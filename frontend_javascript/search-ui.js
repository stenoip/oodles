// frontend_javascript/search-ui.js

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
        if (marked.parse) {
            return marked.parse(text);
        }
    }
    return text;
}

function applyAIResultsFromCache(aiRawText) {
    if (!aiRawText) {
        return;
    }
    var overviewEl = document.getElementById('aiOverview');
    if (isAIOverviewEnabled) {
        if (overviewEl) {
            overviewEl.innerHTML = renderMarkdown(aiRawText);
        }
    } else {
        if (overviewEl) {
            overviewEl.innerHTML = '';
        }
    }
}

function renderAllResults(query, webData, imgData, vidData) {
    var allContainer = document.getElementById('allResults');
    if (!allContainer) {
        return;
    }

    var combinedHtml = '';
    
    var topLinksHtml = '';
    for (var wTop = 0; wTop < 3; wTop++) {
        if (webData.items[wTop]) {
            topLinksHtml += renderSingleLink(webData.items[wTop]);
        }
    }
    combinedHtml += '<div class="all-web-top">' + topLinksHtml + '</div>';

    if (imgData.items) {
        if (imgData.items.length > 0) {
            allTabImagesCache = imgData.items;
            combinedHtml += '<div class="all-image-strip" style="margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">' +
                '<h4 class="small" style="margin-top:0; margin-bottom: 10px; color: #0277bd;">Images for ' + escapeHtml(query) + '</h4>' +
                '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
            
            for (var i = 0; i < imgData.items.length; i++) {
                var img = imgData.items[i];
                combinedHtml += '<img src="' + img.thumbnail + '" onclick="openImageModalFromAll(' + i + ')" title="' + escapeHtml(img.title) + '" style="height: 120px; border-radius: 8px; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">';
            }
            
            combinedHtml += '</div></div>';
        }
    }

    if (vidData) {
        if (vidData.length > 0) {
            var v = vidData[0];
            combinedHtml += '<div class="all-video-featured" style="margin: 20px 0; display: flex; flex-wrap: wrap; gap: 15px; background: linear-gradient(to right, rgba(225, 245, 254, 0.6), rgba(255, 255, 255, 0.4)); padding: 15px; border-radius: 12px;">' +
                '<div style="flex: 0 0 auto;">' +
                    '<iframe src="https://www.youtube.com/embed/' + v.id.videoId + '" style="width: 240px; aspect-ratio: 16/9; border-radius: 8px;" allowfullscreen></iframe>' +
                '</div>' +
                '<div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: center;">' +
                    '<h4 style="margin:0 0 5px 0; font-size:15px; color: #01579b;">Featured Video</h4>' +
                    '<a href="https://www.youtube.com/watch?v=' + v.id.videoId + '" target="_blank" style="font-weight:bold; color: #0288d1;">' + escapeHtml(v.snippet.title) + '</a>' +
                '</div>' +
            '</div>';
        }
    }

    var bottomLinksHtml = '';
    for (var wBot = 3; wBot < 8; wBot++) {
        if (webData.items[wBot]) {
            bottomLinksHtml += renderSingleLink(webData.items[wBot]);
        }
    }
    combinedHtml += '<div class="all-web-bottom">' + bottomLinksHtml + '</div>';
    combinedHtml += '<div style="text-align:center; margin-top:15px;"><button class="frutiger-aero-tab" onclick="switchTab(\'web\', true)">See more results</button></div>';

    allContainer.innerHTML = combinedHtml;
}

function renderSingleLink(r) {
    var sourceBadge = '';
    if (r.source) {
        sourceBadge = '<span style="color: #006400; font-weight: bold; margin-left: 5px;">[' + escapeHtml(r.source) + ']</span>';
    }
    var snippetText = '';
    if (r.snippet) {
        snippetText = r.snippet;
    }
    return '<div class="result-block">' +
        '<a href="' + r.url + '" target="_blank" rel="noopener">' + escapeHtml(r.title) + '</a>' +
        '<div class="small">' + escapeHtml(r.url) + ' ' + sourceBadge + '</div>' +
        '<div>' + escapeHtml(snippetText) + '</div>' +
    '</div>';
}

function openImageModalFromAll(index) {
    lastFetchedItems = allTabImagesCache;
    openImageModal(index);
}

function switchTab(tabName, executeNewSearch) {
    if (window.event) {
        if (window.event.preventDefault) {
            window.event.preventDefault();
        }
    }

    var normalizedTab = tabName;
    var newSearchType = tabName;

    if (tabName === 'web') {
        normalizedTab = 'links';
        newSearchType = 'web';
    } else if (tabName === 'links') {
        normalizedTab = 'links';
        newSearchType = 'web';
    } else if (tabName === 'image') {
        normalizedTab = 'images';
        newSearchType = 'image';
    } else if (tabName === 'images') {
        normalizedTab = 'images';
        newSearchType = 'image';
    } else if (tabName === 'video') {
        normalizedTab = 'videos';
        newSearchType = 'video';
    } else if (tabName === 'videos') {
        normalizedTab = 'videos';
        newSearchType = 'video';
    } else if (tabName === 'all') {
        normalizedTab = 'all';
        newSearchType = 'all';
    }

    currentSearchType = newSearchType;

    if (normalizedTab !== 'all') {
        var chatSectionEl = document.getElementById('chatSection');
        if (chatSectionEl) {
            chatSectionEl.style.display = 'none';
        }
    }

    var tabs = document.querySelectorAll('nav a.frutiger-aero-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }

    var sections = ['allSection', 'linksSection', 'imagesSection', 'videosSection'];
    for (var j = 0; j < sections.length; j++) {
        var el = document.getElementById(sections[j]);
        if (el) {
            el.style.display = 'none';
        }
    }

    var activeTab = document.getElementById('tab-' + normalizedTab);
    var activeSection = document.getElementById(normalizedTab + 'Section');
    
    if (activeTab) { activeTab.classList.add('active'); }
    if (activeSection) { activeSection.style.display = 'block'; }

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    var showCitizen = false;
    if (!isAIOverviewEnabled) {
        if (newSearchType === 'web') { showCitizen = true; }
        else if (newSearchType === 'image') { showCitizen = true; }
        else if (newSearchType === 'all') { showCitizen = true; }
    }
    
    if (citizenMsgEl) {
        if (showCitizen) {
            citizenMsgEl.style.display = 'block';
        } else {
            citizenMsgEl.style.display = 'none';
        }
    }
    
    if (!executeNewSearch) {
        var overviewEl = document.getElementById('aiOverview');
        if (overviewEl) { overviewEl.innerHTML = ''; }
        if (aiTimeout) { clearTimeout(aiTimeout); }
    }

    if (currentQuery) {
        executeSearch(currentQuery, newSearchType, 1);
    }
    cleanupUIForTabs(normalizedTab);
}

function cleanupUIForTabs(activeTab) {
    var kpContainer = document.getElementById('knowledgePanelContainer');
    var snippetContainer = document.getElementById('featuredSnippetContainer');
    var productContainer = document.getElementById('popularProductsContainer');

    if (activeTab !== 'all') {
        if (kpContainer) { kpContainer.style.display = 'none'; }
        if (snippetContainer) { snippetContainer.style.display = 'none'; }
        if (productContainer) { productContainer.style.display = 'none'; }
    } else {
        if (kpContainer) {
            if (kpContainer.innerHTML !== '') {
                kpContainer.style.display = 'block';
            }
        }
        if (snippetContainer) {
            if (snippetContainer.innerHTML !== '') {
                snippetContainer.style.display = 'block';
            }
        }
    }
}

function renderLinkResults(items, total, isAppend) {
    var resultsEl = document.getElementById('linkResults');
    if (!items) {
        if (!isAppend) { resultsEl.innerHTML = '<p class="small">No web links found.</p>'; }
        return;
    }
    if (items.length === 0) {
        if (!isAppend) { resultsEl.innerHTML = '<p class="small">No web links found.</p>'; }
        return;
    }

    var generatedHtml = '';
    for (var i = 0; i < items.length; i++) {
        generatedHtml += renderSingleLink(items[i]);
    }
    
    if (isAppend) {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = generatedHtml;
        resultsEl.appendChild(wrapper);
    } else {
        resultsEl.innerHTML = '<p class="small">Found ' + total + ' links. </p>' + generatedHtml;
    }
}

function renderImageResults(items, total, isAppend) {
    var resultsEl = document.getElementById('imageResults');
    if (!items) {
        if (!isAppend) { resultsEl.innerHTML = '<p class="small">No images found.</p>'; }
        return;
    }
    if (items.length === 0) {
        if (!isAppend) { resultsEl.innerHTML = '<p class="small">No images found.</p>'; }
        return;
    }

    var indexOffset = 0;
    if (isAppend) {
        indexOffset = lastFetchedItems.length - items.length;
    }

    var generatedHtml = '';
    for (var i = 0; i < items.length; i++) {
        var r = items[i];
        var trueIdx = indexOffset + i;
        var w = '?';
        if (r.width) { w = r.width; }
        var h = '?';
        if (r.height) { h = r.height; }
        generatedHtml += '<div class="image-result-item" onclick="openImageModal(' + trueIdx + ')">' +
            '<div class="img-wrapper">' +
                '<img src="' + r.thumbnail + '" alt="' + escapeHtml(r.title) + '" loading="lazy"/>' +
            '</div>' +
            '<div class="img-hover-overlay"><span>' + w + ' x ' + h + '</span></div>' +
        '</div>';
    }

    if (isAppend) {
        var wrapper = document.createElement('div');
        wrapper.style.display = 'contents'; 
        wrapper.innerHTML = generatedHtml;
        resultsEl.appendChild(wrapper);
    } else {
        resultsEl.innerHTML = generatedHtml;
    }
}

function renderVideoResults(items) {
    var resultsEl = document.getElementById('videoResults');
    if (!items) {
        resultsEl.innerHTML = '<p class="small">No videos found.</p>';
        return;
    }
    if (items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No videos found.</p>';
        return;
    }

    var generatedHtml = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        generatedHtml += '<div class="video-card-aero" style="background: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(5px); border-radius: 10px; padding: 5px; margin-bottom: 15px;">' +
            '<iframe src="https://www.youtube.com/embed/' + item.id.videoId + '" style="border-radius: 5px; width: 100%; aspect-ratio: 16/9; border:none;" allowfullscreen></iframe>' +
            '<div style="padding: 10px;">' +
                '<a href="https://www.youtube.com/watch?v=' + item.id.videoId + '" target="_blank" class="small" style="font-weight:bold; display:block; color: #0d47a1;">' + escapeHtml(item.snippet.title) + '</a>' +
                '<span class="small" style="opacity:0.8;">' + escapeHtml(item.snippet.channelTitle) + '</span>' +
            '</div>' +
        '</div>';
    }
    resultsEl.innerHTML = generatedHtml;
}

function setupAIOverviewToggle() {
    var toggle = document.getElementById('aiOverviewToggle');
    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    var overviewEl = document.getElementById('aiOverview');
    
    if (!toggle) { return; }

    var storedState = sessionStorage.getItem('aiOverviewState');
    if (storedState !== null) {
        if (storedState === 'true') {
            isAIOverviewEnabled = true;
        } else {
            isAIOverviewEnabled = false;
        }
    } 

    toggle.checked = isAIOverviewEnabled;

    var showCitizen = false;
    if (!isAIOverviewEnabled) {
        if (currentSearchType === 'web') { showCitizen = true; }
        else if (currentSearchType === 'all') { showCitizen = true; }
    }
    
    if (citizenMsgEl) {
        if (showCitizen) {
            citizenMsgEl.style.display = 'block';
        } else {
            citizenMsgEl.style.display = 'none';
        }
    }
    
    if (isAIOverviewEnabled) {
        if (lastAIRawText) {
            applyAIResultsFromCache(lastAIRawText);
        } else {
            if (overviewEl) { overviewEl.innerHTML = ''; }
        }
    } else {
        if (overviewEl) { overviewEl.innerHTML = ''; }
    }

    toggle.addEventListener('change', function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        
        if (isAIOverviewEnabled) {
            if (citizenMsgEl) { citizenMsgEl.style.display = 'none'; }
            if (currentQuery) {
                var canSearch = false;
                if (currentSearchType === 'web') { canSearch = true; }
                else if (currentSearchType === 'all') { canSearch = true; }
                
                if (canSearch) {
                    if (currentPage === 1) {
                        if (lastAIRawText) { 
                            applyAIResultsFromCache(lastAIRawText); 
                        } else {
                            executeSearch(currentQuery, currentSearchType, currentPage);
                        }
                    }
                }
            }
        } else {
            if (overviewEl) { overviewEl.innerHTML = ''; }
            if (citizenMsgEl) { citizenMsgEl.style.display = 'block'; }
        }
    });
}

function setupInfiniteScrollDetection() {
    window.addEventListener('scroll', function() {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 400) {
            if (!isLoadingMore) {
                if (hasMoreResults) {
                    if (currentSearchType !== 'all') {
                        if (currentSearchType !== 'video') {
                            loadMoreInfiniteResults();
                        }
                    }
                }
            }
        }
    });
}

function initializeFromSession() {
    var urlParams = new URLSearchParams(window.location.search);
    var query = urlParams.get('q');
    var searchType = urlParams.get('type');
    if (!searchType) { searchType = 'all'; }
    var pageRaw = urlParams.get('page');
    var page = parseInt(pageRaw);
    if (!page) { page = 1; }

    if (!query) {
        var storedQuery = sessionStorage.getItem('metaSearchQuery');
        if (storedQuery) { query = storedQuery; }
        else { query = ''; }
        
        var storedType = sessionStorage.getItem('searchType');
        if (storedType) { searchType = storedType; }
        else { searchType = 'all'; }
    }

    sessionStorage.removeItem('metaSearchQuery');
    sessionStorage.removeItem('searchType');

    setupAIOverviewToggle();
    setupInfiniteScrollDetection(); 

    if (query) {
        switchTab(searchType, false);
        executeSearch(query, searchType, page); 
    } else {
        switchTab('all', false);
    }
}

document.addEventListener('DOMContentLoaded', initializeFromSession);
var currentQueryEl = document.getElementById('currentQuery');
if (currentQueryEl) {
    currentQueryEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            var query = this.value.trim();
            var type = 'all';
            if (currentSearchType) { type = currentSearchType; }
            
            lastAIRawText = null; 
            lastFetchedItems = null;
            searchCache = {}; 
            if (aiTimeout) { clearTimeout(aiTimeout); }
            
            window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
        }
    });
}

function openImageModal(index) {
    if (!lastFetchedItems) { return; }
    if (!lastFetchedItems[index]) { return; }
    var item = lastFetchedItems[index];

    var fullImgUrl = item.thumbnail;
    if (item.url) { fullImgUrl = item.url; }
    else if (item.media_url) { fullImgUrl = item.media_url; }
    
    var title = 'Image Result';
    if (item.title) { title = item.title; }
    
    var sourceUrl = '';
    if (item.pageUrl) { sourceUrl = item.pageUrl; }
    else if (item.sourceUrl) { sourceUrl = item.sourceUrl; }

    var w = null;
    if (item.width) { w = item.width; }
    else if (item.w) { w = item.w; }
    else if (item.details) {
        if (item.details.width) { w = item.details.width; }
    }
    
    var h = null;
    if (item.height) { h = item.height; }
    else if (item.h) { h = item.h; }
    else if (item.details) {
        if (item.details.height) { h = item.details.height; }
    }

    var dims = 'Dimensions Unknown';
    if (w) {
        if (h) {
            dims = w + ' x ' + h;
        }
    }

    var modalImgEl = document.getElementById('modalImage');
    if (modalImgEl) { modalImgEl.src = fullImgUrl; }
    
    var modalTitleEl = document.getElementById('modalTitle');
    if (modalTitleEl) { modalTitleEl.innerText = title; }
    
    var modalDimsEl = document.getElementById('modalDims');
    if (modalDimsEl) { modalDimsEl.innerText = dims; }
    
    var sourceName = 'Website';
    if (item.source) { sourceName = item.source; }
    
    var modalSourceEl = document.getElementById('modalSource');
    if (modalSourceEl) {
        modalSourceEl.innerHTML = '<strong>Source:</strong> ' + escapeHtml(sourceName) + '<br>' +
            '<span style="word-break: break-all; font-size: 0.85em; opacity: 0.8;">' + escapeHtml(sourceUrl) + '</span>';
    }
    
    var btnVisit = document.getElementById('btnVisit');
    if (btnVisit) {
        btnVisit.onclick = function() { window.open(sourceUrl, '_blank'); };
    }

    var btnDownload = document.getElementById('btnDownload');
    if (btnDownload) {
        btnDownload.onclick = function() { forceDownload(fullImgUrl, title); };
    }

    var btnShare = document.getElementById('btnShare');
    if (btnShare) {
        btnShare.onclick = function() { shareImage(fullImgUrl, title, sourceUrl); };
    }

    var overlay = document.getElementById('imageModalOverlay');
    if (overlay) { overlay.style.display = 'flex'; }
}

function closeImageModal() {
    var overlay = document.getElementById('imageModalOverlay');
    if (overlay) { overlay.style.display = 'none'; }
    var modalImgEl = document.getElementById('modalImage');
    if (modalImgEl) { modalImgEl.src = ''; }
}

function forceDownload(url, filename) {
    fetch(url)
        .then(function(response) {
            return response.blob();
        })
        .then(function(blob) {
            var blobUrl = window.URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = blobUrl;
            var dlName = 'image';
            if (filename) { dlName = filename; }
            link.download = dlName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        })
        .catch(function(e) {
            window.open(url, '_blank');
        });
}

function shareImage(imgUrl, title, pageUrl) {
    if (navigator.share) {
        navigator.share({
            title: title,
            text: 'Check out this image found on Oodles Search!',
            url: pageUrl 
        }).catch(function(err) {
            console.log('Share canceled');
        });
    } else {
        if (navigator.clipboard) {
            if (navigator.clipboard.writeText) {
                navigator.clipboard.writeText(pageUrl).then(function() {
                    alert('Link copied to clipboard!');
                });
            }
        }
    }
}

document.addEventListener('click', function(event) {
    var overlay = document.getElementById('imageModalOverlay');
    if (event.target === overlay) {
        closeImageModal();
    }
});
