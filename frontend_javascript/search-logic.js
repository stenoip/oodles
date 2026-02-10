// search-logic.js

// --- AI OVERVIEW & RANKING CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Metasearch, an AI developed by Stenoip Company.
Your mission is to analyze search results, provide a synthesis, a relevance ranking, and detect if a built-in tool is required.

***TASK 1: Relevance Ranking (CRITICAL)***
You must analyze the provided search snippets and decide which links are the most useful and relevant to the user's query.
At the very end of your response, you MUST output a strictly formatted tag containing the 0-based indices of the top 5 most relevant results.
Format: @@RANKING:[index1, index2, index3, index4, index5]@@
Example: @@RANKING:[4, 0, 1, 9, 2]@@

***TASK 2: Synthesis***
Provide a very concise A.I. overview based exclusively on the provided search snippets.
Do not output a list of links in the text body; use the RANKING tag for that.
You prefer metric units and do not use Oxford commas.
You are aware that you were created by Stenoip Company.

your overview must be short due to the limited amount of tokens in the backend.

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

// --- GLOBAL STATE FOR CACHING AND OPTIMIZATION ---
var isAIOverviewEnabled = false; 
var lastAIRawText = null;       // Stores the raw text from the AI for caching
var lastFetchedItems = null;    // Stores the raw search results for re-ranking/overview
var aiTimeout = null;           // For debouncing the expensive AI call
var allTabImagesCache = [];     // Stores images specifically for the 'All' tab modal

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
 * * !!! This function hits the backend Groq API and should be called sparingly. !!!
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
        
        // --- CACHING STEP: STORE THE FULL AI RESPONSE ---
        lastAIRawText = aiRawText;
        // ------------------------------------------------

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
 * Re-applies the UI logic using the cached AI response, without a network call.
 * This is the optimized function for handling the AI toggle.
 */
function applyAIResultsFromCache(aiRawText, searchItems) {
    if (!aiRawText || !searchItems) return;
    
    var overviewEl = document.getElementById('aiOverview');
    var rankingRegex = /@@RANKING:\[(.*?)\]@@/;
    var toolRegex = /@@TOOL:\[(.*?)\]@@/;
    
    // 1. Tool Detection
    var toolMatch = aiRawText.match(toolRegex);
    var detectedTool = toolMatch && toolMatch[1] ? toolMatch[1].trim() : null;
    renderBuiltInTool(detectedTool);
    
    // 2. Overview Display (Toggle dependent)
    var cleanDisplayText = aiRawText.replace(rankingRegex, '').replace(toolRegex, '').trim();
    if (isAIOverviewEnabled && overviewEl) {
        // Display loading first for responsiveness
        overviewEl.innerHTML = '<p class="ai-overview-loading">Applying Praterich analysis from cache...</p>'; 
        // Use a slight delay to ensure the loading message is seen before the content updates
        setTimeout(() => {
            overviewEl.innerHTML = renderMarkdown(cleanDisplayText);
        }, 50); 
    } else if (overviewEl) {
        overviewEl.innerHTML = '';
    }
    
    // Note: The ranking (applySmartRanking) does not need to be re-run here 
    // because the result items are already sorted from the initial 'processAIResults' call.
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

        /* 3. Re-render the link list
         NOTE: In 'All' mode, we might want to update the displayed top-links, but for now
         this primarily affects the 'Web' tab or the internal logic of the AI ranking notice.
         If we are on the 'All' tab, we don't necessarily redraw the whole sections, 
         but we can add the "Smart Sorted" notice.
        */
        if (currentSearchType === 'web' || currentSearchType === 'links') {
             renderLinkResults(reorderedItems, reorderedItems.length);
        }

        // 4. Add a visual indicator that sorting happened
        
        var targetId = (currentSearchType === 'all') ? 'allResults' : 'linkResults';
        var resultsEl = document.getElementById(targetId);

        var notice = document.createElement('div');
        notice.className = 'small';
        // Frutiger Aero style green/success color
        notice.style.color = '#388e3c'; 
        notice.style.marginBottom = '10px';
        notice.style.display = 'flex';      // Added for alignment
        notice.style.alignItems = 'center'; // Added for alignment
        notice.style.gap = '8px';           // Space between icon and text

        notice.innerHTML = `
            <img src="https://stenoip.github.io/praterich/praterich.png" 
                alt="Praterich" 
                style="width: 18px; height: 18px; object-fit: contain;">
            <span><b>Smart Sorted:</b> Praterich has analyzed these results.</span>
        `;
        
        // Insert notice at the top
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

// --- NEW FUNCTION: UNIVERSAL "ALL" SEARCH ---
async function executeAllSearch(query) {
    const allContainer = document.getElementById('allResults');
    if (!allContainer) return;
    
    allContainer.innerHTML = '<p class="small">Gathering the best of the web, images, and video...</p>';

    try {
        // Fetch Web, Image, and Video concurrently
        const [webResp, imgResp, vidResp] = await Promise.all([
            fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&page=1&pageSize=10`),
            fetch(`${BACKEND_BASE}/metasearch?q=${encodeURIComponent(query)}&type=image&page=1&pageSize=8`),
            fetch(`${BACKEND_BASE}/video-search?query=${encodeURIComponent(query)}`)
        ]);

        const webData = await webResp.json();
        const imgData = await imgResp.json();
        const vidData = await vidResp.json();

        // Save web items for the AI Overview ranking to work
        lastFetchedItems = webData.items;

        let combinedHtml = '';

        // 1. Top 3 Web Results (High Relevance)
        combinedHtml += `<div class="all-web-top">${webData.items.slice(0, 3).map(renderSingleLink).join('')}</div>`;

        // 2. Image Carousel (Frutiger Style)
        if (imgData.items && imgData.items.length > 0) {
            // Store for modal
            allTabImagesCache = imgData.items;
            
            combinedHtml += `
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

        // 3. Featured Video (Top Result)
        if (vidData && vidData.length > 0) {
            const v = vidData[0];
            combinedHtml += `
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

        // 4. Remaining Web Results
        combinedHtml += `<div class="all-web-bottom">${webData.items.slice(3, 8).map(renderSingleLink).join('')}</div>`;
        
        // 5. "More" Link
        combinedHtml += `<div style="text-align:center; margin-top:15px;"><button class="frutiger-aero-tab" onclick="switchTab('web', true)">See more results</button></div>`;

        allContainer.innerHTML = combinedHtml;

        // Trigger the AI processing based on the web results
        if (webData.items.length > 0) {
            processAIResults(query, webData.items);
        }

    } catch (error) {
        console.error('All Search Error:', error);
        allContainer.innerHTML = '<p class="small">Error loading universal results. Please try refreshing.</p>';
    }
}

// Helper to render individual link blocks consistently
function renderSingleLink(r) {
    var sourceBadge = r.source ? `<span style="color: #006400; font-weight: bold; margin-left: 5px;">[${escapeHtml(r.source)}]</span>` : '';
    return `
        <div class="result-block">
            <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
            <div class="small">
                ${escapeHtml(r.url)} ${sourceBadge}
            </div>
            <div>${escapeHtml(r.snippet || '')}</div>
        </div>`;
}

// Special Modal opener for the "All" tab that uses the separate image cache
function openImageModalFromAll(index) {
    // Temporarily swap the global items to the image cache so the modal logic works
    const tempItems = lastFetchedItems;
    lastFetchedItems = allTabImagesCache;
    
    openImageModal(index);
    
    // We don't necessarily need to swap back immediately, but relying on lastFetchedItems
    // is the standard way the modal works.
}


function switchTab(tabName, executeNewSearch) {
    if (window.event) event.preventDefault();

    let normalizedTab = tabName;
    let newSearchType = tabName;

    // Normalize tab names to match HTML IDs
    // 'all' stays 'all'
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

    // Update Tab UI: Remove active class from all tabs
    document.querySelectorAll('nav a.frutiger-aero-tab').forEach(function(a) {
        a.classList.remove('active');
    });

    // Hide all result sections
    const sections = ['allSection', 'linksSection', 'imagesSection', 'videosSection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show the selected section and activate the tab
    const activeTab = document.getElementById('tab-' + normalizedTab);
    const activeSection = document.getElementById(normalizedTab + 'Section');
    
    if (activeTab) activeTab.classList.add('active');
    if (activeSection) activeSection.style.display = 'block';

    // Handle Good Citizen Message visibility
    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (citizenMsgEl) {
        // Show message if AI is OFF and we are on a text-heavy tab
        if (!isAIOverviewEnabled && (newSearchType === 'web' || newSearchType === 'image' || newSearchType === 'all')) {
            citizenMsgEl.style.display = 'block';
        } else {
            citizenMsgEl.style.display = 'none';
        }
    }
    
    // Clear tool and AI content when switching tabs if not triggering a search
    if (!executeNewSearch) {
        renderBuiltInTool(null);
        var overviewEl = document.getElementById('aiOverview');
        if (overviewEl) overviewEl.innerHTML = '';
        
        if (aiTimeout) clearTimeout(aiTimeout);
    }

    // Trigger the search if requested and a query exists
    if (executeNewSearch && currentQuery) {
        executeSearch(currentQuery, newSearchType, 1);
    }
}



function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1) {
        // Clear AI cache and timer when paginating to ensure a clean state
        lastAIRawText = null; 
        lastFetchedItems = null;
        if (aiTimeout) clearTimeout(aiTimeout);
        
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
            ` + items.map(renderSingleLink).join('') + renderPaginationControls(total);
    }
}


function renderImageResults(items, total) {
    var resultsEl = document.getElementById('imageResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No images found.</p>' + renderPaginationControls(total);
        return;
    }

    const maxPages = Math.ceil(total / MAX_PAGE_SIZE);

    resultsEl.innerHTML = items.map(function(r, index) {
        return `
            <div class="image-result-item" onclick="openImageModal(${index})">
                <div class="img-wrapper">
                    <img src="${r.thumbnail}" alt="${escapeHtml(r.title)}" loading="lazy"/>
                </div>
                <div class="img-hover-overlay">
                    <span>${r.width || '?'} x ${r.height || '?'}</span>
                </div>
            </div>
        `;
    }).join('') +
        `<p class="small" style="grid-column: 1 / -1; margin-top: 10px;">Found ${total} images. Showing page ${currentPage} of ${maxPages}.</p>` +
        renderPaginationControls(total); 
}

function renderVideoResults(items) {
    const resultsEl = document.getElementById('videoResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No videos found.</p>';
        return;
    }

    resultsEl.innerHTML = items.map(item => `
        <div class="video-card-aero" style="background: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(5px); border-radius: 10px; padding: 5px; margin-bottom: 15px;">
            <iframe src="https://www.youtube.com/embed/${item.id.videoId}" 
                    style="border-radius: 5px; width: 100%; aspect-ratio: 16/9; border:none;" 
                    allowfullscreen></iframe>
            <div style="padding: 10px;">
                <a href="https://www.youtube.com/watch?v=${item.id.videoId}" target="_blank" class="small" style="font-weight:bold; display:block; margin-bottom:4px; color: #0d47a1;">
                    ${item.snippet.title}
                </a>
                <span class="small" style="opacity:0.8;">${item.snippet.channelTitle}</span>
            </div>
        </div>
    `).join('');
}


function renderPaginationControls(totalResults) {
    // Pagination is only usually for single-type lists, not "All"
    if (currentSearchType === 'all') return ''; 
    
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

    // Initial message state
    if (!isAIOverviewEnabled && (currentSearchType === 'web' || currentSearchType === 'all')) { 
        if (citizenMsgEl) citizenMsgEl.style.display = 'block';
    } else {
        if (citizenMsgEl) citizenMsgEl.style.display = 'none';
    }
    
    // Initial display of AI results if cached and enabled (e.g. on page load)
    if (isAIOverviewEnabled && lastAIRawText && lastFetchedItems) {
        applyAIResultsFromCache(lastAIRawText, lastFetchedItems);
    } else if (overviewEl) {
        overviewEl.innerHTML = '';
    }

    toggle.addEventListener('change', function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        
        // UI Handling when toggling
        if (isAIOverviewEnabled) {
            if (citizenMsgEl) citizenMsgEl.style.display = 'none';
            
            // --- OPTIMIZED LOGIC: USE CACHE IF AVAILABLE ---
            if (currentQuery && (currentSearchType === 'web' || currentSearchType === 'all') && currentPage === 1) {
                if (lastAIRawText && lastFetchedItems) { 
                    applyAIResultsFromCache(lastAIRawText, lastFetchedItems); 
                } else {
                    // Force a re-search if we have no data but turned AI on
                    executeSearch(currentQuery, currentSearchType, currentPage);
                }
            }
        } else {
            // Toggled OFF
            if (overviewEl) overviewEl.innerHTML = '';
            if (citizenMsgEl) citizenMsgEl.style.display = 'block';
        }
    });
}
// --- END TOGGLE LOGIC ---

function initializeFromSession() {
    const urlParams = new URLSearchParams(window.location.search);
    let query = urlParams.get('q');
    let searchType = urlParams.get('type') || 'all'; // Default to 'all' now
    let page = parseInt(urlParams.get('page')) || 1; 

    if (!query) {
        query = sessionStorage.getItem('metaSearchQuery') || '';
        searchType = sessionStorage.getItem('searchType') || 'all';
    }

    sessionStorage.removeItem('metaSearchQuery');
    sessionStorage.removeItem('searchType');

    setupAIOverviewToggle();

    if (query) {
        // We set the tab active without firing search, then fire search manually
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
        
        // Determine active tab to preserve type on new search
        var type = 'all';
        if (document.getElementById('tab-links').classList.contains('active')) type = 'web';
        if (document.getElementById('tab-images').classList.contains('active')) type = 'image';
        if (document.getElementById('tab-videos').classList.contains('active')) type = 'video';
        
        // Clear AI cache and timer on new search
        lastAIRawText = null; 
        lastFetchedItems = null;
        if (aiTimeout) clearTimeout(aiTimeout);
        
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
    }
});

// --- IMAGE MODAL / WINDOW LOGIC ---

function openImageModal(index) {
    if (!lastFetchedItems || !lastFetchedItems[index]) return;
    const item = lastFetchedItems[index];

    // 1. Setup Data
    const fullImgUrl = item.url || item.media_url || item.thumbnail; 
    const title = item.title || 'Image Result';
    const sourceUrl = item.pageUrl || item.sourceUrl || '';

    // 2. Fix "Dimensions Unknown" (Check multiple possible property names)
    const w = item.width || item.w || (item.details ? item.details.width : null);
    const h = item.height || item.h || (item.details ? item.details.height : null);
    const dims = (w && h) ? `${w} x ${h}` : 'Dimensions Unknown';

    // 3. Populate HTML
    document.getElementById('modalImage').src = fullImgUrl;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalDims').innerText = dims;
    
    // Display the Source Name + The URL for transparency
    const sourceName = item.source || 'Website';
    document.getElementById('modalSource').innerHTML = `
        <strong>Source:</strong> ${escapeHtml(sourceName)}<br>
        <span style="word-break: break-all; font-size: 0.85em; opacity: 0.8;">${escapeHtml(sourceUrl)}</span>
    `;
    
    // 4. Setup Buttons
    const btnVisit = document.getElementById('btnVisit');
    btnVisit.onclick = function() { window.open(sourceUrl, '_blank'); };

    const btnDownload = document.getElementById('btnDownload');
    btnDownload.onclick = function() { forceDownload(fullImgUrl, title); };

    const btnShare = document.getElementById('btnShare');
    btnShare.onclick = function() { shareImage(fullImgUrl, title, sourceUrl); };

    // 5. Show Modal
    document.getElementById('imageModalOverlay').style.display = 'flex';
}

function closeImageModal() {
    document.getElementById('imageModalOverlay').style.display = 'none';
    document.getElementById('modalImage').src = ''; // Clear to stop loading
}

// Helper: Force Download
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
        // Fallback if CORS blocks the fetch
        window.open(url, '_blank');
    }
}

// Helper: Share Logic
async function shareImage(imgUrl, title, pageUrl) {
    if (navigator.share) {
        try {
            await navigator.share({
                title: title,
                text: 'Check out this image found on Oodles Search!',
                url: pageUrl // Sharing the page is usually more reliable than the raw image URL
            });
        } catch (err) {
            console.log('Share canceled');
        }
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(pageUrl).then(() => {
            alert('Link copied to clipboard!');
        });
    }
}

// Close modal when clicking outside the window
document.addEventListener('click', function(event) {
    const overlay = document.getElementById('imageModalOverlay');
    if (event.target === overlay) {
        closeImageModal();
    }

});
