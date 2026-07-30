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

// Config
var TIMEOUT_MS = 8000; 
var DEFAULT_PAGE_SIZE = 10;
var MAX_PAGE_SIZE = 50; 


var SEARXNG_API_URL = process.env.SEARXNG_API_URL || 'https://searx.be';


function withTimeout(promise, ms, label) {
    var t;
    var timeout = new Promise(function(resolve, reject) {
        t = setTimeout(function() {
            reject(new Error(label + ' timed out'));
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
    var thumbnail = data.thumbnail;
    var originalUrl = data.originalUrl;
    var pageUrl = data.pageUrl;
    var source = data.source;

    if (!thumbnail || !originalUrl || !pageUrl) return null;
    return { 
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

function paginate(items, page, pageSize) {
    var start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

// SearXNG Fetchers
function fetchSearxng(query, category) {
    if (!category) category = 'general';
    var url = SEARXNG_API_URL + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=' + category;
    
    return fetch(url, { 
        headers: { 
            'Accept': 'application/json',
            'User-Agent': 'OodlesSearch/1.0'
        } 
    }).then(function(resp) {
        if (!resp.ok) {
            throw new Error('SearXNG error: ' + resp.status + ' for query: ' + query);
        }
        return resp.json();
    });
}

//  Main handler 
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
            var data = await withTimeout(fetchSearxng(q, 'general'), TIMEOUT_MS, 'SearXNG Web Search');
            
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

            var totalWeb = allWebResults.length;
            var webItems = paginate(allWebResults, page, pageSize);

            res.status(200).json({ query: q, total: totalWeb, page: page, pageSize: pageSize, items: webItems });
            return;

        } else if (type === 'image') {
            var imgData = await withTimeout(fetchSearxng(q, 'images'), TIMEOUT_MS, 'SearXNG Image Search');
            
            var rawImages = imgData.results || [];
            var allImageResults = [];
            for (var j = 0; j < rawImages.length; j++) {
                var imgItem = normalizeImage({
                    thumbnail: rawImages[j].img_src || rawImages[j].thumbnail || rawImages[j].url,
                    originalUrl: rawImages[j].url,
                    pageUrl: rawImages[j].template || rawImages[j].url,
                    source: rawImages[j].engine || 'searxng-images'
                });
                if (imgItem) allImageResults.push(imgItem);
            }

            allImageResults = dedupe(allImageResults);

            var totalImg = allImageResults.length;
            var imgItems = paginate(allImageResults, page, pageSize);

            res.status(200).json({
                query: q,
                total: totalImg,
                page: page,
                pageSize: pageSize,
                items: imgItems
            });
            return;

        } else {
             res.status(400).json({ error: 'Invalid type parameter. Must be "web" or "image"' });
             return;
        }

    } catch (err) {
        console.error('SearXNG Proxy error:', err);
        res.status(500).json({ error: 'Oodlebot search failed via SearXNG' });
    }
};
