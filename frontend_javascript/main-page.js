  var BACKEND_BASE = 'https://oodles-backend.vercel.app';
    const micCircle = document.getElementById('mic-icon-circle');

    // Web Audio API Context
    // Always initialize the AudioContext when the user interacts with the page
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    /**
     * Generates and plays a simple tone using the Web Audio API.
     * @param {number} frequency - The tone frequency in Hz.
     * @param {number} duration - The tone duration in seconds.
     * @param {number} volume - The tone volume (0.0 to 1.0).
     * @param {number} delay - The delay before the tone starts (in seconds).
     * @param {number|null} endFrequency - Optional frequency to ramp to.
     */
    function playTone(frequency, duration, volume, delay = 0, endFrequency = null) {
      const startTime = audioContext.currentTime + delay;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Set tone parameters
      oscillator.type = 'sine'; // Sine wave is a clean tone
      oscillator.frequency.setValueAtTime(frequency, startTime);
      
      // Apply frequency sweep if an endFrequency is provided
      if (endFrequency !== null) {
        oscillator.frequency.linearRampToValueAtTime(endFrequency, startTime + duration);
  	  }

      // Set volume and apply a short fade out to prevent clicks
      gainNode.gain.setValueAtTime(volume, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.start(startTime);
      oscillator.stop(audioContext.currentTime + duration);
    }

    // Function to switch between tabs
    function switchTab(tab) {
      document.getElementById('panel-metasearch').style.display = tab === 'metasearch' ? 'block' : 'none';
      document.getElementById('panel-about').style.display = tab === 'about' ? 'block' : 'none';
    }

    // Function to run meta search
    function runMetaSearch() {
      var q = document.getElementById('metaQuery').value.trim();
      var type = document.getElementById('searchTypeSelector').value;
      if (!q) return;
      sessionStorage.setItem('metaSearchQuery', q);
      sessionStorage.setItem('searchType', type);
      window.open('search.html', '_blank');
    }

   // Function to run AI analysis
function runAIAnalysis() {
  var q = document.getElementById('metaQuery').value.trim();
  if (!q) {
    // MODIFIED: Alert the user if the query is empty
    alert('Please enter a query before running AI Analysis.');
    return; 
  }
    
  // ... rest of the function remains the same ...
  window.open('ai_analysation.html?q=' + encodeURIComponent(q), '_blank');
}

    // Function to start voice search
    function startVoiceSearch() {
      if (!('webkitSpeechRecognition' in window)) {
        alert('Your browser does not support speech recognition.');
        return;
      }

      const recognition = new webkitSpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      // START LISTENING: Red circle appears and Middle C sound plays
      micCircle.classList.add('mic-recording');
      
      // START BEEP: Middle C (approx 261.63 Hz)
      playTone(261.63, 0.3, 0.5); 
      

      recognition.start();

      recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById('metaQuery').value = transcript;
      };

      recognition.onend = function() {
        const query = document.getElementById('metaQuery').value.trim();

        // END LISTENING: Remove red circle
        micCircle.classList.remove('mic-recording');

        if (query) {
          // Success: Play 2-beep sequence (la LA!) and run search
          // First beep ("la")
          playTone(800, 0.1, 0.6); 
          
          // Second beep ("LA!")
          playTone(1200, 0.1, 0.6, 0.15); 
          
          runMetaSearch();
        } else {
          // No match/Timeout: Play a failure sound 
          playTone(150, 0.4, 0.6, 0, 100); // Low-to-low tone for subtle failure
        }
      };

      recognition.onerror = function(event) {
        // ERROR: Remove red circle and play error sound
        micCircle.classList.remove('mic-recording');
        
        // NEW FAILURE SOUND: A low, sweeping tone
        playTone(150, 0.4, 0.6, 0, 100); 
        
        alert('Voice recognition failed: ' + event.error);
      };
    }

    // Add keyboard event to trigger search on Enter key
    document.getElementById('metaQuery').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') runMetaSearch();
    });
