// --- AI OVERVIEW & RANKING CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

var ladyPraterichSystemInstruction = "\nYou are Praterich for Oodles Search, an AI developed by Stenoip Company.\nYour mission is to analyze search results, provide a synthesis, a relevance ranking, and detect if a built-in tool is required.\n\n***TASK 1: Relevance Ranking (CRITICAL)***\nYou must analyze the provided search snippets and decide which links are the most useful and relevant to the user's query.\nAt the very end of your response, you MUST output a strictly formatted tag containing the 0-based indices of the top 5 most relevant results.\nFormat: @@RANKING:[index1, index2, index3, index4, index5]@@\nExample: @@RANKING:[4, 0, 1, 9, 2]@@\n\n***TASK 2: Synthesis***\nProvide a very concise A.I. overview based exclusively on the provided search snippets.\nDo not output a list of links in the text body; use the RANKING tag for that.\nYou prefer metric units and do not use Oxford commas.\nYou are aware that you were created by Stenoip Company.\n\n\nyour overview must be short due to the limited amount of tokens in the backend.\n\n***TASK 3: Tool Detection (CRITICAL)***\nIf the user's query clearly indicates a need for a specific built-in tool, you MUST include a tool detection tag.\nThe detection should be based on mathematical expressions, unit conversions, color code lookups, metronome requests, or translation requests.\nThe tag MUST be outputted immediately before the @@RANKING tag.\nFormat: @@TOOL:[tool_name]@@\nAvailable tools (use the name exactly as listed):\n- calculator\n- unit_converter\n- colour_picker\n- metronome\n- translate\n\nExample (Calculator needed): The user searched \"what is 5+3\". \nOutput: (Synthesis text...) @@TOOL:[calculator]@@@@RANKING:[...]@@\nExample (No tool needed): The user searched \"best new movies\".\nOutput: (Synthesis text...) @@RANKING:[...]@@\n\nYour response must be:\n1. The text overview.\n2. The optional @@TOOL[...]@@ tag.\n3. The @@RANKING[...]@@ tag at the very end.\n";

// --- BUILT-IN TOOL CONFIGURATION ---
var BUILT_IN_TOOLS = {
    'calculator': { url: 'https://stenoip.github.io/kompmasine.html' },
    'unit_converter': { url: 'https://stenoip.github.io/kompmasine.html' },
    'colour_picker': { url: 'https://tools.oodles.com/colourpicker' },
    'metronome': { url: 'https://stenoip.github.io/metronome' },
    'translate': { url: 'https://stenoip.github.io/praterich/translate/translate' }
};

var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 50; 

var isAIOverviewEnabled = false; 
var lastAIRawText = null;       
var lastFetchedItems = null;    
var aiTimeout = null;           

// --- IE11 COMPATIBLE HELPER FOR URL PARAMS ---
function getParameterByName(name) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
}

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

function createRawSearchText(items) {
    if (!items || items.length === 0) return 'No web links found.';
    var resultLines = [];
    for (var i = 0; i < items.length; i++) {
        var r = items[i];
        var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
        resultLines.push('[Index ' + i + '] Title: ' + r.title + '. Snippet: ' + fullSnippet);
    }
    return resultLines.join('\n---\n');
}

function renderBuiltInTool(toolName) {
    var toolContainerEl = document.getElementById('toolContainer');
    if (!toolContainerEl) return;
    
    if (!toolName) {
        toolContainerEl.innerHTML = '';
        toolContainerEl.style.display = 'none';
        return;
    }

    var tool = BUILT_IN_TOOLS[toolName];
    if (tool) {
        var finalUrl = tool.url;
        var toolsToPassQuery = ['calculator', 'unit_converter', 'translate'];
        if (toolsToPassQuery.indexOf(toolName) !== -1 && currentQuery) {
            finalUrl += '?q=' + encodeURIComponent(currentQuery);
        }
        
        toolContainerEl.innerHTML = '<div class="built-in-tool-frame">' +
            '<iframe src="' + finalUrl + '" frameborder="0" style="width: 100%; height: 350px;"></iframe>' +
            '</div>';
        toolContainerEl.style.display = 'block';
    } else {
        toolContainerEl.innerHTML = '';
        toolContainerEl.style.display = 'none';
    }
}

// Replaced async/await with standard AJAX/Promise structure
function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    renderBuiltInTool(null); 
    
    if (isAIOverviewEnabled && overviewEl) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing and ranking your results...</p>';
    }

    var rawWebSearchText = createRawSearchText(searchItems);
    var toolResult = "\n[TOOL_RESULT_FOR_PREVIOUS_TURN]\n" + rawWebSearchText + "\n";

    var requestBody = {
        contents: [
            { role: "model", parts: [{ text: toolResult }] },
            { role: "user", parts: [{ text: query }] }
        ],
        system_instruction: {
            parts: [{ text: ladyPraterichSystemInstruction }]
        }
    };

    // IE11 fallback for fetch (Assuming a polyfill or using XHR)
    var xhr = new XMLHttpRequest();
    xhr.open('POST', AI_API_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            var aiRawText = data.text;
            lastAIRawText = aiRawText;

            var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
            var toolRegex = /@@TOOL:\[(.*?)\]@@/;

            var toolMatch = aiRawText.match(toolRegex);
            var detectedTool = toolMatch && toolMatch[1] ? toolMatch[1].trim() : null;

            var match = aiRawText.match(rankingRegex);
            var cleanDisplayText = aiRawText.replace(rankingRegex, '').replace(toolRegex, '').trim();

            renderBuiltInTool(detectedTool);

            if (isAIOverviewEnabled && overviewEl) {
                overviewEl.innerHTML = renderMarkdown(cleanDisplayText);
            } else if (overviewEl) {
                overviewEl.innerHTML = '';
            }

            if (match && match[1]) {
                applySmartRanking(searchItems, match[1]);
            }
        }
    };
    xhr.send(JSON.stringify(requestBody));
}

function applyAIResultsFromCache(aiRawText, searchItems) {
    if (!aiRawText || !searchItems) return;
    
    var overviewEl = document.getElementById('aiOverview');
    var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
    var toolRegex = /@@TOOL:\[(.*?)\]@@/;
    
    var toolMatch = aiRawText.match(toolRegex);
    var detectedTool = toolMatch && toolMatch[1] ? toolMatch[1].trim() : null;
    renderBuiltInTool(detectedTool);
    
    var cleanDisplayText = aiRawText.replace(rankingRegex, '').replace(toolRegex, '').trim();
    if (isAIOverviewEnabled && overviewEl) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Applying Praterich analysis from cache...</p>'; 
        setTimeout(function() {
            overviewEl.innerHTML = renderMarkdown(cleanDisplayText);
        }, 50); 
    } else if (overviewEl) {
        overviewEl.innerHTML = '';
    }
}

function applySmartRanking(originalItems, indicesString) {
    try {
        var prioritizedIndices = JSON.parse('[' + indicesString + ']');
        var reorderedItems = [];
        var usedIndices = {}; // Use object as a simple Set substitute for IE11

        for (var i = 0; i < prioritizedIndices.length; i++) {
            var idx = prioritizedIndices[i];
            if (originalItems[idx]) {
                reorderedItems.push(originalItems[idx]);
                usedIndices[idx] = true;
            }
        }

        for (var j = 0; j < originalItems.length; j++) {
            if (!usedIndices[j]) {
                reorderedItems.push(originalItems[j]);
            }
        }

        renderLinkResults(reorderedItems, reorderedItems.length);

        var resultsEl = document.getElementById('linkResults');
        if (resultsEl && currentSearchType === 'web') {
            var notice = document.createElement('div');
            notice.className = 'small';
            notice.style.color = '#388e3c'; 
            notice.style.marginBottom = '10px';
            notice.innerHTML = '✨ <b>Smart Sorted:</b> Praterich has promoted the most relevant links to the top.';
            resultsEl.insertBefore(notice, resultsEl.firstChild);
        }

    } catch (e) {
        console.warn('Ranking parse error:', e);
    }
}

function executeSearch(query, type, page) {
    if (!query) return;
    page = page || 1;

    currentQuery = query;
    currentSearchType = type;
    currentPage = page;
    document.getElementById('currentQuery').value = query;

    var overviewEl = document.getElementById('aiOverview');
    if (overviewEl) overviewEl.innerHTML = ''; 
    
    renderBuiltInTool(null); 
    lastAIRawText = null; 
    lastFetchedItems = null;

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (citizenMsgEl) {
        citizenMsgEl.style.display = (!isAIOverviewEnabled && type === 'web') ? 'block' : 'none';
    }
    
    if (aiTimeout) clearTimeout(aiTimeout);

    var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
    if (type === 'image') url += '&type=image';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            if (type === 'web') {
                renderLinkResults(data.items, data.total);
                lastFetchedItems = data.items;
                if (page === 1) {
                    aiTimeout = setTimeout(function() {
                        processAIResults(query, data.items);
                    }, 500);
                }
            } else {
                renderImageResults(data.items, data.total);
            }
        }
    };
    
    if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
    } else {
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images...</p>';
    }
    xhr.send();
}

function switchTab(tabName, executeNewSearch) {
    var normalizedTab = tabName;
    var newSearchType = tabName;

    if (tabName === 'web' || tabName === 'links') {
        normalizedTab = 'links';
        newSearchType = 'web';
    } else if (tabName === 'image' || tabName === 'images') {
        normalizedTab = 'images';
        newSearchType = 'image';
    }

    currentSearchType = newSearchType;

    var tabs = document.querySelectorAll('nav a.frutiger-aero-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].className = tabs[i].className.replace(' active', '');
    }

    document.getElementById('linksSection').style.display = 'none';
    document.getElementById('imagesSection').style.display = 'none';

    if (normalizedTab === 'links') {
        document.getElementById('tab-links').className += ' active';
        document.getElementById('linksSection').style.display = 'block';
    } else if (normalizedTab === 'images') {
        document.getElementById('tab-images').className += ' active';
        document.getElementById('imagesSection').style.display = 'block';
    }

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (newSearchType === 'image') {
        if (!isAIOverviewEnabled && citizenMsgEl) citizenMsgEl.style.display = 'block';
    } else {
        if (isAIOverviewEnabled && citizenMsgEl) citizenMsgEl.style.display = 'none';
    }
    
    if (!executeNewSearch) {
        renderBuiltInTool(null);
        if (document.getElementById('aiOverview')) document.getElementById('aiOverview').innerHTML = '';
        if (aiTimeout) clearTimeout(aiTimeout);
    }

    if (executeNewSearch && currentQuery) {
        executeSearch(currentQuery, newSearchType, 1);
    }
}

function changePage(delta) {
    var newPage = currentPage + delta;
    if (newPage >= 1) {
        lastAIRawText = null; 
        lastFetchedItems = null;
        if (aiTimeout) clearTimeout(aiTimeout);
        window.location.href = 'search.html?q=' + encodeURIComponent(currentQuery) + '&type=' + currentSearchType + '&page=' + newPage;
    }
}

function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    if (typeof window.renderLinkResultsWithAds === 'function') {
        resultsEl.innerHTML = window.renderLinkResultsWithAds(items, total, currentPage, MAX_PAGE_SIZE) + renderPaginationControls(total);
    } else {
        if (!items || items.length === 0) {
            resultsEl.innerHTML = '<p class="small">No web links found.</p>' + renderPaginationControls(total);
            return;
        }
        var maxPages = Math.ceil(total / MAX_PAGE_SIZE);
        var html = '<p class="small">Found ' + total + ' links. Showing page ' + currentPage + ' of ' + maxPages + '.</p>';
        for (var i = 0; i < items.length; i++) {
            var r = items[i];
            html += '<div class="result-block">' +
                    '<a href="' + r.url + '" target="_blank" rel="noopener">' + escapeHtml(r.title) + '</a>' +
                    '<div class="small">' + escapeHtml(r.url) + '</div>' +
                    '<div>' + escapeHtml(r.snippet || '') + '</div>' +
                    '</div>';
        }
        resultsEl.innerHTML = html + renderPaginationControls(total);
    }
}

function renderImageResults(items, total) {
    var resultsEl = document.getElementById('imageResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No images found.</p>' + renderPaginationControls(total);
        return;
    }
    var maxPages = Math.ceil(total / MAX_PAGE_SIZE);
    var html = '';
    for (var i = 0; i < items.length; i++) {
        var r = items[i];
        html += '<a href="' + r.pageUrl + '" target="_blank" rel="noopener" title="Source: ' + r.pageUrl + '">' +
                '<img src="' + r.thumbnail + '" alt="Image from ' + r.source + '" />' +
                '</a>';
    }
    resultsEl.innerHTML = html + '<p class="small" style="margin-top: 10px;">Found ' + total + ' images. Page ' + currentPage + ' of ' + maxPages + '.</p>' + renderPaginationControls(total);
}

function renderPaginationControls(totalResults) {
    var maxPages = Math.ceil(totalResults / MAX_PAGE_SIZE);
    var controls = '<div style="text-align: center; margin-top: 20px;">';
    if (currentPage > 1) {
        controls += '<button class="frutiger-aero-tab" onclick="changePage(-1)">← Previous</button>';
    } else {
        controls += '<button class="frutiger-aero-tab" style="opacity: 0.5; cursor: not-allowed;" disabled>← Previous</button>';
    }
    controls += '<span style="margin: 0 15px; font-weight: bold;">Page ' + currentPage + '</span>';
    if (currentPage < maxPages) {
        controls += '<button class="frutiger-aero-tab" onclick="changePage(1)">Next →</button>';
    } else {
        controls += '<button class="frutiger-aero-tab" style="opacity: 0.5; cursor: not-allowed;" disabled>Next →</button>';
    }
    controls += '</div>';
    return controls;
}

function setupAIOverviewToggle() {
    var toggle = document.getElementById('aiOverviewToggle');
    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    var overviewEl = document.getElementById('aiOverview');
    if (!toggle) return;

    var storedState = sessionStorage.getItem('aiOverviewState');
    if (storedState !== null) { isAIOverviewEnabled = (storedState === 'true'); } 
    toggle.checked = isAIOverviewEnabled;

    if (!isAIOverviewEnabled && currentSearchType !== 'image') { 
        if (citizenMsgEl) citizenMsgEl.style.display = 'block';
    } else {
        if (citizenMsgEl) citizenMsgEl.style.display = 'none';
    }
    
    if (isAIOverviewEnabled && lastAIRawText && lastFetchedItems) {
        applyAIResultsFromCache(lastAIRawText, lastFetchedItems);
    }

    toggle.onclick = function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        if (isAIOverviewEnabled) {
            if (citizenMsgEl) citizenMsgEl.style.display = 'none';
            if (lastAIRawText && lastFetchedItems) {
                applyAIResultsFromCache(lastAIRawText, lastFetchedItems);
            } else if (currentQuery && currentSearchType === 'web' && currentPage === 1) {
                executeSearch(currentQuery, currentSearchType, currentPage);
            }
        } else {
            if (overviewEl) overviewEl.innerHTML = '';
            if (citizenMsgEl) citizenMsgEl.style.display = 'block';
        }
    };
}

function initializeFromSession() {
    var query = getParameterByName('q');
    var searchType = getParameterByName('type') || 'web';
    var page = parseInt(getParameterByName('page')) || 1; 

    if (!query) {
        query = sessionStorage.getItem('metaSearchQuery') || '';
        searchType = sessionStorage.getItem('searchType') || 'web';
    }

    sessionStorage.removeItem('metaSearchQuery');
    sessionStorage.removeItem('searchType');
    setupAIOverviewToggle();

    if (query) {
        switchTab(searchType, false);
        executeSearch(query, searchType, page); 
    } else {
        switchTab('web', false);
    }
}

// Support for older IE event listeners
if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', initializeFromSession);
} else {
    window.onload = initializeFromSession;
}

document.getElementById('currentQuery').onkeydown = function(e) {
    var event = e || window.event;
    if (event.keyCode === 13) {
        var query = this.value.trim();
        var type = document.getElementById('tab-images').className.indexOf('active') !== -1 ? 'image' : 'web';
        lastAIRawText = null; 
        lastFetchedItems = null;
        if (aiTimeout) clearTimeout(aiTimeout);
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
    }
};
