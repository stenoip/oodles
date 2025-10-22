const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('./_cors');
const { crawlOne } = require('./generate');

module.exports = async function (req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const q = req.body?.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    // DuckDuckGo
    const duck = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`);
    const ddgResults = (duck.data?.RelatedTopics || []).flatMap(r => {
      const format = (t) => {
        const url = t.FirstURL || '#';
        if (url.includes('duckduckgo.com/?q=')) return null;
        return { title: t.Text || 'Untitled', url, description: '', source: 'DuckDuckGo' };
      };
      if (r.Topics) return r.Topics.map(format).filter(Boolean);
      const single = format(r);
      return single ? [single] : [];
    });

    // Bing
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

    // Crawl each result
    const combined = [...ddgResults, ...bingResults];
    const crawledResults = [];

    for (const result of combined) {
      try {
        const crawled = await crawlOne(result.url);
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
