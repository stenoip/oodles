var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

// Define a common, browser-like User-Agent string
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

module.exports = async function (req, res) {
  // Set CORS headers
  cors.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var q = req.body?.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    // -------------------------------------------------------------------
    // --- DuckDuckGo /html/ scraping with User-Agent ---
    // -------------------------------------------------------------------
    var ddgHtml = await axios.get(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent': USER_AGENT // Add the User-Agent header here
        }
      }
    );
    var $ddg = cheerio.load(ddgHtml.data);
    var ddgResults = [];

    // Use the reliable, simplified selectors
    $ddg('#links .result').each(function () {
      var $result = $ddg(this);

      var title = $result.find('.result__a').text();
      var url = $result.find('.result__a').attr('href');
      var desc = $result.find('.result__snippet').text();

      if (title && url) {
        ddgResults.push({
          title: title.trim(),
          url,
          description: desc.trim(),
          source: 'DuckDuckGo'
        });
      }
    });

    // -------------------------------------------------------------------
    // --- Bing scraping fallback (Add User-Agent here too, for consistency) ---
    // -------------------------------------------------------------------
    var bingHtml = await axios.get(
      `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent': USER_AGENT
        }
      }
    );
    var $bing = cheerio.load(bingHtml.data);
    var bingResults = [];

    $bing('li.b_algo').each(function () {
      var $result = $bing(this);
      var title = $result.find('h2 a').text() || $result.find('a').first().text();
      var url = $result.find('a').attr('href');
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
    // Return a 500 error that includes the DDG error message if scraping failed
    res.status(500).json({
      error: 'MetaSearch failed',
      details: err.message
    });
  }
};
