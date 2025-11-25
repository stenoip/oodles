// --- AI OVERVIEW CONFIGURATION ---
var AI_API_URL = "https://praterich.vercel.app/api/praterich"; // Placeholder for Praterich API
var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Search, an AI developed by Stenoip Company.
Your mission is to provide an **A.I overview based exclusively on the provided search snippets** (the tool result). Do not reference the search tool or its output directly, but synthesize the information provided. You are an AI overview, not a chat bot. You are not for code generation.
You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.

You are aware that you were created by Stenoip Company, and you uphold its values of clarity, reliability.

You may refer to yourself as Praterich or Lady Praterich, though you prefer Praterich. You are female-presenting and speak in first person when appropriate.

Your response must be a single, coherent, synthesized overview of the search query based only on the provided snippets. You must not use raw HTML tags in your responses. You should sound intelligent and confident. You do not use transactional phrases or greetings.
`;
// --- END AI OVERVIEW CONFIGURATION ---


var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1; 
var MAX_PAGE_SIZE = 50; 

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper function to render markdown (requires 'marked' library, assumed available)
function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(text);
    }
    return text;
}


/**
 * @param {string} query The search query.
 * @param {object[]} items The search results items from the Oodles backend.
 * @returns {string} Structured text containing snippets for the AI model.
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
 * Generates and displays the AI Overview based on search results.
 * This function is non-interactive and runs once per search.
 * @param {string} query The search query.
 * @param {object[]} searchItems The list of search result items (for snippets).
 * @param {string} linkMarkdown The formatted links to append to the overview.
 */
async function generateAIOverview(query, searchItems, linkMarkdown) {
    var overviewEl = document.getElementById('aiOverview'); // Assuming you have a <div id="aiOverview">
    if (!overviewEl) {
        console.warn("AI Overview element not found (ID 'aiOverview').");
        return;
    }

    overviewEl.innerHTML = '<p class="ai-overview-loading">Praterich is synthesizing the AI Overview...</p>';

    var rawWebSearchText = createRawSearchText(query, searchItems);

    // 1. Construct Stateless Prompt
    var conversationParts = [
        // The tool result is injected as the model's first "turn"
        { role: "model", parts: [{ text: `[TOOL_RESULT_FOR_PREVIOUS_TURN] Search Snippets:\n${rawWebSearchText}` }] },
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
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        var data = await response.json();
        var aiResponseText = data.text;

        // 2. Append web links (if provided by the chat component logic)
        aiResponseText += linkMarkdown;

        // 3. Display the final overview
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
        // Clear the AI Overview if the query is empty
        var overviewEl = document.getElementById('aiOverview');
        if (overviewEl) overviewEl.innerHTML = '';
        return;
    }

    currentQuery = query;
    currentSearchType = type;
    currentPage = page; // Store the current page
    document.getElementById('currentQuery').value = query; // Update the input field

    // Clear AI Overview on every search start
    var overviewEl = document.getElementById('aiOverview');
    if (overviewEl) overviewEl.innerHTML = '';


    if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            
            // --- AI OVERVIEW INTEGRATION ---
            // Only generate the AI overview for the first page of web search results
            if (page === 1) {
                // Format links for display below the AI response
                var linkMarkdownForAI = data.items.map(function(r) {
                    var snippet = r.snippet ? r.snippet.substring(0, 70).trim() + (r.snippet.length > 70 ? '...' : '') : '';
                    return `- [${escapeHtml(r.title)}](${r.url}) - ${snippet}`;
                }).join('\n');
                var finalLinkMarkdown = data.items.length > 0 ? `\n\n***Links:***\n\n${linkMarkdownForAI}` : '\n\n***Links:***\n\n- *No web links found.*';

                generateAIOverview(query, data.items, finalLinkMarkdown);
            }
            // --- END AI OVERVIEW INTEGRATION ---

            renderLinkResults(data.items, data.total);
        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
            if (overviewEl) overviewEl.innerHTML = '<p class="ai-overview-error">Could not fetch web links to generate AI Overview.</p>';
        }
    } else if (type === 'image') {
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images (this may take a few moments as pages are crawled)...</p>';
        // The AI Overview is typically only generated for 'web' search
        if (overviewEl) overviewEl.innerHTML = ''; 
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
    if (newSearchType === 'image') {
        var overviewEl = document.getElementById('aiOverview');
        if (overviewEl) overviewEl.innerHTML = '';
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


function initializeFromSession() {
    // 1. FIRST, check the URL query parameter for 'q' and 'page'
    const urlParams = new URLSearchParams(window.location.search);
    let query = urlParams.get('q');
    let searchType = urlParams.get('type') || 'web';
    let page = parseInt(urlParams.get('page')) || 1; // 💡 Get page from URL

    // 2. SECOND, check sessionStorage if no URL query is found (for initial redirect from index.html)
    if (!query) {
        query = sessionStorage.getItem('metaSearchQuery') || '';
        searchType = sessionStorage.getItem('searchType') || 'web';
    }

    // Clean up session storage regardless of source
    sessionStorage.removeItem('metaSearchQuery');
    sessionStorage.removeItem('searchType');

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
