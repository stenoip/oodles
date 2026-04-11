// frontend_javascript/serp.js

var SERP_MODULE = {
    /**
      Determines if a query is "Entity-heavy" (likely to have a Wikipedia page)
      and fetches data if it meets criteria.
     */
    renderKnowledgePanel: async function(query) {
        var container = document.getElementById('knowledgePanelContainer');
        if (!container) return;

        // Trigger Check: Don't trigger for long natural language questions
        // Wikipedia works best for 1-3 word nouns (e.g., "Paris", "Owedon", "The Moon")
        var queryWords = query.trim().split(/\s+/);
        if (queryWords.length > 4) {
            container.style.display = 'none';
            return;
        }

        try {
            var wikiUrl = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query);
            var response = await fetch(wikiUrl);
            
            if (!response.ok) {
                container.style.display = 'none';
                return;
            }

            var data = await response.json();

            // Trigger Check: We only want 'standard' articles. 
            // "disambiguation" means the term is too broad (e.g., "Mercury")
            if (data.type === 'standard' && data.extract) {
                var html = '<div class="knowledge-card">';
                if (data.thumbnail) {
                    html += '<img src="' + data.thumbnail.source + '" class="kp-image" alt="' + data.title + '">';
                }
                html += '<h3>' + data.title + '</h3>';
                if (data.description) {
                    html += '<p class="kp-description">' + data.description + '</p>';
                }
                html += '<p class="kp-extract">' + data.extract + '</p>';
                html += '<div class="kp-footer">';
                html += '<a href="' + data.content_urls.desktop.page + '" target="_blank">View on Wikipedia</a>';
                html += '</div></div>';
                
                container.innerHTML = html;
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        } catch (err) {
            console.error("SERP: Wiki fetch error", err);
            container.style.display = 'none';
        }
    },

    /**
      Featured Snippet (Position 0)
      Triggers if the top result has a high relevance and long descriptive text.
     */
    renderFeaturedSnippet: function(items) {
        var container = document.getElementById('featuredSnippetContainer');
        if (!container || !items || items.length === 0) return;

        var topResult = items[0];
        
        // Trigger Check: Only show if the snippet is informative (over 120 chars)
        // This prevents showing a snippet that is just a navigation menu or site header.
        if (topResult.snippet.length < 120) {
            container.style.display = 'none';
            return;
        }

        var snippetHtml = '<div class="serp-featured-card">';
        snippetHtml += '<div class="serp-label">Featured Snippet</div>';
        snippetHtml += '<div class="serp-content"><p>' + topResult.snippet + '</p></div>';
        snippetHtml += '<div class="serp-source">';
        snippetHtml += '<a href="' + topResult.url + '" target="_blank">';
        snippetHtml += '<span class="serp-title">' + topResult.title + '</span>';
        snippetHtml += '<cite>' + topResult.url + '</cite>';
        snippetHtml += '</a></div></div>';

        container.innerHTML = snippetHtml;
        container.style.display = 'block';
    },

    /**
     * Popular Products
     * Triggers if snippets contain currency symbols or known shop domains.
     */
    renderPopularProducts: function(items) {
        var container = document.getElementById('popularProductsContainer');
        if (!container) return;

        // Trigger Check: Filter for product-like results
        var products = items.filter(function(item) {
            return /\$|£|€|Price|Buy/.test(item.snippet) || 
                   /amazon|ebay|etsy|walmart/.test(item.url.toLowerCase());
        }).slice(0, 4);

        if (products.length < 2) {
            container.style.display = 'none';
            return;
        }

        var html = '<h4 style="margin-bottom:10px;">Popular Products</h4>';
        html += '<div class="product-grid">';
        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            html += '<a href="' + p.url + '" class="product-item" target="_blank">';
            html += '<div class="product-title">' + p.title.split('-')[0].substring(0, 45) + '...</div>';
            html += '<div class="product-meta">Check Price</div>';
            html += '</a>';
        }
        html += '</div>';

        container.innerHTML = html;
        container.style.display = 'block';
    },

    /**
      Resets all SERP UI elements for a new search.
     */
    clearAll: function() {
        var ids = ['featuredSnippetContainer', 'knowledgePanelContainer', 'popularProductsContainer'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) {
                el.innerHTML = '';
                el.style.display = 'none';
            }
        }
    }
};
