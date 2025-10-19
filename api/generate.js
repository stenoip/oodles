var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

async function crawlOne(url) {
  var response = await axios.get(url, { timeout: 15000 });
  var html = response.data;
  var $ = cheerio.load(html);

  var title = $('title').first().text() || url;
  var description = $('meta[name="description"]').attr('content') || '';
  var headings = [];
  $('h1,h2,h3').each(function() {
    headings.push($(this).text());
  });
  var bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  return {
    title: title,
    url: url,
    description: description,
    headings: headings,
    content: bodyText,
    html: html // keep full HTML in index.json, but don’t show in previews
  };
}

module.exports = async function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Missing ?url=' });

    var item = await crawlOne(url);
    res.status(200).json({ results: [item] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to crawl', details: err.message });
  }
};
