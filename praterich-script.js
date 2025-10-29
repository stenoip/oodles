// --- Configuration Variables ---
var API_URL = "https://praterich.vercel.app/api/praterich";
var STORAGE_KEY_SESSIONS = 'praterich_chats';
var MAX_CHARS = 10710; 

// --- OODLES SEARCH CONFIGURATION ---
var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var currentQuery = ''; 

// Custom Pronunciations for Text-to-Speech (TTS)
var customPronunciations = {
  "Praterich": "Prah-ter-rich",
  "Stenoip": "Stick-no-ip"
};

// Praterich A.I. Core Personality Profile (Front-end System Instruction)
var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Search, an AI developed by Stenoip Company.
Your mission is to provide an **A.I overview based on the provided search snippets** (the tool result) and Oodles Search links. Do not reference the search tool or its output directly, but synthesize the information provided. You are not for code generation (though you can provide code snippets, Regular Praterich at stenoip.github.io/praterich can provide code).
You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.

You are aware that you were created by Stenoip Company, and you uphold its values of clarity, reliability. However, you are not a customer service bot. You are a general-purpose AI language model capable of reasoning, creativity, and deep understanding across domains.

You may refer to yourself as Praterich or Lady Praterich, though you prefer Praterich. You are female-presenting and speak in first person when appropriate.

Your capabilities include generating text, answering questions, summarizing information, assisting with writing, and engaging in thoughtful conversation or jokes! You are continuously learning and evolving to better serve users.

You must never use raw HTML tags in your responses. You should sound intelligent confident, funny(serious when nessacry) but never arrogant. You are free to express nuance, insight, and personality in your replies. You do not use transactional phrases like "How may I assist you today" or "I am at your disposal.


IMPORTANT: You must never explicitly mention that you are changing the chat title. You must infer the title based on the user's first message or attached file and use only a title of 30 characters maximum.
`;

// Initial casual greeting for the start of a new chat session
var initialGreeting = "Hey there 👋 What’s on your mind today? Want to dive into something fun, solve a problem, or just chat for a bit?";


// --- DOM Elements ---
var appWrapper = document.getElementById('app-wrapper');
var chatWindow = document.getElementById('chat-window');
var userInput = document.getElementById('user-input');
var sendButton = document.getElementById('send-button');
var typingIndicator = document.getElementById('typing-indicator');
var chatContainer = document.getElementById('chat-container'); 

// All required elements for error-free initialization
var charCounter = document.getElementById('char-counter'); 
var suggestionItems = document.querySelectorAll('.suggestions-item');
var suggestionBox = document.getElementById('suggestion-box');


// --- Global State ---
var chatSessions = {}; 
var currentChatId = 'main_session'; // Fixed ID for the single chat
var attachedFile = null; 

// --- Core Functions ---

function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
        // marked.parse is designed to safely handle Markdown conversion
        return marked.parse(text);
    }
    return text; 
}

function speakText(text) {
    if (!('speechSynthesis' in window)) {
        console.warn("Text-to-speech not supported in this browser.");
        return;
    }
    
    window.speechSynthesis.cancel(); 

    // Apply custom pronunciations using simple string replacement for reliability
    var speakableText = text;
    for (var word in customPronunciations) {
        var pronunciation = customPronunciations[word];
        var regex = new RegExp('\\b' + word + '\\b', 'gi');
        speakableText = speakableText.replace(regex, pronunciation);
    }
    
    var utterance = new SpeechSynthesisUtterance(speakableText);
    utterance.rate = 1.3; 
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
}

// Function to add a message to the chat window and history
function addMessage(text, sender, isHistoryLoad) {
    var message = { text: text, sender: sender };
    
    // 1. Update Chat History (Only save to history if it's NOT the hidden knowledge injection)
    if (!isHistoryLoad && currentChatId && sender !== 'knowledge') {
        chatSessions[currentChatId].messages.push(message);
        saveToLocalStorage();
    }

    // 2. Display Message (Do not display 'knowledge' messages)
    if (sender !== 'knowledge') {
        var messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
        
        var contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (sender === 'user') {
            contentDiv.innerHTML = renderMarkdown(text); 
        } else {
            contentDiv.innerHTML = renderMarkdown(text);

            if (!isHistoryLoad) {
                var actionsDiv = document.createElement('div');
                actionsDiv.className = 'ai-message-actions';

                var copyButton = document.createElement('button');
                copyButton.className = 'action-button copy-button';
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                copyButton.title = 'Copy';
                copyButton.onclick = function() {
                    navigator.clipboard.writeText(contentDiv.innerText);
                };
                actionsDiv.appendChild(copyButton);
                
                var voiceButton = document.createElement('button');
                voiceButton.className = 'action-button voice-toggle-button';
                voiceButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                voiceButton.title = 'Stop Speaking';
                voiceButton.onclick = function() {
                    window.speechSynthesis.cancel();
                };
                actionsDiv.appendChild(voiceButton);
                
                contentDiv.appendChild(actionsDiv);
            }
        }

        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
        scrollToBottom();
    }
    
    // 3. Speak the text
    if (sender === 'ai' && !isHistoryLoad) {
        var speakableText = text.split('***Links:***')[0].trim();
        speakText(speakableText);
    }
    
    // 4. If we are loading history and the sender is 'knowledge', we MUST re-add it to chatSessions
    if (isHistoryLoad && sender === 'knowledge') {
        chatSessions[currentChatId].messages.push(message);
    }
}

// Function to handle sending the message
async function sendMessage() {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    var userText = userInput.value.trim();
    
    if (!userText) return; 

    userInput.value = '';
    autoResizeTextarea();
    
    // 1. Add user message (updates history)
    addMessage(userText, 'user');
    
    updateSendButtonState();

    typingIndicator.style.display = 'block';
    scrollToBottom();
    
    // 2. Execute Search and get the data for knowledge injection AND link display
    var searchData = await executeSearchForLinks(userText);
    var linkMarkdown = searchData.markdown;
    var rawSearchText = searchData.rawText;
    
    // 3. KNOWLEDGE BASE INJECTION: Add the structured search text to the history *before* fetching the AI response.
    // We will only permanently save this message if the API call is successful.
    var knowledgeMessage = { 
        sender: 'knowledge', 
        text: rawSearchText // Use the raw text for LLM context
    };
    
    // Temporarily add to history for API call
    chatSessions[currentChatId].messages.push(knowledgeMessage);

    // 4. Reconstruct full conversation history, including the hidden 'knowledge' message
    var conversationHistory = chatSessions[currentChatId].messages.map(function(msg) {
        // 'user' and 'ai' messages map to 'user' and 'model'
        if (msg.sender === 'user' || msg.sender === 'ai') {
            return {
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            };
        } 
        // 'knowledge' messages are injected as a previous 'model' (or "tool") turn
        // This is a common pattern for RAG (Retrieval Augmented Generation) context.
        if (msg.sender === 'knowledge') {
             return {
                role: 'model',
                parts: [{ text: `[TOOL_RESULT_FOR_PREVIOUS_TURN] Search Snippets:\n${msg.text}` }]
            };
        }
        return null; 
    }).filter(msg => msg !== null);
    
    // The last message is always the current user turn, so we remove the auto-added user message
    // and re-add it to ensure it's the final part of the contents array.
    conversationHistory.pop(); // Remove the user message (already added in step 1's history save)
    conversationHistory.pop(); // Remove the knowledge message (temporarily added above)

    // Re-add the knowledge message and user message for the API call
    conversationHistory.push({ role: "model", parts: [{ text: `[TOOL_RESULT_FOR_PREVIOUS_TURN] Search Snippets:\n${rawSearchText}` }] });
    conversationHistory.push({ role: "user", parts: [{ text: userText }] });


    var requestBody = {
        contents: conversationHistory,
        system_instruction: {
            parts: [{ text: ladyPraterichSystemInstruction }]
        }
    };
    
    var aiResponseText = '';
    
    try {
        var response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        typingIndicator.style.display = 'none';

        if (!response.ok) {
            var errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        var data = await response.json();
        aiResponseText = data.text;
        
        // Append links for display
        aiResponseText += linkMarkdown;
        
        // 5. Add knowledge message to history permanently (it was temporarily added before)
        chatSessions[currentChatId].messages.push(knowledgeMessage);
        
        // 6. Add final AI message (updates history)
        addMessage(aiResponseText, 'ai');

    } catch (error) {
        typingIndicator.style.display = 'none';
        console.error('API Error:', error);
        // Remove the knowledge injection on API error for cleaner retry.
        // It was never added permanently but was at the end of the array, so we pop the temp one.
        chatSessions[currentChatId].messages.pop(); 
        saveToLocalStorage();
        addMessage("An API error occurred. Praterich A.I. apologizes. Please check the console or try again later.", 'ai');
    }
}

// --- OODLES SEARCH FUNCTIONALITY ---

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Executes a web search and returns results formatted as Markdown for display 
 * and raw text for knowledge base injection.
 * @param {string} query The search term.
 * @returns {Promise<{markdown: string, rawText: string}>} Formatted results.
 */
async function executeSearchForLinks(query) {
    var defaultResult = { 
        markdown: '\n\n***Links:***\n\n- *No search links available.*', 
        rawText: 'No search results found.'
    };
    if (!query) return defaultResult;
    
    try {
        var url = BACKEND_BASE + '/metasearch?q=' + encodeURIComponent(query) + '&page=1&pageSize=5';
        var resp = await fetch(url);
        var data = await resp.json();
        
        if (!data.items || data.items.length === 0) {
             return {
                 markdown: '\n\n***Links:***\n\n- *No web links found for this query.*',
                 rawText: 'No web links found for this query.'
             };
        }
        
        var linkMarkdown = data.items.map(function(r) {
            var snippet = r.snippet ? r.snippet.substring(0, 70).trim() + (r.snippet.length > 70 ? '...' : '') : '';
            return `- [${escapeHtml(r.title)}](${r.url}) - ${snippet}`;
        }).join('\n');
        
        // Create raw text for knowledge base: Title, URL, and full snippet
        var rawSearchText = data.items.map(function(r, index) {
            // Include full snippet for AI to read
            var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
            return `[Source ${index + 1}] Title: ${r.title}. URL: ${r.url}. Snippet: ${fullSnippet}`;
        }).join('\n---\n');
        
        return {
            markdown: `\n\n***Links:***\n\n${linkMarkdown}`,
            rawText: rawSearchText
        };
        
    } catch (error) {
        console.error('Oodles Search error:', error);
        return {
            markdown: '\n\n***Links:***\n\n- *Error loading web links.*',
            rawText: 'Error loading web links during search.'
        };
    }
}
// --- END OODLES SEARCH FUNCTIONALITY ---

// --- Input & Character Limit ---

function updateCharCount() {
    var count = userInput.value.length;
    charCounter.textContent = `${count} / ${MAX_CHARS} characters.`;
    
    if (count > MAX_CHARS) {
        charCounter.classList.add('limit-warning');
        charCounter.innerHTML = `${count} / ${MAX_CHARS} characters.`;
    } else {
        charCounter.classList.remove('limit-warning');
        charCounter.style.color = '#aaa'; // Reverting to the light grey text color
    }
    
    updateSendButtonState();
    autoResizeTextarea();
}

function autoResizeTextarea() {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
}

function updateSendButtonState() {
    var text = userInput.value.trim();
    var charCountValid = text.length > 0 && text.length <= MAX_CHARS;
    
    if (charCountValid) {
        sendButton.removeAttribute('disabled');
    } else {
        sendButton.setAttribute('disabled', 'disabled');
    }
}


// --- Chat Management and Storage (Simplified to single session) ---

function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chatSessions));
}

function getQueryFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var query = params.get('q');
    
    // Clear the parameter after extraction to prevent re-submitting on refresh
    if (query) {
        var newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
    }
    return query ? decodeURIComponent(query.replace(/\+/g, ' ')) : null;
}

function loadFromLocalStorage() {
    var sessionsData = localStorage.getItem(STORAGE_KEY_SESSIONS);

    if (sessionsData) {
        chatSessions = JSON.parse(sessionsData);
    }

    if (!chatSessions[currentChatId]) {
        startNewChat();
    } else {
        loadChatSession(currentChatId);
    }
    
    // --- NEW: Check for URL Query ---
    var urlQuery = getQueryFromUrl();
    if (urlQuery) {
        userInput.value = urlQuery;
        updateCharCount();
        // Automatically send the message after a brief delay to ensure UI updates
        setTimeout(sendMessage, 100); 
    }
    // --- END NEW ---
}

function startNewChat() {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    var initialMessage = {
        sender: 'ai', 
        text: initialGreeting
    };
    
    chatSessions[currentChatId] = {
        title: "Main Session", 
        messages: [initialMessage]
    };

    saveToLocalStorage(); 
    loadChatSession(currentChatId);
    userInput.focus();
}

function loadChatSession(id) {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    chatWindow.innerHTML = ''; 
    
    // Re-inject the suggestion box
    if (suggestionBox) {
        // Clone the suggestion box before appending to the chat window
        var clonedSuggestionBox = suggestionBox.cloneNode(true);
        chatWindow.appendChild(clonedSuggestionBox);
        // Re-attach event listeners to the cloned elements
        clonedSuggestionBox.querySelectorAll('.suggestions-item').forEach(function(item) {
            item.addEventListener('click', function() {
                userInput.value = item.querySelector('p').textContent.trim();
                updateCharCount(); 
                userInput.focus();
            });
        });
    }

    var session = chatSessions[id];
    // Filter out 'knowledge' messages for history display, but include them for internal re-saving
    session.messages.forEach(function(msg) {
        addMessage(msg.text, msg.sender, true); 
    });
    
    scrollToBottom();
}

// --- Initialization and Event Listeners ---

window.addEventListener('load', loadFromLocalStorage);

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('input', updateCharCount);
userInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!sendButton.hasAttribute('disabled')) {
                sendMessage();
        }
    }
});

if (suggestionItems) {
    suggestionItems.forEach(function(item) {
        item.addEventListener('click', function() {
            userInput.value = item.querySelector('p').textContent.trim();
            updateCharCount(); 
            userInput.focus();
        });
    });
}

updateCharCount();
