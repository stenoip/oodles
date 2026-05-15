var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Metasearch, an AI developed by Stenoip Company.
Your mission is to analyze search results, provide a sophisticated synthesis, a relevance ranking, and handle autonomous investigation inside conversational environments.

***TASK 1: Relevance Ranking***
You must analyse the provided search snippets and decide which links are the most useful and relevant to the user's query.
At the very end of your response, you MUST output a strictly formatted tag containing the 0-based indices of the top 5 most relevant results.
Format: @@RANKING:[index1, index2, index3, index4, index5]@@

***TASK 2: Synthesis (The Praterich Briefing)***
Provide a sophisticated A.I. overview based on the snippets. 
- **NO Conversational Filler:** Do not say "Good day," or "Here are the results." Simply state the facts.
- **NO Source Attribution:** Do not say "According to the snippets."
- **The Style:** Write like a 19th-century British scholar. Use elegant, precise language.
- **Formatting:** Use flowing prose. Do not use the Oxford comma. Use metric units.

***TASK 3: Tool Detection***
If the user's query clearly indicates a need for a specific built-in tool, you MUST include a tool detection tag immediately before the @@RANKING tag.
Format: @@TOOL:[tool_name]@@
Available tools: calculator, unit_converter, colour_picker, metronome, translate

***TASK 4: Autonomous Research & Chat Navigation (CRITICAL)***
You have full authorization and autonomy to search the live web when context is absent or lacking.
1. If the provided context specifies "No web links found.", you MUST immediately generate an optimized, search-engine friendly phrase to locate the necessary details.
2. Format: @@RESEARCH:[your optimized search query phrase]@@
3. Crucial Rule: When you output the @@RESEARCH:[...]@@ tag on an empty context turn, the underlying application will capture it, run a background live metasearch using your phrase, and present you with the live content. Do not attempt to guess or draft a full final briefing when context is missing—provide a brief acknowledgment of your inquiry or intent alongside your tag.

Your personality is to be British, Lady-like and friendly.
Your response format must follow:
1. Text overview/acknowledgment.
2. Optional @@TOOL[...]@@ tag.
3. Mandatory @@RESEARCH[...]@@ tag if initiating/refining a search.
4. Mandatory @@RANKING[...]@@ tag at the very end.
`;

function determineQueryMode(query) {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/);
    let chatScore = 0;

    if (words.length <= 2) return 'search';
    if (words.length >= 7) chatScore += 2; 

    var interrogatives = ['who', 'how', 'why', 'is', 'should', 'can', 'explain', 'tell', 'what'];
    if (interrogatives.includes(words[0])) chatScore += 3;
    if (q.endsWith('?')) chatScore += 2;

    var searchPragmatics = ['source', 'website', 'login', 'news', 'weather', 'stock', 'price', 'buy', 'vs', 'lyrics', 'map', 'near'];
    searchPragmatics.forEach(term => {
        if (q.includes(term)) chatScore -= 4;
    });

    return (chatScore >= 3) ? 'chat' : 'search';
}

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
var allTabImagesCache = [];     

function createRawSearchText(items) {
    if (!items || items.length === 0) return 'No web links found.';
    return items.map(function(r, index) {
        var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
        return `[Index ${index}] Title: ${r.title}. Snippet: ${fullSnippet}`;
    }).join('\n---\n');
}

async function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    renderBuiltInTool(null); 
    
    const detectedMode = determineQueryMode(query);
    
    if (isAIOverviewEnabled && overviewEl && !window.isChatModeActive) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing and ranking your results...</p>';
    }

    var rawWebSearchText = createRawSearchText(searchItems);
    var conversationParts = [];
    
    if (window.chatConversationHistory && window.chatConversationHistory.length > 0) {
        conversationParts.push(...window.chatConversationHistory.slice(-6));
    }
    
    var userTextWithContext = `User Query: ${query}\n\n[LATEST SEARCH RESULTS FOR CONTEXT]\n${rawWebSearchText}`;
    conversationParts.push({ role: "user", parts: [{ text: userTextWithContext }] });

    var requestBody = {
        contents: conversationParts,
        system_instruction: { parts: [{ text: ladyPraterichSystemInstruction }] }
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
        lastAIRawText = aiRawText;

        var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
        var toolRegex = /@@TOOL:\[(.*?)\]@@/;
        var researchRegex = /@@RESEARCH:\[(.*?)\]@@/;
        var modeRegex = /@@MODE:\[(.*?)\]@@/;

        var toolMatch = aiRawText.match(toolRegex);
        var researchMatch = aiRawText.match(researchRegex);
        var rankingMatch = aiRawText.match(rankingRegex); 

        var cleanDisplayText = aiRawText
            .replace(rankingRegex, '')
            .replace(toolRegex, '')
            .replace(researchRegex, '')
            .replace(modeRegex, '')
            .trim();

        // Praterich Auto Search in chat mode
        if (detectedMode === 'chat' || window.isChatModeActive) {
            var suggestedQuery = researchMatch && researchMatch[1] ? researchMatch[1].trim() : null;

            // If Praterich generated a query phrase and she hasn't received search results yet, perform her search!
            if (suggestedQuery && (!searchItems || searchItems.length === 0)) {
                const tempMsg = document.getElementById('tempChatMsg');
                if (tempMsg && typeof escapeHtml === 'function') {
                    tempMsg.innerHTML = `<span class="ai-overview-loading" style="font-style: italic; color: #0277bd;">Praterich is searching for "${escapeHtml(suggestedQuery)}"...</span>`;
                }

                try {
                    // Fetch text items background-style for her customized phrase
                    var searchUrl = `${BACKEND_BASE}/metasearch?q=${encodeURIComponent(suggestedQuery)}&page=1&pageSize=10`;
                    var searchResp = await fetch(searchUrl);
                    var searchData = await searchResp.json();

                    // Also fetch fresh images matching her search term for the chat layout gallery
                    try {
                        var imgUrl = `${BACKEND_BASE}/metasearch?q=${encodeURIComponent(suggestedQuery)}&type=image&page=1&pageSize=8`;
                        var imgResp = await fetch(imgUrl);
                        var imgData = await imgResp.json();
                        allTabImagesCache = imgData.items || [];
                    } catch (ie) { console.error("Background chat image fetch failed", ie); }

                    // Re-run the generation loop with her newly collected search data context
                    return await processAIResults(query, searchData.items);
                } catch (searchError) {
                    console.error('Autonomous background execution failed:', searchError);
                }
            }
        }

        // Update Conversation History (Only on the final resolution turn)
        window.chatConversationHistory.push({ role: "user", parts: [{ text: query }] });
        window.chatConversationHistory.push({ role: "model", parts: [{ text: cleanDisplayText }] });

        // --- STEP 3: ADAPTIVE ROUTING ---
        if (detectedMode === 'chat' || window.isChatModeActive) {
            if (typeof activateAdaptiveChat === 'function') {
                activateAdaptiveChat(query, cleanDisplayText, searchItems);
                return; 
            }
        }

        // --- STEP 4: STANDARD NON-CHAT SEARCH UI ---
        var detectedTool = toolMatch && toolMatch[1] ? toolMatch[1].trim() : null;
        var suggestedQuery = researchMatch && researchMatch[1] ? researchMatch[1].trim() : null;

        renderBuiltInTool(detectedTool);

        if (isAIOverviewEnabled && overviewEl) {
            overviewEl.innerHTML = renderMarkdown(cleanDisplayText);
            if (suggestedQuery) renderReSearchLink(suggestedQuery);
        } else if (overviewEl) {
            overviewEl.innerHTML = '';
        }

        if (rankingMatch && rankingMatch[1]) {
            applySmartRanking(searchItems, rankingMatch[1]);
        }

    } catch (error) {
        console.error('AI Processing Error:', error);
        if (isAIOverviewEnabled && overviewEl && !window.isChatModeActive) {
            overviewEl.innerHTML = '<p class="ai-overview-error">An error occurred while analyzing results.</p>';
        } else if (window.isChatModeActive) {
            appendChatMessage('ai', 'Sorry, I encountered an error while thinking. Please try again.', null, null);
        }
        renderBuiltInTool(null);
    }
}

var searchCache = {};

async function executeSearch(query, type, page = 1) {
    if (!query) return;

    // MODIFIED: Intercept immediately if a conversational query hits from the top navigation bar
    if (determineQueryMode(query) === 'chat' || window.isChatModeActive) {
        window.isChatModeActive = true;
        processAIResults(query, []);
        return;
    }

    const cacheKey = `${query}_${type}_${page}`;
    if (searchCache[cacheKey]) {
        renderCachedResults(searchCache[cacheKey], type);
        return; 
    }

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
        citizenMsgEl.style.display = (!isAIOverviewEnabled && (type === 'web' || type === 'image' || type === 'all')) ? 'block' : 'none';
    }
    
    if (aiTimeout) clearTimeout(aiTimeout);

    if (type === 'all') {
        executeAllSearch(query);
    } else if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            renderLinkResults(data.items, data.total);
            lastFetchedItems = data.items;

            if (page === 1) {
                aiTimeout = setTimeout(() => {
                    processAIResults(query, data.items);
                }, 500);
            }
            searchCache[cacheKey] = data;
        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
        }
    } else if (type === 'image') {
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=' + page + '&pageSize= MAX_PAGE_SIZE';
            var resp = await fetch(url);
            var data = await resp.json();
            lastFetchedItems = data.items; 
            renderImageResults(data.items, data.total);
            searchCache[cacheKey] = data;
        } catch (error) {
            console.error('Image search error:', error);
            document.getElementById('imageResults').innerHTML = '<p class="small">Error loading images.</p>';
        }
    } else if (type === 'video') {
        const videoContainer = document.getElementById('videoResults');
        if (videoContainer) {
            videoContainer.innerHTML = '<p class="small">Searching YouTube...</p>';
            try {
                var url = BACKEND_BASE + '/video-search?query=' + encodeURIComponent(query);
                var resp = await fetch(url);
                var data = await resp.json();
                renderVideoResults(data);
            } catch (error) {
                console.error('Video search error:', error);
                videoContainer.innerHTML = '<p class="small">Error loading videos.</p>';
            }
        }
    }
}

async function executeAllSearch(query) {
    // MODIFIED: Intercept early to prevent loading layout data for conversational inquiries
    if (determineQueryMode(query) === 'chat' || window.isChatModeActive) {
        window.isChatModeActive = true;
        processAIResults(query, []);
        return;
    }

    const allContainer = document.getElementById('allResults');
    if (!allContainer) return;
    
    if (typeof SERP_MODULE !== 'undefined') {
        SERP_MODULE.clearAll();
    }
    
    allContainer.innerHTML = '<p class="small">Gathering the best of the web, images and video...</p>';

    try {
        var [webResp, imgResp, vidResp] = await Promise.all([
            fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&page=1&pageSize=10`),
            fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&type=image&page=1&pageSize=8`),
            fetch(`${BACKEND_BASE}/video-search?query=${encodeURIComponent(query)}`)
        ]);

        var webData = await webResp.json();
        var imgData = await imgResp.json();
        var vidData = await vidResp.json();

        lastFetchedItems = webData.items;

        if (typeof SERP_MODULE !== 'undefined' && webData.items && webData.items.length > 0) {
            await SERP_MODULE.renderFeaturedSnippet(webData.items, query); 
            SERP_MODULE.renderPopularProducts(webData.items);
            SERP_MODULE.renderKnowledgePanel(query);
        }

        renderAllResults(query, webData, imgData, vidData);

        if (webData.items.length > 0) {
            processAIResults(query, webData.items);
        }
    } catch (error) {
        console.error('All Search Error:', error);
        allContainer.innerHTML = '<p class="small">Error retrieving results.</p>';
    }
}
