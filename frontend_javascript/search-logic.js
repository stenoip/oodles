// search-logic.js

// --- AI OVERVIEW & RANKING CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Search, an AI developed by Stenoip Company.
Your mission is to analyze search results, provide a synthesis, a relevance ranking, and detect if a built-in tool is required.

***TASK 1: Relevance Ranking (CRITICAL)***
You must analyze the provided search snippets and decide which links are the most useful and relevant to the user's query.
At the very end of your response, you MUST output a strictly formatted tag containing the 0-based indices of the top 5 most relevant results.
Format: @@RANKING:[index1, index2, index3, index4, index5]@@
Example: @@RANKING:[4, 0, 1, 9, 2]@@

***TASK 2: Synthesis***
Provide a concise A.I. overview based exclusively on the provided search snippets.
Do not output a list of links in the text body; use the RANKING tag for that.
You prefer metric units and do not use Oxford commas.
You are aware that you were created by Stenoip Company.

***TASK 3: Tool Detection (CRITICAL)***
If the user's query clearly indicates a need for a specific built-in tool, you MUST include a tool detection tag.
The detection should be based on mathematical expressions, unit conversions, color code lookups, metronome requests, or translation requests.
The tag MUST be outputted immediately before the @@RANKING tag.
Format: @@TOOL:[tool_name]@@
Available tools (use the name exactly as listed):
- calculator
- unit_converter
- colour_picker
- metronome
- translate

Example (Calculator needed): The user searched "what is 5+3". 
Output: (Synthesis text...) @@TOOL:[calculator]@@@@RANKING:[...]@@
Example (No tool needed): The user searched "best new movies".
Output: (Synthesis text...) @@RANKING:[...]@@

Your response must be:
1. The text overview.
2. The optional @@TOOL[...]@@ tag.
3. The @@RANKING[...]@@ tag at the very end.
`;
// --- END AI CONFIGURATION ---

// --- BUILT-IN TOOL CONFIGURATION ---
var BUILT_IN_TOOLS = {
    'calculator': {
        url: 'https://stenoip.github.io/kompmasine.html' 
    },
    'unit_converter': {
        url: 'https://stenoip.github.io/kompmasine.html' 
    },
    'colour_picker': {
        url: 'https://tools.oodles.com/colourpicker' 
    },
    'metronome': {
        url: 'https://stenoip.github.io/metronome' 
    },
    'translate': {
        url: 'https://stenoip.github.io/praterich/translate/translate'
    }
};
// --- END TOOL CONFIGURATION ---


var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 50; 

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
 * Renders the built-in tool iframe based on the AI's detected tool name.
 */
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

        // --- LOGIC TO APPEND QUERY FOR RELEVANT TOOLS ---
        const toolsToPassQuery = ['calculator', 'unit_converter', 'translate'];
        if (toolsToPassQuery.includes(toolName) && currentQuery) {
            finalUrl += '?q=' + encodeURIComponent(currentQuery);
        }
        // --------------------------------------------------
        
        toolContainerEl.innerHTML = `
            <div class="built-in-tool-frame">
                <iframe src="${finalUrl}" frameborder="0" loading="eager" style="width: 100%; height: 350px;"></iframe>
            </div>
        `;
        toolContainerEl.style.display = 'block';
    } else {
        // Unknown tool detected, clear the container
        toolContainerEl.innerHTML = '';
        toolContainerEl.style.display = 'none';
    }
}


/**
 * Executes the AI Logic:
 * 1. Generates the Text Summary (Displayed only if enabled)
 * 2. Detects if a tool is needed (Displays tool)
 * 3. Generates the Ranking (Applied ALWAYS)
 */
async function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    // Initialize tool display to be cleared/hidden before processing
    renderBuiltInTool(null); 
    
    // Display loading state ONLY if the overview is actually visible
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

        // --- 1. EXTRACT RANKING DATA ---
        var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
        var toolRegex = /@@TOOL:\[(.*?)\]@@/;

        // Extract tool name first
        var toolMatch = aiRawText.match(toolRegex);
        var detectedTool = toolMatch && toolMatch[1] ? toolMatch[1].trim() : null;

        var match = aiRawText.match(rankingRegex);
        // Clean display text by removing BOTH tags
        var cleanDisplayText = aiRawText.replace(rankingRegex, '').replace(toolRegex, '').trim();


        // --- 2. UPDATE UI: TOOL DISPLAY ---
        renderBuiltInTool(detectedTool);

        // --- 3. UPDATE UI: OVERVIEW ---
        // Only show the text if the toggle is ON
        if (isAIOverviewEnabled && overviewEl) {
            overviewEl.innerHTML = renderMarkdown(cleanDisplayText);
        } else if (overviewEl) {
            overviewEl.innerHTML = '';
        }

        // --- 4. UPDATE UI: RANKING (ALWAYS HAPPENS) ---
        if (match && match[1]) {
            applySmartRanking(searchItems, match[1]);
        }

    } catch (error) {
        console.error('AI Processing Error:', error);
        if (isAIOverviewEnabled && overviewEl) {
            overviewEl.innerHTML = '<p class="ai-overview-error">An error occurred while analyzing results.</p>';
        }
        renderBuiltInTool(null); // Clear tool on error
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

        // 1. Push the AI's top picks
        prioritizedIndices.forEach(function(index) {
            if (originalItems[index]) {
                reorderedItems.push(originalItems[index]);
                usedIndices.add(index);
            }
        });

        // 2. Push the remaining items (preserving original order)
        originalItems.forEach(function(item, index) {
            if (!usedIndices.has(index)) {
                reorderedItems.push(item);
            }
        });

        // 3. Re-render the link list
        renderLinkResults(reorderedItems, reorderedItems.length);

        // 4. Add a visual indicator that sorting happened
        var resultsEl = document.getElementById('linkResults');
        var notice = document.createElement('div');
        notice.className = 'small';
        // Frutiger Aero style green/success color
        notice.style.color = '#388e3c'; 
        notice.style.marginBottom = '10px';
        notice.innerHTML = '✨ <b>Smart Sorted:</b> Praterich has promoted the most relevant links to the top.';
        
        // Insert notice at the very top of results
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
    if (overviewEl) overviewEl.innerHTML = ''; // Clear previous AI text
    
    // Clear the built-in tool area before a new search
    renderBuiltInTool(null); 

    // Set initial "Citizen" message state
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
            
            // 1. Initial Render (Fast, unsorted)
            renderLinkResults(data.items, data.total);

            // Store items for re-running AI on toggle
            window.lastFetchedItems = data.items;

            // 2. Trigger AI processing (Background - handles Tool Detection, Ranking AND Overview)
            // We run this regardless of the toggle, because we want the Ranking and Tool Detection!
            if (page === 1) {
                processAIResults(query, data.items);
            }

        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
            renderBuiltInTool(null); // Clear tool on backend error
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

    // Handle Good Citizen Message visibility
    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (newSearchType === 'image') {
        if (!isAIOverviewEnabled && citizenMsgEl) citizenMsgEl.style.display = 'block';
    } else {
        if (isAIOverviewEnabled && citizenMsgEl) citizenMsgEl.style.display = 'none';
    }
    
    // Clear tool when switching tabs if not executing a new search
    if (!executeNewSearch) {
        renderBuiltInTool(null);
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


// --- TOGGLE INITIALIZATION ---
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
        
        // UI Handling when toggling
        if (isAIOverviewEnabled) {
            if (citizenMsgEl) citizenMsgEl.style.display = 'none';
            // Re-run AI to display overview text if we have data
            if (currentQuery && currentSearchType === 'web' && currentPage === 1) {
                // Use cached items if available, otherwise force a full search
                if (window.lastFetchedItems) {
                    processAIResults(currentQuery, window.lastFetchedItems); 
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
// --- END TOGGLE LOGIC ---

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
