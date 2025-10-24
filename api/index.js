/*
########  ########  ########    ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##        ##
##    ##  ##    ##  ##      ##  ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##              ##
########  ########  ########    ########  ######    ########    Search

Copyright Stenoip Company. All rights reserved.
Oodleant is a trademark of Stenoip Company
*/
'use strict';

var fetch = require('node-fetch');
var cheerio = require('cheerio');
var { setCors } = require('./_cors');

// Config
var UA = 'Mozilla/5.0 (compatible; Oodlebot/1.0; +https://stenoip.github.io/oodles)';
var TIMEOUT_MS = 7000;
var DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

// --- Utility functions ---
function withTimeout(promise, ms, label) {
    var t;
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

function normalizeImage({ thumbnail, originalUrl, pageUrl, source }) {
    if (!thumbnail || !originalUrl || !pageUrl) return null;
    return { thumbnail, originalUrl, pageUrl, source };
}

function dedupe(items) {
    var seen = new Set();
    var out = [];
    for (const it of items) {
        try {
            var u = new URL(it.url || it.pageUrl || '');
            var key = `${u.origin}${u.pathname}`.toLowerCase();
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
    var q = query.toLowerCase();
    var titleHit = item.title?.toLowerCase().includes(q) ? 1 : 0;
    var snippetHit = item.snippet?.toLowerCase().includes(q) ? 0.6 : 0;
    var httpsBonus = 0;
    try {
        var u = new URL(item.url);
        httpsBonus = u.protocol === 'https:' ? 0.2 : 0;
    } catch {}
    return weight + titleHit + snippetHit + httpsBonus;
}

function paginate(items, page, pageSize) {
    var start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

async function getHTML(url) {
    var resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    if (!resp.ok) throw new Error(`Fetch ${resp.status} for ${url}`);
    return resp.text();
}

// --- Web Crawlers (Unchanged) ---
async function crawlYahoo(query) {
    var url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=20`;
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('h3.title a').each((_, el) => {
        var a = $(el);
        var title = a.text();
        var href = a.attr('href');
        var snippet = $(el).closest('div').next('div').text();
        var item = normalize({ title, url: href, snippet, source: 'yahoo' });
        if (item) out.push(item);
    });

    if (out.length === 0) {
        $('li div h3 a').each((_, el) => {
            var a = $(el);
            var title = a.text();
            var href = a.attr('href');
            var snippet = $(el).parent().next('p').text();
            var item = normalize({ title, url: href, snippet, source: 'yahoo' });
            if (item) out.push(item);
        });
    }
    return out.slice(0, 20);
}

async function crawlEcosia(query) {
    var url = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('article.result').each((_, el) => {
        const a = $(el).find('a.result-title');
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('.result-snippet').text();
        const item = normalize({ title, url: href, snippet, source: 'ecosia' });
        if (item) out.push(item);
    });

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

    return out.slice(0, 20);
}

// --- Image Crawlers (Original dedicated image crawlers removed/ignored) ---
// New function to crawl images from a single URL
async function crawlImagesFromUrl(pageUrl, source) {
    try {
        const html = await withTimeout(getHTML(pageUrl), TIMEOUT_MS / 3, `Crawl Images from ${pageUrl}`);
        const $ = cheerio.load(html);
        const images = [];

        // Scrape common image tags
        $('img').each((_, el) => {
            const img = $(el);
            // Prioritize src, then data-src
            const originalUrl = img.attr('src') || img.attr('data-src');

            // Resolve relative URLs
            try {
                if (originalUrl) {
                    const resolvedUrl = new URL(originalUrl, pageUrl).href;
                    // Use resolvedUrl for both thumbnail and originalUrl for simplicity in this general scrape
                    const item = normalizeImage({
                        thumbnail: resolvedUrl,
                        originalUrl: resolvedUrl,
                        pageUrl: pageUrl,
                        source: `${source}-page-images` // Indicate the source of the page
                    });
                    if (item) images.push(item);
                }
            } catch (e) {
                // Ignore invalid or unresolvable image URLs
            }
        });

        // Deduping based on originalUrl might be useful, but for now, we return all scraped images
        return images.slice(0, 5); // Limit the number of images per page to avoid excessive results
    } catch (err) {
        // console.error(`Failed to crawl images from ${pageUrl}:`, err.message);
        return [];
    }
}


// --- Dedicated Image Search Handler (Now removed/ignored) ---
// async function handleImageSearch(req, res) { /* ... original code ... */ }
// This handler is no longer needed as the logic is moved to the main module.exports

// --- Main handler for /api/index.js ---
module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const q = (req.query.q || '').trim();
    const type = (req.query.type || 'web').trim();

    if (!q) {
        res.status(400).json({ error: 'Missing query parameter q' });
        return;
    }

    // Run standard web metasearch first, regardless of the 'type'
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(5, parseInt(req.query.pageSize || String(DEFAULT_PAGE_SIZE), 10))
    );

    try {
        const webSearchTasks = [
            withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(() => []),
            withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(() => []),
            withTimeout(crawlYahoo(q), TIMEOUT_MS, 'Yahoo').catch(() => []),
            withTimeout(crawlEcosia(q), TIMEOUT_MS, 'Ecosia').catch(() => [])
        ];

        let [brave, bing, yahoo, ecosia] = await Promise.all(webSearchTasks);
        let allWebResults = dedupe([...brave, ...bing, ...yahoo, ...ecosia]);

        if (type === 'web') {
            // Process and return web results
            const engineWeights = { brave: 0.8, bing: 0.7, yahoo: 0.5, ecosia: 0.5 };
            allWebResults = allWebResults.map(it => ({
                ...it,
                score: scoreItem(it, q, engineWeights[it.source] || 0.6)
            })).sort((a, b) => b.score - a.score);

            const total = allWebResults.length;
            const items = paginate(allWebResults, page, pageSize);

            res.status(200).json({ query: q, total, page, pageSize, items });
            return;

        } else if (type === 'image') {
            // Crawl images from the URLs collected by the web search
            const urlsToCrawl = allWebResults.map(it => it.url).filter(u => u);

            const imageCrawlTasks = urlsToCrawl.map(url =>
                withTimeout(crawlImagesFromUrl(url, allWebResults.find(it => it.url === url)?.source || 'unknown'), TIMEOUT_MS, `Image Crawl from ${url}`).catch(() => [])
            );

            // Run image crawling tasks concurrently
            let allImageResultsArrays = await Promise.all(imageCrawlTasks);

            // Flatten the array of arrays and dedupe image results
            let allImageResults = dedupe(allImageResultsArrays.flat());

            // No specific sorting/scoring implemented for images, just return them
            const total = allImageResults.length;
            const items = paginate(allImageResults, page, pageSize);

            res.status(200).json({
                query: q,
                total,
                page,
                pageSize,
                items
            });
            return;

        } else {
             // Handle unknown type
             res.status(400).json({ error: 'Invalid type parameter. Must be "web" or "image"' });
             return;
        }

    } catch (err) {
        console.error('Metasearch/Image Crawl error:', err);
        res.status(500).json({ error: 'Oodlebot search failed' });
    }
};
