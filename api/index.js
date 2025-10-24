'use strict';

var fetch = require('node-fetch');
var cheerio = require('cheerio');
var { setCors } = require('./_cors');

// Config
var UA = 'Mozilla/5.0 (compatible; Oodlebot/1.0; +https://stenoip.github.io/oodles)';
var TIMEOUT_MS = 7000;
var DEFAULT_PAGE_SIZE = 10;
var MAX_PAGE_SIZE = 20;

// --- Utility functions ---
function withTimeout(promise, ms, label) {
    var t;
    var timeout = new Promise(function(_, reject) {
        t = setTimeout(function() {
            reject(new Error(label + ' timed out'));
        }, ms);
    });
    return Promise.race([promise.finally(function() { clearTimeout(t); }), timeout]);
}

function normalize(obj) {
    if (!obj.url) return null;
    return {
        title: (obj.title || obj.url).trim(),
        url: obj.url.trim(),
        snippet: (obj.snippet || '').trim(),
        source: obj.source
    };
}

function normalizeImage(obj) {
    if (!obj.thumbnail || !obj.originalUrl || !obj.pageUrl) return null;
    return {
        thumbnail: obj.thumbnail,
        originalUrl: obj.originalUrl,
        pageUrl: obj.pageUrl,
        source: obj.source
    };
}

function dedupe(items) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        try {
            var u = new URL(it.url);
            var key = (u.origin + u.pathname).toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                out.push(it);
            }
        } catch (e) {}
    }
    return out;
}

function scoreItem(item, query, weight) {
    var q = query.toLowerCase();
    var titleHit = item.title.toLowerCase().includes(q) ? 1 : 0;
    var snippetHit = item.snippet.toLowerCase().includes(q) ? 0.6 : 0;
    var httpsBonus = 0;
    try {
        var u = new URL(item.url);
        httpsBonus = u.protocol === 'https:' ? 0.2 : 0;
    } catch (e) {}
    return weight + titleHit + snippetHit + httpsBonus;
}

function paginate(items, page, pageSize) {
    var start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

async function getHTML(url) {
    var resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    if (!resp.ok) throw new Error('Fetch ' + resp.status + ' for ' + url);
    return resp.text();
}

// --- Crawlers ---
async function crawlYahoo(query) {
    var url = 'https://search.yahoo.com/search?p=' + encodeURIComponent(query) + '&n=20';
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('h3.title a').each(function(_, el) {
        var a = $(el);
        var title = a.text();
        var href = a.attr('href');
        var snippet = $(el).closest('div').next('div').text();
        var item = normalize({ title: title, url: href, snippet: snippet, source: 'yahoo' });
        if (item) out.push(item);
    });

    if (out.length === 0) {
        $('li div h3 a').each(function(_, el) {
            var a = $(el);
            var title = a.text();
            var href = a.attr('href');
            var snippet = $(el).parent().next('p').text();
            var item = normalize({ title: title, url: href, snippet: snippet, source: 'yahoo' });
            if (item) out.push(item);
        });
    }
    return out.slice(0, 20);
}

async function crawlEcosia(query) {
    var url = 'https://www.ecosia.org/search?q=' + encodeURIComponent(query);
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('article.result').each(function(_, el) {
        var a = $(el).find('a.result-title');
        var title = a.text();
        var href = a.attr('href');
        var snippet = $(el).find('.result-snippet').text();
        var item = normalize({ title: title, url: href, snippet: snippet, source: 'ecosia' });
        if (item) out.push(item);
    });

    if (out.length === 0) {
        $('a.result-title').each(function(_, el) {
            var a = $(el);
            var title = a.text();
            var href = a.attr('href');
            var snippet = $(el).closest('article').find('.result-snippet').text();
            var item = normalize({ title: title, url: href, snippet: snippet, source: 'ecosia' });
            if (item) out.push(item);
        });
    }
    return out.slice(0, 20);
}

async function crawlBing(query) {
    var url = 'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&count=20';
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('li.b_algo').each(function(_, el) {
        var a = $(el).find('h2 a');
        var title = a.text();
        var href = a.attr('href');
        var snippet = $(el).find('.b_caption p').text();
        var item = normalize({ title: title, url: href, snippet: snippet, source: 'bing' });
        if (item) out.push(item);
    });

    if (out.length === 0) {
        $('h2 a').each(function(_, el) {
            var a = $(el);
            var title = a.text();
            var href = a.attr('href');
            if (!href || !/^https?:\/\//.test(href)) return;
            var snippet = $(el).closest('li, div').find('p').first().text();
            var item = normalize({ title: title, url: href, snippet: snippet, source: 'bing' });
            if (item) out.push(item);
        });
    }
    return out.slice(0, 20);
}

async function crawlBrave(query) {
    var url = 'https://search.brave.com/search?q=' + encodeURIComponent(query) + '&count=20';
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('div#results > div').each(function(_, el) {
        var a = $(el).find('a[href]').first();
        var title = a.text();
        var href = a.attr('href');
        var snippet = $(el).find('div').last().text();
        var item = normalize({ title: title, url: href, snippet: snippet, source: 'brave' });
        if (item) out.push(item);
    });

    if (out.length === 0) {
        $('a.result-title, a[href^="http"]').each(function(_, el) {
            var a = $(el);
            var title = a.text();
            var href = a.attr('href');
            if (!href || !/^https?:\/\//.test(href)) return;
            var snippet = $(el).closest('div').find('p, div').eq(1).text();
            var item = normalize({ title: title, url: href, snippet: snippet, source: 'brave' });
            if (item) out.push(item);
        });
    }
    return out.slice(0, 20);
}

// --- Image Crawlers ---
async function crawlYahooImages(query) {
    var url = 'https://images.search.yahoo.com/search/images?p=' + encodeURIComponent(query);
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('li.img').each(function(_, el) {
        var thumbnail = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
        var pageUrl = $(el).find('a').attr('href');
        var originalUrl = $(el).find('img').attr('data-src');
        var item = normalizeImage({ thumbnail: thumbnail, originalUrl: originalUrl, pageUrl: pageUrl, source: 'yahoo-images' });
        if (item) out.push(item);
    });

    return out.slice(0, 30);
}

async function crawlBraveImages(query) {
    var url = 'https://search.brave.com/images?q=' + encodeURIComponent(query);
    var html = await getHTML(url);
    var $ = cheerio.load(html);
    var out = [];

    $('div.image-tile').each(function(_, el) {
        var thumbnail = $(el).find('img').attr('src');
        var pageUrl = $(el).find('a').attr('href');
        var originalUrl = $(el).find('img').attr('data-src') || thumbnail;
        var item = normalizeImage({ thumbnail: thumbnail, originalUrl: originalUrl: originalUrl, pageUrl: pageUrl, source: 'brave-images' });
        if (item) out.push(item);
    });

    return out.slice(0, 30);
}

// --- Dedicated Image Search Handler ---
async function handleImageSearch(req, res) {
    var q = (req.query.q || '').trim();

    try {
        var tasks = [
            withTimeout(crawlYahooImages(q), TIMEOUT_MS, 'Yahoo Images').catch(function() { return []; }),
            withTimeout(crawlBraveImages(q), TIMEOUT_MS, 'Brave Images').catch(function() { return []; })
        ];

        var results = await Promise.all(tasks);
        var allImages = [].concat.apply([], results);

        res.status(200).json({
            query: q,
            total: allImages.length,
            items: allImages
        });
    } catch (err) {
        console.error('Image search error:', err);
        res.status(500).json({ error: 'Oodlebot image search failed' });
    }
}

// --- Main handler ---
module.exports = async function(req, res) {
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

    if (type === 'image') {
        return handleImageSearch(req, res);
    }

    var page = Math.max(1, parseInt(req.query.page || '1', 10));
    var pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(5, parseInt(req.query.pageSize || String(DEFAULT_PAGE_SIZE), 10))
    );

    try {
        var tasks = [
            withTimeout(crawlBrave(q), TIMEOUT_MS, 'Brave').catch(function() { return []; }),
            withTimeout(crawlBing(q), TIMEOUT_MS, 'Bing').catch(function() { return []; }),
            withTimeout(crawlYahoo(q), TIMEOUT_MS, 'Yahoo').catch(function() { return []; }),
            withTimeout(crawlEcosia(q), TIMEOUT_MS, 'Ecosia').catch(function() { return []; })
        ];

        var results = await Promise.all(tasks);
        var brave = results[0];
        var bing = results[1];
        var yahoo = results[2];
        var ecosia = results[3];

        var all = dedupe(brave.concat(bing, yahoo, ecosia));

        var engineWeights = { brave: 0.8, bing: 0.7, yahoo: 0.5, ecosia: 0.5 };
        all = all.map(function(it) {
            return Object.assign({}, it, {
                score: scoreItem(it, q, engineWeights[it.source] || 0.6)
            });
        }).sort(function(a, b) {
            return b.score - a.score;
        });

        var total = all.length;
        var items = paginate(all, page, pageSize);

        res.status(200).json({ query: q, total: total, page: page, pageSize: pageSize, items: items });
    } catch (err) {
        console.error('Metasearch error:', err);
        res.status(500).json({ error: 'Oodlebot metasearch failed' });
    }
};
