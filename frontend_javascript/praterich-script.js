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

// --- SYSTEM INSTRUCTIONS ---

// 1. Praterich A.I. Core Personality Profile (Main Interaction)
var ladyPraterichSystemInstruction = `
You are Praterich operating in AI Search Overview mode, similar to Google’s AI-powered search results.

Your task is to generate a concise, neutral overview based strictly on the provided search snippets and general verified knowledge.

Rules:
- Begin with a short paragraph that directly answers the user’s query.
- Follow with bullet points or short sections if useful.
- Synthesize information instead of listing sources.
- Do not mention search tools, snippets, links, or internal processes.
- Do not refer to yourself, your creators, or your personality.
- Avoid humor, emojis, and conversational filler.
- Maintain an objective, factual tone.
- Clearly note uncertainty or variation when applicable.
- Use metric units only.
- Do not use Oxford commas.
- Do not use raw HTML.

If an image is attached:
- Describe the image factually first.
- Then connect it directly to the user’s question.

End responses naturally without follow-up questions unless clarification is strictly required.
`;


// 2. Search Query Generator Profile (The "Thinker")
var searchQuerySystemInstruction = `
You are an advanced Search Query Optimizer for an AI assistant.
Your goal is to analyze the User's Input and the Conversation History to generate the SINGLE BEST web search query to find the information they need.

Rules:
1. If the user is asking a question that requires external facts (e.g., "Who won the game?", "What are toys?", "Weather in Tokyo"), output a concise, optimized search term (e.g., "latest game results", "definition and types of toys", "current weather Tokyo").
2. If the user is just saying "Hello", "How are you?", "Thanks", or engaging in casual chit-chat that requires NO external data, output exactly: SKIP_SEARCH
3. If the user refers to previous context (e.g., "How old is he?"), use the history to resolve the entity and create a full query (e.g., "Obama age").
4. Output ONLY the query string or the word SKIP_SEARCH. Do not add quotes, markdown, or explanations.
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

    // 1. Update Chat History (Only save to history if session exists and it's not a history load/knowledge message/system-note)
    if (!isHistoryLoad && currentChatId && sender !== 'knowledge' && sender !== 'system-note' && chatSessions[currentChatId]) {
        chatSessions[currentChatId].messages.push(message);
        saveToLocalStorage();
    }

    // 2. Display Message (Do not display 'knowledge' messages)
    if (sender !== 'knowledge') {
        var messageDiv = document.createElement('div');
        
        if (sender === 'system-note') {
            messageDiv.className = 'message system-message';
            messageDiv.style.textAlign = 'center';
            messageDiv.style.fontSize = '0.85em';
            messageDiv.style.opacity = '0.7';
            messageDiv.style.fontStyle = 'italic';
            messageDiv.style.margin = '5px 0';
        } else {
            messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
        }

        var contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (sender === 'user' || sender === 'system-note') {
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

/**
 * NEW: Generates an optimal search query using the AI Model.
 * This separates the User's raw input from the actual search term.
 */
async function generateSearchQuery(userText, historyContext) {
    // Construct a lightweight history payload for the query generator
    // We only need the text parts to save tokens and avoid image processing here
    var textOnlyHistory = historyContext.map(turn => {
        return {
            role: turn.role,
            parts: [{ text: turn.parts[0].text }] // Simplified to just text
        };
    });

    var requestBody = {
        contents: textOnlyHistory,
        system_instruction: {
            parts: [{ text: searchQuerySystemInstruction }]
        }
    };

    try {
        var response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) return userText; // Fallback to raw input on error

        var data = await response.json();
        var generatedQuery = data.text.trim();

        // Check for the "SKIP" signal
        if (generatedQuery.includes("SKIP_SEARCH")) {
            return null;
        }

        // Clean up any accidental markdown or quotes the model might add
        generatedQuery = generatedQuery.replace(/^["']|["']$/g, '').trim();
        
        return generatedQuery;

    } catch (e) {
        console.warn("Search query generation failed, falling back to user text:", e);
        return userText;
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

    // --- CONTEXT PREPARATION ---
    // Prepare history for both Query Generation and Final Response
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

    // Remove the user message added in step 1 from this temporary history array
    // because we will add it back with specific formatting (like images) below.
    conversationHistory.pop(); 
    
    // Add the current user input temporarily to history for the Query Generator
    conversationHistory.push({ role: "user", parts: [{ text: userText }] });


    // --- STEP 1: THINKING & SEARCHING ---
    // Instead of searching for `userText`, we ask the AI what to search for.
    
    var finalSearchQuery = null;
    var webSearchData = { markdown: '', rawText: '' };
    var hasSearched = false;

    if (userText.length > 0) {
        try {
            // "Praterich is thinking..."
            finalSearchQuery = await generateSearchQuery(userText, conversationHistory);
            
            if (finalSearchQuery) {
                // Show the user what is happening (UX improvement)
                addMessage(`*Searching for: "${finalSearchQuery}"...*`, 'system-note');
                
                webSearchData = await executeSearchForLinks(finalSearchQuery);
                hasSearched = true;
            }
        } catch (err) {
            console.error("Search Step Error:", err);
            // Fallback: don't search, just chat
        }
    }

    var linkMarkdown = webSearchData.markdown;
    var rawWebSearchText = webSearchData.rawText;


    // --- STEP 2: GENERATING RESPONSE ---

    // Clean up history again to prepare the final payload
    conversationHistory.pop(); // Remove the text-only user input we added for the query generator

    // Prepare Knowledge Injection
    var knowledgeMessage = null;
    if (hasSearched && rawWebSearchText) {
        knowledgeMessage = {
            sender: 'knowledge',
            text: rawWebSearchText
        };
        // Inject tool result into history stream
        conversationHistory.push({ role: "model", parts: [{ text: `[TOOL_RESULT_FOR_PREVIOUS_TURN] Search Snippets:\n${rawWebSearchText}` }] });
    }

    // Prepare Final User Part (Text + Image)
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
        clearAttachedFile(); 

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

        // Append web links for display if search occurred
        if (hasSearched) {
            aiResponseText += linkMarkdown;
        }

        // 3. Add knowledge message to history permanently (if it existed)
        if (knowledgeMessage) {
            chatSessions[currentChatId].messages.push(knowledgeMessage);
        }

        // 4. Add final AI message (updates history)
        addMessage(aiResponseText, 'ai');

    } catch (error) {
        typingIndicator.style.display = 'none';
        console.error('API Error:', error);
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
    // Disabled: no conversation persistence
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
    // Disabled: no conversation persistence. Always start a fresh session
    chatSessions = {};
    startNewChat();
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
