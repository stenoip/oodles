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
var UA = 'Mozilla/5.0 (compatible; Oodlebot/3.0; +https://stenoip.github.io/oodles)';
var TIMEOUT_MS = 9000; // Increased slightly for the extra engine
var DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100; // Increased max page size to accommodate more results

// --- Utility functions ---
function withTimeout(promise, ms, label) {
    var t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

function normalize({ title, url, snippet, source }) {
    if (!url || !title) return null;
    
    // Cleaning: Remove tracking parameters
    let cleanUrl = url;
    try {
        const u = new URL(url);
        // Remove common tracking params
        ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'click_id'].forEach(p => u.searchParams.delete(p));
        cleanUrl = u.href;
    } catch(e) {}

    // Basic spam filter
    if (cleanUrl.includes('google.com/search') || cleanUrl.includes('yahoo.com/search')) return null;

    return {
        title: title.trim(),
        url: cleanUrl,
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
            const targetUrl = it.originalUrl || it.url || it.pageUrl || '';
            var u = new URL(targetUrl);
            // Key by domain + path to remove duplicates
            var key = `${u.hostname}${u.pathname}`.toLowerCase();
            
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
    var titleHit = item.title?.toLowerCase().includes(q) ? 2.0 : 0; // Increased weight
    var snippetHit = item.snippet?.toLowerCase().includes(q) ? 1.0 : 0;
    var httpsBonus = 0;
    try {
        var u = new URL(item.url);
        httpsBonus = u.protocol === 'https:' ? 0.3 : 0;
    } catch {}
    
    // Penalize very short snippets
    let lengthPenalty = (item.snippet && item.snippet.length < 20) ? -1.0 : 0;

    return weight + titleHit + snippetHit + httpsBonus + lengthPenalty;
}

function paginate(items, page, pageSize) {
    var start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

// Safety check: Ensure we are only parsing HTML
async function getHTML(url) {
    var resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    if (!resp.ok) throw new Error(`Fetch ${resp.status} for ${url}`);
    
    const contentType = resp.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
        throw new Error(`Skipping non-HTML content: ${contentType}`);
    }

    return resp.text();
}

// --- INTELLIGENT PARSERS ---

// A generic "Heuristic" parser that works on almost any search engine layout
function extractGenericLinks($, sourceName) {
    const results = [];
    
    // Expanded selectors for titles (h2, h3, h4, and common div classes)
    $('h2, h3, h4, div[class*="title"], a[class*="title"]').each((_, el) => {
        const titleEl = $(el);
        let link = titleEl.find('a').first();
        if (titleEl.is('a')) link = titleEl; // Sometimes the title itself is the link
        
        if (link.length > 0) {
            const title = titleEl.text().trim();
            const url = link.attr('href');
            
            // Find snippet: Look at siblings or parent text
            let snippet = "";
            const parent = titleEl.parent();
            
            // Try specific classes first
            snippet = parent.find('p, span.st, div.snippet, div.compText, div[class*="desc"]').text().trim();
            if (!snippet) snippet = parent.next().text().trim();
            if (!snippet) snippet = parent.parent().find('p').first().text().trim(); // Go up one more level
            
            // Limit snippet length to avoid giant blobs of text
            if (snippet.length > 300) snippet = snippet.substring(0, 300) + '...';

            if (url && url.startsWith('http')) {
                results.push(normalize({ title, url, snippet, source: sourceName + '-generic' }));
            }
        }
    });
    return results;
}

// --- Web Crawlers (Enhanced for Maximum Yield) ---

async function crawlYahoo(query) {
    // Increased n=60 (max usually allowed without pagination)
    var url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=60`; 
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    // Strategy 1: Specific Classes
    $('div.algo, div.dd.algo').each((_, el) => {
        var title = $(el).find('h3.title a').text();
        var href = $(el).find('h3.title a').attr('href');
        var snippet = $(el).find('div.compText, p.lh-16').text();
        
        if (title && href) {
            var item = normalize({ title, url: href, snippet, source: 'yahoo' });
            if (item) out.push(item);
        }
    });

    // Strategy 2: Aggressive Fallback
    // If we missed results due to layout changes, run generic parser
    if (out.length < 10) {
        const generic = extractGenericLinks($, 'yahoo');
        out = [...out, ...generic];
    }

    return out;
}

async function crawlEcosia(query) {
    var url = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    // Strategy 1: Main Results
    $('div.mainline-results .result').each((_, el) => {
        const a = $(el).find('a.result-title');
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('.result-snippet').text();
        const item = normalize({ title, url: href, snippet, source: 'ecosia' });
        if (item) out.push(item);
    });

    if (out.length < 5) {
         out = [...out, ...extractGenericLinks($, 'ecosia')];
    }

    return out;
}

async function crawlBing(query) {
    // Increased count=50
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=50`;
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

    // Capture "Top Stories" or "Cards" which are often separate
    $('li.b_ans').each((_, el) => {
         const a = $(el).find('h2 a, .b_title a'); 
         if(a.length && $(el).find('.b_entityTitle').length === 0) { 
             const title = a.text();
             const href = a.attr('href');
             const item = normalize({ title, url: href, snippet: 'Featured Result', source: 'bing-featured' });
             if (item) out.push(item);
         }
    });
    
    if (out.length < 10) {
        out = [...out, ...extractGenericLinks($, 'bing')];
    }

    return out;
}

async function crawlBrave(query) {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    const out = [];

    $('div.snippet').each((_, el) => {
        const a = $(el).find('a').first();
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('div[class*="text-gray"]').last().text(); 
        const item = normalize({ title, url: href, snippet, source: 'brave' });
        if (item) out.push(item);
    });
    
    // Always run generic on Brave as their classes change often
    const generic = extractGenericLinks($, 'brave');
    // Combine and dedupe locally
    const combined = [...out, ...generic];
    
    return combined;
}

// --- NEW ENGINE: Mojeek (Crawler based, very easy to scrape) ---
async function crawlMojeek(query) {
    const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    const out = [];

    $('ul.results > li').each((_, el) => {
        const a = $(el).find('h2 a, a.ob');
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('p.s').text();
        
        if (title && href) {
            const item = normalize({ title, url: href, snippet, source: 'mojeek' });
            if (item) out.push(item);
        }
    });

    return out;
}

// --- Image Crawler ---
async function crawlImagesFromUrl(pageUrl, source) {
    try {
        const html = await withTimeout(getHTML(pageUrl), TIMEOUT_MS / 2, `Crawl Images from ${pageUrl}`);
        const $ = cheerio.load(html);
        const images = [];

        // 1. Meta Tags (High Relevance)
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

        // 2. Body Images (with Lazy Load logic)
        $('img').each((_, el) => {
            const img = $(el);
            let candidateUrl = img.attr('src') || 
                               img.attr('data-src') || 
                               img.attr('data-original') || 
                               img.attr('data-lazy-src');
                               
            const srcset = img.attr('srcset') || img.attr('data-srcset');
            if (srcset) {
                const parts = srcset.split(',');
                const lastPart = parts[parts.length - 1].trim();
                const urlPart = lastPart.split(' ')[0];
                if (urlPart) candidateUrl = urlPart;
            }

            if (candidateUrl) {
                try {
                    if (candidateUrl.startsWith('data:image') && candidateUrl.length < 1000) return; 
                    const resolvedUrl = new URL(candidateUrl, pageUrl).href;
                    // Filter tiny icons
                    if (resolvedUrl.includes('icon') || resolvedUrl.includes('logo')) return;

                    const item = normalizeImage({
                        thumbnail: resolvedUrl,
                        originalUrl: resolvedUrl,
                        pageUrl: pageUrl,
                        source: `${source}-page`
                    });
                    if (item) images.push(item);
                } catch (e) {}
            }
        });

        return dedupe(images).slice(0, 50); 
    } catch (err) {
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

    // Increased default paging limits
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(5, parseInt(req.query.pageSize || String(DEFAULT_PAGE_SIZE), 10))
    );

    try {
        // Run all web crawlers in parallel
        // Added Mojeek to the list
        const webSearchTasks = [
            withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(() => []),
            withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(() => []),
            withTimeout(crawlYahoo(q), TIMEOUT_MS, 'Yahoo').catch(() => []),
            withTimeout(crawlEcosia(q), TIMEOUT_MS, 'Ecosia').catch(() => []),
            withTimeout(crawlMojeek(q), TIMEOUT_MS, 'Mojeek').catch(() => [])
        ];

        let [brave, bing, yahoo, ecosia, mojeek] = await Promise.all(webSearchTasks);
        
        // Combine all results
        let allWebResults = [...brave, ...bing, ...yahoo, ...ecosia, ...mojeek];
        
        // Remove nulls and dedupe
        allWebResults = allWebResults.filter(i => i !== null);
        allWebResults = dedupe(allWebResults);

        if (type === 'web') {
            const engineWeights = { 
                'brave': 0.85, 
                'bing': 0.8, 
                'yahoo': 0.7, 
                'ecosia': 0.7, 
                'mojeek': 0.65,
                'bing-featured': 0.9,
                'ecosia-news': 0.8 
            };

            allWebResults = allWebResults.map(it => ({
                ...it,
                score: scoreItem(it, q, engineWeights[it.source] || 0.5)
            })).sort((a, b) => b.score - a.score);

            const total = allWebResults.length;
            const items = paginate(allWebResults, page, pageSize);

            res.status(200).json({ query: q, total, page, pageSize, items });
            return;

        } else if (type === 'image') {
            // Feed MORE web results to the image crawler (Up from 15 to 25)
            const urlsToCrawl = allWebResults.slice(0, 25).map(it => it.url).filter(u => u);

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
             res.status(400).json({ error: 'Invalid type parameter.' });
             return;
        }

    } catch (err) {
        console.error('Metasearch/Image Crawl error:', err);
        res.status(500).json({ error: 'Oodlebot search failed' });
    }
};
