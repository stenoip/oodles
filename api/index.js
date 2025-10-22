// api/index.js
'use strict';

const fetch = require('node-fetch');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  try {
    // Run Oodlebot crawlers in parallel
    const [yahoo, ecosia] = await Promise.all([
      crawlYahoo(q),
      crawlEcosia(q)
    ]);

    // Merge and dedupe
    const all = dedupe([...yahoo, ...ecosia]);

    res.status(200).json({
      query: q,
      total: all.length,
      items: all
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Oodlebot failed' });
  }
};

// --- Crawlers ---
async function crawlYahoo(query) {
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'Oodlebot/1.0' } });
  const html = await resp.text();
  const $ = cheerio.load(html);
  const results = [];
  $('h3.title a').each((_, el) => {
    const title = $(el).text();
    const href = $(el).attr('href');
    const snippet = $(el).closest('div').next('div').text();
    if (href) results.push({ title, url: href, snippet, source: 'yahoo' });
  });
  return results;
}

async function crawlEcosia(query) {
  const url = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'Oodlebot/1.0' } });
  const html = await resp.text();
  const $ = cheerio.load(html);
  const results = [];
  $('article.result').each((_, el) => {
    const a = $(el).find('a.result-title');
    const title = a.text();
    const href = a.attr('href');
    const snippet = $(el).find('.result-snippet').text();
    if (href) results.push({ title, url: href, snippet, source: 'ecosia' });
  });
  return results;
}

// --- Helpers ---
function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    if (!it.url) return false;
    const key = it.url.split('?')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
