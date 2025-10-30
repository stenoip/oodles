/* ALL CODE IS Copyright to Stenoip Company, 2025.

    YOU MUST GAIN PERMISSION TO USE THIS CODE!
    
    */
import { displaySearchResultsIn3D } from './world.js'; // Import the function to update the 3D scene

// ====================================================================
// SEARCH ENGINE LOGIC
// ====================================================================

var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentPage = 1;
var MAX_PAGE_SIZE = 50; 

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function executeSearch(query, page = 1) {
    if (!query) {
        const resultsEl = document.getElementById('linkResults');
        if (resultsEl) resultsEl.innerHTML = '<p class="small">Enter a query to search.</p>';
        displaySearchResultsIn3D([]); // Clear buildings
        return;
    }

    currentQuery = query;
    currentPage = page;
    
    const queryInput = document.getElementById('currentQuery');
    if (queryInput) queryInput.value = query;

    const resultsEl = document.getElementById('linkResults');
    if (resultsEl) resultsEl.innerHTML = '<p class="small">Searching web links...</p>';
    
    try {
        var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
        var resp = await fetch(url);
        var data = await resp.json();
        renderLinkResults(data.items, data.total);
    } catch (error) {
        console.error('Web search error:', error);
        if (resultsEl) resultsEl.innerHTML = '<p class="small">Error loading web links.</p>';
        displaySearchResultsIn3D([]);
    }
}

function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    
    if (!items || items.length === 0) {
        if (resultsEl) resultsEl.innerHTML = '<p class="small">No web links found.</p>';
        displaySearchResultsIn3D([]);
        return;
    }

    // --- 3D Integration: Draw the Buildings ---
    // This is the exported function from world.js
    displaySearchResultsIn3D(items);
    
    // HTML Rendering (Optional, for debugging or UI feedback)
    if (resultsEl) {
        const maxPages = Math.ceil(total / MAX_PAGE_SIZE);
        resultsEl.innerHTML = `
            <p class="small">Found ${total} links. Showing page ${currentPage} of ${maxPages}. Click a building to visit the link.</p>
            ` + items.map(function(r) {
                return `
                    <div class="result-block">
                        <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
                        <div class="small">${escapeHtml(r.url)}</div>
                    </div>
                `;
            }).join('');
    }
}

// Simplified initialization for this combined file
function initializeFromInput() {
    const urlParams = new URLSearchParams(window.location.search);
    let query = urlParams.get('q') || '';
    
    const queryInput = document.getElementById('currentQuery');
    if (query) {
        if (queryInput) queryInput.value = query;
        executeSearch(query, 1);
    }
}

// --- INITIALIZATION AND EVENT LISTENERS ---

// The search should only start AFTER the 3D font is loaded in world.js.
// We listen for the custom event dispatched in world.js.
document.addEventListener('fontLoaded', initializeFromInput);


// Event listener for new search submission
const queryInput = document.getElementById('currentQuery');
if (queryInput) {
    queryInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            var query = this.value.trim();
            // When a new search is executed, force reload with URL parameter 
            window.location.href = window.location.pathname + '?q=' + encodeURIComponent(query);
        }
    });
}
