var cors = require('./_cors');

function normalize(str) {
  return (str || '').toLowerCase();
}

module.exports = async function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    var query = (req.method === 'GET' ? (req.query && req.query.q) : (req.body && req.body.q)) || '';
    var index = (req.method === 'GET' ? null : (req.body && req.body.index)) || null;

    if (!query) {
      res.status(400).json({ error: 'Missing query parameter q' });
      return;
    }

    // If index is provided in POST body, search that; otherwise require GET with q & url to generate on the fly.
    if (!index) {
      // For convenience: allow GET /search?q=...&url=... to search a single generated page
      var url = req.query && req.query.url;
      if (!url) {
        res.status(400).json({ error: 'Provide index in POST body or include ?url= for ad-hoc search' });
        return;
      }
      // Ad-hoc single page "search" by crawling then matching
      var axios = require('axios');
      var cheerio = require('cheerio');
      try {
        var response = await axios.get(url, { timeout: 15000 });
        var $ = cheerio.load(response.data);
        var title = $('title').first().text() || url;
        var description = $('meta[name="description"]').attr('content') || 'No description available';
        index = [{ title: title, url: url, description: description }];
      } catch (e) {
        res.status(500).json({ error: 'Failed ad-hoc crawl', details: e.message });
        return;
      }
    }

    if (!Array.isArray(index)) {
      res.status(400).json({ error: 'index must be an array of {title,url,description}' });
      return;
    }

    var q = normalize(query);
    var results = index.filter(function(item) {
      return normalize(item.title).indexOf(q) !== -1 ||
             normalize(item.description).indexOf(q) !== -1 ||
             normalize(item.url).indexOf(q) !== -1;
    });

    res.status(200).json({ results: results });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
