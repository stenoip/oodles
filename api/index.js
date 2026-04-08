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
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var TIMEOUT_MS = 10000; // Bumped to 10s to give smaller engines time to respond
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
    
    var cleanUrl = url;
    
    // Cleaning: Remove tracking parameters often found in search results
    try {
        var u = new URL(cleanUrl);
        ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'click_id'].forEach(p => u.searchParams.delete(p));
        cleanUrl = u.href;
    } catch(e) {}

    return {
        title: title.trim(),
        url: cleanUrl,
        snippet: (snippet || '').trim().substring(0, 300), // Cap snippet length
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
        } catch {
            // skip invalid URLs
        }
    }
    return out;
}

function scoreItem(item, query, weight = 0.6) {
    var q = query.toLowerCase();
    var titleHit = item.title?.toLowerCase().includes(q) ? 1.5 : 0; 
    var snippetHit = item.snippet?.toLowerCase().includes(q) ? 0.8 : 0;
    var httpsBonus = 0;
    try {
        var u = new URL(item.url);
        httpsBonus = u.protocol === 'https:' ? 0.2 : 0;
    } catch {}
    
    let lengthPenalty = (item.snippet && item.snippet.length < 20) ? -0.5 : 0;

    return weight + titleHit + snippetHit + httpsBonus + lengthPenalty;
}

function paginate(items, page, pageSize) {
    var start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

async function getHTML(url) {
    // Upgraded headers to bypass aggressive bot-protection
    var resp = await fetch(url, { 
        headers: { 
            'User-Agent': UA, 
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        } 
    });
    
    if (!resp.ok) throw new Error(`Fetch ${resp.status} for ${url}`);
    
    const contentType = resp.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
        throw new Error(`Skipping non-HTML content: ${contentType}`);
    }

    return resp.text();
}

// --- INTELLIGENT PARSERS ---

function extractGenericLinks($, sourceName) {
    const results = [];
    $('h2, h3, h4').each((_, el) => {
        const titleEl = $(el);
        const link = titleEl.find('a').first();
        
        if (link.length > 0) {
            const title = titleEl.text().trim();
            const url = link.attr('href');
            
            let snippet = "";
            const parent = titleEl.parent();
            
            snippet = parent.find('p, span.st, div.snippet, div.compText, div.description').text().trim();
            if (!snippet) snippet = parent.next().text().trim(); 
            
            if (url && url.startsWith('http') && !url.includes(sourceName.toLowerCase())) {
                results.push(normalize({ title, url, snippet, source: sourceName + '-generic' }));
            }
        }
    });
    return results;
}

// Last-resort fallback if specific selectors and h2/h3 parsing fails
function extractAggressive($, sourceName) {
    const results = [];
    $('a[href^="http"]').each((_, el) => {
        const a = $(el);
        const title = a.text().trim();
        const url = a.attr('href');
        
        // If the link has a substantial title and isn't pointing back to the search engine itself
        if (title.split(' ').length > 2 && !url.includes(sourceName.toLowerCase())) {
            let snippet = a.parent().text().replace(title, '').trim();
            if (snippet.length < 10) snippet = a.parent().parent().text().replace(title, '').trim();
            
            const item = normalize({ title, url, snippet, source: sourceName + '-aggr' });
            if (item) results.push(item);
        }
    });
    return results;
}

// --- Web Crawlers ---

async function crawlBrave(query) {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    let out = [];

    $('div.snippet').each((_, el) => {
        const a = $(el).find('a').first();
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('div[class*="text-gray"]').last().text(); 
        const item = normalize({ title, url: href, snippet, source: 'brave' });
        if (item) out.push(item);
    });
    
    if (out.length < 5) out = out.concat(extractGenericLinks($, 'brave'));
    if (out.length < 5) out = out.concat(extractAggressive($, 'brave'));
    return dedupe(out);
}

async function crawlMojeek(query) {
    const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    let out = [];

    // Broadened to catch specific Mojeek class structures
    $('.ob-res, ul.results li, ul.results-standard li, .result-item').each((_, el) => {
        const a = $(el).find('h2 a, h3 a, a.ob, a').first();
        const title = a.text().trim();
        const href = a.attr('href');
        const snippet = $(el).find('p.s, div.snippet, p').first().text().trim();

        if (title && href && href.startsWith('http')) {
            const item = normalize({ title, url: href, snippet, source: 'mojeek' });
            if (item) out.push(item);
        }
    });

    if (out.length < 5) out = out.concat(extractGenericLinks($, 'mojeek'));
    if (out.length < 5) out = out.concat(extractAggressive($, 'mojeek'));
    return dedupe(out);
}

async function crawlYep(query) {
    const url = `https://yep.com/web?q=${encodeURIComponent(query)}`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    let out = [];

    // Yep heavily obfuscates CSS classes. Using structural targeting.
    $('[class*="result"], div:has(h2), div:has(h3)').each((_, el) => {
        const a = $(el).find('h2 a, h3 a, a[class*="title"]').first();
        const title = a.text().trim();
        const href = a.attr('href');
        const snippet = $(el).find('[class*="snippet"], p').first().text().trim();

        if (title && href && href.startsWith('http') && !href.includes('yep.com')) {
            const item = normalize({ title, url: href, snippet, source: 'yep' });
            if (item) out.push(item);
        }
    });

    if (out.length < 5) out = out.concat(extractGenericLinks($, 'yep'));
    if (out.length < 5) out = out.concat(extractAggressive($, 'yep'));
    return dedupe(out);
}

async function crawlMarginalia(query) {
    const url = `https://search.marginalia.nu/search?query=${encodeURIComponent(query)}`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);
    let out = [];

    $('section.search-result, article.search-result, div.result').each((_, el) => {
        const a = $(el).find('h2 a, h3 a').first();
        const title = a.text().trim();
        const href = a.attr('href');
        const snippet = $(el).find('p.description, p').first().text().trim();

        if (title && href && href.startsWith('http')) {
            const item = normalize({ title, url: href, snippet, source: 'marginalia' });
            if (item) out.push(item);
        }
    });

    if (out.length < 5) out = out.concat(extractGenericLinks($, 'marginalia'));
    if (out.length < 5) out = out.concat(extractAggressive($, 'marginalia'));
    return dedupe(out);
}


// --- Image Crawler ---
async function crawlImagesFromUrl(pageUrl, source) {
    try {
        const html = await withTimeout(getHTML(pageUrl), TIMEOUT_MS / 2, `Crawl Images from ${pageUrl}`);
        const $ = cheerio.load(html);
        const images = [];

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
        // Appended error logging so server console outputs exact failure reasons
        const webSearchTasks = [
            withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(e => { console.error('Brave Failed:', e.message); return []; }),
            withTimeout(crawlMojeek(q), TIMEOUT_MS, 'Mojeek').catch(e => { console.error('Mojeek Failed:', e.message); return []; }),
            withTimeout(crawlYep(q), TIMEOUT_MS, 'Yep').catch(e => { console.error('Yep Failed:', e.message); return []; }),
            withTimeout(crawlMarginalia(q), TIMEOUT_MS, 'Marginalia').catch(e => { console.error('Marginalia Failed:', e.message); return []; })
        ];

        let [brave, mojeek, yep, marginalia] = await Promise.all(webSearchTasks);
        
        let allWebResults = [...brave, ...mojeek, ...yep, ...marginalia];
        
        allWebResults = dedupe(allWebResults.filter(Boolean));

        if (type === 'web') {
            const engineWeights = { 
                'brave': 0.85, 
                'mojeek': 0.82, 
                'yep': 0.80, 
                'marginalia': 0.78,
                'brave-generic': 0.65,
                'mojeek-generic': 0.65,
                'yep-generic': 0.65,
                'marginalia-generic': 0.65,
                'brave-aggr': 0.5,
                'mojeek-aggr': 0.5,
                'yep-aggr': 0.5,
                'marginalia-aggr': 0.5
            };

            allWebResults = allWebResults.map(it => ({
                ...it,
                score: scoreItem(it, q, engineWeights[it.source] || 0.4)
            })).sort((a, b) => b.score - a.score);

            const total = allWebResults.length;
            const items = paginate(allWebResults, page, pageSize);

            res.status(200).json({ query: q, total, page, pageSize, items });
            return;

        } else if (type === 'image') {
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
