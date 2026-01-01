var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 
var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var ladyPraterichSystemInstruction = `You are Praterich for Oodles Search, an AI developed by Stenoip Company. Analyze search snippets, provide a synthesis, and a relevance ranking. RANKING TAG: @@RANKING:[index1, index2, index3...]@@ TOOL TAG: @@TOOL:[tool_name]@@ (calculator, unit_converter, colour_picker, metronome, translate)`;

var BUILT_IN_TOOLS = {
    'calculator': { url: 'https://stenoip.github.io/kompmasine.html' },
    'unit_converter': { url: 'https://stenoip.github.io/kompmasine.html' },
    'colour_picker': { url: 'https://tools.oodles.com/colourpicker' },
    'metronome': { url: 'https://stenoip.github.io/metronome' },
    'translate': { url: 'https://stenoip.github.io/praterich/translate/translate' }
};

var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 50; 
var isAIOverviewEnabled = false; 
var lastAIRawText = null;       
var lastFetchedItems = null;    
var aiTimeout = null;           
var lastResultFingerprint = "";

function setPersistentCache(query, data) {
    try {
        const cacheObj = { payload: data, timestamp: Date.now() };
        localStorage.setItem(`oodles_cache_${query.toLowerCase().trim()}`, JSON.stringify(cacheObj));
    } catch (e) { console.warn("Cache full."); }
}

function getPersistentCache(query) {
    const cached = localStorage.getItem(`oodles_cache_${query.toLowerCase().trim()}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > (7 * 24 * 60 * 60 * 1000)) return null;
    return parsed.payload;
}

function getFingerprint(items) {
    return items.slice(0, 5).map(i => i.url).join('|');
}

function detectToolLocally(query) {
    const q = query.toLowerCase().trim();
    if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(q) && /[\+\-\*\/]/.test(q)) return 'calculator';
    if (/\b(convert|to|in|cm|inches|kg|lbs|meters|feet|miles|grams|ounces)\b/.test(q) && /\d/.test(q)) return 'unit_converter';
    if (/\b(translate|translation|meaning of|how to say)\b/.test(q)) return 'translate';
    if (/\b(color|colour|hex|rgb|picker|css color)\b/.test(q)) return 'colour_picker';
    if (/\b(metronome|bpm|tempo)\b/.test(q)) return 'metronome';
    return null;
}

function isNavigational(query) {
    const navSites = ['google', 'youtube', 'facebook', 'gmail', 'twitter', 'amazon', 'netflix', 'github', 'wikipedia'];
    const q = query.toLowerCase().trim();
    return navSites.some(site => q === site || q === site + '.com');
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) return marked.parse(text);
    return text;
}

function renderBuiltInTool(toolName) {
    var toolContainerEl = document.getElementById('toolContainer');
    if (!toolContainerEl) return;
    if (!toolName) { toolContainerEl.innerHTML = ''; toolContainerEl.style.display = 'none'; return; }
    const tool = BUILT_IN_TOOLS[toolName];
    if (tool) {
        let finalUrl = tool.url + (['calculator', 'unit_converter', 'translate'].includes(toolName) ? '?q=' + encodeURIComponent(currentQuery) : '');
        toolContainerEl.innerHTML = `<div class="built-in-tool-frame"><iframe src="${finalUrl}" frameborder="0" style="width: 100%; height: 350px;"></iframe></div>`;
        toolContainerEl.style.display = 'block';
    }
}

async function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    const currentFingerprint = getFingerprint(searchItems);
    if (currentFingerprint === lastResultFingerprint && lastAIRawText) {
        applyAIResultsFromCache(lastAIRawText, searchItems);
        return;
    }
    lastResultFingerprint = currentFingerprint;
    const cached = getPersistentCache(query);
    if (cached) {
        lastAIRawText = cached;
        applyAIResultsFromCache(lastAIRawText, searchItems);
        return;
    }
    if (isAIOverviewEnabled && overviewEl) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing...</p>';
    }
    try {
        var rawText = searchItems.map((r, i) => `[${i}] ${r.title}: ${r.snippet}`).join('\n');
        var response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "model", parts: [{ text: `[DATA]\n${rawText}` }] }, { role: "user", parts: [{ text: query }] }],
                system_instruction: { parts: [{ text: ladyPraterichSystemInstruction }] }
            })
        });
        if (!response.ok) throw new Error("API Offline");
        var data = await response.json();
        var aiRawText = data.text;
        setPersistentCache(query, aiRawText);
        lastAIRawText = aiRawText;
        applyAIResultsFromCache(aiRawText, searchItems);
    } catch (e) { 
        console.error(e);
        renderBuiltInTool(detectToolLocally(query));
    }
}

function applyAIResultsFromCache(aiRawText, searchItems) {
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
    if (rankingMatch) applySmartRanking(searchItems, rankingMatch[1]);
}

function applySmartRanking(originalItems, indicesString) {
    try {
        var prioritizedIndices = JSON.parse(`[${indicesString}]`);
        var reorderedItems = [];
        var usedIndices = new Set();
        prioritizedIndices.forEach(idx => { if (originalItems[idx]) { reorderedItems.push(originalItems[idx]); usedIndices.add(idx); } });
        originalItems.forEach((item, idx) => { if (!usedIndices.has(idx)) reorderedItems.push(item); });
        renderLinkResults(reorderedItems, originalItems.length);
        var resultsEl = document.getElementById('linkResults');
        if (resultsEl && currentSearchType === 'web') {
            var notice = document.createElement('div');
            notice.style = 'color: #388e3c; margin-bottom: 10px; font-size: 0.85em;';
            notice.innerHTML = '✨ <b>Smart Sorted:</b> Links prioritized by Praterich.';
            resultsEl.prepend(notice);
        }
    } catch (e) { console.warn(e); }
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
            var resp = await fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&page=${page}&pageSize=${MAX_PAGE_SIZE}`);
            var data = await resp.json();
            renderLinkResults(data.items, data.total);
            lastFetchedItems = data.items;
            if (page === 1 && !isNavigational(query)) {
                const localTool = detectToolLocally(query);
                if (localTool) renderBuiltInTool(localTool);
                aiTimeout = setTimeout(() => processAIResults(query, data.items), 850); 
            }
        } catch (e) { console.error(e); }
    } else {
        document.getElementById('imageResults').innerHTML = '<p>Searching images...</p>';
        try {
            var resp = await fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&type=image&page=${page}`);
            var data = await resp.json();
            renderImageResults(data.items, data.total);
        } catch (e) { console.error(e); }
    }
}

function switchTab(type, performSearch = false) {
    const linksSec = document.getElementById('linksSection');
    const imagesSec = document.getElementById('imagesSection');
    const tabLinks = document.getElementById('tab-links');
    const tabImages = document.getElementById('tab-images');
    if (type === 'links') {
        linksSec.style.display = 'block';
        imagesSec.style.display = 'none';
        tabLinks.classList.add('active');
        tabImages.classList.remove('active');
        currentSearchType = 'web';
    } else {
        linksSec.style.display = 'none';
        imagesSec.style.display = 'block';
        tabLinks.classList.remove('active');
        tabImages.classList.add('active');
        currentSearchType = 'image';
    }
    if (performSearch && currentQuery) executeSearch(currentQuery, currentSearchType);
}

function setupAIOverviewToggle() {
    var toggle = document.getElementById('aiOverviewToggle');
    var goodCitizen = document.getElementById('goodCitizenMessage');
    if (!toggle) return;
    isAIOverviewEnabled = sessionStorage.getItem('aiOverviewState') === 'true';
    toggle.checked = isAIOverviewEnabled;
    if (goodCitizen) goodCitizen.style.display = isAIOverviewEnabled ? 'none' : 'block';
    toggle.addEventListener('change', function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        if (goodCitizen) goodCitizen.style.display = isAIOverviewEnabled ? 'none' : 'block';
        if (isAIOverviewEnabled && lastAIRawText) applyAIResultsFromCache(lastAIRawText, lastFetchedItems);
        else document.getElementById('aiOverview').innerHTML = '';
    });
}

function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    if (!items || items.length === 0) { resultsEl.innerHTML = '<p>No results.</p>'; return; }
    resultsEl.innerHTML = items.map(r => `
        <div class="result-block">
            <a href="${r.url}" target="_blank">${escapeHtml(r.title)}</a>
            <div class="small">${escapeHtml(r.url)}</div>
            <div>${escapeHtml(r.snippet || '')}</div>
        </div>
    `).join('') + renderPagination(total);
}

function renderImageResults(items, total) {
    var resultsEl = document.getElementById('imageResults');
    resultsEl.innerHTML = `<div style="display: flex; flex-wrap: wrap;">` + 
        items.map(r => `<a href="${r.pageUrl}" target="_blank"><img src="${r.thumbnail}" loading="lazy"/></a>`).join('') + 
        `</div>` + renderPagination(total);
}

function renderPagination(total) {
    const max = Math.ceil(total / MAX_PAGE_SIZE);
    if (max <= 1) return '';
    return `<div style="text-align:center; margin-top:20px;">
        <button onclick="changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${currentPage} of ${max}</span>
        <button onclick="changePage(1)" ${currentPage >= max ? 'disabled' : ''}>Next</button>
    </div>`;
}

function changePage(delta) {
    window.location.href = `search.html?q=${encodeURIComponent(currentQuery)}&type=${currentSearchType}&page=${currentPage + delta}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('currentQuery');
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const type = params.get('type') || 'web';
    
    setupAIOverviewToggle();

    if (q) {
        searchInput.value = q;
        if (type === 'image') switchTab('images', false);
        executeSearch(q, type, parseInt(params.get('page')) || 1);
    }

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const newQuery = searchInput.value.trim();
            if (newQuery) {
                window.location.href = `search.html?q=${encodeURIComponent(newQuery)}&type=${currentSearchType}`;
            }
        }
    });
});
