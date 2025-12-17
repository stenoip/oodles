var BACKEND_BASE = 'https://oodles-backend.vercel.app';
var micCircle = document.getElementById('mic-icon-circle');
var audioContext = new (window.AudioContext || window.webkitAudioContext)();
var deferredPrompt;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js');
  });
}

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
});

function playTone(frequency, duration, volume, delay, endFrequency) {
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
  oscillator.stop(audioContext.currentTime + duration);
}

function switchTab(tab) {
  document.getElementById('panel-metasearch').style.display = tab === 'metasearch' ? 'block' : 'none';
  document.getElementById('panel-about').style.display = tab === 'about' ? 'block' : 'none';
}

function runMetaSearch() {
  var q = document.getElementById('metaQuery').value.trim();
  var type = document.getElementById('searchTypeSelector').value;
  if (!q) return;
  sessionStorage.setItem('metaSearchQuery', q);
  sessionStorage.setItem('searchType', type);
  window.open('search.html', '_blank');
}

function runAIAnalysis() {
  var q = document.getElementById('metaQuery').value.trim();
  if (!q) {
    alert('Please enter a query before running AI Analysis.');
    return; 
  }
  window.open('ai_analysation.html?q=' + encodeURIComponent(q), '_blank');
}

function startVoiceSearch() {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Your browser does not support speech recognition.');
    return;
  }

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
      runMetaSearch();
    } else {
      playTone(150, 0.4, 0.6, 0, 100);
    }
  };

  recognition.onerror = function(event) {
    micCircle.classList.remove('mic-recording');
    playTone(150, 0.4, 0.6, 0, 100); 
    alert('Voice recognition failed: ' + event.error);
  };
}

document.getElementById('metaQuery').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') runMetaSearch();
});
