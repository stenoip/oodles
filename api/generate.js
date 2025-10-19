var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

// Crawl one URL and extract metadata, headings, body text, and raw HTML
async function crawlOne(url) {
  var response = await axios.get(url, { timeout: 15000 });
  var html = response.data;
  var $ = cheerio.load(html);

  var result = {
    title: $('title').first().text() || url,
    url: url,
    description: $('meta[name="description"]').attr('content') || 'No description available',
    headings: [],
    content: $('body').text().replace(/\s+/g, ' ').trim(),
    html: html,
    links: []
  };

  $('h1,h2,h3').each(function() {
    result.headings.push($(this).text());
  });

  $('a[href]').each(function() {
    var href = $(this).attr('href');
    if (typeof href === 'string' && href.trim() !== '') {
      result.links.push(href.trim());
    }
  });

  return result;
}

module.exports = async function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    var urls = [];
    if (req.method === 'GET') {
      var singleUrl = req.query && req.query.url;
      if (!singleUrl) {
        res.status(400).json({ error: 'Missing ?url=' });
        return;
      }
      urls = [singleUrl];
    } else if (req.method === 'POST') {
      var body = req.body || {};
      if (Array.isArray(body.urls)) {
        urls = body.urls;
      } else if (typeof body.url === 'string') {
        urls = [body.url];
      } else {
        res.status(400).json({ error: 'Provide url or urls in request body' });
        return;
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    var depth = 0;
    var maxDepth = 0; // set to 1 if you want to follow first-level links
    var visited = {};
    var queue = urls.slice(0);

    var index = [];
    while (queue.length > 0) {
      var current = queue.shift();
      if (visited[current]) continue;
      visited[current] = true;

      try {
        var item = await crawlOne(current);
        index.push(item);

        if (depth < maxDepth) {
          var toAdd = item.links
            .filter(function(l) { return /^https?:\/\//.test(l); })
            .slice(0, 10);
          queue = queue.concat(toAdd);
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

    res.status(200).json({ results: index });
  } catch (err) {
    res.status(500).json({ error: 'Generate failed', details: err.message });
  }
};
