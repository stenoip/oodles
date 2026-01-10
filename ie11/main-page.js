var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var micCircle = document.getElementById('mic-icon-circle');
var audioContext = null; 
var deferredPrompt;

// --- Service Worker & Install Logic ---
// IE11 will simply ignore this as 'serviceWorker' is not in navigator
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')['catch'](function(err) {
        console.log("SW failed", err);
    });
  });
}

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
});

// --- Audio Feedback Logic ---
function initAudio() {
    if (!audioContext) {
        // IE11 doesn't support AudioContext, but this prevents errors in other older browsers
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioContext = new AudioContextClass();
        }
    }
}

function playTone(frequency, duration, volume, delay, endFrequency) {
  initAudio();
  if (!audioContext) return; // Exit if browser doesn't support Web Audio

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

  // Replaced Template Literals with String Concatenation for IE11
  window.location.href = 'search.html?q=' + encodeURIComponent(q) + '&type=' + type;
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
  // IE11 does not support SpeechRecognition
  var RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!RecognitionClass) {
    alert('Your browser does not support speech recognition.');
    return;
  }

  initAudio();
  var recognition = new RecognitionClass();
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
      setTimeout(runMetaSearch, 400); 
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
  // e.key is supported in IE11, but older versions used e.keyCode
  var key = e.key || e.keyCode;
  if (key === 'Enter' || key === 13) {
      runMetaSearch();
  }
});
