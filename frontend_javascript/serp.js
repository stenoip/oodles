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

    /**
     * Helper to find a relevant chunk of text based on the query
     */
    extractRelevantChunk: function(text, query) {
        if (!text) return null;
        var sentences = text.split(/[.!?]\s+/);
        var keywords = query.toLowerCase().split(' ').filter(w => w.length > 3);
        
        // Find the first sentence that matches a keyword
        for (var i = 0; i < sentences.length; i++) {
            for (var k = 0; k < keywords.length; k++) {
                if (sentences[i].toLowerCase().includes(keywords[k])) {
                    // Return this sentence and the next one for context
                    return (sentences[i] + ". " + (sentences[i+1] || "")).trim();
                }
            }
        }
        return sentences[0]; // Fallback to first sentence
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
