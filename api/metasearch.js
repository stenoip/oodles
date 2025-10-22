const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('./_cors');

module.exports = async function (req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const q = req.body?.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    // DuckDuckGo Instant Answer API
    const duck = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`);
    const ddgResults = (duck.data?.RelatedTopics || []).flatMap(r => {
      if (r.Topics) return r.Topics.map(t => ({
        title: t.Text || 'Untitled',
        url: t.FirstURL || '#',
        description: '',
        source: 'DuckDuckGo'
      }));
      return [{
        title: r.Text || 'Untitled',
        url: r.FirstURL || '#',
        description: '',
        source: 'DuckDuckGo'
      }];
    });

    // Bing scraping fallback
    const bingHtml = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(q)}`);
    const $ = cheerio.load(bingHtml.data);
    const bingResults = [];
    $('li.b_algo').each(function () {
      const title = $(this).find('h2').text();
      const url = $(this).find('a').attr('href');
      const desc = $(this).find('p').text();
      if (title && url) {
        bingResults.push({ title, url, description: desc, source: 'Bing' });
      }
    });

    res.status(200).json({ results: [...ddgResults, ...bingResults] });
  } catch (err) {
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
