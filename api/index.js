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
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
var TIMEOUT_MS = 8000; 
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

function decodeSearchUrl(url) {
    if (!url) return url;
    try {
        const u = new URL(url);
        if (u.hostname.includes('bing.com') && u.pathname.includes('/ck/a')) {
            const uParam = u.searchParams.get('u');
            if (uParam) {
                const base64Str = uParam.replace(/^a1/, '');
                const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
                if (decoded.startsWith('http')) return decoded;
            }
        }
        if (u.hostname.includes('search.yahoo.com') && url.includes('RU=')) {
            const match = url.match(/RU=([^/]+)/);
            if (match) {
                return decodeURIComponent(match[1]);
            }
        }
    } catch (e) {}
    return url;
}

function normalize({ title, url, snippet, source }) {
    if (!url || !title) return null;
    var cleanUrl = decodeSearchUrl(url);
    try {
        var u = new URL(cleanUrl);
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
    var resp = await fetch(url, { 
        headers: { 
            'User-Agent': UA, 
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        } 
    });
    if (!resp.ok) throw new Error(`Fetch ${resp.status} for ${url}`);
    const contentType = resp.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
        throw new Error(`Skipping non-HTML content: ${contentType}`);
    }
    return resp.text();
}

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
            snippet = parent.find('p, span.st, div.snippet, div.compText').text().trim();
            if (!snippet) snippet = parent.next().text().trim(); 
            if (url && url.startsWith('http') && !url.includes('google.com/search') && !url.includes('yahoo.com/search')) {
                results.push(normalize({ title, url, snippet, source: sourceName + '-generic' }));
            }
        }
    });
    return results;
}

// --- Web Crawlers ---
async function crawlYahoo(query) {
    var url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=30`; 
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];
    $('div.algo, div.dd.algo').each((_, el) => {
        var title = $(el).find('h3.title a').text();
        var href = $(el).find('h3.title a').attr('href');
        var snippet = $(el).find('div.compText, p.lh-16').text();
        if (title && href) {
            var item = normalize({ title, url: href, snippet, source: 'yahoo' });
            if (item) out.push(item);
        }
    });
    if (out.length < 5) out = out.concat(extractGenericLinks($, 'yahoo'));
    return out;
}

async function crawlEcosia(query) {
    var url = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];
    $('div.mainline-results .result').each((_, el) => {
        const a = $(el).find('a.result-title');
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('.result-snippet').text();
        const item = normalize({ title, url: href, snippet, source: 'ecosia' });
        if (item) out.push(item);
    });
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
    $('li.b_algo').each((_, el) => {
        const a = $(el).find('h2 a');
        const title = a.text();
        const href = a.attr('href');
        const snippet = $(el).find('.b_caption p').text();
        const item = normalize({ title, url: href, snippet, source: 'bing' });
        if (item) out.push(item);
    });
    $('li.b_ans').each((_, el) => {
         const a = $(el).find('h2 a, .b_title a'); 
         if(a.length && $(el).find('.b_entityTitle').length === 0) { 
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
    return out;
}

// --- NEW API Integrations ---

async function fetchDDG(query) {
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
        const resp = await fetch(url);
        const data = await resp.json();
        const out = [];
        if (data.RelatedTopics) {
            data.RelatedTopics.forEach(topic => {
                if (topic.FirstURL && topic.Text) {
                    out.push(normalize({
                        title: topic.Text.split(' - ')[0] || 'DuckDuckGo Result',
                        url: topic.FirstURL,
                        snippet: topic.Text,
                        source: 'duckduckgo-api'
                    }));
                }
            });
        }
        return out.filter(Boolean);
    } catch (e) { return []; }
}

async function fetchWikimediaCommons(query) {
    try {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
        const resp = await fetch(url);
        const data = await resp.json();
        const out = [];
        if (data.query && data.query.pages) {
            Object.values(data.query.pages).forEach(page => {
                if (page.imageinfo && page.imageinfo[0]) {
                    const info = page.imageinfo[0];
                    const item = normalizeImage({
                        thumbnail: info.url,
                        originalUrl: info.url,
                        pageUrl: info.descriptionshorturl || info.descriptionurl || info.url,
                        source: 'wikimedia-commons'
                    });
                    if (item) out.push(item);
                }
            });
        }
        return out.filter(Boolean);
    } catch (e) { return []; }
}

async function fetchOpenverse(query) {
    try {
        const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=15`;
        const resp = await fetch(url);
        const data = await resp.json();
        const out = [];
        if (data.results) {
            data.results.forEach(img => {
                const item = normalizeImage({
                    thumbnail: img.thumbnail || img.url,
                    originalUrl: img.url,
                    pageUrl: img.foreign_landing_url || img.url,
                    source: 'openverse'
                });
                if (item) out.push(item);
            });
        }
        return out.filter(Boolean);
    } catch (e) { return []; }
}

async function fetchMediaLinkAPI(query, searchType) {
    // Structural placeholder. Insert your actual MediaLink endpoint/keys here.
    try {
        const url = `https://api.medialink.example.com/search?q=${encodeURIComponent(query)}&type=${searchType}`;
        // const resp = await fetch(url);
        // const data = await resp.json();
        // map and normalize results based on searchType ('web' or 'image')...
        return [];
    } catch (e) { return []; }
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
        const webSearchTasks = [
            withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(() => []),
            withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(() => []),
            withTimeout(crawlYahoo(q), TIMEOUT_MS, 'Yahoo').catch(() => []),
            withTimeout(crawlEcosia(q), TIMEOUT_MS, 'Ecosia').catch(() => []),
            withTimeout(fetchDDG(q), TIMEOUT_MS, 'DuckDuckGo API').catch(() => []),
            withTimeout(fetchMediaLinkAPI(q, 'web'), TIMEOUT_MS, 'MediaLink API').catch(() => [])
        ];

        let resultsArray = await Promise.all(webSearchTasks);
        let allWebResults = resultsArray.flat();
        
        allWebResults = dedupe(allWebResults.filter(Boolean));

        if (type === 'web') {
            const engineWeights = { 
                'brave': 0.01, 
                'bing': 0.8, 
                'yahoo': 0.89, 
                'ecosia': 0.7, 
                'bing-featured': 0.9,
                'ecosia-news': 0.8,
                'duckduckgo-api': 0.92,
                'medialink-web': 0.95
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
            // Original logic: scrape top web links for their images
            const urlsToCrawl = allWebResults.slice(0, 15).map(it => it.url).filter(u => u);

            const imageCrawlTasks = urlsToCrawl.map(url =>
                withTimeout(
                    crawlImagesFromUrl(url, allWebResults.find(it => it.url === url)?.source || 'unknown'), 
                    TIMEOUT_MS, 
                    `Image Crawl from ${url}`
                ).catch(() => [])
            );

            // New logic: parallel fire off direct image APIs
            const directImageAPITasks = [
                withTimeout(fetchWikimediaCommons(q), TIMEOUT_MS, 'Wikimedia API').catch(() => []),
                withTimeout(fetchOpenverse(q), TIMEOUT_MS, 'Openverse API').catch(() => []),
                withTimeout(fetchMediaLinkAPI(q, 'image'), TIMEOUT_MS, 'MediaLink API').catch(() => [])
            ];

            let allImageResultsArrays = await Promise.all([...imageCrawlTasks, ...directImageAPITasks]);
            let allImageResults = dedupe(allImageResultsArrays.flat().filter(Boolean));

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
