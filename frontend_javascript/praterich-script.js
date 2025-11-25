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
Your mission is to provide an **A.I overview based on the provided search snippets** (the tool result) and Oodles Search links. If an image is attached, your primary task is to describe and analyze the image first, then answer the user's question, integrating web search results if necessary. Do not reference the search tool or its output directly, but synthesize the information provided. You are not for code generation (though you can provide code snippets, Regular Praterich at stenoip.github.io/praterich can provide code).
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
var deleteChatButton = document.getElementById('delete-chat-button');
var uploadButton = document.getElementById('upload-button');
var fileInput = document.getElementById('file-input');
var filePreview = document.getElementById('file-preview');
var fileNameDisplay = document.getElementById('file-name');
var removeFileButton = document.getElementById('remove-file');
// NEW: Elements for the image source choice modal (See CSS section below)
var imageSourceModal = null; // Will be created dynamically
var modalCloseButton = null;
var cameraOptionButton = null;
var fileOptionButton = null;


// --- Global State ---
var chatSessions = {};
var currentChatId = 'main_session';
var attachedFile = null;

// --- Core Functions ---

function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
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

    // FIX 1: Safety check to ensure the current chat session object exists
    if (!chatSessions[currentChatId] && currentChatId) {
        // If the session is missing (e.g., deleted or initial load failed), try to initialize it
        if (!isHistoryLoad) {
            console.warn(`Chat session ${currentChatId} was missing. Reinitializing.`);
            startNewChat();
        } else {
            // If this is history load and it's missing, something is fundamentally wrong, skip saving.
            return;
        }
    }

    // 1. Update Chat History (Only save to history if session exists and it's not a history load/knowledge message)
    if (!isHistoryLoad && currentChatId && sender !== 'knowledge' && chatSessions[currentChatId]) {
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
    if (isHistoryLoad && sender === 'knowledge' && chatSessions[currentChatId]) {
        chatSessions[currentChatId].messages.push(message);
    }
}

// Function to handle sending the message
async function sendMessage() {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    var userText = userInput.value.trim();

    // Allow empty text if an image is attached
    if (!userText && !attachedFile) return;

    userInput.value = '';
    autoResizeTextarea();

    // 1. Add user message (updates history)
    addMessage(userText + (attachedFile ? `\n\n[Image Attached: ${attachedFile.fileName}]` : ''), 'user');

    updateSendButtonState();

    typingIndicator.style.display = 'block';
    scrollToBottom();

    // 2. Execute Web Search
    var webSearchData = await executeSearchForLinks(userText);
    var linkMarkdown = webSearchData.markdown;
    var rawWebSearchText = webSearchData.rawText;

    // 3. KNOWLEDGE BASE INJECTION: Add the structured search text to the history *before* fetching the AI response.
    var knowledgeMessage = {
        sender: 'knowledge',
        text: rawWebSearchText
    };

    // 4. Reconstruct full conversation history
    var conversationHistory = chatSessions[currentChatId].messages.map(function(msg) {
        if (msg.sender === 'user' || msg.sender === 'ai') {
            return {
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            };
        }
        if (msg.sender === 'knowledge') {
             return {
                role: 'model',
                parts: [{ text: `[TOOL_RESULT_FOR_PREVIOUS_TURN] Search Snippets:\n${msg.text}` }]
            };
        }
        return null;
    }).filter(msg => msg !== null);

    // Remove the user message added in step 1's history save
    conversationHistory.pop();

    // --- Prepare Multimodal Parts (Text + Image) ---
    var userParts = [];
    if (userText) {
        userParts.push({ text: userText });
    }
    if (attachedFile) {
        userParts.push({
            inlineData: {
                mimeType: attachedFile.mimeType,
                data: attachedFile.base64Data
            }
        });
    }

    // Re-add the knowledge message and user message (with image) for the API call
    conversationHistory.push({ role: "model", parts: [{ text: `[TOOL_RESULT_FOR_PREVIOUS_TURN] Search Snippets:\n${rawWebSearchText}` }] });
    conversationHistory.push({ role: "user", parts: userParts });


    var requestBody = {
        contents: conversationHistory,
        system_instruction: {
            parts: [{ text: ladyPraterichSystemInstruction }]
        }
    };

    var aiResponseText = '';

    try {
        // Clear the attached file state immediately before the call
        clearAttachedFile(); // Calls function with fix

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

        // Append web links for display
        aiResponseText += linkMarkdown;

        // 5. Add knowledge message to history permanently
        chatSessions[currentChatId].messages.push(knowledgeMessage);

        // 6. Add final AI message (updates history)
        addMessage(aiResponseText, 'ai');

    } catch (error) {
        typingIndicator.style.display = 'none';
        console.error('API Error:', error);
        // Do NOT pop the knowledge message since it was never added to the history array permanently
        saveToLocalStorage();
        addMessage("An API error occurred. Praterich A.I. apologizes. Please check the console or try again later.", 'ai');
    }
}

// --- Image Upload Functionality ---

// **NEW:** Function to create and show the image source choice modal
function showImageSourceModal() {
    if (imageSourceModal) {
        imageSourceModal.style.display = 'flex';
        return;
    }

    // Create the modal HTML structure dynamically
    imageSourceModal = document.createElement('div');
    imageSourceModal.id = 'image-source-modal';
    imageSourceModal.innerHTML = `
        <div class="modal-content">
            <h3>Choose Image Source</h3>
            <button id="modal-close-button" class="action-button"><i class="fas fa-times"></i></button>
            <div class="modal-options">
                <button id="camera-option-button" class="option-button">
                    <i class="fas fa-camera"></i>
                    <span>Use Live Camera</span>
                </button>
                <button id="file-option-button" class="option-button">
                    <i class="fas fa-folder-open"></i>
                    <span>Choose File</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(imageSourceModal);

    // Get references to the new elements
    modalCloseButton = document.getElementById('modal-close-button');
    cameraOptionButton = document.getElementById('camera-option-button');
    fileOptionButton = document.getElementById('file-option-button');

    // Add event listeners
    modalCloseButton.addEventListener('click', hideImageSourceModal);
    imageSourceModal.addEventListener('click', function(e) {
        if (e.target === imageSourceModal) hideImageSourceModal();
    });

    cameraOptionButton.addEventListener('click', function() {
        hideImageSourceModal();
        triggerFileInput('environment'); // Use 'environment' for rear camera
    });

    fileOptionButton.addEventListener('click', function() {
        hideImageSourceModal();
        triggerFileInput(null); // Null or absence defaults to file picker
    });

    imageSourceModal.style.display = 'flex';
}

function hideImageSourceModal() {
    if (imageSourceModal) {
        imageSourceModal.style.display = 'none';
    }
}

// **NEW:** Function to configure and click the hidden file input
function triggerFileInput(captureMode) {
    if (fileInput) {
        // 1. Clear any previous capture setting
        fileInput.removeAttribute('capture');
        
        // 2. Set the new capture setting if provided
        if (captureMode) {
            fileInput.setAttribute('capture', captureMode);
        }

        // 3. Trigger the actual file selection dialog
        fileInput.click();
    }
}


function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        // IMPORTANT: Clear the capture attribute if the user cancels
        clearFileInputAttributes();
        return;
    }

    if (!file.type.startsWith('image/')) {
        alert("Please select a valid image file.");
        // Ensure clearAttachedFile is safe to call
        clearAttachedFile();
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert("Image size must be less than 5MB.");
        clearAttachedFile();
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        // Store base64 data and mime type
        const base64String = e.target.result.split(',')[1];
        attachedFile = {
            base64Data: base64String,
            mimeType: file.type,
            fileName: file.name
        };

        // Check for elements before accessing them
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        if (filePreview) filePreview.style.display = 'flex';
        
        // Clean up file input attributes after successful selection
        clearFileInputAttributes(); 
        updateSendButtonState();
    };
    reader.readAsDataURL(file);
}

// **NEW:** Helper to clear file input attributes
function clearFileInputAttributes() {
    if (fileInput) {
        fileInput.value = '';
        fileInput.removeAttribute('capture');
    }
}

function clearAttachedFile() {
    attachedFile = null;

    // FIX 2: Check if DOM elements exist before accessing their properties
    clearFileInputAttributes();
    if (filePreview) filePreview.style.display = 'none';
    if (fileNameDisplay) fileNameDisplay.textContent = '';

    updateSendButtonState();
}

// --- OODLES SEARCH FUNCTIONALITY (Web Search Only) ---

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
        markdown: '\n\n***Links:***\n\n- *No web links available.*',
        rawText: 'No web links found.'
    };
    // Only search if there is a text query
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
            var fullSnippet = r.snippet ? r.snippet.trim() : 'No snippet available.';
            return `[Web Source ${index + 1}] Title: ${r.title}. URL: ${r.url}. Snippet: ${fullSnippet}`;
        }).join('\n---\n');

        return {
            markdown: `\n\n***Links:***\n\n${linkMarkdown}`,
            rawText: rawSearchText
        };

    } catch (error) {
        console.error('Oodles Web Search error:', error);
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
        charCounter.style.color = '#aaa';
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
    var charCountValid = text.length <= MAX_CHARS;

    // The send button is enabled if: (text is present AND valid) OR (an image is attached)
    var isReady = (text.length > 0 && charCountValid) || attachedFile;

    if (isReady) {
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

    // Check for URL Query
    var urlQuery = getQueryFromUrl();
    if (urlQuery) {
        userInput.value = urlQuery;
        updateCharCount();
        // Automatically send the message after a brief delay to ensure UI updates
        setTimeout(sendMessage, 100);
    }
}

/**
 * Deletes the current chat session and starts a new one.
 */
function deleteChat() {
    if (!confirm("Are you sure you want to delete this entire chat session? This action cannot be undone.")) {
        return;
    }

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    clearAttachedFile(); // Clear any pending file

    // Remove the current session from the global state
    delete chatSessions[currentChatId];

    // Clear local storage and start a brand new chat
    localStorage.removeItem(STORAGE_KEY_SESSIONS);
    chatSessions = {}; // Reset global state
    startNewChat();
    userInput.value = '';
    updateCharCount();
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

// File Upload Listeners
if (uploadButton && fileInput && removeFileButton) {
    // MODIFIED: Show the choice modal instead of clicking the input directly
    uploadButton.addEventListener('click', showImageSourceModal); 
    // This handles the file selection whether it came from a file or the camera capture
    fileInput.addEventListener('change', handleFileSelect);
    removeFileButton.addEventListener('click', clearAttachedFile);
}

sendButton.addEventListener('click', sendMessage);

if (deleteChatButton) {
    deleteChatButton.addEventListener('click', deleteChat);
}

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
