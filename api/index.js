/*
########  ########  ########    ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##        ##
##    ##  ##    ##  ##      ##  ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##              ##
########  ########  ########    ########  ######    ########    Search

Copyright Stenoip Company. All rights reserved.
Oodles Search and the Oodleant-Crawlers are trademarks of Stenoip Company
*/
'use strict';

var fetch = require('node-fetch');
var cheerio = require('cheerio');
var { setCors } = require('./_cors');

// Config
var UA = 'Mozilla/5.0 (compatible; Oodlebot/1.0; +https://stenoip.github.io/oodles)';
var TIMEOUT_MS = 7000;
var DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50; 

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
            // For images, we dedupe by the image URL itself if available
            // For web results, we dedupe by the page URL
            const targetUrl = it.originalUrl || it.url || it.pageUrl || '';
            
            // Basic normalization to prevent http/https dupes
            var u = new URL(targetUrl);
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

// Updated getHTML: Checks Content-Type to avoid parsing binary/junk
async function getHTML(url) {
    var resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    
    if (!resp.ok) throw new Error(`Fetch ${resp.status} for ${url}`);
    
    // Safety check: Ensure we are only parsing HTML
    const contentType = resp.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
        throw new Error(`Skipping non-HTML content: ${contentType}`);
    }

    return resp.text();
}

// --- Web Crawlers ---
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
    return out.slice(0, 50); 
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

    return out.slice(0, 50); 
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

    return out.slice(0, 50); 
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

    return out.slice(0, 50); 
}

// --- Updated Image Crawler ---
async function crawlImagesFromUrl(pageUrl, source) {
    try {
        const html = await withTimeout(getHTML(pageUrl), TIMEOUT_MS / 3, `Crawl Images from ${pageUrl}`);
        const $ = cheerio.load(html);
        const images = [];

        // 1. Meta Tags (High Relevance - "What the site wants you to see")
        const metaSelectors = [
            'meta[property="og:image"]',
            'meta[property="og:image:secure_url"]',
            'meta[name="twitter:image"]',
            'meta[name="twitter:image:src"]',
            'link[rel="image_src"]'
        ];

        metaSelectors.forEach(selector => {
            $(selector).each((_, el) => {
                const imgUrl = $(el).attr('content') || $(el).attr('href');
                if (imgUrl) {
                    try {
                        const resolved = new URL(imgUrl, pageUrl).href;
                        const item = normalizeImage({
                            thumbnail: resolved,
                            originalUrl: resolved,
                            pageUrl: pageUrl,
                            source: `${source}-meta`
                        });
                        if (item) images.push(item);
                    } catch (e) {}
                }
            });
        });

        // 2. Body Images (checking Lazy Load attributes)
        $('img').each((_, el) => {
            const img = $(el);
            
            // Check src, then common lazy load attributes
            let candidateUrl = img.attr('src') || 
                               img.attr('data-src') || 
                               img.attr('data-original') || 
                               img.attr('data-lazy-src');
                               
            const srcset = img.attr('srcset') || img.attr('data-srcset');

            // Handle srcset: grab the last URL (usually the largest/best quality)
            if (srcset) {
                const parts = srcset.split(',');
                const lastPart = parts[parts.length - 1].trim();
                const urlPart = lastPart.split(' ')[0];
                if (urlPart) candidateUrl = urlPart;
            }

            if (candidateUrl) {
                try {
                    // Ignore tiny data URIs (placeholders)
                    if (candidateUrl.startsWith('data:image') && candidateUrl.length < 1000) {
                        return; 
                    }

                    const resolvedUrl = new URL(candidateUrl, pageUrl).href;
                    const item = normalizeImage({
                        thumbnail: resolvedUrl,
                        originalUrl: resolvedUrl,
                        pageUrl: pageUrl,
                        source: `${source}-page`
                    });
                    if (item) images.push(item);
                } catch (e) {
                    // Ignore invalid
                }
            }
        });

        // Dedupe within the page context to keep the list clean
        return dedupe(images).slice(0, 50); 
    } catch (err) {
        // Silent fail on individual page crawl errors to keep the main search alive
        // console.error(`Failed to crawl images from ${pageUrl}:`, err.message);
        return [];
    }
}

// --- Main handler ---
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

    // Run standard web metasearch first
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
                withTimeout(
                    crawlImagesFromUrl(url, allWebResults.find(it => it.url === url)?.source || 'unknown'), 
                    TIMEOUT_MS, 
                    `Image Crawl from ${url}`
                ).catch(() => [])
            );

            let allImageResultsArrays = await Promise.all(imageCrawlTasks);
            let allImageResults = dedupe(allImageResultsArrays.flat());

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
             res.status(400).json({ error: 'Invalid type parameter. Must be "web" or "image"' });
             return;
        }

    } catch (err) {
        console.error('Metasearch/Image Crawl error:', err);
        res.status(500).json({ error: 'Oodlebot search failed' });
    }
};
