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
var TIMEOUT_MS = 10000; 
var DEFAULT_PAGE_SIZE = 10;
var MAX_PAGE_SIZE = 50; 
var API_FETCH_LIMIT = 50; // Cap APIs to prevent hitting a route 2,000 times

// --- Utility functions ---
function withTimeout(promise, ms, label) {
    var t;
    var timeout = new Promise((_, reject) => {
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
    for (var it of items) {
        try {
            var targetUrl = it.originalUrl || it.url || it.pageUrl || '';
            var u = new URL(targetUrl);
            var key = `${u.hostname}${u.pathname}`.toLowerCase();
            
            if (!seen.has(key)) {
                seen.add(key);
                out.push(it);
            }
        } catch(e) {
            // skip invalid URLs
        }
    }
    return out;
}

function scoreItem(item, query, weight) {
    weight = weight || 0.6;
    var q = query.toLowerCase();
    var titleHit = item.title && item.title.toLowerCase().includes(q) ? 1.5 : 0; 
    var snippetHit = item.snippet && item.snippet.toLowerCase().includes(q) ? 0.8 : 0;
    var httpsBonus = 0;
    try {
        var u = new URL(item.url);
        httpsBonus = u.protocol === 'https:' ? 0.2 : 0;
    } catch(e) {}
    
    var lengthPenalty = (item.snippet && item.snippet.length < 20) ? -0.5 : 0;

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
    
    var contentType = resp.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
        throw new Error(`Skipping non-HTML content: ${contentType}`);
    }

    return resp.text();
}

// --- INTELLIGENT PARSERS ---

function extractGenericLinks($, sourceName) {
    var results = [];
    $('h2, h3, h4').each((_, el) => {
        var titleEl = $(el);
        var link = titleEl.find('a').first();
        
        if (link.length > 0) {
            var title = titleEl.text().trim();
            var url = link.attr('href');
            
            var snippet = "";
            var parent = titleEl.parent();
            
            snippet = parent.find('p, span.st, div.snippet, div.compText, div.description').text().trim();
            if (!snippet) snippet = parent.next().text().trim(); 
            
            if (url && url.startsWith('http') && !url.includes(sourceName.toLowerCase())) {
                results.push(normalize({ title, url, snippet, source: sourceName + '-generic' }));
            }
        }
    });
    return results;
}

function extractAggressive($, sourceName) {
    var results = [];
    $('a[href^="http"]').each((_, el) => {
        var a = $(el);
        var title = a.text().trim();
        var url = a.attr('href');
        
        if (title.split(' ').length > 2 && !url.includes(sourceName.toLowerCase())) {
            var snippet = a.parent().text().replace(title, '').trim();
            if (snippet.length < 10) snippet = a.parent().parent().text().replace(title, '').trim();
            
            var item = normalize({ title, url, snippet, source: sourceName + '-aggr' });
            if (item) results.push(item);
        }
    });
    return results;
}

// --- Web Crawler ---

async function crawlBrave(query) {
    var url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('div.snippet').each((_, el) => {
        var a = $(el).find('a').first();
        var title = a.text();
        var href = a.attr('href');
        var snippet = $(el).find('div[class*="text-gray"]').last().text(); 
        var item = normalize({ title, url: href, snippet, source: 'brave' });
        if (item) out.push(item);
    });
    
    if (out.length < 5) out = out.concat(extractGenericLinks($, 'brave'));
    if (out.length < 5) out = out.concat(extractAggressive($, 'brave'));
    return dedupe(out);
}

// --- Web APIs ---

async function fetchDuckDuckGo(query) {
    var url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
    try {
        var resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) return [];
        var data = await resp.json();
        var out = [];
        
        if (data.RelatedTopics) {
            for (var topic of data.RelatedTopics) {
                if (topic.FirstURL && topic.Text) {
                    var title = topic.Text.split(' - ')[0] || query;
                    var item = normalize({ title: title, url: topic.FirstURL, snippet: topic.Text, source: 'duckduckgo-api' });
                    if (item) out.push(item);
                }
            }
        }
        return dedupe(out).slice(0, API_FETCH_LIMIT);
    } catch (err) {
        return [];
    }
}

async function fetchMediawiki(query) {
    var url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=${API_FETCH_LIMIT}`;
    try {
        var resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) return [];
        var data = await resp.json();
        var out = [];
        
        if (data.query && data.query.search) {
            for (var result of data.query.search) {
                var cleanSnippet = result.snippet.replace(/<[^>]+>/g, ''); 
                var pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`;
                var item = normalize({ title: result.title, url: pageUrl, snippet: cleanSnippet, source: 'mediawiki-api' });
                if (item) out.push(item);
            }
        }
        return dedupe(out);
    } catch (err) {
        return [];
    }
}

// --- Image APIs & Crawler ---

async function crawlImagesFromUrl(pageUrl, source) {
    try {
        var html = await withTimeout(getHTML(pageUrl), TIMEOUT_MS / 2, `Crawl Images from ${pageUrl}`);
        var $ = cheerio.load(html);
        var images = [];

        var metaSelectors = [
            'meta[property="og:image"]',
            'meta[property="og:image:secure_url"]',
            'meta[name="twitter:image"]',
            'meta[name="twitter:image:src"]',
            'link[rel="image_src"]'
        ];

        metaSelectors.forEach(selector => {
            $(selector).each((_, el) => {
                var imgUrl = $(el).attr('content') || $(el).attr('href');
                if (imgUrl) {
                    try {
                        var resolved = new URL(imgUrl, pageUrl).href;
                        var item = normalizeImage({
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
            var img = $(el);
            var candidateUrl = img.attr('src') || 
                               img.attr('data-src') || 
                               img.attr('data-original') || 
                               img.attr('data-lazy-src');
                               
            var srcset = img.attr('srcset') || img.attr('data-srcset');
            if (srcset) {
                var parts = srcset.split(',');
                var lastPart = parts[parts.length - 1].trim();
                var urlPart = lastPart.split(' ')[0];
                if (urlPart) candidateUrl = urlPart;
            }

            if (candidateUrl) {
                try {
                    if (candidateUrl.startsWith('data:image') && candidateUrl.length < 1000) return; 
                    var resolvedUrl = new URL(candidateUrl, pageUrl).href;
                    var item = normalizeImage({
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

async function fetchWikimediaCommons(query) {
    var url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${API_FETCH_LIMIT}&prop=imageinfo&iiprop=url&format=json`;
    try {
        var resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) return [];
        var data = await resp.json();
        var out = [];
        
        if (data.query && data.query.pages) {
            var pages = Object.values(data.query.pages);
            for (var page of pages) {
                if (page.imageinfo && page.imageinfo[0]) {
                    var imgUrl = page.imageinfo[0].url;
                    var descUrl = page.imageinfo[0].descriptionurl;
                    var item = normalizeImage({ thumbnail: imgUrl, originalUrl: imgUrl, pageUrl: descUrl, source: 'wikimedia-commons-api' });
                    if (item) out.push(item);
                }
            }
        }
        return dedupe(out);
    } catch (err) {
        return [];
    }
}

async function fetchOpenverse(query) {
    var url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${API_FETCH_LIMIT}`;
    try {
        var resp = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!resp.ok) return [];
        var data = await resp.json();
        var out = [];
        
        if (data.results) {
            for (var res of data.results) {
                var item = normalizeImage({ 
                    thumbnail: res.thumbnail || res.url, 
                    originalUrl: res.url, 
                    pageUrl: res.foreign_landing_url, 
                    source: 'openverse-api' 
                });
                if (item) out.push(item);
            }
        }
        return dedupe(out);
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

    var q = (req.query.q || '').trim();
    var type = (req.query.type || 'web').trim();

    if (!q) {
        res.status(400).json({ error: 'Missing query parameter q' });
        return;
    }

    var page = Math.max(1, parseInt(req.query.page || '1', 10));
    var pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(5, parseInt(req.query.pageSize || String(DEFAULT_PAGE_SIZE), 10))
    );

    try {
        if (type === 'web') {
            var webSearchTasks = [
                withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(e => { console.error('Brave Failed:', e.message); return []; }),
                withTimeout(fetchDuckDuckGo(q), TIMEOUT_MS, 'DuckDuckGo API').catch(e => { console.error('DDG Failed:', e.message); return []; }),
                withTimeout(fetchMediawiki(q), TIMEOUT_MS, 'MediaWiki API').catch(e => { console.error('MediaWiki Failed:', e.message); return []; })
            ];

            var [brave, duckduckgo, mediawiki] = await Promise.all(webSearchTasks);
            
            var allWebResults = [...brave, ...duckduckgo, ...mediawiki];
            allWebResults = dedupe(allWebResults.filter(Boolean));

            var engineWeights = { 
                'brave': 0.85, 
                'mediawiki-api': 0.82, 
                'duckduckgo-api': 0.80, 
                'brave-generic': 0.65,
                'brave-aggr': 0.5
            };

            allWebResults = allWebResults.map(it => ({
                ...it,
                score: scoreItem(it, q, engineWeights[it.source] || 0.4)
            })).sort((a, b) => b.score - a.score);

            var totalWeb = allWebResults.length;
            var webItems = paginate(allWebResults, page, pageSize);

            res.status(200).json({ query: q, total: totalWeb, page, pageSize, items: webItems });
            return;

        } else if (type === 'image') {
            // Fast web crawl to seed page image crawler
            var seedingTask = await withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave Seed').catch(() => []);
            var urlsToCrawl = dedupe(seedingTask.filter(Boolean)).slice(0, 15).map(it => it.url).filter(u => u);

            var imageCrawlTasks = urlsToCrawl.map(url =>
                withTimeout(
                    crawlImagesFromUrl(url, 'brave'), 
                    TIMEOUT_MS, 
                    `Image Crawl from ${url}`
                ).catch(() => [])
            );

            // Directly inject Image APIs into task batch limit queue
            imageCrawlTasks.push(withTimeout(fetchWikimediaCommons(q), TIMEOUT_MS, 'Wikimedia API').catch(() => []));
            imageCrawlTasks.push(withTimeout(fetchOpenverse(q), TIMEOUT_MS, 'Openverse API').catch(() => []));

            var allImageResultsArrays = await Promise.all(imageCrawlTasks);
            var allImageResults = dedupe(allImageResultsArrays.flat().filter(Boolean));

            var totalImg = allImageResults.length;
            var imgItems = paginate(allImageResults, page, pageSize);

            res.status(200).json({
                query: q,
                total: totalImg,
                page,
                pageSize,
                items: imgItems
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
