// frontend_javascript/search-logic.js

var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 
var OODLES_SEARCH_URL = "https://oodles-backend.vercel.app/metasearch";
var BACKEND_BASE = 'https://oodles-backend.vercel.app';

var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 20; 

var isAIOverviewEnabled = false; 
var lastAIRawText = null;       
var lastFetchedItems = null;    
var aiTimeout = null;           
var allTabImagesCache = [];     

var searchCache = {}; 
var isLoadingMore = false; 
var hasMoreResults = true;

function createRawSearchText(items) {
    if (!items) { return 'No web links found.'; }
    if (items.length === 0) { return 'No web links found.'; }
    
    var textArr = [];
    for (var i = 0; i < items.length; i++) {
        var r = items[i];
        var fullSnippet = 'No snippet available.';
        if (r.snippet) { fullSnippet = r.snippet.trim(); }
        textArr.push('[Index ' + i + '] Title: ' + r.title + '. Snippet: ' + fullSnippet);
    }
    return textArr.join('\n---\n');
}

function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    var rawWebSearchText = createRawSearchText(searchItems);
    var promptText = "User Query: " + query + "\n\nProvide a brief, elegant overview of the topic based strictly on these search results:\n" + rawWebSearchText;

    var requestBody = {
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        system_instruction: { parts: [{ text: "You are Praterich, an AI for Oodles Metasearch. Your mission is to provide a brief, well-written synthesis of the provided search results. Do not output any ranking arrays or tool tags." }] }
    };

    if (overviewEl) {
        if (isAIOverviewEnabled) {
            overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing the your results...</p>';
        }
    }

    fetch(AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('HTTP error');
        }
        return response.json();
    })
    .then(function(data) {
        var aiRawText = data.text;
        lastAIRawText = aiRawText;

        if (isAIOverviewEnabled) {
            if (overviewEl) {
                var finalHTML = aiRawText;
                if (typeof renderMarkdown === 'function') {
                    finalHTML = renderMarkdown(aiRawText);
                }
                overviewEl.innerHTML = finalHTML;
            }
        }
    })
    .catch(function(error) {
        console.error('AI Processing Error:', error);
        if (isAIOverviewEnabled) {
            if (overviewEl) {
                overviewEl.innerHTML = '<p class="ai-overview-error">An error occurred while analyzing results.</p>';
            }
        }
    });
}

function executeSearch(query, type, page) {
    if (!page) { page = 1; }
    if (!query) { return; }

    currentQuery = query;
    currentSearchType = type;
    currentPage = page;
    hasMoreResults = true; 
    var queryInput = document.getElementById('currentQuery');
    if (queryInput) {
        queryInput.value = query;
    }

    var overviewEl = document.getElementById('aiOverview');
    if (overviewEl) { overviewEl.innerHTML = ''; }
    
    lastAIRawText = null; 
    lastFetchedItems = null;

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (citizenMsgEl) {
        var showCitizen = false;
        if (!isAIOverviewEnabled) {
            if (type === 'web') { showCitizen = true; }
            else if (type === 'image') { showCitizen = true; }
            else if (type === 'all') { showCitizen = true; }
        }
        if (showCitizen) {
            citizenMsgEl.style.display = 'block';
        } else {
            citizenMsgEl.style.display = 'none';
        }
    }
    
    if (aiTimeout) { clearTimeout(aiTimeout); }

    var cacheKey = query + '_' + type;
    if (page === 1) {
        if (searchCache[cacheKey]) {
            renderCachedResults(searchCache[cacheKey], type);
            return;
        }
    }

    if (type === 'all') {
        executeAllSearch(query);
    } else if (type === 'web') {
        if (page === 1) {
            var linkEl = document.getElementById('linkResults');
            if (linkEl) { linkEl.innerHTML = '<p class="small">Searching web links...</p>'; }
        }
        var urlWeb = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
        fetch(urlWeb)
            .then(function(resp) { return resp.json(); })
            .then(function(data) {
                searchCache[cacheKey] = data; 
                renderLinkResults(data.items, data.total, false);
                lastFetchedItems = data.items;

                if (page === 1) {
                    if (isAIOverviewEnabled) {
                        aiTimeout = setTimeout(function() {
                            processAIResults(query, data.items);
                        }, 500);
                    }
                }
            })
            .catch(function(error) {
                console.error('Web search error:', error);
                var errEl = document.getElementById('linkResults');
                if (errEl) { errEl.innerHTML = '<p class="small">Error loading web links.</p>'; }
            });
    } else if (type === 'image') {
        if (page === 1) {
            var imgEl = document.getElementById('imageResults');
            if (imgEl) { imgEl.innerHTML = '<p class="small">Searching images...</p>'; }
        }
        var urlImg = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
        fetch(urlImg)
            .then(function(resp) { return resp.json(); })
            .then(function(data) {
                searchCache[cacheKey] = data;
                lastFetchedItems = data.items; 
                renderImageResults(data.items, data.total, false);
            })
            .catch(function(error) {
                console.error('Image search error:', error);
                var errEl2 = document.getElementById('imageResults');
                if (errEl2) { errEl2.innerHTML = '<p class="small">Error loading images.</p>'; }
            });
    } else if (type === 'video') {
        var videoContainer = document.getElementById('videoResults');
        if (videoContainer) {
            videoContainer.innerHTML = '<p class="small">Searching YouTube...</p>';
            var urlVid = BACKEND_BASE + '/video-search?query=' + encodeURIComponent(query);
            fetch(urlVid)
                .then(function(resp) { return resp.json(); })
                .then(function(data) {
                    searchCache[cacheKey] = data;
                    renderVideoResults(data);
                })
                .catch(function(error) {
                    console.error('Video search error:', error);
                    videoContainer.innerHTML = '<p class="small">Error loading videos.</p>';
                });
        }
    }
}

function renderCachedResults(cachedData, type) {
    if (type === 'web') {
        renderLinkResults(cachedData.items, cachedData.total, false);
        lastFetchedItems = cachedData.items;
        if (lastFetchedItems) {
            if (lastFetchedItems.length > 0) {
                if (isAIOverviewEnabled) {
                    processAIResults(currentQuery, lastFetchedItems);
                }
            }
        }
    } else if (type === 'image') {
        lastFetchedItems = cachedData.items;
        renderImageResults(cachedData.items, cachedData.total, false);
    } else if (type === 'video') {
        renderVideoResults(cachedData);
    } else if (type === 'all') {
        renderAllResults(currentQuery, cachedData.web, cachedData.img, cachedData.vid);
    }
}

function executeAllSearch(query) {
    var allContainer = document.getElementById('allResults');
    if (!allContainer) { return; }
    
    if (typeof SERP_MODULE !== 'undefined') {
        if (SERP_MODULE.clearAll) {
            SERP_MODULE.clearAll();
        }
    }
    
    allContainer.innerHTML = 
        '<div id="all-web-top-holder"><p class="small">Gathering web links...</p></div>' +
        '<div id="all-image-holder"></div>' +
        '<div id="all-video-holder"></div>' +
        '<div id="all-web-bottom-holder"></div>' +
        '<div id="all-more-btn-holder" style="text-align:center; margin-top:15px; display:none;">' +
            '<button class="frutiger-aero-tab" onclick="switchTab(\'web\', true)">See more results</button>' +
        '</div>';

    var webPayload = null;
    var imgPayload = null;
    var vidPayload = null;
    var cacheKey = query + '_all';

    var urlWebAll = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=1&pageSize=10';
    fetch(urlWebAll)
        .then(function(res) { return res.json(); })
        .then(function(webData) {
            webPayload = webData;
            lastFetchedItems = webData.items;
            
            if (typeof SERP_MODULE !== 'undefined') {
                if (webData.items) {
                    if (webData.items.length > 0) {
                        var p = SERP_MODULE.renderFeaturedSnippet(webData.items, query);
                        if (p) {
                            if (p.then) {
                                p.then(function() {
                                    SERP_MODULE.renderPopularProducts(webData.items);
                                    SERP_MODULE.renderKnowledgePanel(query);
                                });
                            } else {
                                SERP_MODULE.renderPopularProducts(webData.items);
                                SERP_MODULE.renderKnowledgePanel(query);
                            }
                        } else {
                            SERP_MODULE.renderPopularProducts(webData.items);
                            SERP_MODULE.renderKnowledgePanel(query);
                            SERP_MODULE.renderDictionaryCard(query);
                        }
                    }
                }
            }

            var topEl = document.getElementById('all-web-top-holder');
            var bottomEl = document.getElementById('all-web-bottom-holder');
            var btnEl = document.getElementById('all-more-btn-holder');

            if (webData.items) {
                if (webData.items.length > 0) {
                    var topLinksHtml = '';
                    for (var wTop = 0; wTop < 3; wTop++) {
                        if (webData.items[wTop]) { topLinksHtml += renderSingleLink(webData.items[wTop]); }
                    }
                    if (topEl) { topEl.innerHTML = topLinksHtml; }
                    
                    var botLinksHtml = '';
                    for (var wBot = 3; wBot < 8; wBot++) {
                        if (webData.items[wBot]) { botLinksHtml += renderSingleLink(webData.items[wBot]); }
                    }
                    if (bottomEl) { bottomEl.innerHTML = botLinksHtml; }
                    
                    if (btnEl) { btnEl.style.display = 'block'; }
                    
                    if (isAIOverviewEnabled) {
                        processAIResults(query, webData.items);
                    }
                } else {
                    if (topEl) { topEl.innerHTML = '<p class="small">No web links found.</p>'; }
                }
            } else {
                if (topEl) { topEl.innerHTML = '<p class="small">No web links found.</p>'; }
            }
            saveAllCache(cacheKey, webPayload, imgPayload, vidPayload);
        }).catch(function(err) {
            var errTopEl = document.getElementById('all-web-top-holder');
            if (errTopEl) { errTopEl.innerHTML = '<p class="small">Error loading links.</p>'; }
        });

    var urlImgAll = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=1&pageSize=8';
    fetch(urlImgAll)
        .then(function(res) { return res.json(); })
        .then(function(imgData) {
            imgPayload = imgData;
            var imgEl = document.getElementById('all-image-holder');
            if (imgData.items) {
                if (imgData.items.length > 0) {
                    allTabImagesCache = imgData.items;
                    var stripHtml = '<div class="all-image-strip" style="margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">' +
                        '<h4 class="small" style="margin-top:0; margin-bottom: 10px; color: #0277bd;">Images for ' + escapeHtml(query) + '</h4>' +
                        '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
                    for (var imgIdx = 0; imgIdx < imgData.items.length; imgIdx++) {
                        var imgObj = imgData.items[imgIdx];
                        stripHtml += '<img src="' + imgObj.thumbnail + '" onclick="openImageModalFromAll(' + imgIdx + ')" title="' + escapeHtml(imgObj.title) + '" style="height: 120px; border-radius: 8px; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: transform 0.2s;">';
                    }
                    stripHtml += '</div></div>';
                    if (imgEl) { imgEl.innerHTML = stripHtml; }
                }
            }
            saveAllCache(cacheKey, webPayload, imgPayload, vidPayload);
        }).catch(function(err) {
            console.error("Img cross-stream fail", err);
        });

    var urlVidAll = BACKEND_BASE + '/video-search?query=' + encodeURIComponent(query);
    fetch(urlVidAll)
        .then(function(res) { return res.json(); })
        .then(function(vidData) {
            vidPayload = vidData;
            var vidEl = document.getElementById('all-video-holder');
            if (vidData) {
                if (vidData.length > 0) {
                    var v = vidData[0];
                    if (vidEl) {
                        vidEl.innerHTML = '<div class="all-video-featured" style="margin: 20px 0; display: flex; flex-wrap: wrap; gap: 15px; background: linear-gradient(to right, rgba(225, 245, 254, 0.6), rgba(255, 255, 255, 0.4)); padding: 15px; border-radius: 12px; border: 1px solid rgba(179, 229, 252, 0.8);">' +
                            '<div style="flex: 0 0 auto;">' +
                                '<iframe src="https://www.youtube.com/embed/' + v.id.videoId + '" style="width: 240px; aspect-ratio: 16/9; border-radius: 8px; border: 1px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" allowfullscreen></iframe>' +
                            '</div>' +
                            '<div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: center;">' +
                                '<h4 style="margin:0 0 5px 0; font-size:15px; color: #01579b;">Featured Video</h4>' +
                                '<a href="https://www.youtube.com/watch?v=' + v.id.videoId + '" target="_blank" style="font-weight:bold; text-decoration: none; color: #0288d1; font-size: 1.1em;">' +
                                    escapeHtml(v.snippet.title) +
                                '</a>' +
                                '<p class="small" style="margin-top:5px; opacity:0.8;">' + escapeHtml(v.snippet.channelTitle) + '</p>' +
                            '</div>' +
                        '</div>';
                    }
                }
            }
            saveAllCache(cacheKey, webPayload, imgPayload, vidPayload);
        }).catch(function(err) {
            console.error("Video stream fail", err);
        });
}

function saveAllCache(key, web, img, vid) {
    if (web) {
        if (img) {
            if (vid) {
                searchCache[key] = { web: web, img: img, vid: vid };
            }
        }
    }
}

function loadMoreInfiniteResults() {
    if (isLoadingMore) { return; }
    if (!hasMoreResults) { return; }
    if (currentSearchType === 'all') { return; }
    if (currentSearchType === 'video') { return; }

    isLoadingMore = true;
    currentPage++;

    var targetId = 'imageResults';
    if (currentSearchType === 'web') {
        targetId = 'linkResults';
    }
    var container = document.getElementById(targetId);

    var scrollLoader = document.createElement('div');
    scrollLoader.id = 'infinite-scroll-loader';
    scrollLoader.innerHTML = '<p class="small" style="text-align:center; padding:15px; color:#0288d1;">Loading more results matches...</p>';
    if (container) {
        container.appendChild(scrollLoader);
    }

    var urlMore = '';
    if (currentSearchType === 'web') {
        urlMore = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(currentQuery) + '&page=' + currentPage + '&pageSize=' + MAX_PAGE_SIZE;
    } else if (currentSearchType === 'image') {
        urlMore = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(currentQuery) + '&type=image&page=' + currentPage + '&pageSize=' + MAX_PAGE_SIZE;
    }

    fetch(urlMore)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var loaderEl = document.getElementById('infinite-scroll-loader');
            if (loaderEl) { loaderEl.remove(); }

            if (data.items) {
                if (data.items.length > 0) {
                    lastFetchedItems = lastFetchedItems.concat(data.items);
                    if (currentSearchType === 'web') {
                        renderLinkResults(data.items, data.total, true);
                    } else if (currentSearchType === 'image') {
                        renderImageResults(data.items, data.total, true);
                    }
                } else {
                    hasMoreResults = false;
                }
            } else {
                hasMoreResults = false;
            }
        })
        .catch(function(e) {
            console.error("Infinite scroll compilation error:", e);
            var errLoaderEl = document.getElementById('infinite-scroll-loader');
            if (errLoaderEl) { errLoaderEl.remove(); }
        })
        .then(function() {
            isLoadingMore = false;
        });
}
