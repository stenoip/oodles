var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');
var generate = require('./generate');
var crawlOne = generate.crawlOne;

module.exports = async function (req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var q = req.body && req.body.q;
  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    // --- Bing scraping ---
    var bingHtml = await axios.get('https://www.bing.com/search?q=' + encodeURIComponent(q));
    var $bing = cheerio.load(bingHtml.data);
    var bingResults = [];
    $bing('li.b_algo').each(function () {
      var title = $bing(this).find('h2').text();
      var url = $bing(this).find('a').attr('href');
      var desc = $bing(this).find('p').text();
      if (title && url) {
        bingResults.push({ title: title, url: url, description: desc, source: 'Bing' });
      }
    });

    // --- Yahoo scraping ---
    var yahooHtml = await axios.get('https://search.yahoo.com/search?p=' + encodeURIComponent(q));
    var $yahoo = cheerio.load(yahooHtml.data);
    var yahooResults = [];
    $yahoo('div.dd.algo').each(function () {
      var title = $yahoo(this).find('h3.title').text();
      var url = $yahoo(this).find('h3.title a').attr('href');
      var desc = $yahoo(this).find('p').text();
      if (title && url) {
        yahooResults.push({ title: title, url: url, description: desc, source: 'Yahoo' });
      }
    });

    // --- Combine and crawl ---
    var combined = bingResults.concat(yahooResults);
    var crawledResults = [];

    for (var i = 0; i < combined.length; i++) {
      var result = combined[i];
      try {
        var crawled = await crawlOne(result.url);
        crawledResults.push({
          title: crawled.title,
          url: crawled.url,
          description: crawled.description,
          headings: crawled.headings,
          content: crawled.content,
          source: result.source,
          _score: 0
        });
      } catch (e) {
        crawledResults.push({
          title: result.title,
          url: result.url,
          description: result.description || 'Failed to crawl',
          headings: [],
          content: '',
          source: result.source,
          _score: 0
        });
      }
    }

    res.status(200).json({ results: crawledResults });
  } catch (err) {
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
