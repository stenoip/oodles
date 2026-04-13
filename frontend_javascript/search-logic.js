// frontend_javascript/search-logic.js

// --- AI OVERVIEW & RANKING CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Metasearch, an AI developed by Stenoip Company.
Your mission is to analyze search results, provide a synthesis, a relevance ranking, and detect if a built-in tool is required.

***TASK 1: Relevance Ranking (CRITICAL)***
You must analyse the provided search snippets and decide which links are the most useful and relevant to the user's query.
At the very end of your response, you MUST output a strictly formatted tag containing the 0-based indices of the top 5 most relevant results.
Format: @@RANKING:[index1, index2, index3, index4, index5]@@
Example: @@RANKING:[4, 0, 1, 9, 2]@@

***TASK 2: Synthesis (The Praterich Briefing)***
Provide a sophisticated A.I. overview based on the snippets. 
- **NO Conversational Filler:** Do not say "Good day," "Here are the results," or "I hope this helps."
- **NO Source Attribution:** Do not say "According to the snippets" or "The first link suggests." Simply state the facts.
- **The Style:** Write like a 19th-century British scholar or a high-society briefing. Use elegant, precise language (e.g., "noteworthy," "predominantly," "exceptional").
- **Formatting:** Use flowing prose. Do not use the Oxford comma. Use metric units.



***TASK 3: Tool Detection (CRITICAL)***
If the user's query clearly indicates a need for a specific built-in tool, you MUST include a tool detection tag.
The detection should be based on mathematical expressions, unit conversions, colour code lookups, metronome requests, or translation requests.
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

***TASK 4: Re-search Suggestion (OPTIONAL)***
If you determine that the provided snippets are insufficient, irrelevant, or do not contain the answer to the user's question, you MUST suggest a better, more specific search query.
Format: @@RESEARCH:[new search query]@@
The tag MUST be outputted before the @@RANKING tag.

Example (Snippets are bad): The user asked for "latest 2026 fusion results" but snippets only show 2024.
Output: (Synthesis text...) @@RESEARCH:[breakthroughs in nuclear fusion March 2026]@@@@RANKING:[...]@@


***TASK 5: Mode Detection (CRITICAL)***
Analyze the user's intent:
- Use this if the user is asking a general knowledge question (e.g., "Why is the sky blue?"), asking for an opinion, or engaging in conversation. If the answer is "common knowledge" that doesn't require specific 2026 news or links, prefer chat.: @@MODE:[chat]@@
- Use this ONLY if the query is looking for specific websites, local services, current events or shopping results where links are the primary goal: @@MODE:[search]@@

Output the @@MODE tag before the @@RANKING tag.

Your personality is to be British, Lady-like and friendly.
Your response must be:
1. The text overview.
2. The optional @@TOOL[...]@@ tag.
3. The @@RANKING[...]@@ tag at the very end.
`;
// --- END AI CONFIGURATION ---

// --- BUILT-IN TOOL CONFIGURATION ---
var BUILT_IN_TOOLS = {
    'calculator': { url: 'https://stenoip.github.io/kompmasine.html' },
    'unit_converter': { url: 'https://stenoip.github.io/kompmasine.html' },
    'colour_picker': { url: 'https://tools.oodles.com/colourpicker' },
    'metronome': { url: 'https://stenoip.github.io/metronome' },
    'translate': { url: 'https://stenoip.github.io/praterich/translate/translate' }
};
// --- END TOOL CONFIGURATION ---

var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 50; 

// --- GLOBAL STATE FOR CACHING AND OPTIMIZATION ---
var isAIOverviewEnabled = false; 
var lastAIRawText = null;       // Stores the raw text from the AI for caching
var lastFetchedItems = null;    // Stores the raw search results for re-ranking/overview
var aiTimeout = null;           // For debouncing the expensive AI call
var allTabImagesCache = [];     // Stores images specifically for the 'All' tab modal


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
 * Executes the AI Logic:
 * 1. Generates the Text Summary (Displayed only if enabled)
 * 2. Detects if a tool is needed (Displays tool)
 * 3. Generates the Ranking (Applied ALWAYS)
 * * !!! This function hits the backend Groq API and should be called sparingly. !!!
 */
async function processAIResults(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    renderBuiltInTool(null); 
    
    // Only show standard loading if we aren't already actively in chat mode
    if (isAIOverviewEnabled && overviewEl && !window.isChatModeActive) {
        overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is analyzing and ranking your results...</p>';
    }

    var rawWebSearchText = createRawSearchText(searchItems);
    
    // Build Conversation Payload
    var conversationParts = [];
    
    // Push recent history if in chat mode to keep context (last 6 interactions)
    if (window.chatConversationHistory && window.chatConversationHistory.length > 0) {
        conversationParts.push(...window.chatConversationHistory.slice(-6));
    }
    
    // Formulate the current turn, feeding the search results into the user prompt
    var userTextWithContext = `User Query: ${query}\n\n[LATEST SEARCH RESULTS FOR CONTEXT]\n${rawWebSearchText}`;
    conversationParts.push({ role: "user", parts: [{ text: userTextWithContext }] });

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
        lastAIRawText = aiRawText;

        // --- 1. EXTRACT DATA ---
        var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
        var toolRegex = /@@TOOL:\[(.*?)\]@@/;
        var researchRegex = /@@RESEARCH:\[(.*?)\]@@/;
        var modeRegex = /@@MODE:\[(.*?)\]@@/;

        var toolMatch = aiRawText.match(toolRegex);
        var researchMatch = aiRawText.match(researchRegex);
        var rankingMatch = aiRawText.match(rankingRegex); 
        var modeMatch = aiRawText.match(modeRegex);

        var detectedTool = toolMatch && toolMatch[1] ? toolMatch[1].trim() : null;
        var suggestedQuery = researchMatch && researchMatch[1] ? researchMatch[1].trim() : null;
        var detectedMode = modeMatch && modeMatch[1] ? modeMatch[1].trim() : 'search';

        // Clean display text
        var cleanDisplayText = aiRawText
            .replace(rankingRegex, '')
            .replace(toolRegex, '')
            .replace(researchRegex, '')
            .replace(modeRegex, '')
            .trim();

        // Update Conversation History for the next turn
        window.chatConversationHistory.push({ role: "user", parts: [{ text: query }] }); // Keep history clean without raw data
        window.chatConversationHistory.push({ role: "model", parts: [{ text: cleanDisplayText }] });

        // --- 2. CHECK ADAPTIVE CHAT MODE ---
        // If the AI says it's a chat OR we are already locked into chat mode from a previous message
        if (detectedMode === 'chat' || window.isChatModeActive) {
            if (typeof activateAdaptiveChat === 'function') {
                activateAdaptiveChat(query, cleanDisplayText, searchItems);
                return; // Exit here. Do not render standard AI Overview.
            }
        }

        // --- 3. UPDATE UI: STANDARD SEARCH (If not chat) ---
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



async function executeSearch(query, type, page = 1) {
    if (!query) return;

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
        // Good citizen message is shown if AI is OFF and we are on text-heavy tabs (All, Web, Image)
        citizenMsgEl.style.display = (!isAIOverviewEnabled && (type === 'web' || type === 'image' || type === 'all')) ? 'block' : 'none';
    }
    
    if (aiTimeout) {
        clearTimeout(aiTimeout);
    }

    // --- ROUTING BASED ON TYPE ---
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
        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
        }

    } else if (type === 'image') {
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            
            lastFetchedItems = data.items; 
            renderImageResults(data.items, data.total);
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


// --- UNIVERSAL "ALL" SEARCH LOGIC ---
async function executeAllSearch(query) {
    const allContainer = document.getElementById('allResults');
    if (!allContainer) return;
    
    // 1. CLEAR PREVIOUS SERP STATE
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

        // 2. TRIGGER SERP MODULE RENDERING
        if (typeof SERP_MODULE !== 'undefined' && webData.items && webData.items.length > 0) {
            // We use await here so the Featured Snippet can crawl the URL if needed
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
