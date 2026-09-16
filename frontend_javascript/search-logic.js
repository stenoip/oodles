// Configuration URLs
var AI_API_URL = "https://praterich.vercel.app/api/praterich";
var BACKEND_BASE = 'https://oodles-backend.vercel.app';

// Global state variables
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

// Helper: Make text safe to put in HTML (prevent XSS)
function escapeHtml(str) {
    if (!str) {
        return '';
    }
    var div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

// Helper: Build HTML for one web search link
function renderSingleLink(item) {
    if (!item) {
        return '';
    }
    var title = escapeHtml(item.title || 'Untitled');
    var url = escapeHtml(item.url || '#');
    var snippet = escapeHtml(item.snippet || 'No snippet available.');
    var source = escapeHtml(item.source || 'web');

    var sourceHtml = '';
    if (source) {
        sourceHtml = '<span style="font-size: 11px; color: #70757a; background: #f1f3f4; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">' + source + '</span>';
    }

    return '<div class="search-result-item" style="margin-bottom: 20px;">' +
        '<div style="font-size: 12px; color: #5f6368; word-break: break-all;">' + url + '</div>' +
        '<h3 style="margin: 2px 0 4px 0; font-size: 18px;"><a href="' + url + '" target="_blank" style="color: #1a0dab; text-decoration: none;">' + title + '</a></h3>' +
        '<div style="font-size: 14px; color: #4d5156; line-height: 1.5;">' + snippet + '</div>' +
        sourceHtml +
    '</div>';
}

// Display web link search results on the page
function renderLinkResults(items, total, append) {
    var container = document.getElementById('linkResults');
    if (!container) {
        return;
    }

    if (!items || items.length === 0) {
        if (!append) {
            container.innerHTML = '<p class="small">No web links found.</p>';
        }
        return;
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
        html += renderSingleLink(items[i]);
    }

    if (append) {
        container.innerHTML += html;
    } else {
        container.innerHTML = html;
    }
}

// Display image search results in a grid
function renderImageResults(items, total, append) {
    var container = document.getElementById('imageResults');
    if (!container) {
        return;
    }

    if (!items || items.length === 0) {
        if (!append) {
            container.innerHTML = '<p class="small">No images found.</p>';
        }
        return;
    }

    var html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px;">';
    for (var i = 0; i < items.length; i++) {
        var img = items[i];
        var thumb = escapeHtml(img.thumbnail || img.originalUrl);
        var pageUrl = escapeHtml(img.pageUrl || img.originalUrl || '#');
        html += '<a href="' + pageUrl + '" target="_blank" style="display: block; border-radius: 8px; overflow: hidden; border: 1px solid #ccc;">' +
                    '<img src="' + thumb + '" style="width: 100%; height: 120px; object-fit: cover; display: block;" />' +
                '</a>';
    }
    html += '</div>';

    if (append) {
        container.innerHTML += html;
    } else {
        container.innerHTML = html;
    }
}

// Display YouTube video results
function renderVideoResults(items) {
    var container = document.getElementById('videoResults');
    if (!container) {
        return;
    }

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="small">No videos found.</p>';
        return;
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
        var v = items[i];
        var videoId = '';
        if (v.id) {
            videoId = v.id.videoId || v.id;
        }
        var title = 'Video';
        if (v.snippet) {
            title = escapeHtml(v.snippet.title);
        }
        var channel = '';
        if (v.snippet) {
            channel = escapeHtml(v.snippet.channelTitle);
        }

        html += '<div style="margin-bottom: 15px;">' +
            '<iframe src="https://www.youtube.com/embed/' + videoId + '" style="width: 100%; max-width: 400px; aspect-ratio: 16/9; border-radius: 8px;" allowfullscreen></iframe>' +
            '<h4>' + title + '</h4>' +
            '<p class="small">' + channel + '</p>' +
        '</div>';
    }
    container.innerHTML = html;
}

// Combine all snippets together to send to the AI
function createRawSearchText(items) {
    if (!items || items.length === 0) {
        return 'No web links found.';
    }
    var textArr = [];
    for (var i = 0; i < items.length; i++) {
        var r = items[i];
        var snippet = 'No snippet available.';
        if (r.snippet) {
            snippet = r.snippet.trim();
        }
        var titleText = 'Untitled';
        if (r.title) {
            titleText = r.title;
        }
        textArr.push('[Index ' + i + '] Title: ' + titleText + '. Snippet: ' + snippet);
    }
    return textArr.join('\n---\n');
}

// Call AI API using XMLHttpRequest to get an overview summary
function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview');
    var rawText = createRawSearchText(searchItems);
    var promptText = "User Query: " + query + "\n\nProvide a brief, elegant overview of the topic based strictly on these search results:\n" + rawText;

    var requestBody = {
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        system_instruction: { parts: [{ text: "You are Praterich, an AI for Oodles Metasearch. Your mission is to provide a brief, well-written synthesis of the provided search results. Do not output any ranking arrays or tool tags." }] }
    };

    if (overviewEl && isAIOverviewEnabled) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing your results...</p>';
    }

    var ourRequest = new XMLHttpRequest();
    ourRequest.open('POST', AI_API_URL, true);
    ourRequest.setRequestHeader('Content-Type', 'application/json');

    ourRequest.onreadystatechange = function() {
        if (ourRequest.readyState === 4) {
            if (ourRequest.status >= 200 && ourRequest.status < 300) {
                var data = JSON.parse(ourRequest.responseText);
                lastAIRawText = data.text;
                if (isAIOverviewEnabled && overviewEl) {
                    if (typeof renderMarkdown === 'function') {
                        overviewEl.innerHTML = renderMarkdown(lastAIRawText);
                    } else {
                        overviewEl.innerHTML = lastAIRawText;
                    }
                }
            } else {
                console.error('AI Processing Error: HTTP status ' + ourRequest.status);
                if (isAIOverviewEnabled && overviewEl) {
                    overviewEl.innerHTML = '<p class="ai-overview-error">An error occurred while analyzing results.</p>';
                }
            }
        }
    };

    ourRequest.send(JSON.stringify(requestBody));
}

// Main function to run a search using XMLHttpRequest
function executeSearch(query, type, page) {
    if (!page) {
        page = 1;
    }
    if (!query) {
        return;
    }

    currentQuery = query;
    currentSearchType = type;
    currentPage = page;
    hasMoreResults = true;

    var queryInput = document.getElementById('currentQuery');
    if (queryInput) {
        queryInput.value = query;
    }

    var overviewEl = document.getElementById('aiOverview');
    if (overviewEl) {
        overviewEl.innerHTML = '';
    }

    var pagEl = document.getElementById('paginationContainer');
    if (pagEl) {
        pagEl.innerHTML = '';
    }

    lastAIRawText = null;
    lastFetchedItems = null;

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (citizenMsgEl) {
        var showCitizen = false;
        if (!isAIOverviewEnabled) {
            if (type === 'web' || type === 'image' || type === 'all') {
                showCitizen = true;
            }
        }
        if (showCitizen) {
            citizenMsgEl.style.display = 'block';
        } else {
            citizenMsgEl.style.display = 'none';
        }
    }

    if (aiTimeout) {
        clearTimeout(aiTimeout);
    }

    var cacheKey = query + '_' + type;
    if (page === 1 && searchCache[cacheKey]) {
        renderCachedResults(searchCache[cacheKey], type);
        return;
    }

    if (type === 'all') {
        executeAllSearch(query);
        return;
    }

    var targetId = 'linkResults';
    if (type === 'image') {
        targetId = 'imageResults';
    } else if (type === 'video') {
        targetId = 'videoResults';
    }

    var targetEl = document.getElementById(targetId);
    if (page === 1 && targetEl) {
        var label = 's';
        if (type === 'video') {
            label = 'YouTube';
        } else {
            label = type + 's';
        }
        targetEl.innerHTML = '<p class="small">Searching ' + label + '...</p>';
    }

    var url = BACKEND_BASE;
    if (type === 'video') {
        url += '/video-search?query=' + encodeURIComponent(query);
    } else {
        url += '/metasearch?q=' + encodeURIComponent(query);
        if (type === 'image') {
            url += '&type=image';
        }
        url += '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
    }

    var ourRequest = new XMLHttpRequest();
    ourRequest.open('GET', url, true);

    ourRequest.onreadystatechange = function() {
        if (ourRequest.readyState === 4) {
            if (ourRequest.status >= 200 && ourRequest.status < 300) {
                var data = JSON.parse(ourRequest.responseText);
                searchCache[cacheKey] = data;

                if (type === 'video') {
                    renderVideoResults(data);
                } else {
                    lastFetchedItems = data.items;
                    if (type === 'web') {
                        var shouldAppend = false;
                        if (page > 1) {
                            shouldAppend = true;
                        }
                        renderLinkResults(data.items, data.total, shouldAppend);
                    } else if (type === 'image') {
                        var shouldAppendImg = false;
                        if (page > 1) {
                            shouldAppendImg = true;
                        }
                        renderImageResults(data.items, data.total, shouldAppendImg);
                    }
                    renderPagination(data.total, data.page, data.pageSize);

                    if (type === 'web' && page === 1 && isAIOverviewEnabled) {
                        aiTimeout = setTimeout(function() {
                            processAIResults(query, data.items);
                        }, 500);
                    }
                }
            } else {
                console.error('Search error: HTTP status ' + ourRequest.status);
                if (targetEl) {
                    targetEl.innerHTML = '<p class="small">Error loading results.</p>';
                }
            }
        }
    };

    ourRequest.send();
}

// Load results from local cache instead of fetching again
function renderCachedResults(cachedData, type) {
    if (type === 'web') {
        renderLinkResults(cachedData.items, cachedData.total, false);
        lastFetchedItems = cachedData.items;
        if (lastFetchedItems && lastFetchedItems.length > 0 && isAIOverviewEnabled) {
            processAIResults(currentQuery, lastFetchedItems);
        }
    } else if (type === 'image') {
        lastFetchedItems = cachedData.items;
        renderImageResults(cachedData.items, cachedData.total, false);
    } else if (type === 'video') {
        renderVideoResults(cachedData);
    } else if (type === 'all') {
        executeAllSearch(currentQuery);
    }
}

// Handle "All" tab search using multiple XMLHttpRequest objects
function executeAllSearch(query) {
    var allContainer = document.getElementById('allResults');
    if (!allContainer) {
        return;
    }

    if (typeof SERP_MODULE !== 'undefined' && SERP_MODULE.clearAll) {
        SERP_MODULE.clearAll();
    }

    allContainer.innerHTML =
        '<div id="all-web-top-holder"><p class="small">Gathering web links...</p></div>' +
        '<div id="all-image-holder"></div>' +
        '<div id="all-video-holder"></div>' +
        '<div id="all-web-bottom-holder"></div>' +
        '<div id="all-more-btn-holder" style="text-align:center; margin-top:15px; display:none;">' +
            '<button class="frutiger-aero-tab" onclick="switchTab(\'web\', true)">See more results</button>' +
        '</div>';

    var cacheKey = query + '_all';
    var urlWeb = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=1&pageSize=10';
    var urlImg = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=1&pageSize=8';
    var urlVid = BACKEND_BASE + '/video-search?query=' + encodeURIComponent(query);

    var webData = null;
    var imgData = null;
    var vidData = null;
    var completedCount = 0;

    function checkAllComplete() {
        completedCount++;
        if (completedCount < 3) {
            return;
        }

        // 1. Handle Web Results
        if (webData && webData.items) {
            lastFetchedItems = webData.items || [];
            if (typeof SERP_MODULE !== 'undefined' && webData.items.length > 0) {
                var p = null;
                if (SERP_MODULE.renderFeaturedSnippet) {
                    p = SERP_MODULE.renderFeaturedSnippet(webData.items, query);
                }
                var showSerpWidgets = function() {
                    if (SERP_MODULE.renderPopularProducts) {
                        SERP_MODULE.renderPopularProducts(webData.items);
                    }
                    if (SERP_MODULE.renderKnowledgePanel) {
                        SERP_MODULE.renderKnowledgePanel(query);
                    }
                    if (SERP_MODULE.renderDictionaryCard) {
                        SERP_MODULE.renderDictionaryCard(query);
                    }
                };
                if (p && typeof p.then === 'function') {
                    p.then(showSerpWidgets);
                } else {
                    showSerpWidgets();
                }
            }

            var topEl = document.getElementById('all-web-top-holder');
            var bottomEl = document.getElementById('all-web-bottom-holder');
            var btnEl = document.getElementById('all-more-btn-holder');

            if (webData.items.length > 0) {
                var topHtml = '';
                var bottomHtml = '';
                for (var i = 0; i < webData.items.length; i++) {
                    if (i < 3) {
                        topHtml += renderSingleLink(webData.items[i]);
                    } else if (i < 8) {
                        bottomHtml += renderSingleLink(webData.items[i]);
                    }
                }
                if (topEl) {
                    topEl.innerHTML = topHtml;
                }
                if (bottomEl) {
                    bottomEl.innerHTML = bottomHtml;
                }
                if (btnEl) {
                    btnEl.style.display = 'block';
                }
                if (isAIOverviewEnabled) {
                    processAIResults(query, webData.items);
                }
            } else {
                if (topEl) {
                    topEl.innerHTML = '<p class="small">No web links found.</p>';
                }
            }
        } else {
            var errTopEl = document.getElementById('all-web-top-holder');
            if (errTopEl) {
                errTopEl.innerHTML = '<p class="small">Error loading links.</p>';
            }
        }

        // 2. Handle Image Strip
        if (imgData && imgData.items && imgData.items.length > 0) {
            var imgEl = document.getElementById('all-image-holder');
            allTabImagesCache = imgData.items;
            var stripHtml = '<div class="all-image-strip" style="margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">' +
                '<h4 class="small" style="margin-top:0; margin-bottom: 10px; color: #0277bd;">Images for ' + escapeHtml(query) + '</h4>' +
                '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
            for (var j = 0; j < imgData.items.length; j++) {
                var img = imgData.items[j];
                var imgTitle = query;
                if (img.title) {
                    imgTitle = img.title;
                }
                stripHtml += '<img src="' + escapeHtml(img.thumbnail) + '" onclick="if(typeof openImageModalFromAll===\'function\') openImageModalFromAll(' + j + ')" title="' + escapeHtml(imgTitle) + '" style="height: 120px; border-radius: 8px; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">';
            }
            stripHtml += '</div></div>';
            if (imgEl) {
                imgEl.innerHTML = stripHtml;
            }
        }

        // 3. Handle Featured Video
        if (vidData && vidData.length > 0) {
            var vidEl = document.getElementById('all-video-holder');
            var v = vidData[0];
            var vidId = '';
            if (v.id) {
                vidId = v.id.videoId || v.id;
            }
            var vTitle = 'Featured Video';
            if (v.snippet) {
                vTitle = escapeHtml(v.snippet.title);
            }
            var vChan = '';
            if (v.snippet) {
                vChan = escapeHtml(v.snippet.channelTitle);
            }
            if (vidEl) {
                vidEl.innerHTML = '<div class="all-video-featured" style="margin: 20px 0; display: flex; flex-wrap: wrap; gap: 15px; background: linear-gradient(to right, rgba(225, 245, 254, 0.6), rgba(255, 255, 255, 0.4)); padding: 15px; border-radius: 12px; border: 1px solid rgba(179, 229, 252, 0.8);">' +
                    '<div style="flex: 0 0 auto;"><iframe src="https://www.youtube.com/embed/' + vidId + '" style="width: 240px; aspect-ratio: 16/9; border-radius: 8px; border: 1px solid #fff;" allowfullscreen></iframe></div>' +
                    '<div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: center;">' +
                        '<h4 style="margin:0 0 5px 0; font-size:15px; color: #01579b;">Featured Video</h4>' +
                        '<a href="https://www.youtube.com/watch?v=' + vidId + '" target="_blank" style="font-weight:bold; text-decoration: none; color: #0288d1; font-size: 1.1em;">' + vTitle + '</a>' +
                        '<p class="small" style="margin-top:5px; opacity:0.8;">' + vChan + '</p>' +
                    '</div>' +
                '</div>';
            }
        }

        searchCache[cacheKey] = { web: webData, img: imgData, vid: vidData };
    }

    // Request 1: Web
    var reqWeb = new XMLHttpRequest();
    reqWeb.open('GET', urlWeb, true);
    reqWeb.onreadystatechange = function() {
        if (reqWeb.readyState === 4) {
            if (reqWeb.status >= 200 && reqWeb.status < 300) {
                webData = JSON.parse(reqWeb.responseText);
            }
            checkAllComplete();
        }
    };
    reqWeb.send();

    // Request 2: Image
    var reqImg = new XMLHttpRequest();
    reqImg.open('GET', urlImg, true);
    reqImg.onreadystatechange = function() {
        if (reqImg.readyState === 4) {
            if (reqImg.status >= 200 && reqImg.status < 300) {
                imgData = JSON.parse(reqImg.responseText);
            }
            checkAllComplete();
        }
    };
    reqImg.send();

    // Request 3: Video
    var reqVid = new XMLHttpRequest();
    reqVid.open('GET', urlVid, true);
    reqVid.onreadystatechange = function() {
        if (reqVid.readyState === 4) {
            if (reqVid.status >= 200 && reqVid.status < 300) {
                vidData = JSON.parse(reqVid.responseText);
            }
            checkAllComplete();
        }
    };
    reqVid.send();
}

// Pagination navigation
function goToPage(page) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    executeSearch(currentQuery, currentSearchType, page);
}

// Generate pagination buttons at the bottom
function renderPagination(total, currentPage, pageSize) {
    var container = document.getElementById('paginationContainer');
    if (!container) {
        return;
    }

    if (!total || total <= pageSize) {
        container.innerHTML = '';
        return;
    }

    var totalPages = Math.ceil(total / pageSize);
    var maxPagesToShow = 10;
    var startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    var endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    var html = '';
    if (currentPage > 1) {
        html += '<button class="pagination-btn" onclick="goToPage(' + (currentPage - 1) + ')">&laquo; Prev</button>';
    } else {
        html += '<button class="pagination-btn disabled" disabled>&laquo; Prev</button>';
    }

    for (var p = startPage; p <= endPage; p++) {
        if (p === currentPage) {
            html += '<button class="pagination-btn active">' + p + '</button>';
        } else {
            html += '<button class="pagination-btn" onclick="goToPage(' + p + ')">' + p + '</button>';
        }
    }

    if (currentPage < totalPages) {
        html += '<button class="pagination-btn" onclick="goToPage(' + (currentPage + 1) + ')">Next &raquo;</button>';
    } else {
        html += '<button class="pagination-btn disabled" disabled>Next &raquo;</button>';
    }

    container.innerHTML = html;
}

// Save complete cache pack
function saveAllCache(key, web, img, vid) {
    if (web && img && vid) {
        searchCache[key] = { web: web, img: img, vid: vid };
    }
}

// Infinite scroll loader using XMLHttpRequest
function loadMoreInfiniteResults() {
    if (isLoadingMore) {
        return;
    }
    if (!hasMoreResults) {
        return;
    }
    if (currentSearchType === 'all' || currentSearchType === 'video') {
        return;
    }

    isLoadingMore = true;
    currentPage++;

    var targetId = 'linkResults';
    if (currentSearchType === 'image') {
        targetId = 'imageResults';
    }
    var container = document.getElementById(targetId);

    var loader = document.createElement('div');
    loader.id = 'infinite-scroll-loader';
    loader.innerHTML = '<p class="small" style="text-align:center; padding:15px; color:#0288d1;">Loading more results...</p>';
    if (container) {
        container.appendChild(loader);
    }

    var typeParam = '';
    if (currentSearchType === 'image') {
        typeParam = '&type=image';
    }
    var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(currentQuery) + typeParam + '&page=' + currentPage + '&pageSize=' + MAX_PAGE_SIZE;

    var ourRequest = new XMLHttpRequest();
    ourRequest.open('GET', url, true);

    ourRequest.onreadystatechange = function() {
        if (ourRequest.readyState === 4) {
            var loaderEl = document.getElementById('infinite-scroll-loader');
            if (loaderEl) {
                loaderEl.remove();
            }

            if (ourRequest.status >= 200 && ourRequest.status < 300) {
                var data = JSON.parse(ourRequest.responseText);
                if (data.items && data.items.length > 0) {
                    var existingItems = lastFetchedItems;
                    if (!existingItems) {
                        existingItems = [];
                    }
                    var combinedItems = [];
                    for (var i = 0; i < existingItems.length; i++) {
                        combinedItems.push(existingItems[i]);
                    }
                    for (var j = 0; j < data.items.length; j++) {
                        combinedItems.push(data.items[j]);
                    }
                    lastFetchedItems = combinedItems;

                    if (currentSearchType === 'web') {
                        renderLinkResults(data.items, data.total, true);
                    } else if (currentSearchType === 'image') {
                        renderImageResults(data.items, data.total, true);
                    }
                } else {
                    hasMoreResults = false;
                }
            } else {
                console.error("Infinite scroll error: HTTP status " + ourRequest.status);
            }
            isLoadingMore = false;
        }
    };

    ourRequest.send();
}
