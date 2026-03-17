// frontend_javascript/adaptive-chat.js


 // Transforms the standard results UI into a Chat-centric interface.

function initiateAdaptiveChat(query, aiResponse, searchItems) {
    const mainContainer = document.querySelector('.container');
    const sectionsToHide = ['allSection', 'linksSection', 'imagesSection', 'videosSection', 'aiOverview'];
    
    // Hide all standard search UI
    sectionsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    let chatWrapper = document.getElementById('adaptiveChatWrapper');
    if (!chatWrapper) {
        chatWrapper = document.createElement('div');
        chatWrapper.id = 'adaptiveChatWrapper';
        chatWrapper.className = 'glass-panel'; // Keeping the Frutiger Aero aesthetic
        chatWrapper.style.margin = '20px 0';
        chatWrapper.style.padding = '25px';
        mainContainer.appendChild(chatWrapper);
    }

    // Clean the AI response of tags
    const cleanAiText = aiResponse.replace(/@@.*?@@/g, '').trim();

    chatWrapper.innerHTML = `
        <div class="chat-bubble user-bubble">${escapeHtml(query)}</div>

        <div class="chat-bubble praterich-bubble">
            <div class="praterich-header">
                <img src="https://stenoip.github.io/praterich/praterich.png" class="praterich-avatar">
                <strong>Praterich</strong>
            </div>
            <div class="chat-content">
                ${renderMarkdown(cleanAiText)}
            </div>
            
            <div class="chat-carousel">
                ${renderChatCarousel(searchItems)}
            </div>
        </div>
    `;
}


function appendChatMessage(sender, text, items = null) {
    var chatContainer = document.getElementById('adaptiveChatContainer');
    var bubble = document.createElement('div');
    bubble.style.marginBottom = '20px';
    bubble.style.display = 'flex';
    bubble.style.gap = '12px';
    bubble.style.flexDirection = sender === 'user' ? 'row-reverse' : 'row';

    var iconHtml = sender === 'praterich' 
        ? `<img src="https://stenoip.github.io/praterich/praterich.png" style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid #81d4fa; background: white;">`
        : `<div style="width: 40px; height: 40px; border-radius: 50%; background: #0288d1; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">U</div>`;

    var cleanText = text.replace(/@@RANKING:\[.*?\]@@/g, '').replace(/@@TOOL:\[.*?\]@@/g, '').replace(/@@RESEARCH:\[.*?\]@@/g, '');

    bubble.innerHTML = `
        ${iconHtml}
        <div style="max-width: 80%; padding: 15px; border-radius: 15px; background: ${sender === 'user' ? '#e3f2fd' : 'rgba(255,255,255,0.9)'}; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 1px solid rgba(0,0,0,0.05);">
            <div class="chat-text">${renderMarkdown(cleanText)}</div>
            ${items ? renderChatCarousel(items) : ''}
        </div>
    `;
    
    chatContainer.appendChild(bubble);
}


//  Renders a horizontal carousel of search results inside the chat bubble.

function renderChatCarousel(items) {
    if (!items || items.length === 0) return '';
    return `
        <div class="carousel-track">
            ${items.slice(0, 4).map(item => `
                <a href="${item.url}" target="_blank" class="carousel-card">
                    <span class="carousel-title">${escapeHtml(item.title)}</span>
                    <span class="carousel-url">${new URL(item.url).hostname}</span>
                </a>
            `).join('')}
        </div>
    `;
}
