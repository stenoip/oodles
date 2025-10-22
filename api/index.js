// api/index.js
'use strict';

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { setCors } = require('./_cors');

// --- Config ---
const UA = 'Mozilla/5.0 (compatible; Oodlebot/1.0; +https://stenoip.github.io/oodles)';
const TIMEOUT_MS = 7000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

// --- Utility functions ---
function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

function normalize({ title, url, snippet, source }) {
  if (!url) return null;
  return {
    title: (title || url).trim(),
    url: url.trim(),
    snippet: (snippet || '').trim(),
    source
  };
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    try {
      const u = new URL(it.url);
      const key = `${u.origin}${u.pathname}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(it);
      }
    } catch {
      // skip invalid URLs
    }
  }
  return out;
}

function scoreItem(item, query, weight = 0.6) {
  const q = query.toLowerCase();
  const titleHit = item.title.toLowerCase().includes(q) ? 1 : 0;
  const snippetHit = item.snippet.toLowerCase().includes(q) ? 0.6 : 0;
  let httpsBonus = 0;
  try {
    const u = new URL(item.url);
    httpsBonus = u.protocol === 'https:' ? 0.2 : 0;
  } catch {}
  return weight + titleHit + snippetHit + httpsBonus;
}

function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

async function getHTML(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!resp.ok) throw new Error(`Fetch ${resp.status} for ${url}`);
  return resp.text();
}

// --- Crawlers ---
async function crawlYahoo(query) {
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=20`;
  const html = await getHTML(url);
  const $ = cheerio.load(html);
  const out = [];

  $('h3.title a').each((_, el) => {
    const a = $(el);
    const title = a.text();
    const href = a.attr('href');
    const snippet = $(el).closest('div').next('div').text();
    const item = normalize({ title, url: href, snippet, source: 'yahoo' });
    if (item) out.push(item);
  });

  if (out.length === 0) {
    $('li div h3 a').each((_, el) => {
      const a = $(el);
      const title = a.text();
      const href = a.attr('href');
      const snippet = $(el).parent().next('p').text();
      const item = normalize({ title, url: href, snippet, source: 'yahoo' });
      if (item) out.push(item);
    });
  }
  return out.slice(0, 20);
}

async function crawlEcosia(query) {
  const url = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
  const html = await getHTML(url);
  const $ = cheerio.load(html);
  const out = [];

  $('article.result').each((_, el) => {
    const a = $(el).find('a.result-title');
    const title = a.text();
    const href = a.attr('href');
    const snippet = $(el).find('.result-snippet').text();
    const item = normalize({ title, url: href, snippet, source: 'ecosia' });
    if (item) out.push(item);
  });

  if (out.length === 0) {
    $('a.result-title').each((_, el) => {
      const a = $(el);
      const title = a.text();
      const href = a.attr('href');
      const snippet = $(el).closest('article').find('.result-snippet').text();
      const item = normalize({ title, url: href, snippet, source: 'ecosia' });
      if (item) out.push(item);
    });
  }
  return out.slice(0, 20);
}

async function crawlBing(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`;
  const html = await getHTML(url);
  const $ = cheerio.load(html);
  const out = [];

  $('li.b_algo').each((_, el) => {
    const a = $(el).find('h2 a');
    const title = a.text();
    const href = a.attr('href');
    const snippet = $(el).find('.b_caption p').text();
    const item = normalize({ title, url: href, snippet, source: 'bing' });
    if (item) out.push(item);
  });

  if (out.length === 0) {
    $('h2 a').each((_, el) => {
      const a = $(el);
      const title = a.text();
      const href = a.attr('href');
      const snippet = $(el).closest('li, div').find('p').first().text();
      const item = normalize({ title, url: href, snippet, source: 'bing' });
      if (item) out.push(item);
    });
  }
  return out.slice(0, 20);
}

async function crawlBrave(query) {
  const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&count=20`;
  const html = await getHTML(url);
  const $ = cheerio.load(html);
  const out = [];

  $('div#results > div').each((_, el) => {
    const a = $(el).find('a[href]').first();
    const title = a.text();
    const href = a.attr('href');
    const snippet = $(el).find('div').last().text();
    const item = normalize({ title, url: href, snippet, source: 'brave' });
    if (item) out.push(item);
  });

  if (out.length === 0) {
    $('a.result-title, a[href^="http"]').each((_, el) => {
      const a = $(el);
      const title = a.text();
      const href = a.attr('href');
      if (!href || !/^https?:\/\//.test(href)) return;
      const snippet = $(el).closest('div').find('p, div').eq(1).text();
      const item = normalize({ title, url: href, snippet, source: 'brave' });
      if (item) out.push(item);
    });
  }
  return out.slice(0, 20);
}

// --- Main handler ---
module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const q = (req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(5, parseInt(req.query.pageSize || String(DEFAULT_PAGE_SIZE), 10))
  );

  if (!q) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  try {
    const tasks = [
      withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(() => []),
      withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(() => []),
      withTimeout(crawlYahoo(q), TIMEOUT_MS, 'Yahoo').catch(() => []),
      withTimeout(crawlEcosia(q), TIMEOUT_MS, 'Ecosia').catch(() => [])
    ];

    let [brave, bing, yahoo, ecosia] = await Promise.all(tasks);
    let all = dedupe([...brave, ...bing, ...yahoo, ...ecosia]);

    const engineWeights = { brave: 0.8, bing: 0.7, yahoo: 0.5, ecosia: 0.5 };
    all = all.map(it => ({
      ...it,
      score: scoreItem(it, q, engineWeights[it.source] || 0.6)
    })).sort((a, b) => b.score - a.score);

    const total = all.length;
    const items = paginate(all, page, pageSize);

       res.status(200).json({ query: q, total, page, pageSize, items });
  } catch (err) {
    console.error('Metasearch error:', err);
    res.status(500).json({ error: 'Oodlebot metasearch failed' });
  }
};
