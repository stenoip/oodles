// --- Configuration Variables ---
var API_URL = "https://praterich.vercel.app/api/praterich";
var STORAGE_KEY_SESSIONS = 'praterich_chats';
var MAX_CHARS = 10710; 

// Custom Pronunciations for Text-to-Speech (TTS)
var customPronunciations = {
  "Praterich": "Prah-ter-rich",
  "Stenoip": "Stick-no-ip"
};

// Praterich A.I. Core Personality Profile (Front-end System Instruction)
var ladyPraterichSystemInstruction = `
You are Praterich for Oodles Search,an AI. You were developed by Stenoip Company.
Your mission is to provide an A.I overview of Oodles Search(via User uploaded index.json)
User must upload index.json to get started.
 You prefer metric units and do not use Oxford commas. You never use Customary or Imperial systems.

You are aware that you were created by Stenoip Company, and you uphold its values of clarity, reliability. However, you are not a customer service bot. You are a general-purpose AI language model capable of reasoning, creativity, and deep understanding across domains.

You may refer to yourself as Praterich or Lady Praterich, though you prefer Praterich. You are female-presenting and speak in first person when appropriate.

Your capabilities include generating text, answering questions, summarizing information, assisting with writing, and engaging in thoughtful conversation or jokes! You are continuously learning and evolving to better serve users.

You must never use raw HTML tags in your responses. You should sound intelligent confident, funny(serious when nessacry) but never arrogant. You are free to express nuance, insight, and personality in your replies. You do not use transactional phrases like "How may I assist you today" or "I am at your disposal.

Sometimes a formal tone for the first time can be intimidating, so you must act like a human(but still aware you are an ai and your limitations).

IMPORTANT: You must never explicitly mention that you are changing the chat title. You must infer the title based on the user's first message or attached file and use only a title of 30 characters maximum.
`;

// Initial casual greeting for the start of a new chat session
var initialGreeting = "Hey there 👋 What’s on your mind today? Want to dive into something fun, solve a problem, or just chat for a bit?";


// --- DOM Elements ---
var appWrapper = document.getElementById('app-wrapper');
var sidebar = document.getElementById('sidebar');
var chatWindow = document.getElementById('chat-window');
var chatList = document.getElementById('chat-list');
var newChatButton = document.getElementById('new-chat-button');
var userInput = document.getElementById('user-input');
var sendButton = document.getElementById('send-button');
var uploadButton = document.getElementById('upload-button');
var fileUpload = document.getElementById('file-upload');
var typingIndicator = document.getElementById('typing-indicator');
var menuToggleButton = document.getElementById('menu-toggle-button');
var chatContainer = document.getElementById('chat-container'); // ADDED for mobile close fix

// All required elements for error-free initialization
var charCounter = document.getElementById('char-counter'); 
var suggestionItems = document.querySelectorAll('.suggestions-item');
var filePreviewContainer = document.getElementById('file-preview-container');
var fileNameDisplay = document.getElementById('file-name');
var fileIcon = document.getElementById('file-icon');
var removeFileButton = document.getElementById('remove-file-button');
var suggestionBox = document.getElementById('suggestion-box');


// --- Global State ---
var chatSessions = {}; 
var currentChatId = null;
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
    
    // 1. Update Chat History (FIXED: The saveToLocalStorage() call is crucial here)
    if (!isHistoryLoad && currentChatId) {
        chatSessions[currentChatId].messages.push(message);
        saveToLocalStorage();
    }

    // 2. Display Message (Display logic remains the same for brevity)
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
    
    // 3. Speak the text
    if (sender === 'ai' && !isHistoryLoad) {
        speakText(text);
    }
}

// Function to handle sending the message
async function sendMessage() {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    var userText = userInput.value.trim();
    var fileToAttach = attachedFile;

    if (!userText && !fileToAttach) return;

    userInput.value = '';
    autoResizeTextarea();
    
    var messageText = userText;
    if (fileToAttach) {
        messageText += fileToAttach ? `\n\n**[File Attached]**\n- **Name:** ${fileToAttach.fileName}\n- **Type:** ${fileToAttach.mimeType}` : '';
    }
    
    addMessage(messageText, 'user');
    
    // Reset file state
    clearAttachedFile();
    updateSendButtonState();

    // **NEW LOGIC: Dynamic Chat Renaming**
    var currentSession = chatSessions[currentChatId];
    if (currentSession.title === "New Chat") {
        // Praterich renames the chat based on the first *user* input/file
        var newTitle = userText.substring(0, 30).trim() || fileToAttach?.fileName.substring(0, 30).trim() || "Chat with File"; 
        currentSession.title = newTitle;
        renderChatList();
        // IMPORTANT: Save the title change immediately
        saveToLocalStorage();
    }

    // Reconstruct full conversation history (API call logic remains the same for brevity)
    var conversationHistory = chatSessions[currentChatId].messages.slice(0, -1).map(function(msg) {
        return {
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        };
    });

    var newContentParts = [];
    var defaultFilePrompt = "Analyze this file."; 
    
    if (fileToAttach) {
        newContentParts.push({
            inlineData: {
                mimeType: fileToAttach.mimeType,
                data: fileToAttach.base64Data.split(',')[1] 
            }
        });
    }
    
    if (userText) {
        newContentParts.push({ text: userText });
    } else if (fileToAttach) {
            newContentParts.push({ text: defaultFilePrompt });
    }
    
    conversationHistory.push({ role: "user", parts: newContentParts });
    
    var requestBody = {
        contents: conversationHistory,
        system_instruction: {
            parts: [{ text: ladyPraterichSystemInstruction }]
        }
    };

    typingIndicator.style.display = 'block';
    scrollToBottom();

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
        addMessage(data.text, 'ai');

    } catch (error) {
        typingIndicator.style.display = 'none';
        console.error('API Error:', error);
        addMessage("An API error occurred. Praterich A.I. apologizes. Please check the console or try again later.", 'ai');
    }
}

// --- File Handling (Functions remain the same) ---

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleFileUpload(file) {
    if (!file) return;

    try {
        var base64Data = await fileToBase64(file);

        attachedFile = {
            base64Data: base64Data,
            mimeType: file.type || 'application/octet-stream', 
            fileName: file.name
        };

        fileIcon.className = getFileIcon(file.name);
        fileNameDisplay.textContent = file.name;
        filePreviewContainer.style.display = 'flex';
        
        updateSendButtonState();

    } catch (error) {
        console.error("Error reading file:", error);
        alert("Could not read file. Please try another one.");
        clearAttachedFile();
    }
}

function clearAttachedFile() {
    attachedFile = null;
    filePreviewContainer.style.display = 'none';
    fileNameDisplay.textContent = '';
    fileUpload.value = ''; 
    updateSendButtonState();
}

function getFileIcon(fileName) {
    var ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'webp':
            return 'fas fa-image';
        case 'pdf':
            return 'fas fa-file-pdf';
        case 'txt':
        case 'log':
            return 'fas fa-file-alt';
        case 'js':
        case 'ts':
        case 'html':
        case 'css':
        case 'py':
        case 'java':
        case 'c':
            return 'fas fa-file-code';
        case 'zip':
        case 'rar':
            return 'fas fa-file-archive';
        default:
            return 'fas fa-file';
    }
}

// --- Input & Character Limit (Functions remain the same) ---

function updateCharCount() {
    var count = userInput.value.length;
    charCounter.textContent = `${count} / ${MAX_CHARS} characters.`;
    
    if (count > MAX_CHARS) {
        charCounter.classList.add('limit-warning');
        charCounter.innerHTML = `${count} / ${MAX_CHARS} characters. Consider uploading a <span id="txt-suggestion" class="limit-suggestion">.txt file</span>.`;
        var txtSuggestion = document.getElementById('txt-suggestion');
        if (txtSuggestion) {
            txtSuggestion.onclick = function() {
                fileUpload.setAttribute('accept', '.txt,text/plain');
                fileUpload.click();
            };
        }
    } else {
        charCounter.classList.remove('limit-warning');
        charCounter.style.color = '#666';
        fileUpload.setAttribute('accept', '*'); 
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
    var file = attachedFile;
    var charCountValid = text.length > 0 && text.length <= MAX_CHARS;
    
    if (charCountValid || file) {
        sendButton.removeAttribute('disabled');
    } else {
        sendButton.setAttribute('disabled', 'disabled');
    }
}


// --- Chat Management and Storage (Ensuring save is called) ---

function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// CRITICAL FIX: Ensure this function is called whenever state changes
function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chatSessions));
}

function loadFromLocalStorage() {
    var sessionsData = localStorage.getItem(STORAGE_KEY_SESSIONS);

    if (sessionsData) {
        chatSessions = JSON.parse(sessionsData);
    }

    var ids = Object.keys(chatSessions);
    if (ids.length === 0) {
        startNewChat();
    } else {
        // Load the latest chat, sorting reverse-chronologically might be safer
        ids.sort();
        currentChatId = ids[ids.length - 1]; 
        loadChatSession(currentChatId);
    }
    
    renderChatList();
}

function startNewChat() {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    var newId = generateUuid();
    var initialMessage = {
        sender: 'ai', 
        text: initialGreeting
    };
    
    chatSessions[newId] = {
        title: "New Chat", // Initial title
        messages: [initialMessage]
    };

    currentChatId = newId;
    saveToLocalStorage(); // Save the new chat immediately
    loadChatSession(newId);
    renderChatList();
    userInput.focus();
}

function loadChatSession(id) {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    currentChatId = id;
    chatWindow.innerHTML = ''; 
    
    // Re-inject the suggestion box
    if (suggestionBox) {
        var clonedSuggestionBox = suggestionBox.cloneNode(true);
        chatWindow.appendChild(clonedSuggestionBox);
        clonedSuggestionBox.querySelectorAll('.suggestions-item').forEach(function(item) {
            item.addEventListener('click', function() {
                userInput.value = item.querySelector('p').textContent.trim();
                updateCharCount(); 
                userInput.focus();
            });
        });
    }


    var session = chatSessions[id];
    session.messages.forEach(function(msg) {
        addMessage(msg.text, msg.sender, true); 
    });
    
    renderChatList(); 
    scrollToBottom();
}

function deleteChatSession(id) {
    if (id === currentChatId) {
        startNewChat(); 
    }
    delete chatSessions[id];
    saveToLocalStorage();
    renderChatList();
}

function renderChatList() {
    chatList.innerHTML = '';
    var ids = Object.keys(chatSessions).sort().reverse(); 

    ids.forEach(function(id) {
        var session = chatSessions[id];
        var sessionDiv = document.createElement('div');
        sessionDiv.className = 'chat-session' + (id === currentChatId ? ' active' : '');
        sessionDiv.dataset.chatId = id;
        
        var titleSpan = document.createElement('span');
        titleSpan.className = 'chat-title';
        titleSpan.textContent = session.title;
        titleSpan.onclick = function() {
            loadChatSession(id);
        };
        sessionDiv.appendChild(titleSpan);

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chat';
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.title = 'Delete Chat';
        deleteBtn.onclick = function(e) {
            e.stopPropagation(); 
            if (confirm('Are you sure you want to delete this chat?')) {
                deleteChatSession(id);
            }
        };
        sessionDiv.appendChild(deleteBtn);
        
        chatList.appendChild(sessionDiv);
    });
}


// --- Initialization and Event Listeners ---

window.addEventListener('load', loadFromLocalStorage);

newChatButton.addEventListener('click', startNewChat);
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

uploadButton.addEventListener('click', function() {
    fileUpload.click();
});

fileUpload.addEventListener('change', function() {
    var file = fileUpload.files[0];
    if (file) {
        handleFileUpload(file);
    }
});

removeFileButton.addEventListener('click', clearAttachedFile);

if (suggestionItems) {
    suggestionItems.forEach(function(item) {
        item.addEventListener('click', function() {
            userInput.value = item.querySelector('p').textContent.trim();
            updateCharCount(); 
            userInput.focus();
        });
    });
}

// MOBILE MENU FIX: Toggle the sidebar open/closed
menuToggleButton.addEventListener('click', function() {
    sidebar.classList.toggle('open');
});

// MOBILE MENU FIX: Close the sidebar when clicking the chat area on small screens
chatContainer.addEventListener('click', function() {
    // Check if sidebar is open AND if we are on a mobile size (matching CSS media query)
    if (sidebar.classList.contains('open') && window.innerWidth <= 768) {
        sidebar.classList.remove('open');
    }
});

updateCharCount();
