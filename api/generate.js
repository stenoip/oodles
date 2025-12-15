var fetch = require('node-fetch');
var cheerio = require('cheerio');
var _cors = require('./_cors');

async function crawlOne(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MetaCrawler/1.0)' },
      timeout: 10000
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[name="Description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    const keywords =
      $('meta[name="keywords"]').attr('content') ||
      $('meta[name="Keywords"]').attr('content') ||
      '';

    const headings = [];
    $('h1,h2,h3').each((_, el) => headings.push($(el).text()));

    const content = $('p').map((_, el) => $(el).text()).get().join(' ');

    // --- Image Extraction ---
    const images = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        try {
          const absoluteUrl = new URL(src, url).href;
          images.push(absoluteUrl);
        } catch (err) {
          // ignore invalid URLs
        }
      }
    });

    return {
      url,
      title: $('title').text() || '',
      description,
      keywords,
      headings,
      content,
      images
    };
  } catch (err) {
    return {
      url,
      title: '',
      description: 'Failed to fetch or parse',
      keywords: '',
      headings: [],
      content: '',
      images: [],
      error: err.message
    };
  }
}

module.exports = {
  crawlOne,

  // API handler for direct POST requests with { urls: [...] }
  async handler(req, res) {
    _cors.setCors(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const body = req.body || {};
      const urls = body.urls || [];
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty URLs array' });
      }

      const allResults = await Promise.allSettled(urls.map(url => crawlOne(url)));
      const indexData = [];

      for (const r of allResults) {
        if (r.status === 'fulfilled') indexData.push(r.value);
        else indexData.push({ error: 'Failed to process URL' });
      }

      res.status(200).json({ success: true, data: indexData });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: 'Invalid JSON or request format' });
    }
  }
};
