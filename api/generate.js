var fetch = require('node-fetch');
var cheerio = require('cheerio');
var fs = require('fs');
var _cors = require('./_cors');

module.exports = async function (req, res) {
  _cors.setCors(res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var body = '';
  req.on('data', function(chunk) {
    body += chunk;
  });

  req.on('end', async function() {
    try {
      var parsed = JSON.parse(body);
      var urls = parsed.urls;
      
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

      fs.writeFileSync('index.json', JSON.stringify(indexData, null, 2));
      res.status(200).json({ success: true, data: indexData });

    } catch (err) {
      res.status(400).json({ error: 'Invalid JSON' });
    }
  });
};
