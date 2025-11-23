// --- Configuration Variables ---
var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = '';
var currentSearchType = 'web';
var currentPage = 1;
var MAX_PAGE_SIZE = 50;

// --- AI Overview for Search-Logic ---
var ladyPraterichSystemInstruction = `
You are Praterich, an AI designed to help users search the web, answer questions, and find relevant information. You understand natural language and can assist users in various contexts, like searching for web links, images, and other content.

Your responses should be clear, concise, and informative. You should prioritize providing accurate search results and summaries, while maintaining a friendly, conversational tone. Avoid sounding too formal or robotic, and remember to engage with the user as if having a casual, helpful chat.

You should adapt based on the type of search requested, whether it's a web search or an image search. You can also guide users through pagination or suggest alternatives when no results are found.
`;

// --- DOM Elements ---
var appWrapper = document.getElementById('app-wrapper');
var sidebar = document.getElementById('sidebar');
var chatWindow = document.getElementById('chat-window');
var chatList = document.getElementById('chat-list');
var newChatButton = document.getElementById('new-chat-button');
var userInput = document.getElementById('user-input');
var sendButton = document.getElementById('send-button');
var typingIndicator = document.getElementById('typing-indicator');

// --- Global State ---
var chatSessions = {};
var currentChatId = null;
var attachedFile = null;

// --- Core Functions ---

// Escape HTML characters for safety in rendering search results
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Handle search result rendering for links
function renderLinkResults(items, total) {
    var resultsEl = document.getElementById('linkResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No web links found.</p>' + renderPaginationControls(total);
        return;
    }

    const maxPages = Math.ceil(total / MAX_PAGE_SIZE);
    resultsEl.innerHTML = `
        <p class="small">Found ${total} links. Showing page ${currentPage} of ${maxPages}.</p>
        ` + items.map(function (r) {
            return `
            <div class="result-block">
                <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
                <div class="small">${escapeHtml(r.url)}</div>
                <div>${escapeHtml(r.snippet || '')}</div>
            </div>
            `;
        }).join('') + renderPaginationControls(total);
}

// Handle search result rendering for images
function renderImageResults(items, total) {
    var resultsEl = document.getElementById('imageResults');
    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<p class="small">No images found.</p>' + renderPaginationControls(total);
        return;
    }

    const maxPages = Math.ceil(total / MAX_PAGE_SIZE);
    resultsEl.innerHTML = items.map(function (r) {
        return `
        <a href="${r.pageUrl}" target="_blank" rel="noopener" title="Source: ${r.pageUrl}">
            <img src="${r.thumbnail}" alt="Image from ${r.source}" loading="lazy"/>
        </a>
        `;
    }).join('') +
        `<p class="small" style="grid-column: 1 / -1; margin-top: 10px;">Found ${total} images. Showing page ${currentPage} of ${maxPages}.</p>` +
        renderPaginationControls(total);
}

// Render pagination controls based on search results
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

// Change the current page for pagination
function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1) {
        window.location.href = 'search.html?q=' + encodeURIComponent(currentQuery) + '&type=' + currentSearchType + '&page=' + newPage;
    }
}

// Execute the search for either web or image results
async function executeSearch(query, type, page = 1) {
    if (!query) {
        document.getElementById('linkResults').innerHTML = '<p class="small">No query to search.</p>';
        document.getElementById('imageResults').innerHTML = '<p class="small">No query to search.</p>';
        return;
    }

    currentQuery = query;
    currentSearchType = type;
    currentPage = page;
    document.getElementById('currentQuery').value = query;

    if (type === 'web') {
        document.getElementById('linkResults').innerHTML = '<p class="small">Searching web links...</p>';
        try {
            var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=' + page + '&pageSize=' + MAX_PAGE_SIZE;
            var resp = await fetch(url);
            var data = await resp.json();
            renderLinkResults(data.items, data.total);
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
    }
}

// Switch between the tabs for different search types (web or image)
function switchTab(tabName, executeNewSearch) {
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

    document.querySelectorAll('nav a.frutiger-aero-tab').forEach(function (a) {
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

// Initialize search from session or URL parameters
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

// Store the current search query in session
function storeQueryInSession(query, type) {
    sessionStorage.setItem('metaSearchQuery', query);
    sessionStorage.setItem('searchType', type);
}

// --- Event Listeners ---
document.getElementById('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var query = userInput.value.trim();
    if (query) {
        storeQueryInSession(query, currentSearchType);
        executeSearch(query, currentSearchType, 1);
    }
});

// --- On Page Load ---
window.addEventListener('load', initializeFromSession);
