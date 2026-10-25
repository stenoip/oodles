/*
########  ########  ########    ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##        ##
##    ##  ##    ##  ##      ##  ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##              ##
########  ########  ########    ########  ######    ########

##   ##  ######  ######   ####    #####  ######   ####   #####    #####  ##  ##
### ###  ##        ##    ##  ##  ##      ##      ##  ##  ##  ##  ##      ##  ##
## # ##  ####      ##    ######   ####   ####    ######  #####   ##      ######
##   ##  ##        ##    ##  ##      ##  ##      ##  ##  ## ##   ##      ##  ##
##   ##  ######    ##    ##  ##  #####   ######  ##  ##  ##  ##   #####  ##  ##

Copyright Stenoip Company. All rights reserved.
Oodles Metasearch and the Oodleant-Crawlers are trademarks of Stenoip Company
*/
'use strict';

var fetch = require('node-fetch');
var setCors = require('./_cors').setCors;

// Config
var TIMEOUT_MS = 20000;
var DEFAULT_PAGE_SIZE = 10;
var MAX_PAGE_SIZE = 50;

var OPENSERP_API_URL = process.env.OPENSERP_API_URL || 'https://new-oodles-backend.onrender.com';

var OPENSERP_ENGINES = process.env.OPENSERP_ENGINES || 'bing';

function withTimeout(promise, ms, label) {
    var t;
    var timeout = new Promise(function(resolve, reject) {
        t = setTimeout(function() {
            reject(new Error(label + ' timed out after ' + ms + 'ms'));
        }, ms);
    });
    return Promise.race([
        promise.finally(function() {
            clearTimeout(t);
        }),
        timeout
    ]);
}

function normalize(data) {
    var title = data.title;
    var url = data.url;
    var snippet = data.snippet;
    var source = data.source;

    if (!url || !title) return null;
    var cleanUrl = url;
    try {
        var u = new URL(cleanUrl);
        var paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'click_id'];
        for (var i = 0; i < paramsToRemove.length; i++) {
            u.searchParams.delete(paramsToRemove[i]);
        }
        cleanUrl = u.href;
    } catch (e) {}

    return {
        title: title.trim(),
        url: cleanUrl,
        snippet: (snippet || '').trim(),
        source: source || 'openserp'
    };
}

function normalizeImage(data) {
    var title = data.title;
    var thumbnail = data.thumbnail || data.originalUrl;
    var originalUrl = data.originalUrl || data.thumbnail;
    var pageUrl = data.pageUrl || originalUrl || '#';
    var source = data.source;

    if (!thumbnail && !originalUrl) return null;
    return {
        title: (title || '').trim(),
        thumbnail: thumbnail,
        originalUrl: originalUrl,
        pageUrl: pageUrl,
        source: source || 'openserp-images'
    };
}

function dedupe(items) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        try {
            var targetUrl = it.originalUrl || it.url || it.pageUrl || '';
            var u = new URL(targetUrl);
            var key = (u.hostname + u.pathname).toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                out.push(it);
            }
        } catch (e) {
            // skip invalid URLs
        }
    }
    return out;
}

// OpenSERP fetcher
// kind: 'search' or 'image'. Uses the multi-engine (mega) endpoints.
function fetchOpenserp(query, kind, page, pageSize) {
    var baseUrl = OPENSERP_API_URL.replace(/\/+$/, '');
    var start = (page - 1) * pageSize;

    var url = baseUrl + '/mega/' + kind +
              '?text=' + encodeURIComponent(query) +
              '&limit=' + pageSize +
              '&start=' + start +
              '&mode=any' +
              '&engines=' + encodeURIComponent(OPENSERP_ENGINES);

    return fetch(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'OodlesSearch/1.0'
        }
    }).then(function(resp) {
        if (!resp.ok) {
            throw new Error('OpenSERP returned HTTP ' + resp.status + ' for ' + kind);
        }
        return resp.json();
    });
}

// Responses are an envelope ({ results: [...] }), but handle a bare array too.
function getResults(data) {
    if (Array.isArray(data)) return data;
    return (data && data.results) || [];
}

function hasMore(data) {
    return !!(data && data.pagination && data.pagination.has_more);
}

// Main handler
module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    var type = (req.query.type || 'web').trim();

    // Health / Ping endpoint
    if (type === 'ping') {
        res.status(200).json({ status: 'ok', message: 'pong', timestamp: Date.now() });
        return;
    }

    var q = (req.query.q || '').trim();

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
            var data = await withTimeout(fetchOpenserp(q, 'search', page, pageSize), TIMEOUT_MS, 'OpenSERP Web Search');

            var rawResults = getResults(data);
            var allWebResults = [];
            for (var i = 0; i < rawResults.length; i++) {
                var r = rawResults[i];
                if (r.ad === true) continue;
                if (r.type && r.type !== 'organic') continue;

                var item = normalize({
                    title: r.title,
                    url: r.url,
                    snippet: r.snippet || r.description,
                    source: r.engine || 'openserp'
                });
                if (item) allWebResults.push(item);
            }

            allWebResults = dedupe(allWebResults);

            var totalWeb = (page - 1) * pageSize + allWebResults.length + (hasMore(data) ? pageSize : 0);

            res.status(200).json({
                query: q,
                total: totalWeb,
                page: page,
                pageSize: pageSize,
                items: allWebResults
            });
            return;

        } else if (type === 'image') {
            var imgData = await withTimeout(fetchOpenserp(q, 'image', page, pageSize), TIMEOUT_MS, 'OpenSERP Image Search');

            var rawImages = getResults(imgData);
            var allImageResults = [];
            for (var j = 0; j < rawImages.length; j++) {
                var im = rawImages[j];
                var meta = im.image || {};
                var imgItem = normalizeImage({
                    title: im.title,
                    thumbnail: meta.thumbnail || im.thumbnail,
                    originalUrl: meta.url || meta.full || meta.original || meta.src || im.image_url || im.url,
                    pageUrl: im.page_url || meta.page_url || im.url,
                    source: im.engine || 'openserp-images'
                });
                if (imgItem) allImageResults.push(imgItem);
            }

            allImageResults = dedupe(allImageResults);

            var totalImg = (page - 1) * pageSize + allImageResults.length + (hasMore(imgData) ? pageSize : 0);

            res.status(200).json({
                query: q,
                total: totalImg,
                page: page,
                pageSize: pageSize,
                items: allImageResults
            });
            return;

        } else {
            res.status(400).json({ error: 'Invalid type parameter. Must be "web", "image", or "ping"' });
            return;
        }

    } catch (err) {
        console.error('OpenSERP Proxy error:', err);
        res.status(500).json({ error: 'Oodlebot search failed via OpenSERP', details: err.message });
    }
};
