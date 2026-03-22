// frontend_javascript/adaptive-chat.js

window.chatConversationHistory = [];
window.isChatModeActive = false;

function buildChatUI() {
    var chatSection = document.getElementById('chatSection');
    if (!chatSection.innerHTML.trim()) {
        chatSection.innerHTML = `
            <div id="chatContainer" style="background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.8); padding: 15px; display: flex; flex-direction: column; height: 65vh; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <div id="chatMessages" style="flex: 1; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; padding-right: 10px; margin-bottom: 15px;">
                    <div style="text-align: center; font-size: 12px; color: #966; margin-bottom: 10px;">Chatting with Praterich</div>
                </div>
                <div class="chat-input-area" style="display: flex; gap: 10px; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border: 1px solid #b3e5fc;">
                    <input type="text" id="chatInputBox" placeholder="Reply to Praterich..." style="flex: 1; border: none; background: transparent; outline: none; padding: 5px 10px; font-size: 15px;">
                    <button onclick="handleChatSubmit()" class="frutiger-aero-tab" style="margin: 0; padding: 0.5em 1.2em;">Send</button>
                </div>
            </div>
        `;
        
        // Bind enter key
        document.getElementById('chatInputBox').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleChatSubmit();
            }
        });
    }
}

function handleChatSubmit() {
    const input = document.getElementById('chatInputBox');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    
    // Append user message to UI
    appendChatMessage('user', text);
    
    // Show typing indicator
    appendChatMessage('ai', '<span class="ai-overview-loading" style="font-style: italic; color: #0277bd;">Praterich is thinking...</span>', null, null, true);
    
    window.isChatModeActive = true;
    
    // Trigger the global search which feeds fresh results back to the AI
    // We use 'all' so it gathers new links and images for the chat context
    executeSearch(text, 'all', 1);
}

function appendChatMessage(role, text, sources = null, images = null, isTemp = false) {
    const container = document.getElementById('chatMessages');
    
    // Remove old temp loading message if appending a real response
    if (!isTemp) {
        const oldTemp = document.getElementById('tempChatMsg');
        if (oldTemp) oldTemp.remove();
    }
    
    const msgDiv = document.createElement('div');
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
        msgDiv.innerText = text; // user text is safe
    } else {
        msgDiv.style.alignSelf = 'flex-start';
        msgDiv.style.background = 'rgba(255, 255, 255, 0.95)';
        msgDiv.style.border = '1px solid #e1f5fe';
        msgDiv.style.color = '#202124';
        msgDiv.style.borderBottomLeftRadius = '4px';
        msgDiv.style.boxShadow = '0 3px 8px rgba(0,0,0,0.08)';
        
        let content = text === '<span class="ai-overview-loading" style="font-style: italic; color: #0277bd;">Praterich is thinking...</span>' 
            ? text 
            : (typeof renderMarkdown === 'function' ? renderMarkdown(text) : text);
        
        // --- Append Sources ---
        if (sources && sources.length > 0) {
            content += `
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 0.85em;">
                <strong style="color: #0277bd;">Sources Consulted:</strong>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    ${sources.slice(0, 3).map(s => `<li><a href="${s.url}" target="_blank" style="color: #0288d1; text-decoration: none;">${escapeHtml(s.title)}</a></li>`).join('')}
                </ul>
            </div>`;
        }
        
        // --- Append Images (Image Gallery) ---
        if (images && images.length > 0) {
            content += `
            <div style="margin-top: 10px; font-size: 0.85em;">
                <strong style="color: #0277bd;">Image Gallery:</strong>
                <div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0;">
                    ${images.slice(0, 5).map((img, idx) => `
                        <img src="${img.thumbnail}" onclick="openImageModalFromAll(${idx})" title="${escapeHtml(img.title || '')}" style="height: 60px; width: 60px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #ccc; transition: transform 0.2s;">
                    `).join('')}
                </div>
            </div>`;
        }
        
        msgDiv.innerHTML = content;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function activateAdaptiveChat(userQuery, aiResponseText, webItems) {
    window.isChatModeActive = true;
    
    // Hide standard search elements
    var sectionsToHide = ['allSection', 'linksSection', 'imagesSection', 'videosSection', 'aiOverview', 'toolContainer'];
    sectionsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Show chat section
    const chatSection = document.getElementById('chatSection');
    if (chatSection) {
        chatSection.style.display = 'block';
    }
    
    buildChatUI();
    
    // Remove temporary loading message if present
    const tempMsg = document.getElementById('tempChatMsg');
    if (tempMsg) tempMsg.remove();
    
    const msgContainer = document.getElementById('chatMessages');
    
    // If this is a fresh transition into chat from the top search bar, append the user's initial query visually
    if (msgContainer.children.length <= 1) { // 1 because of the "Chatting with Praterich" label
        appendChatMessage('user', userQuery);
    } else {
        // Check if the last message was already the user's query (to prevent duplicates if they used the chat input)
        const lastMsg = msgContainer.lastElementChild;
        if (lastMsg && lastMsg.style.alignSelf !== 'flex-end') {
             appendChatMessage('user', userQuery);
        }
    }
    
    // Determine sources and images to attach
    var sources = webItems || [];
    var images = typeof allTabImagesCache !== 'undefined' ? allTabImagesCache : [];
    
    // Append the AI's response
    appendChatMessage('ai', aiResponseText, sources, images);
}
