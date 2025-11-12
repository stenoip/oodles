var fetch = require('node-fetch');
var cheerio = require('cheerio');
var _cors = require('./_cors');

module.exports = async function (req, res) {
  _cors.setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var urls = req.body.urls;

    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'Invalid URLs array' });
    }

    var indexData = [];

    for (var i = 0; i < urls.length; i++) {
      var url = urls[i];
      try {
        var response = await fetch(url);
        var html = await response.text();
        var $ = cheerio.load(html);

        indexData.push({
          url: url,
          title: $('title').text() || '',
          description: $('meta[name="description"]').attr('content') || '',
          keywords: $('meta[name="keywords"]').attr('content') || ''
        });
      } catch (err) {
        indexData.push({ url: url, error: 'Failed to fetch' });
      }
    }

    // DO NOT write to disk — just return JSON
    res.status(200).json({ success: true, data: indexData });

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid JSON' });
  }
};
