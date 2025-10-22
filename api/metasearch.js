var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

module.exports = async function (req, res) {
  // Set CORS headers
  cors.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var q = req.body?.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    // --- DuckDuckGo /html/ scraping ---
    var ddgHtml = await axios.get(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    var $ddg = cheerio.load(ddgHtml.data);
    var ddgResults = [];

    // Targets the main results container and iterates over individual results.
    $ddg('#links .result').each(function () {
      var $result = $ddg(this); // Reference the current result element

      var title = $result.find('.result__a').text();
      var url = $result.find('.result__a').attr('href');
      var desc = $result.find('.result__snippet').text();

      // DuckDuckGo /html/ links are relative: `/l/?kh=-1&amp;uddg=...`
      // We use the relative URL as a placeholder.

      if (title && url) {
        ddgResults.push({
          title: title.trim(),
          url,
          description: desc.trim(),
          source: 'DuckDuckGo'
        });
      }
    });

    // --- Bing scraping fallback ---
    var bingHtml = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(q)}`);
    var $bing = cheerio.load(bingHtml.data);
    var bingResults = [];

    // Targets individual search algorithm blocks
    $bing('li.b_algo').each(function () {
      var $result = $bing(this); // Reference the current result element

      // Find link within h2 or directly inside the block
      var title = $result.find('h2 a').text() || $result.find('a').first().text();
      var url = $result.find('a').attr('href');

      // The snippet is often in a <p> tag
      var desc = $result.find('p').text();

      if (title && url) {
        bingResults.push({ title: title.trim(), url, description: desc.trim(), source: 'Bing' });
      }
    });

    // Combine and return results
    res.status(200).json({
      results: [...ddgResults, ...bingResults]
    });
  } catch (err) {
    // Log the error for debugging purposes if needed, but return a generic 500
    // console.error(err);
    res.status(500).json({
      error: 'MetaSearch failed',
      details: err.message
    });
  }
};
