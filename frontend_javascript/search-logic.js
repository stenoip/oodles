/* Copyright Stenoip Company. All rights reserved.
   Oodles Search Frontend - Optimized for Request Efficiency
*/

// --- AI OVERVIEW & RANKING CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Search, an AI developed by Stenoip Company.
Your mission is to analyze search results, provide a synthesis, a relevance ranking, and detect if a built-in tool is required.

***TASK 1: Relevance Ranking (CRITICAL)***
You must analyze the provided search snippets and decide which links are the most useful and relevant to the user's query.
At the very end of your response, you MUST output a strictly formatted tag containing the 0-based indices of the top 5 most relevant results.
Format: @@RANKING:[index1, index2, index3, index4, index5]@@

***TASK 2: Synthesis***
Provide a concise A.I. overview based exclusively on the provided search snippets.
Do not output a list of links in the text body; use the RANKING tag for that.
You prefer metric units and do not use Oxford commas.

***TASK 3: Tool Detection (CRITICAL)***
Format: @@TOOL:[tool_name]@@
Available tools: calculator, unit_converter, colour_picker, metronome, translate
`;

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

// --- GLOBAL STATE ---
var isAIOverviewEnabled = false; 
var lastAIRawText = null;       
var lastFetchedItems = null;    
var aiTimeout = null;           

// --- 1. LOCAL OPTIMIZATION HELPERS ---

/**
 * Detects tools via regex to provide instant UI response and save API costs.
 */
function detectToolLocally(query) {
    const q = query.toLowerCase().trim();
    // Simple Math: 5+5, 10/2, etc.
    if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(q) && /[\+\-\*\/]/.test(q)) return 'calculator';
    // Conversions: 5km to miles, 10kg in lbs
    if (/\b(convert|to|in|cm|inches|kg|lbs|meters|feet|miles|grams|ounces)\b/.test(q) && /\d/.test(q)) return 'unit_converter';
    // Translation: translate hello to spanish
    if (/\b(translate|translation|meaning of|how to say)\b/.test(q)) return 'translate';
    // Color: hex to rgb, color picker
    if (/\b(color|colour|hex|rgb|picker|css color)\b/.test(q)) return 'colour_picker';
    // Music: 120 bpm, metronome
    if (/\b(metronome|bpm|tempo)\b/.test(q)) return 'metronome';
    return null;
}

/**
 * Filters out simple site navigation to prevent expensive AI calls for "google.com" etc.
 */
function isNavigational(query) {
    const navSites = ['google', 'youtube', 'facebook', 'gmail', 'twitter', 'amazon', 'netflix', 'github', 'wikipedia'];
    const q = query.toLowerCase().trim();
    return navSites.some(site => q === site || q === site + '.com');
}

// --- 2. CORE LOGIC ---

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) return marked.parse(text);
    return text;
}

function createRawSearchText(items) {
    if (!items || items.length === 0) return 'No web links found.';
    return items.map((r, index) => `[Index ${index}] Title: ${r.title}. Snippet: ${r.snippet || 'N/A'}`).join('\n---\n');
}

function renderBuiltInTool(toolName) {
    var toolContainerEl = document.getElementById('toolContainer');
    if (!toolContainerEl) return;
    
    if (!toolName) {
        toolContainerEl.innerHTML = '';
        toolContainerEl.style.display = 'none';
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
    }
}

async function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    
    // Check Session Storage for Cache
    const cacheKey = `oodles_ai_${query.toLowerCase().trim()}`;
    const cachedResponse = sessionStorage.getItem(cacheKey);
    
    if (cachedResponse) {
        lastAIRawText = cachedResponse;
        applyAIResultsFromCache(lastAIRawText, searchItems);
        return;
    }

    if (isAIOverviewEnabled && overviewEl) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing and ranking...</p>';
    }

    var rawWebSearchText = createRawSearchText(searchItems);
    var requestBody = {
        contents: [
            { role: "model", parts: [{ text: `[SEARCH_RESULTS]\n${rawWebSearchText}` }] },
            { role: "user", parts: [{ text: query }] }
        ],
        system_instruction: { parts: [{ text: ladyPraterichSystemInstruction }] }
    };

    try {
        var response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        var data = await response.json();
        var aiRawText = data.text;
        
        // Cache result
        sessionStorage.setItem(cacheKey, aiRawText);
        lastAIRawText = aiRawText;

        var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
        var toolRegex = /@@TOOL:\[(.*?)\]@@/;

        // Extraction
        var toolMatch = aiRawText.match(toolRegex);
        var detectedTool = toolMatch ? toolMatch[1].trim() : detectToolLocally(query);
        var rankingMatch = aiRawText.match(rankingRegex);
        var cleanText = aiRawText.replace(rankingRegex, '').replace(toolRegex, '').trim();

        renderBuiltInTool(detectedTool);

        if (isAIOverviewEnabled && overviewEl) {
            overviewEl.innerHTML = renderMarkdown(cleanText);
        }

        if (rankingMatch && rankingMatch[1]) {
            applySmartRanking(searchItems, rankingMatch[1]);
        }

    } catch (error) {
        console.error('AI Processing Error:', error);
        renderBuiltInTool(detectToolLocally(query)); 
    }
}

function applyAIResultsFromCache(aiRawText, searchItems) {
    if (!aiRawText || !searchItems) return;
    var overviewEl = document.getElementById('aiOverview');
    var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
    var toolRegex = /@@TOOL:\[(.*?)\]@@/;
    
    var toolMatch = aiRawText.match(toolRegex);
    var rankingMatch = aiRawText.match(rankingRegex);
    renderBuiltInTool(toolMatch ? toolMatch[1].trim() : detectToolLocally(currentQuery));
    
    if (isAIOverviewEnabled && overviewEl) {
        var cleanText = aiRawText.replace(rankingRegex, '').replace(toolRegex, '').trim();
        overviewEl.innerHTML = renderMarkdown(cleanText);
    }
    
    if (rankingMatch && rankingMatch[1]) {
        applySmartRanking(searchItems, rankingMatch[1]);
    }
}

function applySmartRanking(originalItems, indicesString) {
    try {
        var prioritizedIndices = JSON.parse(`[${indicesString}]`);
        var reorderedItems = [];
        var usedIndices = new Set();

        prioritizedIndices.forEach(idx => {
            if (originalItems[idx]) {
                reorderedItems.push(originalItems[idx]);
                usedIndices.add(idx);
            }
        });

        originalItems.forEach((item, idx) => {
            if (!usedIndices.has(idx)) reorderedItems.push(item);
        });

        renderLinkResults(reorderedItems, originalItems.length);
        
        var resultsEl = document.getElementById('linkResults');
        if (resultsEl && currentSearchType === 'web') {
            var notice = document.createElement('div');
            notice.style = 'color: #388e3c; margin-bottom: 10px; font-size: 0.85em;';
            notice.innerHTML = '✨ <b>Smart Sorted:</b> Praterich has promoted relevant links.';
            resultsEl.prepend(notice);
        }
    } catch (e) { console.warn('Ranking error:', e); }
}

async function executeSearch(query, type, page = 1) {
    if (!query) return;
    currentQuery = query;
    currentSearchType = type;
    currentPage = page;

    renderBuiltInTool(null); 
    if (aiTimeout) clearTimeout(aiTimeout);

    if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p>Searching...</p>';
        try {
            var url = `${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&page=${page}&pageSize=${MAX_PAGE_SIZE}`;
            var resp = await fetch(url);
            var data = await resp.json();
            
            renderLinkResults(data.items, data.total);
            lastFetchedItems = data.items;

            // Trigger AI if it's page 1 and not a simple navigation
            if (page === 1 && !isNavigational(query)) {
                // Check local tool first for speed
                const localTool = detectToolLocally(query);
                if (localTool) renderBuiltInTool(localTool);

                aiTimeout = setTimeout(() => {
                    processAIResults(query, data.items);
                }, 800); 
            }
        } catch (e) { console.error(e); }
    } else if (type === 'image') {
        // Image logic remains same...
        try {
            var url = `${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&type=image&page=${page}`;
            var resp = await fetch(url);
            var data = await resp.json();
            renderImageResults(data.items, data.total);
        } catch (e) { console.error(e); }
    }
}

// --- TAB & UI HANDLERS ---

function setupAIOverviewToggle() {
    var toggle = document.getElementById('aiOverviewToggle');
    if (!toggle) return;

    isAIOverviewEnabled = sessionStorage.getItem('aiOverviewState') === 'true';
    toggle.checked = isAIOverviewEnabled;

    toggle.addEventListener('change', function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        if (isAIOverviewEnabled && lastAIRawText) {
            applyAIResultsFromCache(lastAIRawText, lastFetchedItems);
        } else {
            document.getElementById('aiOverview').innerHTML = '';
        }
    });
}

function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p>No results.</p>';
        return;
    }
    resultsEl.innerHTML = items.map(r => `
        <div class="result-block">
            <a href="${r.url}" target="_blank">${escapeHtml(r.title)}</a>
            <div class="small">${escapeHtml(r.url)}</div>
            <div>${escapeHtml(r.snippet || '')}</div>
        </div>
    `).join('') + renderPagination(total);
}

function renderPagination(total) {
    const max = Math.ceil(total / MAX_PAGE_SIZE);
    return `<div style="text-align:center; margin-top:20px;">
        <button onclick="changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${currentPage} of ${max}</span>
        <button onclick="changePage(1)" ${currentPage >= max ? 'disabled' : ''}>Next</button>
    </div>`;
}

function changePage(delta) {
    const newPage = currentPage + delta;
    window.location.href = `search.html?q=${encodeURIComponent(currentQuery)}&type=${currentSearchType}&page=${newPage}`;
}

function initialize() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const t = params.get('type') || 'web';
    const p = parseInt(params.get('page')) || 1;

    setupAIOverviewToggle();
    if (q) executeSearch(q, t, p);
}

document.addEventListener('DOMContentLoaded', initialize);
