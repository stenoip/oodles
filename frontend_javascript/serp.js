// frontend_javascript/serp.js

var SERP_MODULE = {
    /**
     * Featured Snippet (Position 0)
      Now uses the /generate endpoint to crawl the first link if no good snippet exists.
     */
    renderFeaturedSnippet: async function(items, query) {
        var container = document.getElementById('featuredSnippetContainer');
        if (!container || !items || items.length === 0) return;

        var topResult = items[0];
        var displaySnippet = topResult.snippet || "";

        // If snippet is missing or too short, crawl the page for a better one
        if (displaySnippet.length < 120) {
            try {
                var genResponse = await fetch('https://oodles-backend.vercel.app/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        urls: [topResult.url],
                        recursiveLevel: 1,
                        includeAllText: true
                    })
                });
                
                var genData = await genResponse.json();
                
                if (genData.success && genData.data.length > 0) {
                    var fullText = genData.data[0]['all-text'] || "";
                    // Find a paragraph containing keywords from the query
                    displaySnippet = this.extractRelevantChunk(fullText, query) || displaySnippet;
                }
            } catch (e) {
                console.warn("SERP: Crawl failed, falling back to original snippet.");
            }
        }

        // Final check: if we still have nothing useful, don't show the box
        if (displaySnippet.length < 40) {
            container.style.display = 'none';
            return;
        }

        var html = '<div class="serp-featured-card">';
        html += '<div class="serp-label">Featured Snippet</div>';
        html += '<div class="serp-content"><p>' + displaySnippet.substring(0, 450) + '...</p></div>';
        html += '<div class="serp-source">';
        html += '<a href="' + topResult.url + '" target="_blank">';
        html += '<span class="serp-title">' + topResult.title + '</span>';
        html += '<cite>' + topResult.url + '</cite>';
        html += '</a></div></div>';

        container.innerHTML = html;
        container.style.display = 'block';
    },

    /*
     A robot that finds relavent keywords in a passage
     */
    extractRelevantChunk: function(text, query) {
    if (!text) return null;

    // 1. Clean the text and split into blocks (paragraphs or large sentence groups)
    var blocks = text.split(/\n\n|\n/).filter(b => b.trim().length > 60);
    
    // 2. Tokenize query and remove words shorter than 3 chars 
    // (This naturally ignores 'a', 'is', 'to', 'the' without a fixed list)
    var queryTerms = query.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(term => term.length > 2);

    var bestBlock = null;
    var highestScore = 0;

    blocks.forEach(block => {
        var lowerBlock = block.toLowerCase();
        var score = 0;

        queryTerms.forEach(term => {
            // Use Regex to count exact word matches only (prevents 'loaf' matching 'loaves' or 'floating')
            const regex = new RegExp('\\b' + term + '\\b', 'g');
            const matches = (lowerBlock.match(regex) || []).length;
            
            // SCORING RULE: 
            // Finding a term once is good. Finding it multiple times in one 
            // paragraph is a sign of a "definition" or "focused content".
            score += (matches * 10); 
            
            // BONUS: If terms appear close to each other, it's likely a high-quality snippet
            if (matches > 0) score += 5; 
        });

        // PENALTY: Decrease score for blocks that look like headers/menus
        // (Short blocks with very few verbs or lots of special characters)
        if (block.length < 100 && block.includes('|')) score -= 20;

        if (score > highestScore) {
            highestScore = score;
            bestBlock = block;
        }
    });

    // Final Fallback: If no keywords match, the first large block of text is usually the intro.
    if (!bestBlock) {
        bestBlock = blocks.find(b => b.length > 120) || blocks[0];
    }

    return bestBlock.trim().substring(0, 450);
},

    renderKnowledgePanel: async function(query) {
        var container = document.getElementById('knowledgePanelContainer');
        if (!container) return;

        var queryWords = query.trim().split(/\s+/);
        if (queryWords.length > 4) {
            container.style.display = 'none';
            return;
        }

        try {
            var wikiUrl = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query);
            var response = await fetch(wikiUrl);
            if (!response.ok) { container.style.display = 'none'; return; }
            var data = await response.json();

            if (data.type === 'standard' && data.extract) {
                var html = '<div class="knowledge-card">';
                if (data.thumbnail) html += '<img src="' + data.thumbnail.source + '" class="kp-image">';
                html += '<h3>' + data.title + '</h3>';
                if (data.description) html += '<p class="kp-description">' + data.description + '</p>';
                html += '<p class="kp-extract">' + data.extract + '</p>';
                html += '<div class="kp-footer"><a href="' + data.content_urls.desktop.page + '" target="_blank">Wikipedia</a></div></div>';
                
                container.innerHTML = html;
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        } catch (err) {
            container.style.display = 'none';
        }
    },

    renderPopularProducts: function(items) {
        var container = document.getElementById('popularProductsContainer');
        if (!container) return;

        var products = items.filter(function(item) {
            return /\$|£|€|Price|Buy/.test(item.snippet) || /amazon|ebay|etsy|walmart/.test(item.url.toLowerCase());
        }).slice(0, 4);

        if (products.length < 2) {
            container.style.display = 'none';
            return;
        }

        var html = '<h4 style="margin-bottom:10px;">Popular Products</h4><div class="product-grid">';
        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            html += '<a href="' + p.url + '" class="product-item" target="_blank">';
            html += '<div class="product-title">' + p.title.substring(0, 45) + '...</div>';
            html += '<div class="product-meta">Check Price</div></a>';
        }
        html += '</div>';
        container.innerHTML = html;
        container.style.display = 'block';
    },

    clearAll: function() {
        var ids = ['featuredSnippetContainer', 'knowledgePanelContainer', 'popularProductsContainer'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) { el.innerHTML = ''; el.style.display = 'none'; }
        }
    }
};
