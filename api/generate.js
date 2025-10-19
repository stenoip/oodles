var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

// Extract basic metadata from a single URL
async function crawlOne(url) {
  var result = {
    title: '',
    url: url,
    description: '',
    links: []
  };

  var response = await axios.get(url, { timeout: 15000 });
  var $ = cheerio.load(response.data);

  // Title & description
  result.title = $('title').first().text() || url;
  result.description = $('meta[name="description"]').attr('content') || 'No description available';

  // Collect on-page links (absolute or relative)
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

  // Accept either GET with ?url= or POST with { urls: [...] }
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

    // Optional depth limit to follow links from the first page (lightweight)
    var depth = 0;
    var maxDepth = 0; // set to 1 to follow first-level links
    var visited = {};
    var queue = urls.slice(0);

    var index = [];
    while (queue.length > 0) {
      var current = queue.shift();
      if (visited[current]) continue;
      visited[current] = true;

      try {
        var item = await crawlOne(current);
        index.push({
          title: item.title,
          url: item.url,
          description: item.description
        });

        // If you want to follow links, enable maxDepth = 1 above
        if (depth < maxDepth) {
          var toAdd = item.links
            .filter(function(l) {
              // Basic filter to keep http(s) resources and avoid mailto, javascript:
              return /^https?:\/\//.test(l);
            })
            .slice(0, 10); // limit breadth
          queue = queue.concat(toAdd);
        }
      } catch (e) {
        // Continue crawling even if one URL fails
        index.push({
          title: current,
          url: current,
          description: 'Failed to crawl: ' + e.message
        });
      }
    }

    res.status(200).json({ results: index });
  } catch (err) {
    res.status(500).json({ error: 'Generate failed', details: err.message });
  }
};
