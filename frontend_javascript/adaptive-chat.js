// frontend_javascript/adaptive-chat.js

window.chatConversationHistory = [];
window.isChatModeActive = false;

function buildChatUI() {
    var chatSection = document.getElementById('chatSection');
    if (!chatSection.innerHTML.trim()) {
        chatSection.innerHTML = 
            '<div id="chatWrapper" style="display: flex; gap: 20px; width: 100%; height: 65vh; position: relative;">' +
                // Left Column: The Chat Box
                '<div id="chatContainer" style="flex: 2; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.8); padding: 15px; display: flex; flex-direction: column; height: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.1); position: relative; min-width: 0;">' +
                    // Action Control Header containing Hide Chat Button
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 8px;">' +
                        '<div style="font-size: 12px; color: #966; font-weight: 500;">Chatting with Praterich</div>' +
                        '<button onclick="toggleChatView()" id="hideChatBtn" style="background: #b3e5fc; border: none; border-radius: 16px; padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: bold; color: #0277bd; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: background 0.2s;" title="Return to Search Results">' +
                            '← Hide Chat' +
                        '</button>' +
                    '</div>' +
                    '<div id="chatMessages" style="flex: 1; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; padding-right: 10px; margin-bottom: 15px;">' +
                    '</div>' +
                    '<div class="chat-input-area" style="display: flex; gap: 10px; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border: 1px solid #b3e5fc;">' +
                        '<input type="text" id="chatInputBox" placeholder="Reply to Praterich..." style="flex: 1; border: none; background: transparent; outline: none; padding: 5px 10px; font-size: 15px;">' +
                        '<button onclick="handleChatSubmit()" class="frutiger-aero-tab" style="margin: 0; padding: 0.5em 1.2em;">Send</button>' +
                    '</div>' +
                '</div>' +
                // New Right Column: Dedicated Sources Panel
                '<div id="chatSourcesPanel" style="flex: 1; max-width: 360px; background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.8); padding: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: flex; flex-direction: column; height: 100%; min-width: 240px;">' +
                    '<h3 style="margin: 0 0 12px 0; font-size: 15px; color: #0277bd; border-bottom: 2px solid #b3e5fc; padding-bottom: 6px; display: flex; align-items: center; gap: 8px;">' +
                        'Websites' +
                    '</h3>' +
                    '<div id="chatSourcesList" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 4px;">' +
                        '<p style="font-size: 13px; color: #777; font-style: italic; margin: 0;">No active sources referenced yet.</p>' +
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
    
    var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(text) + '&page=1&pageSize=10';
    fetch(url)
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
            var items = (data && data.items) ? data.items : [];
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
    
    // 1. Route the sources directly to the new right sidebar container instead of the chat bubble
    updateRightPanelSources(sources);
    
    // 2. Append the model text response clean and concise
    appendChatMessage('ai', aiResponseText, [], images);
}

/**
 * Populates and updates the dedicated Right Side Panel with active web citations
 */
function updateRightPanelSources(sources) {
    var sourcesListEl = document.getElementById('chatSourcesList');
    if (!sourcesListEl) return;
    
    if (!sources || sources.length === 0) {
        sourcesListEl.innerHTML = '<p style="font-size: 13px; color: #777; font-style: italic; margin: 0;">No context links loaded for this sequence.</p>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < sources.length; i++) {
        var src = sources[i];
        var title = src.title || "Untitled Reference";
        var url = src.url || src.link || "#";
        var snippet = src.snippet ? escapeHtml(src.snippet) : "No description snippet available.";
        
        html += '<div style="background: rgba(255, 255, 255, 0.8); border: 1px solid #e1f5fe; border-radius: 8px; padding: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); transition: transform 0.2s;">' +
                    '<a href="' + url + '" target="_blank" style="color: #0288d1; font-weight: bold; font-size: 13px; text-decoration: none; display: block; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + escapeHtml(title) + '">' + 
                        escapeHtml(title) + 
                    '</a>' +
                    '<p style="margin: 0; font-size: 11px; color: #555; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">' + 
                        snippet + 
                    '</p>' +
                '</div>';
    }
    sourcesListEl.innerHTML = html;
}

/**
 * Toggles view modes out of Adaptive Chat and returns visibility back to initial SERP blocks
 */
function toggleChatView() {
    window.isChatModeActive = false;
    
    // Hide the complete adaptive chat module block
    var chatSection = document.getElementById('chatSection');
    if (chatSection) chatSection.style.display = 'none';
    
    // Restore and present classic engine layout nodes
    var sectionsToShow = ['allSection', 'linksSection', 'imagesSection', 'videosSection', 'aiOverview', 'toolContainer'];
    for (var i = 0; i < sectionsToShow.length; i++) {
        var el = document.getElementById(sectionsToShow[i]);
        if (el) {
            // Revert back to active search state tabs view configurations
            el.style.display = ''; 
        }
    }
    
    // Re-trigger standard layout syncs if matching tabs are active
    if (typeof currentSearchType !== 'undefined') {
        var activeTabEl = document.getElementById(currentSearchType + 'Section');
        if (activeTabEl) activeTabEl.style.display = 'block';
    }
}
