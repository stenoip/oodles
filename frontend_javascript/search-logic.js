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

// Function to handle AI overviews (Praterich-like summaries) for search results
async function getAIOverviewForSearchResults(results) {
    const apiUrl = 'https://praterich.vercel.app/api/praterich'; // Assuming this is where Praterich API is
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: `Provide a brief, insightful summary for the following search results: ${results.map(r => r.title).join(', ')}`
            })
        });
        const data = await response.json();
        return data.text;  // Assuming the response contains a 'text' field with the AI overview
    } catch (error) {
        console.error('AI Overview Fetch Error:', error);
        return "Sorry, couldn't fetch an AI overview at the moment.";
    }
}

// Main search function to perform the actual search logic
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
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            await renderLinkResults(data.items, data.total);
        } catch (error) {
            console.error('Web search error:', error);
            document.getElementById('linkResults').innerHTML = '<p class="small">Error loading web links.</p>';
        }
    } else if (type === 'image') {
        document.getElementById('imageResults').innerHTML = '<p class="small">Searching images (this may take a few moments as pages are crawled)...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&type=image&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            await renderImageResults(data.items, data.total);
        } catch (error) {
            console.error('Image search error:', error);
            document.getElementById('imageResults').innerHTML = '<p class="small">Error loading images.</p>';
        }
    }
}

// Switch between web and image results
function switchTab(tabName, executeNewSearch) {
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

    document.querySelectorAll('nav a.frutiger-aero-tab').forEach(function(a) {
        a.classList.remove('active');
    });

    document.getElementById('linksSection').style.display = 'none';
    document.getElementById('imagesSection').style.display = 'none';

    if (normalizedTab === 'links') {
        document.getElementById('tab-links').classList.add('active');
        document.getElementById('linksSection').style.display = 'block';
    } else if (normalizedTab === 'images') {
        document.getElementById('tab-images').classList.add('active');
        document.getElementById('imagesSection').style.display = 'block';
    }

    if (executeNewSearch && currentQuery) {
        executeSearch(currentQuery, newSearchType, 1);
    }
}

// Change the page for pagination
function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1) {
        window.location.href = 'search.html?q=' + encodeURIComponent(currentQuery) + '&type=' + currentSearchType + '&page=' + newPage;
    }
}

// Render the link results and integrate AI overview
async function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No web links found.</p>' + renderPaginationControls(total);
        return;
    }

    const maxPages = Math.ceil(total / MAX_PAGE_SIZE);
    const aiOverview = await getAIOverviewForSearchResults(items); // Fetch AI Overview

    resultsEl.innerHTML = `
        <p class="small">Found ${total} links. Showing page ${currentPage} of ${maxPages}.</p>
        <p><strong>AI Overview:</strong> ${aiOverview}</p>
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

// Render image results
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

// Pagination controls rendering
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

// Initialize search parameters from session or URL
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
        window.location.href = 'search.html?q=' + encodeURIComponent(query) + '&type=' + type + '&page=1';
    }
});
