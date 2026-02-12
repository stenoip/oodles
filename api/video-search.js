var fetch = require('node-fetch');
var { setCors } = require('./_cors');

var YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
var SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
var VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  var query = req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    // 1. Fetch a large enough sample size to filter effectively
    var searchParams = new URLSearchParams({
      part: 'snippet',
      q: query + ' -shorts -tiktok -funniest', // Basic API-level exclusion
      type: 'video',
      maxResults: '75', 
      relevanceLanguage: 'en',
      key: YOUTUBE_API_KEY
    });

    var searchRes = await fetch(SEARCH_URL + '?' + searchParams.toString());
    var searchData = await searchRes.json();
    if (!searchData.items || searchData.items.length === 0) return res.status(200).json([]);

    var videoIds = searchData.items.map(function(item) { return item.id.videoId; }).join(',');
    var detailsRes = await fetch(VIDEOS_URL + '?part=contentDetails,snippet,status,statistics&id=' + videoIds + '&key=' + YOUTUBE_API_KEY);
    var detailsData = await detailsRes.json();

    // 2. THE SMART FILTERING ENGINE
    var filteredResults = detailsData.items.filter(function(video) {
      var score = 0;
      var title = video.snippet.title;
      var desc = video.snippet.description || "";
      var duration = parseDuration(video.contentDetails.duration);
      var viewCount = parseInt(video.statistics.viewCount || 0);

      // --- RULE 1: THE HARD KILL (Duration & Kids Content) ---
      // Shorts are < 60s. AI Brainrot is almost always flagged 'madeForKids'
      if (duration <= 60 || video.status.madeForKids) return false;

      // --- RULE 2: EMOJI DENSITY (AI/Brainrot Fingerprint) ---
      var emojiCount = (title.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\u263A|\u2705/g) || []).length;
      if (emojiCount > 3) score += 2.5; // High emoji count is a massive red flag

      // --- RULE 3: THE "SHOUTING" TEST ---
      var words = title.split(' ');
      var capsWords = words.filter(function(w) { return w === w.toUpperCase() && w.length > 1; }).length;
      if (capsWords / words.length > 0.5) score += 2; // Title is >50% ALL CAPS

      // --- RULE 4: REPETITIVE KEYWORDS (SEO Spam) ---
      var brainrotPattern = /(brainrot|skibidi|sigma|rizz|ohio|satisfying|funny|crazy|insane|steal)/gi;
      var matches = (title.match(brainrotPattern) || []).length;
      score += (matches * 1.5);

      // --- RULE 5: CHANNEL REPUTATION HEURISTIC ---
      // Real "Video Essays" or quality content usually have longer descriptions.
      // AI spam channels usually have < 100 characters or just links.
      if (desc.length < 100) score += 1.5;

      // --- RULE 6: THE ENGAGEMENT GAP ---
      // If a video has 10 million views but a title that looks like "vids", 
      // it's likely a mass-market engagement farm.
      if (viewCount > 1000000 && title.toLowerCase().indexOf(query.toLowerCase()) === -1) score += 1;

      // FINAL DECISION: Threshold of 3.0. 
      // If a video hits multiple flags, it's out.
      return score < 3.0;
    });

    res.status(200).json(filteredResults.slice(0, 10));

  } catch (error) {
    res.status(500).json({ error: 'Filter failed', detail: error.message });
  }
};

function parseDuration(duration) {
  var match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  var hours = parseInt(match[1] || 0);
  var minutes = parseInt(match[2] || 0);
  var seconds = parseInt(match[3] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
}
