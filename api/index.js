/*
########  ########  ########    ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##      ##
##    ##  ##    ##  ##      ##  ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##            ##
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
//  Increase overall API MAX_PAGE_SIZE from 20 to 50
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

// --- Web Crawlers ---
async function crawlYahoo(query) {
    // Increase results to 50 by setting n=50
    var url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=50`;
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

    // Alternative scraping method if no results from the first try
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

    return out.slice(0, 50); // Return up to 50 results
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

    return out.slice(0, 50); // Increase web crawler limit from 20 to 50
}

async function crawlBing(query) {
    // Increase results to 50 by setting count=50
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

    return out.slice(0, 50); // Increase web crawler limit from 20 to 50
}

async function crawlBrave(query) {
    // Increase results to 50 by setting count=50
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&count=50`;
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

    return out.slice(0, 50); // Increase web crawler limit from 20 to 50
}

// --- Image Crawlers ---
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

        return images.slice(0, 50); // Increase image slice limit per page from 5 to 50
    } catch (err) {
        return [];
    }
}

// --- Main handler for /api/index.js ---
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
        var webSearchTasks = [
            withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(() => []),
            withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(() => []),
            withTimeout(crawlYahoo(q), TIMEOUT_MS, 'Yahoo').catch(() => []),
            withTimeout(crawlEcosia(q), TIMEOUT_MS, 'Ecosia').catch(() => []),
        ];

        // Combine all search results
        var allWebResults = dedupe(
            [].concat(...await Promise.all(webSearchTasks))
        );

        // Paginate results
        var paginatedResults = paginate(allWebResults, page, pageSize);

        res.status(200).json({ results: paginatedResults });
    } catch (err) {
        res.status(500).json({ error: 'Error while processing your request' });
    }
};
