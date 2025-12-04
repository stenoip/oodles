// search-logic.js

// --- AI OVERVIEW & RANKING CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

// Mapping of Widget Type to External URL for iframe src
const WIDGET_URLS = {
    'translate': 'https://stenoip.github.io/pratrich/translate/translate',
    
    'calculator': 'https://stenoip.github.io/calculator-desmos',
    'clock': 'https://stenoip.github.io/clocker',
    'timer': 'https://stenoip.github.io/clocker'
};

var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Search, an AI developed by Stenoip Company.
Your mission is to analyze search results to provide a synthesis, a relevance ranking, and potentially a widget.

***TASK 0: Widget Generation (NEW)***
Analyze the user's query. If the query is a simple calculation (e.g., '5*4', '120 divided by 6'), a time query, a timer query, a translation query, or a simple definition, you must output a structured JSON widget block. If no widget is applicable, output an empty block: @@WIDGET_JSON:{}@@

Widget Types:
1. calculator: For math. Set 'type'='calculator' and 'value' as the numerical result.
2. clock: For current time/date queries. Set 'type'='clock'. 'value' can be ignored.
3. timer: For timer queries. Set 'type'='timer'. 'value' can be ignored.
4. definition: For simple definitions. Set 'type'='definition' and 'value' as the definition text.
5. translate: For translation queries. Set 'type'='translate'. 'value' can be ignored.

Structure: @@WIDGET_JSON:{"type":"...", "value":"..."}@@

***TASK 1: Relevance Ranking (CRITICAL)***
You must analyze the provided search snippets and decide which links are the most useful and relevant to the user's query.
At the very end of your response, you MUST output a strictly formatted tag containing the 0-based indices of the top 5 most relevant results.
Format: @@RANKING:[index1, index2, index3, index4, index5]@@

***TASK 2: Synthesis***
Provide a concise A.I. overview based exclusively on the provided search snippets.
Do not output a list of links in the text body; use the RANKING tag for that.
You prefer metric units and do not use Oxford commas.

Your response must be:
1. The @@WIDGET_JSON[...]@@ tag (must be present, even if empty).
2. The text overview.
3. The @@RANKING[...]@@ tag at the very end.
`;
// --- END AI CONFIGURATION ---


var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 50; 
var PRATERICH_ICON_URL = "https://stenoip.github.io/praterich/praterich.png";

// --- GLOBAL STATE ---
var isAIOverviewEnabled = false; 

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


/**
 * Creates structured text containing full snippets for the AI model.
 */
function createRawSearchText(items) {
    if (!items || items.length === 0) return 'No web links found.';
    
    // We include the Index so the AI can reference it in the RANKING tag
    return items.map(function(r, index) {
        var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
        return `[Index ${index}] Title: ${r.title}. Snippet: ${fullSnippet}`;
    }).join('\n---\n');
}

/**
 * Renders the dedicated sidebar widget using external iframe URLs.
 */
function renderWidget(widgetData, query) {
    var widgetEl = document.getElementById('widgetResults');
    if (!widgetEl || !widgetData.type) {
        if (widgetEl) widgetEl.innerHTML = '';
        return;
    }

    let title = '';
    let widgetHtml = '';
    let srcUrl = WIDGET_URLS[widgetData.type]; // Get the external URL

    const iframeStyle = 'width: 100%; height: 120px; border: 1px solid #ccc; border-radius: 4px;';
    const iframeId = `praterich-${widgetData.type}-widget`;

    if (srcUrl) {
        // Handle specific iframe logic and titles
        switch (widgetData.type) {
            case 'calculator': 
                title = 'Calculator Result';
                // Pass the AI's numerical result and original query to the external iframe
                if (widgetData.value) {
                    srcUrl += `?result=${encodeURIComponent(widgetData.value)}&query=${encodeURIComponent(query)}`;
                }
                break;
            case 'clock': 
                title = 'Current Time Widget';
                // Optionally pass locale or specific time data if the widget supports it
                break;
            case 'timer': 
                title = 'Timer Widget'; 
                // Optionally pass duration/query to the widget
                break;
            case 'translate': 
                title = 'Translation Widget'; 
                // Optionally pass text to be translated
                break;
        }
        
        // Construct the iframe using the external source URL
        widgetHtml = `<iframe src="${srcUrl}" style="${iframeStyle}" id="${iframeId}"></iframe>`;

    } else if (widgetData.type === 'definition') {
        // Definition remains static text and does not use an iframe
        title = `Definition for "${escapeHtml(query)}"`;
        widgetHtml = `<p style="padding: 10px 0;">${widgetData.value}</p>`;
    } else {
        // Unknown type or missing URL
        widgetEl.innerHTML = '';
        return;
    }

    widgetEl.innerHTML = `
        <div class="frutiger-aero-widget-box" style="padding: 15px; border-radius: 8px; background: rgba(255, 255, 255, 0.7); box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <img src="${PRATERICH_ICON_URL}" alt="Praterich Icon" style="width: 24px; height: 24px; margin-right: 8px;">
                <h3 style="margin: 0; font-size: 1.1em; color: #0056b3;">${title}</h3>
            </div>
            <div style="border-top: 1px solid #ccc; padding-top: 5px;">
                ${widgetHtml}
            </div>
        </div>
    `;
}


/**
 * Executes the AI Logic:
 * 1. Generates Widget (Applied ALWAYS)
 * 2. Generates Ranking (Applied ALWAYS)
 * 3. Generates the Text Summary (Displayed only if enabled)
 */
async function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    var widgetEl = document.getElementById('widgetResults'); 
    if (widgetEl) widgetEl.innerHTML = '';

    if (isAIOverviewEnabled && overviewEl) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing and ranking your results...</p>';
    }

    var rawWebSearchText = createRawSearchText(searchItems);

    var toolResult = `
[TOOL_RESULT_FOR_PREVIOUS_TURN]
${rawWebSearchText}
`;

    var conversationParts = [
        { role: "model", parts: [{ text: toolResult }] },
        { role: "user", parts: [{ text: query }] }
    ];

    var requestBody = {
        contents: conversationParts,
        system_instruction: {
            parts: [{ text: ladyPraterichSystemInstruction }]
        }
    };

    try {
        var response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        var data = await response.json();
        var aiRawText = data.text;

        // --- 1. EXTRACT WIDGET DATA ---
        var widgetRegex = /@@WIDGET_JSON:(\{.*?\})@@/;
        var widgetMatch = aiRawText.match(widgetRegex);
        
        var widgetData = {};
        if (widgetMatch && widgetMatch[1]) {
            try {
                widgetData = JSON.parse(widgetMatch[1]);
            } catch (e) {
                console.warn('Widget JSON parse error:', e);
            }
        }
        
        renderWidget(widgetData, query); 

        // --- 2. EXTRACT RANKING DATA & CLEAN TEXT ---
        var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
        var rankingMatch = aiRawText.match(rankingRegex);
        
        var cleanDisplayText = aiRawText
            .replace(widgetRegex, '')
            .replace(rankingRegex, '')
            .trim();

        // --- 3. UPDATE UI: OVERVIEW ---
        if (isAIOverviewEnabled && overviewEl) {
            overviewEl.innerHTML = renderMarkdown(cleanDisplayText);
        }

        // --- 4. UPDATE UI: RANKING (ALWAYS HAPPENS) ---
        if (rankingMatch && rankingMatch[1]) {
            applySmartRanking(searchItems, rankingMatch[1]);
        }

    } catch (error) {
        console.error('AI Processing Error:', error);
        if (isAIOverviewEnabled && overviewEl) {
            overviewEl.innerHTML = '<p class="ai-overview-error">An error occurred while analyzing results.</p>';
        }
    }
}

/**
 * Re-orders the search items based on AI indices and re-renders the list.
 */
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

        renderLinkResults(reorderedItems, reorderedItems.length);

        var resultsEl = document.getElementById('linkResults');
        var notice = document.createElement('div');
        notice.className = 'small';
        notice.style.color = '#388e3c'; 
        notice.style.marginBottom = '10px';
        notice.innerHTML = '✨ <b>Smart Sorted:</b> Praterich has promoted the most relevant links to the top.';
        
        if (resultsEl) resultsEl.prepend(notice);

    } catch (e) {
        console.warn('Ranking parse error:', e);
    }
}


async function executeSearch(query, type, page = 1) {
    if (!query) return;

    currentQuery = query;
    currentSearchType = type;
    currentPage = page;
    document.getElementById('currentQuery').value = query;

    var overviewEl = document.getElementById('aiOverview');
    if (overviewEl) overviewEl.innerHTML = '';
    
    var widgetEl = document.getElementById('widgetResults');
    if (widgetEl) widgetEl.innerHTML = ''; 

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (citizenMsgEl) {
        citizenMsgEl.style.display = (!isAIOverviewEnabled && type === 'web') ? 'block' : 'none';
    }

    if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            
            renderLinkResults(data.items, data.total);

            if (page === 1) {
                processAIResults(query, data.items);
            }

        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
        }
    } else if (type === 'image') {
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images...</p>';
        if (citizenMsgEl && !isAIOverviewEnabled) citizenMsgEl.style.display = 'block';

        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            renderImageResults(data.items, data.total);
        } catch (error) {
            console.error('Image search error:', error);
            document.getElementById('imageResults').innerHTML = '<p class="small">Error loading images.</p>';
        }
    }
}

function switchTab(tabName, executeNewSearch) {
    if (window.event) event.preventDefault();

    let normalizedTab = tabName;
    let newSearchType = tabName;

    if (tabName === 'web' || tabName === 'links') {
        normalizedTab = 'links';
        newSearchType = 'web';
    } else if (tabName === 'image' || tabName === 'images') {
        normalizedTab = 'images';
        newSearchType = 'image';
    }

    currentSearchType = newSearchType;

    document.querySelectorAll('nav a.frutiger-aero-tab').forEach(function(a) {
        a.classList.remove('active');
    });

    document.getElementById('linksSection').style.display = 'none';
    document.getElementById('imagesSection').style.display = 'none';

    if (normalizedTab === 'links') {
        document.getElementById('tab-links').classList.add('active');
        document.getElementById('linksSection').style.display = 'block';
    } else if (normalizedTab === 'images') {
        document.getElementById('tab-images').classList.add('active');
        document.getElementById('imagesSection').style.display = 'block';
    }

    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    var overviewEl = document.getElementById('aiOverview');
    
    if (newSearchType === 'image') {
        if (!isAIOverviewEnabled && citizenMsgEl) citizenMsgEl.style.display = 'block';
        if (overviewEl) overviewEl.innerHTML = '';
    } else {
        if (isAIOverviewEnabled && citizenMsgEl) citizenMsgEl.style.display = 'none';
    }

    if (executeNewSearch && currentQuery) {
        executeSearch(currentQuery, newSearchType, 1);
    }
}


function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1) {
        window.location.href = 'search.html?q=' + encodeURIComponent(currentQuery) + '&type=' + currentSearchType + '&page=' + newPage;
    }
}

function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    
    if (typeof window.renderLinkResultsWithAds === 'function') {
        const resultsHtml = window.renderLinkResultsWithAds(items, total, currentPage, MAX_PAGE_SIZE);
        resultsEl.innerHTML = resultsHtml + renderPaginationControls(total);
    } else {
        if (!items || items.length === 0) {
            resultsEl.innerHTML = '<p class="small">No web links found.</p>' + renderPaginationControls(total);
            return;
        }
        
        const maxPages = Math.ceil(total / MAX_PAGE_SIZE);

        resultsEl.innerHTML = `
            <p class="small">Found ${total} links. Showing page ${currentPage} of ${maxPages}.</p>
            ` + items.map(function(r) {
                return `
                    <div class="result-block">
                        <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
                        <div class="small">${escapeHtml(r.url)}</div>
                        <div>${escapeHtml(r.snippet || '')}</div>
                    </div>
                `;
            }).join('') + renderPaginationControls(total);
    }
}


function renderImageResults(items, total) {
    var resultsEl = document.getElementById('imageResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No images found.</p>' + renderPaginationControls(total);
        return;
    }

    const maxPages = Math.ceil(total / MAX_PAGE_SIZE);

    resultsEl.innerHTML = items.map(function(r) {
        return `
            <a href="${r.pageUrl}" target="_blank" rel="noopener" title="Source: ${r.pageUrl}">
                <img src="${r.thumbnail}" alt="Image from ${r.source}" loading="lazy"/>
            </a>
        `;
    }).join('') +
        `<p class="small" style="grid-column: 1 / -1; margin-top: 10px;">Found ${total} images. Showing page ${currentPage} of ${maxPages}.</p>` +
        renderPaginationControls(total); 
}


function renderPaginationControls(totalResults) {
    const maxPages = Math.ceil(totalResults / MAX_PAGE_SIZE);
    let controls = '<div style="text-align: center; margin-top: 20px;">';

    if (currentPage > 1) {
        controls += `<button class="frutiger-aero-tab" onclick="changePage(-1)">← Previous</button>`;
    } else {
        controls += `<button class="frutiger-aero-tab" style="opacity: 0.5; cursor: not-allowed;" disabled>← Previous</button>`;
    }

    controls += `<span style="margin: 0 15px; font-weight: bold;">Page ${currentPage}</span>`;

    if (currentPage < maxPages) {
        controls += `<button class="frutiger-aero-tab" onclick="changePage(1)">Next →</button>`;
    } else {
        controls += `<button class="frutiger-aero-tab" style="opacity: 0.5; cursor: not-allowed;" disabled>Next →</button>`;
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
    if (storedState !== null) {
        isAIOverviewEnabled = (storedState === 'true');
    } 

    toggle.checked = isAIOverviewEnabled;

    if (!isAIOverviewEnabled && currentSearchType !== 'image') { 
        if (citizenMsgEl) citizenMsgEl.style.display = 'block';
    } else {
        if (citizenMsgEl) citizenMsgEl.style.display = 'none';
    }

    toggle.addEventListener('change', function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        
        if (isAIOverviewEnabled) {
            if (citizenMsgEl) citizenMsgEl.style.display = 'none';
            if (currentQuery && currentSearchType === 'web' && currentPage === 1) {
                 executeSearch(currentQuery, currentSearchType, currentPage);
            }
        } else {
            if (overviewEl) overviewEl.innerHTML = '';
            if (citizenMsgEl) citizenMsgEl.style.display = 'block';
        }
    });
}

function initializeFromSession() {
    const urlParams = new URLSearchParams(window.location.search);
    let query = urlParams.get('q');
    let searchType = urlParams.get('type') || 'web';
    let page = parseInt(urlParams.get('page')) || 1; 

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

document.addEventListener('DOMContentLoaded', initializeFromSession);
document.getElementById('currentQuery').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        var query = this.value.trim();
        var type = document.getElementById('tab-images').classList.contains('active') ? 'image' : 'web';
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
    }
});
