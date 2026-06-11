// frontend_javascript/adaptive-chat.js

window.chatConversationHistory = [];
window.isChatModeActive = false;

function buildChatUI() {
    var chatSection = document.getElementById('chatSection');
    if (!chatSection.innerHTML.trim()) {
        chatSection.innerHTML = 
            '<div id="chatWrapper" style="display: flex; gap: 20px; width: 100%; height: 65vh; position: relative;">' +
                /* Left Column: The Interactive Chat Workspace */
                '<div id="chatContainer" style="flex: 2; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.8); padding: 15px; display: flex; flex-direction: column; height: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.1); position: relative; min-width: 0;">' +
                    /* Action Control Header containing Hide Chat Button */
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 8px;">' +
                        '<div style="font-size: 12px; color: #966; font-weight: 500;">Chatting with Praterich</div>' +
                        '<button onclick="toggleChatView()" id="hideChatBtn" style="background: #b3e5fc; border: none; border-radius: 16px; padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: bold; color: #0277bd; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: background 0.2s;" title="Return to Search Results">' +
                            '<- Hide Chat' +
                        '</button>' +
                    '</div>' +
                    '<div id="chatMessages" style="flex: 1; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; padding-right: 10px; margin-bottom: 15px;">' +
                    '</div>' +
                    '<div class="chat-input-area" style="display: flex; gap: 10px; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border: 1px solid #b3e5fc;">' +
                        '<input type="text" id="chatInputBox" placeholder="Reply to Praterich..." style="flex: 1; border: none; background: transparent; outline: none; padding: 5px 10px; font-size: 15px;">' +
                        '<button onclick="handleChatSubmit()" class="frutiger-aero-tab" style="margin: 0; padding: 0.5em 1.2em;">Send</button>' +
                    '</div>' +
                '</div>' +
             
                '<div id="chatSourcesPanel" style="flex: 1; max-width: 360px; display: flex; flex-direction: column; height: 100%; min-width: 500px;">' +
                    '<h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 500; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 10px;">' +
                        'Consulted Sources' +
                    '</h3>' +
                    '<div id="chatSourcesList" style="flex: 1; overflow-y: auto; padding-right: 4px;">' +
                        '<p class="small" style="font-style: italic; margin: 0;">No links.</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        
        document.getElementById('chatInputBox').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleChatSubmit();
            }
        });
    }
}

function handleChatSubmit() {
    var input = document.getElementById('chatInputBox');
    var text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    
    appendChatMessage('user', text);
    appendChatMessage('ai', '<span class="ai-overview-loading" style="font-style: italic; color: #0277bd;">Praterich is thinking...</span>', null, null, true);
    
    window.isChatModeActive = true;
    
    var isSearchQuery = typeof determineQueryMode === 'function' ? determineQueryMode(text) === 'search' : false;
    if (isSearchQuery) {
        updateChatIndicator('Praterich is searching the web for: "' + escapeHtml(text) + '"...');
    }
    
    var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(text) + '&page=1&pageSize=10';
    fetch(url)
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
            var items = (data && data.items) ? data.items : [];
            updateChatIndicator("Praterich is analyzing the search findings...");
            if (typeof processAIResults === 'function') {
                processAIResults(text, items);
            }
        })
        .catch(function(error) {
            console.error('Chat context background retrieval error:', error);
            if (typeof processAIResults === 'function') {
                processAIResults(text, []);
            }
        });
}

function appendChatMessage(role, text, sources, images, isTemp) {
    var container = document.getElementById('chatMessages');
    
    if (!isTemp) {
        var oldTemp = document.getElementById('tempChatMsg');
        if (oldTemp) oldTemp.parentNode.removeChild(oldTemp);
    }
    
    var msgDiv = document.createElement('div');
    msgDiv.style.maxWidth = '85%';
    msgDiv.style.padding = '12px 16px';
    msgDiv.style.borderRadius = '18px';
    msgDiv.style.lineHeight = '1.5';
    msgDiv.style.animation = 'fadeIn 0.3s ease';
    
    if (isTemp) msgDiv.id = 'tempChatMsg';

    if (role === 'user') {
        msgDiv.style.alignSelf = 'flex-end';
        msgDiv.style.background = 'linear-gradient(to bottom, #81d4fa, #29b6f6)';
        msgDiv.style.color = 'white';
        msgDiv.style.borderBottomRightRadius = '4px';
        msgDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
        msgDiv.innerText = text;
    } else {
        msgDiv.style.alignSelf = 'flex-start';
        msgDiv.style.background = 'rgba(255, 255, 255, 0.95)';
        msgDiv.style.border = '1px solid #e1f5fe';
        msgDiv.style.color = '#202124';
        msgDiv.style.borderBottomLeftRadius = '4px';
        msgDiv.style.boxShadow = '0 3px 8px rgba(0,0,0,0.08)';
        
        var content = text === '<span class="ai-overview-loading" style="font-style: italic; color: #0277bd;">Praterich is thinking...</span>' 
            ? text 
            : (typeof renderMarkdown === 'function' ? renderMarkdown(text) : text);
        
        if (images && images.length > 0) {
            var imagesHtml = '';
            var slicedImages = images.slice(0, 5);
            for (var j = 0; j < slicedImages.length; j++) {
                var img = slicedImages[j];
                imagesHtml += '<img src="' + img.thumbnail + '" onclick="openImageModalFromAll(' + j + ')" title="' + escapeHtml(img.title || '') + '" style="height: 60px; width: 60px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #ccc; transition: transform 0.2s; margin-right: 8px;">';
            }
            content += '<div style="margin-top: 10px; font-size: 0.85em;">' +
                       '<strong style="color: #0277bd;">Image Gallery:</strong>' +
                       '<div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0;">' +
                       imagesHtml +
                       '</div>' +
                       '</div>';
        }
        
        msgDiv.innerHTML = content;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function activateAdaptiveChat(userQuery, aiResponseText, webItems) {
    window.isChatModeActive = true;
    
    var sectionsToHide = ['allSection', 'linksSection', 'imagesSection', 'videosSection', 'aiOverview', 'toolContainer'];
    for (var i = 0; i < sectionsToHide.length; i++) {
        var el = document.getElementById(sectionsToHide[i]);
        if (el) el.style.display = 'none';
    }
    
    var chatSection = document.getElementById('chatSection');
    if (chatSection) {
        chatSection.style.display = 'block';
    }
    
    buildChatUI();
    
    var tempMsg = document.getElementById('tempChatMsg');
    if (tempMsg) tempMsg.parentNode.removeChild(tempMsg);
    
    var msgContainer = document.getElementById('chatMessages');
    
    if (msgContainer.children.length <= 1) { 
        appendChatMessage('user', userQuery);
    } else {
        var lastMsg = msgContainer.lastElementChild;
        if (lastMsg && lastMsg.style.alignSelf !== 'flex-end') {
             appendChatMessage('user', userQuery);
        }
    }
    
    var sources = webItems || [];
    var images = typeof allTabImagesCache !== 'undefined' ? allTabImagesCache : [];
    
    updateRightPanelSources(sources);
    appendChatMessage('ai', aiResponseText, [], images);
}

function updateRightPanelSources(sources) {
    var sourcesListEl = document.getElementById('chatSourcesList');
    if (!sourcesListEl) return;
    
    if (!sources || sources.length === 0) {
        sourcesListEl.innerHTML = '<p class="small" style="font-style: italic; margin: 0;">No active sources referenced yet.</p>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < sources.length; i++) {
        var src = sources[i];
        var title = src.title || "Untitled Reference";
        var url = src.url || src.link || "#";
        var snippet = src.snippet ? escapeHtml(src.snippet) : "No description snippet available.";
        
        html += '<div class="result-block">' +
                    '<div style="margin-bottom: 4px;">' +
                        '<a href="' + url + '" target="_blank" title="' + escapeHtml(title) + '" style="display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">' + 
                            escapeHtml(title) + 
                        '</a>' +
                    '</div>' +
                    '<div class="small" style="line-height: 1.4; max-height: 3.6em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">' + 
                        snippet + 
                    '</div>' +
                '</div>';
    }
    sourcesListEl.innerHTML = html;
}

function updateChatIndicator(htmlContent) {
    var tempMsg = document.getElementById('tempChatMsg');
    if (tempMsg) {
        var loadingSpan = tempMsg.querySelector('.ai-overview-loading');
        if (loadingSpan) {
            loadingSpan.innerHTML = htmlContent;
        } else {
            tempMsg.innerHTML = '<span class="ai-overview-loading" style="font-style: italic; color: #0277bd;">' + htmlContent + '</span>';
        }
    }
}

function toggleChatView() {
    window.isChatModeActive = false;
    
    var chatSection = document.getElementById('chatSection');
    if (chatSection) chatSection.style.display = 'none';
    
    var sectionsToShow = ['allSection', 'linksSection', 'imagesSection', 'videosSection', 'aiOverview', 'toolContainer'];
    for (var i = 0; i < sectionsToShow.length; i++) {
        var el = document.getElementById(sectionsToShow[i]);
        if (el) {
            el.style.display = ''; 
        }
    }
    
    if (typeof currentSearchType !== 'undefined') {
        var activeTabEl = document.getElementById(currentSearchType + 'Section');
        if (activeTabEl) activeTabEl.style.display = 'block';
    }
}
