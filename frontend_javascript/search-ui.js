// frontend_javascript/search-ui.js

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderAllResults(query, webData, imgData, vidData) {
    var allContainer = document.getElementById('allResults');
    if (!allContainer) {
        return;
    }

    var combinedHtml = '';
    combinedHtml += '<div class="all-web-top">' + webData.items.slice(0, 3).map(renderSingleLink).join('') + '</div>';

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

    combinedHtml += '<div class="all-web-bottom">' + webData.items.slice(3, 8).map(renderSingleLink).join('') + '</div>';
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
    
    if (activeTab) {
        activeTab.classList.add('active');
    }
    if (activeSection) {
        activeSection.style.display = 'block';
    }

    if (currentQuery) {
        executeSearch(currentQuery, newSearchType, 1);
    }
}

function renderLinkResults(items, total, isAppend) {
    var resultsEl = document.getElementById('linkResults');
    if (!items) {
        if (!isAppend) {
            resultsEl.innerHTML = '<p class="small">No web links found.</p>';
        }
        return;
    }
    if (items.length === 0) {
        if (!isAppend) {
            resultsEl.innerHTML = '<p class="small">No web links found.</p>';
        }
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
        resultsEl.innerHTML = '<p class="small">Found ' + total + ' links. Scroll down to look up more seamlessly.</p>' + generatedHtml;
    }
}

function renderImageResults(items, total, isAppend) {
    var resultsEl = document.getElementById('imageResults');
    if (!items) {
        if (!isAppend) {
            resultsEl.innerHTML = '<p class="small">No images found.</p>';
        }
        return;
    }
    if (items.length === 0) {
        if (!isAppend) {
            resultsEl.innerHTML = '<p class="small">No images found.</p>';
        }
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
        if (r.width) {
            w = r.width;
        }
        var h = '?';
        if (r.height) {
            h = r.height;
        }
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
    if (!searchType) {
        searchType = 'all';
    }
    var page = parseInt(urlParams.get('page'));
    if (!page) {
        page = 1;
    }

    if (!query) {
        query = sessionStorage.getItem('metaSearchQuery');
        var storedType = sessionStorage.getItem('searchType');
        if (storedType) {
            searchType = storedType;
        }
        if (!query) {
            query = '';
        }
    }

    sessionStorage.removeItem('metaSearchQuery');
    sessionStorage.removeItem('searchType');

    setupInfiniteScrollDetection();

    if (query) {
        switchTab(searchType, false);
        executeSearch(query, searchType, page); 
    } else {
        switchTab('all', false);
    }
}

document.addEventListener('DOMContentLoaded', initializeFromSession);

var queryInput = document.getElementById('currentQuery');
if (queryInput) {
    queryInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            var query = this.value.trim();
            var type = 'all';
            if (currentSearchType) {
                type = currentSearchType;
            }
            searchCache = {};
            window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
        }
    });
}

function openImageModal(index) {
    if (!lastFetchedItems) {
        return;
    }
    if (!lastFetchedItems[index]) {
        return;
    }
    var item = lastFetchedItems[index];

    var fullImgUrl = item.thumbnail;
    if (item.url) {
        fullImgUrl = item.url;
    } else if (item.media_url) {
        fullImgUrl = item.media_url;
    }
    
    var title = 'Image Result';
    if (item.title) {
        title = item.title;
    }
    
    var sourceUrl = '';
    if (item.pageUrl) {
        sourceUrl = item.pageUrl;
    } else if (item.sourceUrl) {
        sourceUrl = item.sourceUrl;
    }

    var w = null;
    if (item.width) { w = item.width; }
    else if (item.w) { w = item.w; }
    else if (item.details) { if (item.details.width) { w = item.details.width; } }
    
    var h = null;
    if (item.height) { h = item.height; }
    else if (item.h) { h = item.h; }
    else if (item.details) { if (item.details.height) { h = item.details.height; } }

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
    if (item.source) {
        sourceName = item.source;
    }
    
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
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function closeImageModal() {
    var overlay = document.getElementById('imageModalOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    var modalImgEl = document.getElementById('modalImage');
    if (modalImgEl) {
        modalImgEl.src = '';
    }
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
            var name = 'image';
            if (filename) {
                name = filename;
            }
            link.download = name;
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
        navigator.clipboard.writeText(pageUrl).then(function() {
            alert('Link copied to clipboard!');
        });
    }
}

document.addEventListener('click', function(event) {
    var overlay = document.getElementById('imageModalOverlay');
    if (event.target === overlay) {
        closeImageModal();
    }
});
