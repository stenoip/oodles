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
var UA = 'Mozilla/5.0 (compatible; Oodlebot/2.0; +https://stenoip.github.io/oodles)';
var TIMEOUT_MS = 8000; // Bumped slightly for deeper parsing
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
    if (!url || !title) return null;
    
    // Cleaning: Remove tracking parameters often found in search results
    let cleanUrl = url;
    try {
        const u = new URL(url);
        // Remove common tracking params
        ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'click_id'].forEach(p => u.searchParams.delete(p));
        cleanUrl = u.href;
    } catch(e) {}

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
            // Key by domain + path to remove duplicates like http://site.com vs https://site.com/
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
    var titleHit = item.title?.toLowerCase().includes(q) ? 1.5 : 0; // Increased weight for title matches
    var snippetHit = item.snippet?.toLowerCase().includes(q) ? 0.8 : 0;
    var httpsBonus = 0;
    try {
        var u = new URL(item.url);
        httpsBonus = u.protocol === 'https:' ? 0.2 : 0;
    } catch {}
    
    // Penalize very short snippets (likely bad parsing)
    let lengthPenalty = (item.snippet && item.snippet.length < 20) ? -0.5 : 0;

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
// It looks for the pattern: Container -> Header(h2/h3) -> Link(a) -> Text
function extractGenericLinks($, sourceName) {
    const results = [];
    
    // Select all headings (h2, h3) that contain links
    $('h2, h3, h4').each((_, el) => {
        const titleEl = $(el);
        const link = titleEl.find('a').first();
        
        if (link.length > 0) {
            const title = titleEl.text().trim();
            const url = link.attr('href');
            
            // Find snippet: Look at the parent's next sibling or text inside the parent container
            let snippet = "";
            const parent = titleEl.parent();
            
            // Try to find a paragraph or span with text nearby
            snippet = parent.find('p, span.st, div.snippet, div.compText').text().trim();
            if (!snippet) snippet = parent.next().text().trim(); // Next sibling often has text
            
            // Validate: Must be a valid HTTP link (no javascript: or relative internal links)
            if (url && url.startsWith('http') && !url.includes('google.com/search') && !url.includes('yahoo.com/search')) {
                results.push(normalize({ title, url, snippet, source: sourceName + '-generic' }));
            }
        }
    });
    return results;
}

// --- Web Crawlers (Updated with Multi-Strategy) ---

async function crawlYahoo(query) {
    var url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=30`; // Fetch more
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    // Strategy 1: Specific Classes
    $('div.algo, div.dd.algo').each((_, el) => {
        var title = $(el).find('h3.title a').text();
        var href = $(el).find('h3.title a').attr('href');
        var snippet = $(el).find('div.compText, p.lh-16').text();
        
        // Yahoo sometimes wraps links in tracking, often the real link is in href
        if (title && href) {
            var item = normalize({ title, url: href, snippet, source: 'yahoo' });
            if (item) out.push(item);
        }
    });

    // Strategy 2: Fallback to generic if specific failed
    if (out.length < 5) {
        out = out.concat(extractGenericLinks($, 'yahoo'));
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

    // Strategy 2: Sidebar / News Cards
    $('div.card-mobile').each((_, el) => {
         const a = $(el).find('a.result-title');
         if(a.length) {
             const title = a.text();
             const href = a.attr('href');
             const item = normalize({ title, url: href, snippet: 'News result', source: 'ecosia-news' });
             if (item) out.push(item);
         }
    });

    return out;
}

async function crawlBing(query) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    const out = [];

    // Strategy 1: Standard Algo
    $('li.b_algo').each((_, el) => {
        const a = $(el).find('h2 a');
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('.b_caption p').text();
        const item = normalize({ title, url: href, snippet, source: 'bing' });
        if (item) out.push(item);
    });

    // Strategy 2: "Top Stories" or "Cards" (often miss these)
    $('li.b_ans').each((_, el) => {
         const a = $(el).find('h2 a, .b_title a'); // Broader selector
         if(a.length && $(el).find('.b_entityTitle').length === 0) { // Avoid sidebar entities
             const title = a.text();
             const href = a.attr('href');
             const item = normalize({ title, url: href, snippet: 'Featured Result', source: 'bing-featured' });
             if (item) out.push(item);
         }
    });

    return out;
}

async function crawlBrave(query) {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    const out = [];

    // Strategy 1: Snippets
    $('div.snippet').each((_, el) => {
        const a = $(el).find('a').first();
        const title = a.text();
        const href = a.attr('href');
        // Brave snippets are often in a div with text-gray classes
        const snippet = $(el).find('div[class*="text-gray"]').last().text(); 
        const item = normalize({ title, url: href, snippet, source: 'brave' });
        if (item) out.push(item);
    });
    
    // Strategy 2: Info Cards
    if (out.length < 5) {
         out = out.concat(extractGenericLinks($, 'brave'));
    }

    return out;
}

// --- Image Crawler (Kept your powerful metadata version) ---
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

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(5, parseInt(req.query.pageSize || String(DEFAULT_PAGE_SIZE), 10))
    );

    try {
        // Run all web crawlers in parallel
        const webSearchTasks = [
            withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(() => []),
            withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(() => []),
            withTimeout(crawlYahoo(q), TIMEOUT_MS, 'Yahoo').catch(() => []),
            withTimeout(crawlEcosia(q), TIMEOUT_MS, 'Ecosia').catch(() => [])
        ];

        let [brave, bing, yahoo, ecosia] = await Promise.all(webSearchTasks);
        
        // Combine and cleanup
        let allWebResults = [...brave, ...bing, ...yahoo, ...ecosia];
        
        // Robust Deduplication
        allWebResults = dedupe(allWebResults);

        if (type === 'web') {
            // Ranking Logic
            const engineWeights = { 
                'brave': 0.85, 
                'bing': 0.8, 
                'yahoo': 0.7, 
                'ecosia': 0.7, 
                'bing-featured': 0.9, // Boost featured results
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
            // Use the high-quality web results to feed the image crawler
            // Limit to top 15 results to avoid timeout, but deep crawl them
            const urlsToCrawl = allWebResults.slice(0, 15).map(it => it.url).filter(u => u);

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
