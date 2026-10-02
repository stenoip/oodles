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
var setCors = require('./_cors').setCors;

// Config - Raised timeout to 15s to accommodate slower image engine responses
var TIMEOUT_MS = 15000; 
var DEFAULT_PAGE_SIZE = 10;
var MAX_PAGE_SIZE = 50; 
var PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (Render sleeps at 15m)

var SEARXNG_API_URL = process.env.SEARXNG_API_URL || 'https://oodlesbot.onrender.com';

// Auto Self-Ping Keep-Alive for Render Free Tier
var selfPingTimer = null;
function initSelfPing() {
    if (selfPingTimer) return;

    selfPingTimer = setInterval(function() {
        var targetPingUrl = SEARXNG_API_URL.replace(/\/+$/, '') + '?type=ping';
        fetch(targetPingUrl)
            .then(function(res) {
                console.log('[Keep-Alive] Self-ping successful (' + res.status + ')');
            })
            .catch(function(err) {
                console.error('[Keep-Alive] Self-ping failed:', err.message);
            });
    }, PING_INTERVAL_MS);

    console.log('[Keep-Alive] Self-ping initialized for ' + SEARXNG_API_URL);
}

// Start self-ping loop on module load
initSelfPing();

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
    } catch(e) {}

    return {
        title: title.trim(),
        url: cleanUrl,
        snippet: (snippet || '').trim(),
        source: source || 'searxng'
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
        source: source || 'searxng-images' 
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

// SearXNG Fetchers
function fetchSearxng(query, category, page) {
    if (!category) category = 'general';
    if (!page) page = 1;
    var baseUrl = SEARXNG_API_URL.replace(/\/+$/, '');
    
    // SearXNG expects 'pageno' for page numbers
    var url = baseUrl + '/search?q=' + encodeURIComponent(query) + 
              '&format=json&categories=' + category + 
              '&pageno=' + page;
    
    return fetch(url, { 
        headers: { 
            'Accept': 'application/json',
            'User-Agent': 'OodlesSearch/1.0'
        } 
    }).then(function(resp) {
        if (!resp.ok) {
            throw new Error('SearXNG returned HTTP ' + resp.status + ' for category: ' + category);
        }
        return resp.json();
    });
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
            var data = await withTimeout(fetchSearxng(q, 'general', page), TIMEOUT_MS, 'SearXNG Web Search');
            
            var rawResults = data.results || [];
            var allWebResults = [];
            for (var i = 0; i < rawResults.length; i++) {
                var item = normalize({
                    title: rawResults[i].title,
                    url: rawResults[i].url,
                    snippet: rawResults[i].content,
                    source: rawResults[i].engine || 'searxng'
                });
                if (item) allWebResults.push(item);
            }

            allWebResults = dedupe(allWebResults);

            var totalWeb = data.number_of_results || (page * pageSize + allWebResults.length + 10);

            res.status(200).json({ 
                query: q, 
                total: totalWeb, 
                page: page, 
                pageSize: pageSize, 
                items: allWebResults 
            });
            return;

        } else if (type === 'image') {
            var imgData = await withTimeout(fetchSearxng(q, 'images', page), TIMEOUT_MS, 'SearXNG Image Search');
            
            var rawImages = imgData.results || [];
            var allImageResults = [];
            for (var j = 0; j < rawImages.length; j++) {
                var imgItem = normalizeImage({
                    title: rawImages[j].title,
                    thumbnail: rawImages[j].thumbnail_src || rawImages[j].img_src || rawImages[j].thumbnail || rawImages[j].url,
                    originalUrl: rawImages[j].img_src || rawImages[j].url,
                    pageUrl: rawImages[j].url || rawImages[j].source_url || rawImages[j].img_src,
                    source: rawImages[j].engine || 'searxng-images'
                });
                if (imgItem) allImageResults.push(imgItem);
            }

            allImageResults = dedupe(allImageResults);

            var totalImg = imgData.number_of_results || (page * pageSize + allImageResults.length + 10);

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
        console.error('SearXNG Proxy error:', err);
        res.status(500).json({ error: 'Oodlebot search failed via SearXNG', details: err.message });
    }
};
