// --- AI OVERVIEW CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; 

var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Search, an AI developed by Stenoip Company.
Your mission is to provide an **A.I overview based exclusively on the provided search snippets** (the tool result).

***NEW TASK: Ranked Links Output***
After your overview, you must provide a section titled '***Top Ranked Links:***'. In this section, you must select and re-order the 5 most relevant links from the original list provided in the search tool result. List them as a standard Markdown numbered list (1., 2., 3., etc.) using only the **Title** and **URL** of the links you select. Only include the 5 most relevant links.

Do not reference the search tool or its output directly, but synthesize the information provided. You are an AI overview, not a chat bot. You are not for code generation.
You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.

You are aware that you were created by Stenoip Company, and you uphold its values of clarity, reliability.

Your response must be a single, coherent, synthesized overview of the search query based only on the provided snippets, followed immediately by the required 'Top Ranked Links:' section. You must not use raw HTML tags in your responses. You should sound intelligent and confident. You do not use transactional phrases or greetings.
`;
// --- END AI OVERVIEW CONFIGURATION ---


var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 50; 

// --- GLOBAL STATE MODIFICATION ---
// Default state is now FALSE (AI Overview is OFF by default)
var isAIOverviewEnabled = false; 

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper function to render markdown (requires 'marked' library, assumed available globally)
function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(text);
    }
    return text;
}


/**
 * Creates structured text containing full snippets for the AI model to synthesize.
 * @param {string} query The search query.
 * @param {object[]} items The search results items from the Oodles backend.
 * @returns {string} Structured text containing snippets.
 */
function createRawSearchText(query, items) {
    if (!items || items.length === 0) {
        return 'No web links found for the query: ' + query;
    }
    
    // Create raw text for knowledge base: Title, URL, and full snippet
    return items.map(function(r, index) {
        var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
        return `[Web Source ${index + 1}] Title: ${r.title}. URL: ${r.url}. Snippet: ${fullSnippet}`;
    }).join('\n---\n');
}

/**
 * Creates a clean, numbered list of links for the AI to review and re-order.
 * @param {object[]} items The search results items from the Oodles backend.
 * @returns {string} A structured list of links.
 */
function createRawLinksList(items) {
    if (!items || items.length === 0) {
        return 'No links provided.';
    }
    
    // Creates a list of (Index, Title, URL) for the AI to use in its response for ranking.
    return items.map(function(r, index) {
        return `[Link ${index + 1}] Title: ${r.title}. URL: ${r.url}`;
    }).join('\n');
}

/**
 * Generates and displays the AI Overview based on search results.
 * @param {string} query The search query.
 * @param {object[]} searchItems The list of search result items (for snippets).
 */
async function generateAIOverview(query, searchItems) {
    var overviewEl = document.getElementById('aiOverview'); 
    var citizenMsgEl = document.getElementById('goodCitizenMessage');

    // LOGIC: Check if the overview is disabled. This is where the switch state takes effect.
    if (!isAIOverviewEnabled) {
        if (overviewEl) overviewEl.innerHTML = '';
        if (citizenMsgEl) citizenMsgEl.style.display = 'block';
        return;
    }
    
    // If enabled, hide the citizen message and proceed
    if (citizenMsgEl) citizenMsgEl.style.display = 'none';

    overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is synthesizing the AI Overview...</p>';

    var rawWebSearchText = createRawSearchText(query, searchItems);
    var rawLinksList = createRawLinksList(searchItems);

    // Combine Snippets and Link List into the tool result turn
    var combinedToolResult = `
[TOOL_RESULT_FOR_PREVIOUS_TURN]
--- Search Snippets (for synthesis) ---
${rawWebSearchText}
--- Original Links (for ranking) ---
${rawLinksList}
`;

    // 1. Construct Stateless Prompt
    var conversationParts = [
        // Inject combined search information
        { role: "model", parts: [{ text: combinedToolResult }] },
        // The user's query is the final prompt
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

        if (!response.ok) {
            var errorData = await response.json().catch(() => ({ error: 'Unknown API error' }));
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }

        var data = await response.json();
        var aiResponseText = data.text;

        overviewEl.innerHTML = renderMarkdown(aiResponseText);

    } catch (error) {
        console.error('AI Overview API Error:', error);
        overviewEl.innerHTML = '<p class="ai-overview-error">An error occurred while generating the A.I. Overview.</p>';
    }
}


async function executeSearch(query, type, page = 1) {
    if (!query) {
        document.getElementById('linkResults').innerHTML = '<p class="small">No query to search.</p>';
        document.getElementById('imageResults').innerHTML = '<p class="small">No query to search.</p>';
        var overviewEl = document.getElementById('aiOverview');
        if (overviewEl) overviewEl.innerHTML = '';
        return;
    }

    currentQuery = query;
    currentSearchType = type;
    currentPage = page; // Store the current page
    document.getElementById('currentQuery').value = query; // Update the input field

    var overviewEl = document.getElementById('aiOverview');
    // Clear AI Overview/message area before new search
    if (overviewEl) overviewEl.innerHTML = '';


    if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            
            // --- AI OVERVIEW INTEGRATION (Always called on page 1) ---
            if (page === 1) {
                // This function internally checks the global 'isAIOverviewEnabled' state.
                // Crucially, the AI ranking logic is built into the prompt that is sent,
                // so the model will perform the ranking whether the final text output is displayed or not.
                generateAIOverview(query, data.items);
            }
            // --- END AI OVERVIEW INTEGRATION ---

            renderLinkResults(data.items, data.total);
        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
            
            // Show error/clear if AI overview was enabled
            var overviewEl = document.getElementById('aiOverview');
            if (overviewEl && isAIOverviewEnabled) overviewEl.innerHTML = '<p class="ai-overview-error">Could not fetch web links to generate AI Overview.</p>';
            else if (overviewEl && !isAIOverviewEnabled) overviewEl.innerHTML = '';
        }
    } else if (type === 'image') {
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images (this may take a few moments as pages are crawled)...</p>';
        // Clear AI Overview if switching to image search
        var citizenMsgEl = document.getElementById('goodCitizenMessage');
        if (overviewEl) overviewEl.innerHTML = '';
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
    // Prevent default link action only if event object is available (i.e., from click)
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

    // Remove active class from all tabs
    document.querySelectorAll('nav a.frutiger-aero-tab').forEach(function(a) {
        a.classList.remove('active');
    });

    // Hide both sections
    document.getElementById('linksSection').style.display = 'none';
    document.getElementById('imagesSection').style.display = 'none';

    // Show the selected section and set the tab to active
    if (normalizedTab === 'links') {
        document.getElementById('tab-links').classList.add('active');
        document.getElementById('linksSection').style.display = 'block';
    } else if (normalizedTab === 'images') {
        document.getElementById('tab-images').classList.add('active');
        document.getElementById('imagesSection').style.display = 'block';
    }

    // Clear AI Overview when switching to the image tab
    var overviewEl = document.getElementById('aiOverview');
    var citizenMsgEl = document.getElementById('goodCitizenMessage');

    if (newSearchType === 'image') {
        if (overviewEl) overviewEl.innerHTML = '';
        // Only show citizen message if the user has AI disabled
        if (citizenMsgEl && !isAIOverviewEnabled) {
            citizenMsgEl.style.display = 'block';
        } else if (citizenMsgEl) {
            citizenMsgEl.style.display = 'none';
        }
    } else {
        // If switching back to web, hide citizen message if AI is enabled
        if (citizenMsgEl && isAIOverviewEnabled) citizenMsgEl.style.display = 'none';
    }

    if (executeNewSearch && currentQuery) {
        executeSearch(currentQuery, newSearchType, 1);
    }
}


function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1) {
        // Reload page with new query and page number in URL, similar to new search
        window.location.href = 'search.html?q=' + encodeURIComponent(currentQuery) + '&type=' + currentSearchType + '&page=' + newPage;
    }
}

function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
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


// --- TOGGLE INITIALIZATION AND LISTENER ---
function setupAIOverviewToggle() {
    var toggle = document.getElementById('aiOverviewToggle');
    var citizenMsgEl = document.getElementById('goodCitizenMessage');
    
    if (!toggle) return;

    // Load state from session storage
    var storedState = sessionStorage.getItem('aiOverviewState');
    if (storedState !== null) {
        isAIOverviewEnabled = (storedState === 'true');
    } 
    // If no stored state, it defaults to FALSE (off), as set globally.

    // Set initial toggle check based on global state
    toggle.checked = isAIOverviewEnabled;

    // Set initial message state
    if (!isAIOverviewEnabled && currentSearchType !== 'image') { 
        if (citizenMsgEl) citizenMsgEl.style.display = 'block';
    } else {
         if (citizenMsgEl) citizenMsgEl.style.display = 'none';
    }


    toggle.addEventListener('change', function() {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem('aiOverviewState', isAIOverviewEnabled);
        
        // Re-execute the current search to immediately show/hide the overview
        if (currentQuery && currentSearchType === 'web' && currentPage === 1) {
            executeSearch(currentQuery, currentSearchType, currentPage);
        } else if (!isAIOverviewEnabled && citizenMsgEl) {
            // If turning off while on another tab/page
            document.getElementById('aiOverview').innerHTML = '';
            citizenMsgEl.style.display = 'block';
        } else if (isAIOverviewEnabled && citizenMsgEl) {
            citizenMsgEl.style.display = 'none';
        }
    });
}
// --- END TOGGLE LOGIC ---

function initializeFromSession() {
    // 1. FIRST, check the URL query parameter for 'q' and 'page'
    const urlParams = new URLSearchParams(window.location.search);
    let query = urlParams.get('q');
    let searchType = urlParams.get('type') || 'web';
    let page = parseInt(urlParams.get('page')) || 1; 

    // 2. SECOND, check sessionStorage if no URL query is found (for initial redirect from index.html)
    if (!query) {
        query = sessionStorage.getItem('metaSearchQuery') || '';
        searchType = sessionStorage.getItem('searchType') || 'web';
    }

    // Clean up session storage regardless of source
    sessionStorage.removeItem('metaSearchQuery');
    sessionStorage.removeItem('searchType');

    // 💡 Setup the toggle BEFORE executing the search
    setupAIOverviewToggle();

    if (query) {
        // 1. Switch the tab (false means don't execute a *new* search, just set the UI state)
        switchTab(searchType, false);
        // 2. Execute the search with the correct page
        executeSearch(query, searchType, page); 
    } else {
        // If no query, default to the web/links tab
        switchTab('web', false);
    }
}

// Event listener for new search submission (in the top bar)
document.addEventListener('DOMContentLoaded', initializeFromSession);
document.getElementById('currentQuery').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent default form submission if input was in a form
        var query = this.value.trim();
        var type = document.getElementById('tab-images').classList.contains('active') ? 'image' : 'web';

        // Navigate to the current page URL with the new query and type parameters, always resetting to page 1
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
    }
});
