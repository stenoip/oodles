var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

module.exports = async function (req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var q = req.body?.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    // DuckDuckGo /html/ scraping
    var ddgHtml = await axios.get(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    var $ddg = cheerio.load(ddgHtml.data);
    var ddgResults = [];
    $ddg('#links .result').each(function () {
      var title = $ddg(this).find('.result__a').text();
      var url = $ddg(this).find('.result__a').attr('href');
      var desc = $ddg(this).find('.result__snippet').text();

      /* DuckDuckGo /html/ links are relative: `/l/?kh=-1&amp;uddg=...`
        the relative URL used as a placeholder. */

      if (title && url) {
        ddgResults.push({ title: title.trim(), url, description: desc.trim(), source: 'DuckDuckGo' });
      }
    });

    // Bing scraping fallback
    var bingHtml = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(q)}`);
    var $bing = cheerio.load(bingHtml.data);
    var bingResults = [];
    $bing('li.b_algo').each(function () {
      var title = $bing(this).find('h2').text();
      var url = $bing(this).find('a').attr('href');
      var desc = $bing(this).find('p').text();
      if (title && url) {
        bingResults.push({ title, url, description: desc, source: 'Bing' });
      }
    });

    res.status(200).json({ results: [...ddgResults, ...bingResults] });
  } catch (err) {
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
