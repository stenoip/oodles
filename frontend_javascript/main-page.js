var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var micCircle = document.getElementById('mic-icon-circle');
var audioContext = null; // Initialized on user interaction to comply with browser policies
var deferredPrompt;

// --- Service Worker & Install Logic ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log("SW failed", err));
  });
}

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
});

// --- Audio Feedback Logic ---
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playTone(frequency, duration, volume, delay, endFrequency) {
  initAudio();
  var d = delay || 0;
  var ef = endFrequency || null;
  var startTime = audioContext.currentTime + d;
  var oscillator = audioContext.createOscillator();
  var gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);
  
  if (ef !== null) {
    oscillator.frequency.linearRampToValueAtTime(ef, startTime + duration);
  }

  gainNode.gain.setValueAtTime(volume, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

// --- Tab Navigation ---
function switchTab(tab) {
  document.getElementById('panel-metasearch').style.display = tab === 'metasearch' ? 'block' : 'none';
  document.getElementById('panel-about').style.display = tab === 'about' ? 'block' : 'none';
}

// --- CORE SEARCH REDIRECTION FIX ---
function runMetaSearch() {
  var q = document.getElementById('metaQuery').value.trim();
  var type = document.getElementById('searchTypeSelector').value;
  if (!q) return;

  // Redirect to search.html with parameters (matches your new search-logic.js)
  window.location.href = `search.html?q=${encodeURIComponent(q)}&type=${type}`;
}

function runAIAnalysis() {
  var q = document.getElementById('metaQuery').value.trim();
  if (!q) {
    alert('Please enter a query before running AI Analysis.');
    return; 
  }
  window.location.href = 'ai_analysation.html?q=' + encodeURIComponent(q);
}

// --- Voice Search Logic ---
function startVoiceSearch() {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Your browser does not support speech recognition.');
    return;
  }

  initAudio();
  var recognition = new webkitSpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;

  micCircle.classList.add('mic-recording');
  playTone(261.63, 0.3, 0.5); 

  recognition.start();

  recognition.onresult = function(event) {
    var transcript = event.results[0][0].transcript;
    document.getElementById('metaQuery').value = transcript;
  };

  recognition.onend = function() {
    var query = document.getElementById('metaQuery').value.trim();
    micCircle.classList.remove('mic-recording');

    if (query) {
      playTone(800, 0.1, 0.6); 
      playTone(1200, 0.1, 0.6, 0.15); 
      setTimeout(runMetaSearch, 400); // Small delay to let sounds finish
    } else {
      playTone(150, 0.4, 0.6, 0, 100);
    }
  };

  recognition.onerror = function(event) {
    micCircle.classList.remove('mic-recording');
    playTone(150, 0.4, 0.6, 0, 100); 
    console.error('Voice recognition error:', event.error);
  };
}

// --- Event Listeners ---
document.getElementById('metaQuery').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
      runMetaSearch();
  }
});
