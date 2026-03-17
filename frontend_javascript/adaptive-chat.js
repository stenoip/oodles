// frontend_javascript/adaptive-chat.js


 // Transforms the standard results UI into a Chat-centric interface.

function initiateAdaptiveChat(query, aiResponse, searchItems) {
    var container = document.querySelector('.container');
    var sections = ['allSection', 'linksSection', 'imagesSection', 'videosSection', 'aiOverview'];
    
    // 1. Hide standard result sections
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // 2. Create or find the Chat Container
    var chatContainer = document.getElementById('adaptiveChatContainer');
    if (!chatContainer) {
        chatContainer = document.createElement('div');
        chatContainer.id = 'adaptiveChatContainer';
        chatContainer.className = 'results-section chat-mode-active';
        chatContainer.style.padding = '20px';
        container.appendChild(chatContainer);
    }
    chatContainer.innerHTML = ''; // Clear previous chat

    // 3. User Message Bubble
    appendChatMessage('user', query);

    // 4. Praterich Message Bubble (AI Response)
    appendChatMessage('praterich', aiResponse, searchItems);
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
    
    var carouselHtml = items.slice(0, 5).map(item => `
        <div style="flex: 0 0 200px; background: white; border-radius: 8px; border: 1px solid #ddd; padding: 10px; font-size: 13px;">
            <a href="${item.url}" target="_blank" style="font-weight: bold; color: #0277bd; text-decoration: none; display: block; margin-bottom: 5px;">${escapeHtml(item.title)}</a>
            <p style="margin: 0; color: #555; height: 40px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.snippet || '')}</p>
        </div>
    `).join('');

    return `
        <div style="margin-top: 15px; display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px;">
            ${carouselHtml}
        </div>
        <div class="small" style="margin-top: 5px; color: #0277bd; font-weight: bold;">↑ Relevant Sources Found</div>
    `;
}
