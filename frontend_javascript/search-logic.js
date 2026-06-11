var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 
var OODLES_SEARCH_URL = "https://oodles-backend.vercel.app/metasearch";

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

IMPORTANT CAPABILITY - CHAT MODE REAL-TIME WEB SEARCH:
If the filter bot system notification indicates you are in chat mode and the user asks a question requiring deeper up-to-date knowledge, OR if you are unsure of a fact, you can explicitly trigger an internal lookup loop by replying EXACTLY with this format and nothing else:
@@SEARCH: [your search query]@@

Your personality is to be British, Lady-like and friendly.
Your response must be:
1. The text overview.
2. The optional @@TOOL[...]@@ tag.
3. The @@RANKING[...]@@ tag at the very end.
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
var MAX_PAGE_SIZE = 20; 

var isAIOverviewEnabled = false; 
var lastAIRawText = null;       
var lastFetchedItems = null;    
var aiTimeout = null;           
var allTabImagesCache = [];     

var searchCache = {}; 
var isLoadingMore = false; 
var hasMoreResults = true;

// Shared search function from the primary chatbot architecture
async function fetchWebSearch(query) {
    try {
        var url = OODLES_SEARCH_URL + '?q=' + encodeURIComponent(query) + '&page=1&pageSize=6';
        var resp = await fetch(url);
        var data = await resp.json();
        
        if (!data.items || data.items.length === 0) return 'No web links found.';
        
        return data.items.map(function(r, index) {
            var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
            return `[Index ${index}] Title: ${r.title}. Snippet: ${fullSnippet}`;
        }).join('\n---\n');
    } catch (error) {
        console.error('Oodles search error:', error);
        return 'Web search failed or timed out. Please proceed with your existing knowledge.';
    }
}

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
var currentModeLabel = window.isChatModeActive ? 'chat' : detectedMode;

var rawWebSearchText = createRawSearchText(searchItems);
var conversationParts = [];

if (window.chatConversationHistory && window.chatConversationHistory.length > 0) {
    conversationParts.push(...window.chatConversationHistory.slice(-6));
}

// Injected system flag telling Praterich exactly what mode the filter bot detected
var modeNotification = `[SYSTEM NOTIFICATION: The filter bot has classified this turn as "${currentModeLabel.toUpperCase()}" mode.]`;

var userTextWithContext = `User Query: ${query}\n\n${modeNotification}\n\n[LATEST SEARCH RESULTS FOR CONTEXT]\n${rawWebSearchText}`;
conversationParts.push({ role: "user", parts: [{ text: userTextWithContext }] });

    var isFinalAnswer = false;
    var turnCount = 0;
    var aiRawText = "";

    try {
        while (!isFinalAnswer && turnCount < 3) {
            turnCount++;

            var requestBody = {
                contents: conversationParts,
                system_instruction: { parts: [{ text: ladyPraterichSystemInstruction }] }
            };

            var response = await fetch(AI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

            var data = await response.json();
            aiRawText = data.text;
            lastAIRawText = aiRawText;

            if (!aiRawText || aiRawText.trim() === '') {
                throw new Error('Empty response from API.');
            }

            var searchRegex = /@@SEARCH:\s*(.*?)@@/s;
            var searchMatch = aiRawText.match(searchRegex);

            // Intercept search tokens inside chat loops precisely like script.js
            if (searchMatch && (detectedMode === 'chat' || window.isChatModeActive)) {
                var searchQuery = searchMatch[1].trim();
                var searchResultsText = await fetchWebSearch(searchQuery);

                conversationParts.push({ role: "model", parts: [{ text: aiRawText }] });
                conversationParts.push({ role: "user", parts: [{ text: '[TOOL_RESULT_FOR_PREVIOUS_TURN]\nWeb Search Results for "' + searchQuery + '":\n' + searchResultsText + '\n\nBased on these results, please provide your final response.' }] });
            } else {
                isFinalAnswer = true;
            }
        }

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

        if (window.chatConversationHistory) {
            window.chatConversationHistory.push({ role: "user", parts: [{ text: query }] });
            window.chatConversationHistory.push({ role: "model", parts: [{ text: cleanDisplayText }] });
        }

        if (detectedMode === 'chat' || window.isChatModeActive) {
            if (typeof activateAdaptiveChat === 'function') {
                activateAdaptiveChat(query, cleanDisplayText, searchItems);
                return;
            }
        }

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
        }
        renderBuiltInTool(null);
    }
}

/**
 * Optimised route executing searches dynamically with local RAM caching.
 */
async function executeSearch(query, type, page = 1) {
    if (!query) return;

    currentQuery = query;
    currentSearchType = type;
    currentPage = page;
    hasMoreResults = true; 
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

    const cacheKey = `${query}_${type}`;
    if (page === 1 && searchCache[cacheKey]) {
        console.log("Instant Switch From Local Cache:", cacheKey);
        renderCachedResults(searchCache[cacheKey], type);
        return;
    }

    if (type === 'all') {
        executeAllSearch(query);
    } else if (type === 'web') {
        if(page === 1) document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            
            searchCache[cacheKey] = data; 
            renderLinkResults(data.items, data.total, false);
            lastFetchedItems = data.items;

            if (page === 1) {
                aiTimeout = setTimeout(() => { processAIResults(query, data.items); }, 500);
            }
        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
        }
    } else if (type === 'image') {
        if(page === 1) document.getElementById('imageResults').innerHTML = '<p class="small">Searching images...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            
            searchCache[cacheKey] = data;
            lastFetchedItems = data.items; 
            renderImageResults(data.items, data.total, false);
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
                searchCache[cacheKey] = data;
                renderVideoResults(data);
            } catch (error) {
                console.error('Video search error:', error);
                videoContainer.innerHTML = '<p class="small">Error loading videos.</p>';
            }
        }
    }
}

function renderCachedResults(cachedData, type) {
    if (type === 'web') {
        renderLinkResults(cachedData.items, cachedData.total, false);
        lastFetchedItems = cachedData.items;
        if (lastFetchedItems.length > 0) processAIResults(currentQuery, lastFetchedItems);
    } else if (type === 'image') {
        lastFetchedItems = cachedData.items;
        renderImageResults(cachedData.items, cachedData.total, false);
    } else if (type === 'video') {
        renderVideoResults(cachedData);
    } else if (type === 'all') {
        renderAllResults(currentQuery, cachedData.web, cachedData.img, cachedData.vid);
    }
}

async function executeAllSearch(query) {
    const allContainer = document.getElementById('allResults');
    if (!allContainer) return;
    
    if (typeof SERP_MODULE !== 'undefined') {
        SERP_MODULE.clearAll();
    }
    
    allContainer.innerHTML = `
        <div id="all-web-top-holder"><p class="small">Gathering web links...</p></div>
        <div id="all-image-holder"></div>
        <div id="all-video-holder"></div>
        <div id="all-web-bottom-holder"></div>
        <div id="all-more-btn-holder" style="text-align:center; margin-top:15px; display:none;">
            <button class="frutiger-aero-tab" onclick="switchTab('web', true)">See more results</button>
        </div>
    `;

    var webPayload = null, imgPayload = null, vidPayload = null;
    const cacheKey = `${query}_all`;

    fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&page=1&pageSize=10`)
        .then(res => res.json())
        .then(async (webData) => {
            webPayload = webData;
            lastFetchedItems = webData.items;
            
            if (typeof SERP_MODULE !== 'undefined' && webData.items && webData.items.length > 0) {
                await SERP_MODULE.renderFeaturedSnippet(webData.items, query); 
                SERP_MODULE.renderPopularProducts(webData.items);
                SERP_MODULE.renderKnowledgePanel(query);
            }

            const topEl = document.getElementById('all-web-top-holder');
            const bottomEl = document.getElementById('all-web-bottom-holder');
            const btnEl = document.getElementById('all-more-btn-holder');

            if (webData.items && webData.items.length > 0) {
                topEl.innerHTML = webData.items.slice(0, 3).map(renderSingleLink).join('');
                bottomEl.innerHTML = webData.items.slice(3, 8).map(renderSingleLink).join('');
                if(btnEl) btnEl.style.display = 'block';
                
                processAIResults(query, webData.items);
            } else {
                topEl.innerHTML = '<p class="small">No web links found.</p>';
            }
            saveAllCache(cacheKey, webPayload, imgPayload, vidPayload);
        }).catch(err => {
            document.getElementById('all-web-top-holder').innerHTML = '<p class="small">Error loading links.</p>';
        });

    fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&type=image&page=1&pageSize=8`)
        .then(res => res.json())
        .then(imgData => {
            imgPayload = imgData;
            const imgEl = document.getElementById('all-image-holder');
            if (imgData.items && imgData.items.length > 0) {
                allTabImagesCache = imgData.items;
                imgEl.innerHTML = `
                    <div class="all-image-strip" style="margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                        <h4 class="small" style="margin-top:0; margin-bottom: 10px; color: #0277bd;">Images for ${escapeHtml(query)}</h4>
                        <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">
                            ${imgData.items.map((img, idx) => `
                                <img src="${img.thumbnail}" 
                                     onclick="openImageModalFromAll(${idx})" 
                                     title="${escapeHtml(img.title)}"
                                     style="height: 120px; border-radius: 8px; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: transform 0.2s;">
                            `).join('')}
                        </div>
                    </div>`;
            }
            saveAllCache(cacheKey, webPayload, imgPayload, vidPayload);
        }).catch(err => console.error("Img cross-stream fail", err));

    fetch(`${BACKEND_BASE}/video-search?query=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(vidData => {
            vidPayload = vidData;
            const vidEl = document.getElementById('all-video-holder');
            if (vidData && vidData.length > 0) {
                const v = vidData[0];
                vidEl.innerHTML = `
                    <div class="all-video-featured" style="margin: 20px 0; display: flex; flex-wrap: wrap; gap: 15px; background: linear-gradient(to right, rgba(225, 245, 254, 0.6), rgba(255, 255, 255, 0.4)); padding: 15px; border-radius: 12px; border: 1px solid rgba(179, 229, 252, 0.8);">
                        <div style="flex: 0 0 auto;">
                            <iframe src="https://www.youtube.com/embed/${v.id.videoId}" style="width: 240px; aspect-ratio: 16/9; border-radius: 8px; border: 1px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" allowfullscreen></iframe>
                        </div>
                        <div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: center;">
                            <h4 style="margin:0 0 5px 0; font-size:15px; color: #01579b;">Featured Video</h4>
                            <a href="https://www.youtube.com/watch?v=${v.id.videoId}" target="_blank" style="font-weight:bold; text-decoration: none; color: #0288d1; font-size: 1.1em;">
                                ${v.snippet.title}
                            </a>
                            <p class="small" style="margin-top:5px; opacity:0.8;">${v.snippet.channelTitle}</p>
                        </div>
                    </div>`;
            }
            saveAllCache(cacheKey, webPayload, imgPayload, vidPayload);
        }).catch(err => console.error("Video stream fail", err));
}

function saveAllCache(key, web, img, vid) {
    if (web && img && vid) {
        searchCache[key] = { web: web, img: img, vid: vid };
    }
}

async function loadMoreInfiniteResults() {
    if (isLoadingMore || !hasMoreResults || currentSearchType === 'all' || currentSearchType === 'video') return;

    isLoadingMore = true;
    currentPage++;

    const targetId = currentSearchType === 'web' ? 'linkResults' : 'imageResults';
    const container = document.getElementById(targetId);

    let scrollLoader = document.createElement('div');
    scrollLoader.id = 'infinite-scroll-loader';
    scrollLoader.innerHTML = `<p class="small" style="text-align:center; padding:15px; color:#0288d1;">Loading more results matches...</p>`;
    if (container) container.appendChild(scrollLoader);

    try {
        let url = '';
        if (currentSearchType === 'web') {
            url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(currentQuery) + '&page=' + currentPage + '&pageSize=' + MAX_PAGE_SIZE;
        } else if (currentSearchType === 'image') {
            url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(currentQuery) + '&type=image&page=' + currentPage + '&pageSize=' + MAX_PAGE_SIZE;
        }

        let resp = await fetch(url);
        let data = await resp.json();

        const loaderEl = document.getElementById('infinite-scroll-loader');
        if (loaderEl) loaderEl.remove();

        if (data.items && data.items.length > 0) {
            lastFetchedItems = lastFetchedItems.concat(data.items);
            if (currentSearchType === 'web') {
                renderLinkResults(data.items, data.total, true);
            } else if (currentSearchType === 'image') {
                renderImageResults(data.items, data.total, true);
            }
        } else {
            hasMoreResults = false;
        }
    } catch (e) {
        console.error("Infinite scroll compilation error:", e);
        const loaderEl = document.getElementById('infinite-scroll-loader');
        if (loaderEl) loaderEl.remove();
    } finally {
        isLoadingMore = false;
    }
}
