var axios = require('axios');
var cheerio = require('cheerio');
var urlLib = require('url');
var cors = require('./_cors');

// Normalize and resolve absolute URLs
function resolveUrl(base, href) {
  try {
    return new urlLib.URL(href, base).href;
  } catch (e) {
    return null;
  }
}

// Crawl one URL and extract metadata, headings, body text, raw HTML, and links
async function crawlOne(url) {
  var response = await axios.get(url, { timeout: 15000 });
  var html = response.data;
  var $ = cheerio.load(html);

  var title = $('title').first().text() || url;
  var description = $('meta[name="description"]').attr('content') || 'No description available';
  var headings = [];
  $('h1,h2,h3').each(function() { headings.push($(this).text()); });

  var bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  // Collect and resolve links
  var links = [];
  $('a[href]').each(function() {
    var href = ($(this).attr('href') || '').trim();
    if (!href) return;
    if (/^(javascript:|mailto:|tel:|#)/i.test(href)) return;
    var abs = resolveUrl(url, href);
    if (abs && /^https?:\/\//i.test(abs)) {
      links.push(abs);
    }
  });

  return {
    title: title,
    url: url,
    description: description,
    headings: headings,
    content: bodyText,
    html: html,     // stored in index.json; not shown in previews
    links: links
  };
}

module.exports = async function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Inputs
    var urls = [];
    var maxDepth = 1;  // default: follow one level deep
    var maxPerPageLinks = 10; // breadth limit per page
    var sameDomainOnly = false; // set true to restrict crawl to seed domains

    if (req.method === 'GET') {
      var singleUrl = req.query && req.query.url;
      if (!singleUrl) {
        res.status(400).json({ error: 'Missing ?url=' });
        return;
      }
      urls = [singleUrl];
      if (req.query.depth) maxDepth = Math.max(0, parseInt(req.query.depth || '1', 10) || 1);
      if (req.query.links) maxPerPageLinks = Math.max(1, parseInt(req.query.links || '10', 10) || 10);
      if (req.query.sameDomain) sameDomainOnly = String(req.query.sameDomain).toLowerCase() === 'true';
    } else if (req.method === 'POST') {
      var body = req.body || {};
      if (Array.isArray(body.urls)) urls = body.urls;
      else if (typeof body.url === 'string') urls = [body.url];
      else {
        res.status(400).json({ error: 'Provide url or urls in request body' });
        return;
      }
      if (body.depth !== undefined) maxDepth = Math.max(0, parseInt(body.depth, 10) || 1);
      if (body.links !== undefined) maxPerPageLinks = Math.max(1, parseInt(body.links, 10) || 10);
      if (body.sameDomain !== undefined) sameDomainOnly = !!body.sameDomain;
    } else {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Seed domains (for sameDomainOnly option)
    var seedDomains = urls.map(function(u) {
      try { return new urlLib.URL(u).hostname; } catch (e) { return null; }
    }).filter(Boolean);

    // BFS crawl
    var visited = {};
    var queue = urls.map(function(u) { return { url: u, depth: 0 }; });
    var index = [];

    while (queue.length > 0) {
      var node = queue.shift();
      var current = node.url;
      var depth = node.depth;

      if (visited[current]) continue;
      visited[current] = true;

      try {
        var item = await crawlOne(current);
        index.push(item);

        if (depth < maxDepth) {
          var toAdd = item.links
            .filter(function(l) {
              if (!/^https?:\/\//i.test(l)) return false;
              if (!sameDomainOnly) return true;
              try {
                var host = new urlLib.URL(l).hostname;
                return seedDomains.indexOf(host) !== -1;
              } catch (e) { return false; }
            })
            .slice(0, maxPerPageLinks);

          toAdd.forEach(function(nextUrl) {
            if (!visited[nextUrl]) queue.push({ url: nextUrl, depth: depth + 1 });
          });
        }
      } catch (e) {
        index.push({
          title: current,
          url: current,
          description: 'Failed to crawl: ' + e.message,
          headings: [],
          content: '',
          html: '',
          links: []
        });
      }
    }

    res.status(200).json({ results: index, meta: { seeds: urls, depth: maxDepth } });
  } catch (err) {
    res.status(500).json({ error: 'Generate failed', details: err.message });
  }
};
