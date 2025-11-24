// --- AI Proxy and Search Backend Configuration ---
var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var PRATERICH_API_URL = 'https://praterich.vercel.app/api/praterich'; // Actual AI Proxy URL
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

// Renders the AI Overview and Ranked Links
function renderAiOverview(aiOverview, rankedLinks) {
    // Only render if we have at least an overview or a ranked link
    if (!aiOverview && (!rankedLinks || rankedLinks.length === 0)) return '';

    // Filter out content not necessary for the AI overview (e.g., file upload info)
    const cleanedOverview = aiOverview ? aiOverview.replace(/\b(file|upload|storage)\b/gi, '').trim() : '';

    const linkHtml = (rankedLinks || []).map(function(r, index) {
        // Highlight the link marked as the best one (or the first one if none is explicitly marked)
        const isBest = r.isBest || (index === 0 && !rankedLinks.some(link => link.isBest)); 
        const linkClass = isBest ? 'result-block ai-ranked-link ai-ranked-best' : 'result-block ai-ranked-link';
        const badge = isBest ? '<span class="ai-best-badge">⭐ Best Match</span>' : '';
        
        // Remove file-related terms from the snippet
        const cleanSnippet = (r.description || r.snippet || '').replace(/\b(file|upload|storage)\b/gi, '').trim();

        return `
            <div class="${linkClass}">
                ${badge}
                <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
                <div class="small">${escapeHtml(r.url)}</div>
                <div>${escapeHtml(cleanSnippet)}</div>
            </div>
        `;
    }).join('');

    // If the overview or links are present, return the full HTML block
    if (cleanedOverview || linkHtml) {
        return `
            <div class="ai-overview-container">
                ${cleanedOverview ? `
                    <h3>🤖 AI Overview</h3>
                    <p>${escapeHtml(cleanedOverview)}</p>
                ` : ''}
                ${linkHtml ? `
                    <h3>🏆 Ranked Links</h3>
                    ${linkHtml}
                ` : ''}
            </div>
            <hr/>
        `;
    }
    return '';
}

async function executeSearch(query, type, page = 1) {
    if (!query) {
        document.getElementById('linkResults').innerHTML = '<p class="small">No query to search.</p>';
        document.getElementById('imageResults').innerHTML = '<p class="small">No query to search.</p>';
        return;
    }

    currentQuery = query;
    currentSearchType = type;
    currentPage = page; // Store the current page
    document.getElementById('currentQuery').value = query; // Update the input field

    if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
        try {
            // URL now only contains pagination parameters.
            var url = BACKEND_BASE + '/metasearch?page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            
            // CRITICAL UPDATE: Use POST method and send query in the request body (JSON)
            var resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ q: query })
            });

            var data = await resp.json();
            
            // The backend returns 'items' for regular results and 'total' for count.
            // It also returns 'aiOverview' and 'rankedLinks'.
            renderLinkResults(data.items, data.total, data.aiOverview, data.rankedLinks);

        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
        }
    } else if (type === 'image') {
        // Image search logic (assumes a standard GET request)
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images (this may take a few moments as pages are crawled)...</p>';
        try {
            
            // Image search typically uses GET/URL-based query
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

    // Determine the correct UI ID and the backend search type
    let normalizedTab = tabName;
    let newSearchType = tabName;

    if (tabName === 'web' || tabName === 'links') {
        normalizedTab = 'links';
        newSearchType = 'web';
    } else if (tabName === 'image' || tabName === 'images') {
        normalizedTab = 'images';
        newSearchType = 'image';
    }

    // Update global state immediately
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

    // If triggered by a tab click (executeNewSearch is true), and a query exists, run a new search
    // Note: We reset to page 1 when switching tabs
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

// MODIFIED FUNCTION: Accepts optional aiOverview and rankedLinks
function renderLinkResults(items, total, aiOverview, rankedLinks) {
    var resultsEl = document.getElementById('linkResults');
    const maxPages = Math.ceil(total / MAX_PAGE_SIZE);
    
    // Render the new AI content block first
    const overviewBlock = renderAiOverview(aiOverview, rankedLinks);

    if (!items || items.length === 0) {
        // If no regular search results, just display the AI block and the "not found" message
        resultsEl.innerHTML = overviewBlock + '<p class="small">No web links found.</p>' + renderPaginationControls(total);
        return;
    }

    resultsEl.innerHTML = overviewBlock + `
        <p class="small">Found ${total} links. Showing page ${currentPage} of ${maxPages}.</p>
        ` + items.map(function(r) {
            return `
                <div class="result-block">
                    <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
                    <div class="small">${escapeHtml(r.url)}</div>
                    <div>${escapeHtml(r.description || r.snippet || '')}</div>
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
    let page = parseInt(urlParams.get('page')) || 1; // MODIFIED: Get page from URL

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

        // CORRECTED: Navigate to the current page URL with the new query and type parameters, always resetting to page 1
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1'; 
    }
});
