// frontend_javascript/search-ui.js

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(text);
    }
    return text;
}

function renderBuiltInTool(toolName) {
    var toolContainerEl = document.getElementById('toolContainer');
    if (!toolContainerEl || !toolName) {
        if (toolContainerEl) {
            toolContainerEl.innerHTML = '';
            toolContainerEl.style.display = 'none';
        }
        return;
    }

    const tool = BUILT_IN_TOOLS[toolName];
    if (tool) {
        let finalUrl = tool.url;
        const toolsToPassQuery = ['calculator', 'unit_converter', 'translate'];
        if (toolsToPassQuery.includes(toolName) && currentQuery) {
            finalUrl += '?q=' + encodeURIComponent(currentQuery);
        }
        
        toolContainerEl.innerHTML = `
            <div class="built-in-tool-frame">
                <iframe src="${finalUrl}" frameborder="0" loading="eager" style="width: 100%; height: 350px;"></iframe>
            </div>
        `;
        toolContainerEl.style.display = 'block';
    } else {
        toolContainerEl.innerHTML = '';
        toolContainerEl.style.display = 'none';
    }
}

function applyAIResultsFromCache(aiRawText, searchItems) {
    if (!aiRawText || !searchItems) return;
    
    var overviewEl = document.getElementById('aiOverview');
    var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
    var toolRegex = /@@TOOL:\[(.*?)\]@@/;
    var researchRegex = /@@RESEARCH:\[(.*?)\]@@/;
    
    var toolMatch = aiRawText.match(toolRegex);
    var researchMatch = aiRawText.match(researchRegex);
    
    var detectedTool = toolMatch && toolMatch[1] ? toolMatch[1].trim() : null;
    var suggestedQuery = researchMatch && researchMatch[1] ? researchMatch[1].trim() : null;
    
    renderBuiltInTool(detectedTool);
    
    var cleanDisplayText = aiRawText.replace(rankingRegex, '').replace(toolRegex, '').replace(researchRegex, '').trim();
    
    if (isAIOverviewEnabled && overviewEl) {
        overviewEl.innerHTML = renderMarkdown(cleanDisplayText);
        if (suggestedQuery) renderReSearchLink(suggestedQuery);
    } else if (overviewEl) {
        overviewEl.innerHTML = '';
    }
}

function applySmartRanking(originalItems, indicesString) {
    try {
        var prioritizedIndices = JSON.parse(`[${indicesString}]`);
        var reorderedItems = [];
        var usedIndices = new Set();

        prioritizedIndices.forEach(function(index) {
            if (originalItems[index]) {
                reorderedItems.push(originalItems[index]);
                usedIndices.add(index);
            }
        });

        originalItems.forEach(function(item, index) {
            if (!usedIndices.has(index)) {
                reorderedItems.push(item);
            }
        });

        lastFetchedItems = reorderedItems;

        if (currentSearchType === 'web' || currentSearchType === 'links') {
             renderLinkResults(reorderedItems, reorderedItems.length, false);
        } else if (currentSearchType === 'all') {
            var topWebEl = document.querySelector('.all-web-top');
            var bottomWebEl = document.querySelector('.all-web-bottom');
            
            if (topWebEl) {
                topWebEl.innerHTML = reorderedItems.slice(0, 3).map(renderSingleLink).join('');
            }
            if (bottomWebEl) {
                bottomWebEl.innerHTML = reorderedItems.slice(3, 8).map(renderSingleLink).join('');
            }
        }

        var targetId = (currentSearchType === 'all') ? 'allResults' : 'linkResults';
        var resultsEl = document.getElementById(targetId);

        var existingNotice = document.getElementById('smart-sort-notice');
        if (existingNotice) existingNotice.remove();

        var notice = document.createElement('div');
        notice.id = 'smart-sort-notice';
        notice.className = 'small';
        notice.style.color = '#388e3c'; 
        notice.style.marginBottom = '10px';
        notice.style.display = 'flex';      
        notice.style.alignItems = 'center'; 
        notice.style.gap = '8px';           

        notice.innerHTML = `
            <img src="https://stenoip.github.io/praterich/praterich.png" 
                alt="Praterich" 
                style="width: 18px; height: 18px; object-fit: contain;">
            <span><b>Smart Sorted:</b> Praterich has analyzed these results.</span>
        `;
        
        if (resultsEl) resultsEl.prepend(notice);
    } catch (e) {
        console.warn('Ranking parse error:', e);
    }
}

// Fallback logic for synchronous/cached renders on 'All' tab
function renderAllResults(query, webData, imgData, vidData) {
    const allContainer = document.getElementById('allResults');
    if (!allContainer) return;

    let combinedHtml = '';
    combinedHtml += `<div class="all-web-top">${webData.items.slice(0, 3).map(renderSingleLink).join('')}</div>`;

    if (imgData.items && imgData.items.length > 0) {
        allTabImagesCache = imgData.items;
        combinedHtml += `
            <div class="all-image-strip" style="margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                <h4 class="small" style="margin-top:0; margin-bottom: 10px; color: #0277bd;">Images for ${escapeHtml(query)}</h4>
                <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">
                    ${imgData.items.map((img, idx) => `
                        <img src="${img.thumbnail}" onclick="openImageModalFromAll(${idx})" title="${escapeHtml(img.title)}" style="height: 120px; border-radius: 8px; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    `).join('')}
                </div>
            </div>`;
    }

    if (vidData && vidData.length > 0) {
        const v = vidData[0];
        combinedHtml += `
            <div class="all-video-featured" style="margin: 20px 0; display: flex; flex-wrap: wrap; gap: 15px; background: linear-gradient(to right, rgba(225, 245, 254, 0.6), rgba(255, 255, 255, 0.4)); padding: 15px; border-radius: 12px;">
                <div style="flex: 0 0 auto;">
                    <iframe src="https://www.youtube.com/embed/${v.id.videoId}" style="width: 240px; aspect-ratio: 16/9; border-radius: 8px;" allowfullscreen></iframe>
                </div>
                <div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: center;">
                    <h4 style="margin:0 0 5px 0; font-size:15px; color: #01579b;">Featured Video</h4>
                    <a href="https://www.youtube.com/watch?v=${v.id.videoId}" target="_blank" style="font-weight:bold; color: #0288d1;">${v.snippet.title}</a>
                </div>
            </div>`;
    }

    combinedHtml += `<div class="all-web-bottom">${webData.items.slice(3, 8).map(renderSingleLink).join('')}</div>`;
    combinedHtml += `<div style="text-align:center; margin-top:15px;"><button class="frutiger-aero-tab" onclick="switchTab('web', true)">See more results</button></div>`;

    allContainer.innerHTML = combinedHtml;
}

function renderSingleLink(r) {
    var sourceBadge = r.source ? `<span style="color: #006400; font-weight: bold; margin-left: 5px;">[${escapeHtml(r.source)}]</span>` : '';
    return `
        <div class="result-block">
            <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
            <div class="small">${escapeHtml(r.url)} ${sourceBadge}</div>
            <div>${escapeHtml(r.snippet || '')}</div>
        </div>`;
}

function openImageModalFromAll(index) {
    const tempItems = lastFetchedItems;
    lastFetchedItems = allTabImagesCache;
    openImageModal(index);
}

function switchTab(tabName, executeNewSearch) {
    if (window.event) event.preventDefault();

    var normalizedTab = tabName;
    var newSearchType = tabName;

    if (tabName === 'web' || tabName === 'links') {
        normalizedTab = 'links';
        newSearchType = 'web';
    } else if (tabName === 'image' || tabName === 'images') {
        normalizedTab = 'images';
        newSearchType = 'image';
    } else if (tabName === 'video' || tabName === 'videos') {
        normalizedTab = 'videos';
        newSearchType = 'video';
    } else if (tabName === 'all') {
        normalizedTab = 'all';
        newSearchType = 'all';
    }

    currentSearchType = newSearchType;

    if (normalizedTab !== 'all') {
        window.isChatModeActive = false;
        const chatSectionEl = document.getElementById('chatSection');
        if (chatSectionEl) chatSectionEl.style.display = 'none';
    }

    document.querySelectorAll('nav a.frutiger-aero-tab').forEach(function(a) {
        a.classList.remove('active');
    });

    const sections = ['allSection', 'linksSection', 'imagesSection', 'videosSection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    var activeTab = document.getElementById('tab-' + normalizedTab);
    var activeSection = document.getElementById(normalizedTab + 'Section');
    
    if (activeTab) activeTab.classList.add('active');
    if (activeSection) activeSection.style.display = 'block';

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (citizenMsgEl) {
        if (!isAIOverviewEnabled && (newSearchType === 'web' || newSearchType === 'image' || newSearchType === 'all')) {
            citizenMsgEl.style.display = 'block';
        } else {
            citizenMsgEl.style.display = 'none';
        }
    }
    
    if (!executeNewSearch) {
        renderBuiltInTool(null);
        var overviewEl = document.getElementById('aiOverview');
        if (overviewEl) overviewEl.innerHTML = '';
        if (aiTimeout) clearTimeout(aiTimeout);
    }

    if (currentQuery) {
        // Leverages smart execution via RAM Cache verification
        executeSearch(currentQuery, newSearchType, 1);
    }
    cleanupUIForTabs(normalizedTab);
}

function cleanupUIForTabs(activeTab) {
    var kpContainer = document.getElementById('knowledgePanelContainer');
    var snippetContainer = document.getElementById('featuredSnippetContainer');
    var productContainer = document.getElementById('popularProductsContainer');

    if (activeTab !== 'all') {
        if (kpContainer) kpContainer.style.display = 'none';
        if (snippetContainer) snippetContainer.style.display = 'none';
        if (productContainer) productContainer.style.display = 'none';
    } else {
        if (kpContainer && kpContainer.innerHTML !== '') kpContainer.style.display = 'block';
        if (snippetContainer && snippetContainer.innerHTML !== '') snippetContainer.style.display = 'block';
    }
}

/**
 * MODIFIED: Appends lists dynamically or rewrites them based on Scroll Trigger.
 */
function renderLinkResults(items, total, isAppend = false) {
    var resultsEl = document.getElementById('linkResults');
    if (!items || items.length === 0) {
        if(!isAppend) resultsEl.innerHTML = '<p class="small">No web links found.</p>';
        return;
    }

    const generatedHtml = items.map(renderSingleLink).join('');
    
    if (isAppend) {
        // Appends to the DOM instantly
        var wrapper = document.createElement('div');
        wrapper.innerHTML = generatedHtml;
        resultsEl.appendChild(wrapper);
    } else {
        resultsEl.innerHTML = `<p class="small">Found ${total} links. Scroll down to look up more seamlessly.</p>` + generatedHtml;
    }
}

/**
 * MODIFIED: Image loader supporting Infinite Append.
 */
function renderImageResults(items, total, isAppend = false) {
    var resultsEl = document.getElementById('imageResults');
    if (!items || items.length === 0) {
        if(!isAppend) resultsEl.innerHTML = '<p class="small">No images found.</p>';
        return;
    }

    // Offset indices configuration for infinite layout arrays
    const indexOffset = isAppend ? (lastFetchedItems.length - items.length) : 0;

    const generatedHtml = items.map(function(r, index) {
        const trueIdx = indexOffset + index;
        return `
            <div class="image-result-item" onclick="openImageModal(${trueIdx})">
                <div class="img-wrapper">
                    <img src="${r.thumbnail}" alt="${escapeHtml(r.title)}" loading="lazy"/>
                </div>
                <div class="img-hover-overlay"><span>${r.width || '?'} x ${r.height || '?'}</span></div>
            </div>`;
    }).join('');

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
    const resultsEl = document.getElementById('videoResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No videos found.</p>';
        return;
    }

    resultsEl.innerHTML = items.map(item => `
        <div class="video-card-aero" style="background: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(5px); border-radius: 10px; padding: 5px; margin-bottom: 15px;">
            <iframe src="https://www.youtube.com/embed/${item.id.videoId}" style="border-radius: 5px; width: 100%; aspect-ratio: 16/9; border:none;" allowfullscreen></iframe>
            <div style="padding: 10px;">
                <a href="https://www.youtube.com/watch?v=${item.id.videoId}" target="_blank" class="small" style="font-weight:bold; display:block; color: #0d47a1;">${item.snippet.title}</a>
                <span class="small" style="opacity:0.8;">${item.snippet.channelTitle}</span>
            </div>
        </div>
    `).join('');
}

function renderReSearchLink(suggestedQuery) {
    if (!suggestedQuery) return;

    var reSearchDiv = document.createElement('div');
    reSearchDiv.id = 're-search-container'; 
    reSearchDiv.style.marginBottom = '15px';
    reSearchDiv.style.padding = '10px';
    reSearchDiv.style.background = 'rgba(211, 47, 47, 0.05)';
    reSearchDiv.style.borderRadius = '8px';
    reSearchDiv.style.border = '1px dashed #d32f2f';
    
    var link = document.createElement('a');
    link.href = `search.html?q=${encodeURIComponent(suggestedQuery)}&type=${currentSearchType}&page=1`;
    link.style.color = '#d32f2f';
    link.style.fontWeight = 'bold';
    link.style.textDecoration = 'none';
    link.innerHTML = ` Praterich recommends: "${escapeHtml(suggestedQuery)}"`;
    
    reSearchDiv.appendChild(link);

    const activeSectionId = currentSearchType === 'all' ? 'allSection' : (currentSearchType + 'Section');
    const targetSection = document.getElementById(activeSectionId);
    
    if (targetSection) {
        const old = targetSection.querySelector('#re-search-container');
        if (old) old.remove();
        targetSection.prepend(reSearchDiv);
    }
}

function setupAIOverviewToggle() {
    var toggle = document.getElementById('aiOverviewToggle');
    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    var overviewEl = document.getElementById('aiOverview');
    
    if (!toggle) return;

    var storedState = sessionStorage.getItem('aiOverviewState');
    if (storedState !== null) {
        isAIOverviewEnabled = (storedState === 'true');
    } 

    toggle.checked = isAIOverviewEnabled;

    if (!isAIOverviewEnabled && (currentSearchType === 'web' || currentSearchType === 'all')) { 
        if (citizenMsgEl) citizenMsgEl.style.display = 'block';
    } else {
        if (citizenMsgEl) citizenMsgEl.style.display = 'none';
    }
    
    if (isAIOverviewEnabled && lastAIRawText && lastFetchedItems) {
        applyAIResultsFromCache(lastAIRawText, lastFetchedItems);
    } else if (overviewEl) {
        overviewEl.innerHTML = '';
    }

    toggle.addEventListener('change', function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        
        if (isAIOverviewEnabled) {
            if (citizenMsgEl) citizenMsgEl.style.display = 'none';
            if (currentQuery && (currentSearchType === 'web' || currentSearchType === 'all') && currentPage === 1) {
                if (lastAIRawText && lastFetchedItems) { 
                    applyAIResultsFromCache(lastAIRawText, lastFetchedItems); 
                } else {
                    executeSearch(currentQuery, currentSearchType, currentPage);
                }
            }
        } else {
            if (overviewEl) overviewEl.innerHTML = '';
            if (citizenMsgEl) citizenMsgEl.style.display = 'block';
        }
    });
}

/**
 * GOOGLE-STYLE INFINITE SCROLL SENSOR
 * Tracks view parameters and fires off-screen network requests progressively.
 */
function setupInfiniteScrollDetection() {
    window.addEventListener('scroll', function() {
        // Triggers pagination fetch when scrolling 400px near the bottom
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 400) {
            if (!isLoadingMore && hasMoreResults && currentSearchType !== 'all' && currentSearchType !== 'video') {
                loadMoreInfiniteResults();
            }
        }
    });
}

function initializeFromSession() {
    const urlParams = new URLSearchParams(window.location.search);
    let query = urlParams.get('q');
    let searchType = urlParams.get('type') || 'all'; 
    let page = parseInt(urlParams.get('page')) || 1; 

    if (!query) {
        query = sessionStorage.getItem('metaSearchQuery') || '';
        searchType = sessionStorage.getItem('searchType') || 'all';
    }

    sessionStorage.removeItem('metaSearchQuery');
    sessionStorage.removeItem('searchType');

    setupAIOverviewToggle();
    setupInfiniteScrollDetection(); // Mount continuous scroll engine

    if (query) {
        switchTab(searchType, false);
        executeSearch(query, searchType, page); 
    } else {
        switchTab('all', false);
    }
}

document.addEventListener('DOMContentLoaded', initializeFromSession);
document.getElementById('currentQuery').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        var query = this.value.trim();
        var type = currentSearchType || 'all'; 
        
        lastAIRawText = null; 
        lastFetchedItems = null;
        searchCache = {}; // Purge local session cache for clean queries
        if (aiTimeout) clearTimeout(aiTimeout);
        
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
    }
});

function openImageModal(index) {
    if (!lastFetchedItems || !lastFetchedItems[index]) return;
    const item = lastFetchedItems[index];

    const fullImgUrl = item.url || item.media_url || item.thumbnail; 
    const title = item.title || 'Image Result';
    const sourceUrl = item.pageUrl || item.sourceUrl || '';

    const w = item.width || item.w || (item.details ? item.details.width : null);
    const h = item.height || item.h || (item.details ? item.details.height : null);
    const dims = (w && h) ? `${w} x ${h}` : 'Dimensions Unknown';

    document.getElementById('modalImage').src = fullImgUrl;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalDims').innerText = dims;
    
    const sourceName = item.source || 'Website';
    document.getElementById('modalSource').innerHTML = `
        <strong>Source:</strong> ${escapeHtml(sourceName)}<br>
        <span style="word-break: break-all; font-size: 0.85em; opacity: 0.8;">${escapeHtml(sourceUrl)}</span>
    `;
    
    const btnVisit = document.getElementById('btnVisit');
    btnVisit.onclick = function() { window.open(sourceUrl, '_blank'); };

    const btnDownload = document.getElementById('btnDownload');
    btnDownload.onclick = function() { forceDownload(fullImgUrl, title); };

    const btnShare = document.getElementById('btnShare');
    btnShare.onclick = function() { shareImage(fullImgUrl, title, sourceUrl); };

    document.getElementById('imageModalOverlay').style.display = 'flex';
}

function closeImageModal() {
    document.getElementById('imageModalOverlay').style.display = 'none';
    document.getElementById('modalImage').src = ''; 
}

async function forceDownload(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'image';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
        window.open(url, '_blank');
    }
}

async function shareImage(imgUrl, title, pageUrl) {
    if (navigator.share) {
        try {
            await navigator.share({
                title: title,
                text: 'Check out this image found on Oodles Search!',
                url: pageUrl 
            });
        } catch (err) {
            console.log('Share canceled');
        }
    } else {
        navigator.clipboard.writeText(pageUrl).then(() => {
            alert('Link copied to clipboard!');
        });
    }
}

document.addEventListener('click', function(event) {
    const overlay = document.getElementById('imageModalOverlay');
    if (event.target === overlay) {
        closeImageModal();
    }
});
