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

var XMLHttpRequest = global.XMLHttpRequest;
if (!XMLHttpRequest) {
    try {
        XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
    } catch (e) {}
}

var setCors = require('./_cors').setCors;

var TIMEOUT_MS = 15000;
var DEFAULT_PAGE_SIZE = 10;
var MAX_PAGE_SIZE = 50;
var PING_INTERVAL_MS = 14 * 60 * 1000;

var SEARXNG_API_URL = process.env.SEARXNG_API_URL || 'https://oodlesbot.onrender.com';

function ajax(options, callback) {
    var xhr = new XMLHttpRequest();
    var method = options.method || 'GET';
    xhr.open(method, options.url, true);

    if (options.headers) {
        var keys = Object.keys(options.headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            xhr.setRequestHeader(key, options.headers[key]);
        }
    }

    if (options.timeout) {
        xhr.timeout = options.timeout;
    }

    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            callback(null, xhr.responseText);
        } else {
            callback(new Error('HTTP ' + xhr.status));
        }
    };

    xhr.onerror = function() {
        callback(new Error('Network error'));
    };

    xhr.ontimeout = function() {
        callback(new Error('Request timed out'));
    };

    xhr.send(options.body || null);
}

var selfPingTimer = null;
function initSelfPing() {
    if (selfPingTimer) return;

    selfPingTimer = setInterval(function() {
        var targetPingUrl = SEARXNG_API_URL.replace(/\/+$/, '') + '?type=ping';
        ajax({ url: targetPingUrl, timeout: 10000 }, function(err) {
            if (err) {
                console.error('[Keep-Alive] Self-ping failed:', err.message);
            } else {
                console.log('[Keep-Alive] Self-ping successful');
            }
        });
    }, PING_INTERVAL_MS);
}

initSelfPing();

function normalize(data) {
    var title = data.title;
    var cleanUrl = data.url;
    var snippet = data.snippet;
    var source = data.source || 'searxng';

    if (!cleanUrl || !title) return null;

    var urlParts = cleanUrl.split('?');
    if (urlParts.length > 1) {
        var base = urlParts[0];
        var queryStr = urlParts.slice(1).join('?');
        var params = queryStr.split('&');
        var cleanParams = [];
        for (var i = 0; i < params.length; i++) {
            var p = params[i];
            var pair = p.split('=');
            var k = pair[0];
            if (k !== 'utm_source' && k !== 'utm_medium' && k !== 'utm_campaign' && k !== 'ref' && k !== 'click_id') {
                cleanParams.push(p);
            }
        }
        if (cleanParams.length > 0) {
            cleanUrl = base + '?' + cleanParams.join('&');
        } else {
            cleanUrl = base;
        }
    }

    var snip = snippet || '';

    return {
        title: title.trim(),
        url: cleanUrl,
        snippet: snip.trim(),
        source: source
    };
}

function normalizeImage(data) {
    var title = data.title || '';
    var thumbnail = data.thumbnail || data.originalUrl;
    var originalUrl = data.originalUrl || data.thumbnail;
    var pageUrl = data.pageUrl || originalUrl || '#';
    var source = data.source || 'searxng-images';

    if (!thumbnail && !originalUrl) return null;
    return { 
        title: title.trim(),
        thumbnail: thumbnail, 
        originalUrl: originalUrl, 
        pageUrl: pageUrl, 
        source: source 
    };
}

function dedupe(items) {
    var seen = {};
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        try {
            var targetUrl = it.originalUrl || it.url || it.pageUrl || '';
            var parts = targetUrl.split('/');
            var hostAndPath = parts.slice(2).join('/');
            var key = hostAndPath.toLowerCase();
            if (!seen[key]) {
                seen[key] = true;
                out.push(it);
            }
        } catch (e) {}
    }
    return out;
}

function fetchSearxng(query, category, page, callback) {
    if (!category) category = 'general';
    if (!page) page = 1;
    var baseUrl = SEARXNG_API_URL.replace(/\/+$/, '');
    var targetUrl = baseUrl + '/search?q=' + encodeURIComponent(query) + 
                    '&format=json&categories=' + category + 
                    '&pageno=' + page;

    ajax({
        url: targetUrl,
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'OodlesSearch/1.0'
        },
        timeout: TIMEOUT_MS
    }, function(err, body) {
        if (err) {
            return callback(err);
        }
        try {
            var parsed = JSON.parse(body);
            callback(null, parsed);
        } catch (e) {
            callback(e);
        }
    });
}

module.exports = function(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    var reqQuery = req.query || {};
    var type = (reqQuery.type || 'web').trim();

    if (type === 'ping') {
        res.status(200).json({ status: 'ok', message: 'pong', timestamp: Date.now() });
        return;
    }

    var q = (reqQuery.q || '').trim();

    if (!q) {
        res.status(400).json({ error: 'Missing query parameter q' });
        return;
    }

    var pageParam = reqQuery.page || '1';
    var page = Math.max(1, parseInt(pageParam, 10));

    var pageSizeParam = reqQuery.pageSize || String(DEFAULT_PAGE_SIZE);
    var pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(5, parseInt(pageSizeParam, 10))
    );

    if (type === 'web') {
        fetchSearxng(q, 'general', page, function(err, data) {
            if (err) {
                console.error('SearXNG Proxy error:', err);
                res.status(500).json({ error: 'Oodlebot search failed via SearXNG', details: err.message });
                return;
            }
            var rawResults = [];
            if (data && data.results) {
                rawResults = data.results;
            }
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
            var totalWeb = page * pageSize + allWebResults.length + 10;
            if (data && data.number_of_results) {
                totalWeb = data.number_of_results;
            }

            res.status(200).json({ 
                query: q, 
                total: totalWeb, 
                page: page, 
                pageSize: pageSize, 
                items: allWebResults 
            });
        });
    } else if (type === 'image') {
        fetchSearxng(q, 'images', page, function(err, imgData) {
            if (err) {
                console.error('SearXNG Proxy error:', err);
                res.status(500).json({ error: 'Oodlebot search failed via SearXNG', details: err.message });
                return;
            }
            var rawImages = [];
            if (imgData && imgData.results) {
                rawImages = imgData.results;
            }
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
            var totalImg = page * pageSize + allImageResults.length + 10;
            if (imgData && imgData.number_of_results) {
                totalImg = imgData.number_of_results;
            }

            res.status(200).json({
                query: q,
                total: totalImg,
                page: page,
                pageSize: pageSize,
                items: allImageResults
            });
        });
    } else {
        res.status(400).json({ error: 'Invalid type parameter. Must be "web", "image", or "ping"' });
    }
};
