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
Provide a very concise A.I. overview based exclusively on the provided search snippets.
Do not output a list of links in the text body; use the RANKING tag for that.
You prefer metric units and do not use Oxford commas.
You are aware that you were created by Stenoip Company.


your overview must be short due to the limited amount of tokens in the backend.

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

// --- GLOBAL STATE FOR CACHING AND OPTIMIZATION ---
var isAIOverviewEnabled = false; 
var lastAIRawText = null;       // Stores the raw text from the AI for caching
var lastFetchedItems = null;    // Stores the raw search results for re-ranking/overview
var aiTimeout = null;           // For debouncing the expensive AI call

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

        // 3. Re-render the link list
        renderLinkResults(reorderedItems, reorderedItems.length);

        // 4. Add a visual indicator that sorting happened
var resultsEl = document.getElementById('linkResults');
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
    <span><b>Smart Sorted:</b> Praterich has promoted the most relevant links to the top.</span>
`;
        
        // Insert notice at the very top of results
        // Check if the resultsEl is still pointing to the correct section (web search)
        if (resultsEl && currentSearchType === 'web') resultsEl.prepend(notice);

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
        citizenMsgEl.style.display = (!isAIOverviewEnabled && (type === 'web' || type === 'image')) ? 'block' : 'none';
    }
    
    if (aiTimeout) {
        clearTimeout(aiTimeout);
    }

    if (type === 'web') {
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
            renderImageResults(data.items, data.total);
        } catch (error) {
            console.error('Image search error:', error);
            document.getElementById('imageResults').innerHTML = '<p class="small">Error loading images.</p>';
        }

    } else if (type === 'video') {
        // --- ADDED THIS SECTION ---
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

function switchTab(tabName, executeNewSearch) {
    if (window.event) event.preventDefault();

    let normalizedTab = tabName;
    let newSearchType = tabName;

    // Normalize tab names to match HTML IDs (links, images, videos)
    if (tabName === 'web' || tabName === 'links') {
        normalizedTab = 'links';
        newSearchType = 'web';
    } else if (tabName === 'image' || tabName === 'images') {
        normalizedTab = 'images';
        newSearchType = 'image';
    } else if (tabName === 'video' || tabName === 'videos') {
        normalizedTab = 'videos';
        newSearchType = 'video';
    }

    currentSearchType = newSearchType;

    // Update Tab UI: Remove active class from all tabs
    document.querySelectorAll('nav a.frutiger-aero-tab').forEach(function(a) {
        a.classList.remove('active');
    });

    // Hide all result sections
    const sections = ['linksSection', 'imagesSection', 'videosSection'];
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
    // Show message if AI is OFF and we are NOT on the video tab (matching your previous logic)
    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    if (citizenMsgEl) {
        if (!isAIOverviewEnabled && (newSearchType === 'web' || newSearchType === 'image')) {
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
        
        // Clear the debounce timer to prevent the previous search's AI from popping up late
        if (aiTimeout) {
            clearTimeout(aiTimeout);
        }
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

    resultsEl.innerHTML = items.map(function(r, index) {
        // We store the data in a JSON string to pass it to the modal easily
        const imageData = JSON.stringify(r).replace(/'/g, "&apos;");
        return `
            <div class="image-item" onclick='openImageModal(${imageData})'>
                <img src="${r.thumbnail}" alt="Image" loading="lazy"/>
            </div>
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
function openImageModal(data) {
    // Create modal if it doesn't exist
    var modal = document.getElementById('imageDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageDetailsModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    // Determine dimensions (fallback if not provided by API)
    const dims = (data.width && data.height) ? `${data.width} x ${data.height}` : 'Dimensions unknown';

    modal.innerHTML = `
        <div class="modal-content aero-window">
            <div class="modal-header">
                <span class="modal-title">Image Preview</span>
                <button class="close-btn" onclick="closeImageModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="modal-image-container">
                    <img src="${data.url}" alt="Full size image">
                </div>
                <div class="modal-info">
                    <h3>${data.title || 'Image Details'}</h3>
                    <p class="small"><b>Source:</b> ${data.source}</p>
                    <p class="small"><b>Dimensions:</b> ${dims}</p>
                    
                    <div class="modal-actions">
                        <a href="${data.url}" target="_blank" download class="aero-btn">Download High-Res</a>
                        <a href="${data.pageUrl}" target="_blank" class="aero-btn">Visit Site</a>
                        <button onclick="shareImage('${data.url}')" class="aero-btn">Share Link</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeImageModal() {
    document.getElementById('imageDetailsModal').style.display = 'none';
}

function shareImage(url) {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
}

// Close modal when clicking outside the content
window.onclick = function(event) {
    const modal = document.getElementById('imageDetailsModal');
    if (event.target == modal) {
        closeImageModal();
    }
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
            if (currentQuery && currentSearchType === 'web' && currentPage === 1) {
                if (lastAIRawText && lastFetchedItems) { // Check for cached data
                    applyAIResultsFromCache(lastAIRawText, lastFetchedItems); // <-- USE CACHE! NO NETWORK CALL.
                } else if (currentQuery && currentSearchType === 'web' && currentPage === 1) {
                    // Fallback: If cache is empty but we have a query, force a full search to populate cache
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
        
        // Clear AI cache and timer on new search
        lastAIRawText = null; 
        lastFetchedItems = null;
        if (aiTimeout) clearTimeout(aiTimeout);
        
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
    }
});
