// frontend_javascript/serp.js

var SERP_MODULE = {
    /**
      Determines if a query is a definition lookup and renders a dictionary card.
      Triggers on single words or patterns like "define [word]" or "definition of [word]".
     */
    renderDictionaryCard: async function(query) {
        var container = document.getElementById('dictionaryContainer');
        if (!container) return;

        var cleanedQuery = query.trim().toLowerCase();
        if (!cleanedQuery) {
            container.style.display = 'none';
            return;
        }

        // Trigger Check & Query Extraction
        var targetWord = "";
        var matchDefine = cleanedQuery.match(/^define\s+(.+)$/);
        var matchWhatIs = cleanedQuery.match(/^what\s+is\s+(?:an?|the)\s+(.+)$/);
        var matchDefinition = cleanedQuery.match(/^definition\s+of\s+(.+)$/);
        var words = cleanedQuery.split(/\s+/);

        if (matchDefine) {
            targetWord = matchDefine[1];
        } else if (matchWhatIs) {
            targetWord = matchWhatIs[1];
        } else if (matchDefinition) {
            targetWord = matchDefinition[1];
        } else if (words.length === 1 && /^[a-zA-Z\-]+$/.test(words[0])) {
            // Fallback: If it's exactly one clean alphabetical word, treat it as a lookup candidate
            targetWord = words[0];
        }

        // Standardize clean target word checks
        targetWord = targetWord.trim().replace(/[\?\.\!]/g, "");
        if (!targetWord || targetWord.split(/\s+/).length > 2) {
            container.style.display = 'none';
            return;
        }

        try {
            var dictUrl = 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(targetWord);
            var response = await fetch(dictUrl);
            
            if (!response.ok) {
                container.style.display = 'none';
                return;
            }

            var data = await response.json();
            if (!data || data.length === 0) {
                container.style.display = 'none';
                return;
            }

            var entry = data[0];
            var word = entry.word;
            var phonetic = entry.phonetic || "";
            
            // Look for a fallback phonetic string if top-level is blank
            if (!phonetic && entry.phonetics && entry.phonetics.length > 0) {
                for (var pIdx = 0; pIdx < entry.phonetics.length; pIdx++) {
                    if (entry.phonetics[pIdx].text) {
                        phonetic = entry.phonetics[pIdx].text;
                        break;
                    }
                }
            }

            var html = '<div class="serp-dictionary-card" style="background: rgba(255,255,255,0.45); border: 1px solid rgba(255,255,255,0.7); border-radius: 12px; padding: 18px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); backdrop-filter: blur(4px);">';
            html += '<div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px;">';
            html += '<h3 style="margin: 0; font-size: 22px; color: #01579b; text-transform: capitalize;">' + typeof escapeHtml === 'function' ? escapeHtml(word) : word + '</h3>';
            if (phonetic) {
                html += '<span style="color: #555; font-size: 0.95em; font-style: italic;">' + (typeof escapeHtml === 'function' ? escapeHtml(phonetic) : phonetic) + '</span>';
            }
            html += '</div>';

            // Loop meanings up to a readable maximum limit
            var maxMeanings = Math.min(entry.meanings.length, 3);
            for (var m = 0; m < maxMeanings; m++) {
                var meaning = entry.meanings[m];
                var partOfSpeech = meaning.partOfSpeech;
                
                html += '<div style="margin-bottom: 12px;">';
                html += '<div style="font-weight: bold; font-style: italic; color: #0277bd; font-size: 0.9em; margin-bottom: 4px;">' + (typeof escapeHtml === 'function' ? escapeHtml(partOfSpeech) : partOfSpeech) + '</div>';
                
                var maxDefs = Math.min(meaning.definitions.length, 2);
                html += '<ol style="margin: 0; padding-left: 20px; color: #333;">';
                for (var d = 0; d < maxDefs; d++) {
                    var defObj = meaning.definitions[d];
                    html += '<li style="margin-bottom: 4px; line-height: 1.4;">';
                    html += (typeof escapeHtml === 'function' ? escapeHtml(defObj.definition) : defObj.definition);
                    if (defObj.example) {
                        html += '<br><span style="color: #666; font-style: italic; font-size: 0.9em;">"' + (typeof escapeHtml === 'function' ? escapeHtml(defObj.example) : defObj.example) + '"</span>';
                    }
                    html += '</li>';
                }
                html += '</ol>';
                html += '</div>';
            }

            html += '</div>';

            container.innerHTML = html;
            container.style.display = 'block';

        } catch (err) {
            console.error("SERP: Dictionary fetch error", err);
            container.style.display = 'none';
        }
    },

    /**
      Determines if a query is "Entity-heavy" (likely to have a Wikipedia page)
      and fetches data if it meets criteria.
     */
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
            
            if (!response.ok) {
                container.style.display = 'none';
                return;
            }

            var data = await response.json();

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
        var ids = ['featuredSnippetContainer', 'knowledgePanelContainer', 'popularProductsContainer', 'dictionaryContainer'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) {
                el.innerHTML = '';
                el.style.display = 'none';
            }
        }
    }
};
