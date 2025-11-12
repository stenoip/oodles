const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { setCors } = require('./_cors');
const fs = require('fs');

module.exports = async (req, res) => {
  setCors(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'Invalid URLs array' });
  }

  const indexData = [];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);

      const title = $('title').text() || '';
      const description = $('meta[name="description"]').attr('content') || '';
      const keywords = $('meta[name="keywords"]').attr('content') || '';

      indexData.push({ url, title, description, keywords });
    } catch (err) {
      console.error(`Failed to fetch ${url}:`, err.message);
      indexData.push({ url, error: 'Failed to fetch' });
    }
  }

  fs.writeFileSync('index.json', JSON.stringify(indexData, null, 2));

  res.status(200).json({ success: true, data: indexData });
};
