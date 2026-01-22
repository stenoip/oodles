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

// --- CONFIGURATION ---
// We use a "Legacy" User Agent to trick engines into serving simple HTML (Server-Side Rendered)
// instead of complex JavaScript apps. This makes 'Ctrl+U' look like 'Inspect Element'.
var UA_MOBILE_LEGACY = 'Mozilla/5.0 (Linux; Android 7.0; SM-G930V Build/NRD90M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.125 Mobile Safari/537.36';

var TIMEOUT_MS = 10000; 
var DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 150; 

// --- UTILITY ---
function withTimeout(promise, ms, label) {
    var t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

function normalize({ title, url, snippet, source }) {
    if (!url || !title) return null;
    
    // Clean Google Redirects (gbv=1 returns /url?q=...)
    if (url.startsWith('/url?q=')) {
        try {
            url = url.split('/url?q=')[1].split('&')[0];
            url = decodeURIComponent(url);
        } catch (e) {}
    }

    // General cleanup
    let cleanUrl = url;
    try {
        const u = new URL(url);
        ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'click_id', 'sa', 'ved', 'usg'].forEach(p => u.searchParams.delete(p));
        cleanUrl = u.href;
    } catch(e) {}

    // Filter internal engine links
    if (cleanUrl.includes('google.com/search') || 
        cleanUrl.includes('yahoo.com/search') || 
        cleanUrl.includes('duckduckgo.com') ||
        !cleanUrl.startsWith('http')) {
        return null;
    }

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
            var key = `${u.hostname}${u.pathname}`.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                out.push(it);
            }
        } catch { }
    }
    return out;
}

function scoreItem(item, query, weight = 0.6) {
    var q = query.toLowerCase();
    var titleHit = item.title?.toLowerCase().includes(q) ? 2.5 : 0; 
    var snippetHit = item.snippet?.toLowerCase().includes(q) ? 1.0 : 0;
    
    // Boost shorter, cleaner URLs (usually better quality)
    var urlLenPenalty = (item.url.length > 100) ? -0.5 : 0;
    
    return weight + titleHit + snippetHit + urlLenPenalty;
}

function paginate(items, page, pageSize) {
    var start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

// Fetcher with Legacy Headers
async function getHTML(url, isMobile = true) {
    const headers = {
        'User-Agent': isMobile ? UA_MOBILE_LEGACY : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    var resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fetch ${resp.status} for ${url}`);
    return resp.text();
}


// --- CRAWLERS (TARGETING "NO-JS" ENDPOINTS) ---

// 1. Google "Basic Version" (gbv=1) - The Holy Grail of static scraping
async function crawlGoogleLegacy(query) {
    // num=100 asks for 100 results. gbv=1 forces legacy HTML mode.
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&gbv=1&num=60`;
    const html = await getHTML(url, true);
    const $ = cheerio.load(html);
    const out = [];

    // In gbv=1, results are often in plain divs with class 'g' or inside 'div.kCrYT'
    // We look for 'h3' which is the title
    $('h3').each((_, el) => {
        const h3 = $(el);
        const a = h3.parent('a'); // usually h3 is inside a
        
        if (a.length) {
            const title = h3.text();
            const rawUrl = a.attr('href');
            
            // Find snippet: usually in a div following the title container
            // In mobile gbv=1, snippets are messy. We try to grab the nearest meaningful text.
            let snippet = a.parent().next().text();
            
            const item = normalize({ title, url: rawUrl, snippet, source: 'google-lite' });
            if (item) out.push(item);
        }
    });

    return out;
}

// 2. DuckDuckGo HTML (Lite) - Pure static HTML
async function crawlDuckDuckGoLite(query) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url, false); // Desktop UA often works better for DDG Html
    const $ = cheerio.load(html);
    const out = [];

    $('.result').each((_, el) => {
        const title = $(el).find('.result__a').text();
        const rawUrl = $(el).find('.result__a').attr('href');
        const snippet = $(el).find('.result__snippet').text();

        const item = normalize({ title, url: rawUrl, snippet, source: 'ddg-lite' });
        if (item) out.push(item);
    });

    return out;
}

// 3. Mojeek - Crawler based, always static
async function crawlMojeek(query) {
    const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url, false);
    const $ = cheerio.load(html);
    const out = [];

    $('li').each((_, el) => {
        const title = $(el).find('h2 a').text();
        const href = $(el).find('h2 a').attr('href');
        const snippet = $(el).find('p.s').text();
        
        if (title && href) {
            const item = normalize({ title, url: href, snippet, source: 'mojeek' });
            if (item) out.push(item);
        }
    });

    return out;
}

// 4. Bing - Using standard but with headers
async function crawlBing(query) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=50`;
    const html = await getHTML(url, false);
    const $ = cheerio.load(html);
    const out = [];

    $('li.b_algo').each((_, el) => {
        const title = $(el).find('h2 a').text();
        const href = $(el).find('h2 a').attr('href');
        const snippet = $(el).find('.b_caption p').text();
        
        if(title && href) {
            const item = normalize({ title, url: href, snippet, source: 'bing' });
            if (item) out.push(item);
        }
    });

    return out;
}

// 5. Ask.com - Often good static results
async function crawlAsk(query) {
    const url = `https://www.ask.com/web?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url, false);
    const $ = cheerio.load(html);
    const out = [];

    $('.PartialSearchResults-item').each((_, el) => {
        const title = $(el).find('a.PartialSearchResults-item-title-link').text();
        const href = $(el).find('a.PartialSearchResults-item-title-link').attr('href');
        const snippet = $(el).find('.PartialSearchResults-item-abstract').text();
        
        if(title && href) {
            const item = normalize({ title, url: href, snippet, source: 'ask' });
            if (item) out.push(item);
        }
    });
    
    return out;
}

// --- IMAGE CRAWLER (Unchanged, already powerful) ---
async function crawlImagesFromUrl(pageUrl, source) {
    try {
        const html = await withTimeout(getHTML(pageUrl, false), TIMEOUT_MS / 2, `Crawl Images from ${pageUrl}`);
        const $ = cheerio.load(html);
        const images = [];

        // 1. Meta Tags 
        const metaSelectors = [
            'meta[property="og:image"]', 'meta[property="og:image:secure_url"]',
            'meta[name="twitter:image"]', 'link[rel="image_src"]'
        ];

        metaSelectors.forEach(selector => {
            $(selector).each((_, el) => {
                const imgUrl = $(el).attr('content') || $(el).attr('href');
                if (imgUrl) {
                    try {
                        const resolved = new URL(imgUrl, pageUrl).href;
                        images.push(normalizeImage({
                            thumbnail: resolved, originalUrl: resolved, pageUrl: pageUrl, source: `${source}-meta`
                        }));
                    } catch (e) {}
                }
            });
        });

        // 2. Body Images
        $('img').each((_, el) => {
            const img = $(el);
            let candidateUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');
            
            // Try to find large images in srcset
            const srcset = img.attr('srcset');
            if (srcset) {
                const parts = srcset.split(',');
                candidateUrl = parts[parts.length - 1].trim().split(' ')[0];
            }

            if (candidateUrl && !candidateUrl.startsWith('data:')) {
                try {
                    const resolved = new URL(candidateUrl, pageUrl).href;
                    // Filter icons
                    if(!resolved.match(/icon|logo|pixel|blank/i)) {
                         images.push(normalizeImage({
                            thumbnail: resolved, originalUrl: resolved, pageUrl: pageUrl, source: `${source}-page`
                        }));
                    }
                } catch (e) {}
            }
        });

        return dedupe(images).slice(0, 50); 
    } catch (err) {
        return [];
    }
}


// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const q = (req.query.q || '').trim();
    const type = (req.query.type || 'web').trim();

    if (!q) { res.status(400).json({ error: 'Missing query' }); return; }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(MAX_PAGE_SIZE, parseInt(req.query.pageSize || DEFAULT_PAGE_SIZE));

    try {
        // --- 1. SEARCH PHASE ---
        // We use promise.allSettled or catch() to ensure one failure doesn't stop the rest
        const webSearchTasks = [
            withTimeout(crawlGoogleLegacy(q), TIMEOUT_MS, 'Google').catch(e => { console.log('Google fail', e.message); return []; }),
            withTimeout(crawlDuckDuckGoLite(q), TIMEOUT_MS, 'DDG').catch(e => { console.log('DDG fail', e.message); return []; }),
            withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(e => { console.log('Bing fail', e.message); return []; }),
            withTimeout(crawlMojeek(q), TIMEOUT_MS, 'Mojeek').catch(e => { console.log('Mojeek fail', e.message); return []; }),
            withTimeout(crawlAsk(q), TIMEOUT_MS, 'Ask').catch(e => { console.log('Ask fail', e.message); return []; })
        ];

        let resultsArrays = await Promise.all(webSearchTasks);
        let allWebResults = resultsArrays.flat().filter(i => i !== null);
        
        allWebResults = dedupe(allWebResults);

        if (type === 'web') {
            // Scoring
            const engineWeights = { 
                'google-lite': 1.0, 
                'ddg-lite': 0.9, 
                'bing': 0.8, 
                'mojeek': 0.7,
                'ask': 0.6
            };

            allWebResults = allWebResults.map(it => ({
                ...it,
                score: scoreItem(it, q, engineWeights[it.source] || 0.5)
            })).sort((a, b) => b.score - a.score);

            const total = allWebResults.length;
            const items = paginate(allWebResults, page, pageSize);

            res.status(200).json({ query: q, total, page, pageSize, items });

        } else if (type === 'image') {
            // --- 2. IMAGE PHASE ---
            // We take the top ~25 distinct URLs from our massive web search
            // and deep-crawl them for images.
            const urlsToCrawl = allWebResults.slice(0, 25).map(it => it.url);
            
            const imageTasks = urlsToCrawl.map(url => 
                withTimeout(crawlImagesFromUrl(url, 'web-crawl'), TIMEOUT_MS, `Img ${url}`).catch(() => [])
            );

            let imageArrays = await Promise.all(imageTasks);
            let allImages = dedupe(imageArrays.flat());

            res.status(200).json({
                query: q, total: allImages.length, page, pageSize,
                items: paginate(allImages, page, pageSize)
            });
        } else {
            res.status(400).json({ error: 'Invalid type' });
        }

    } catch (err) {
        console.error('Search Error:', err);
        res.status(500).json({ error: 'Oodlebot internal error' });
    }
};
