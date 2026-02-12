const fetch = require('node-fetch');
const { setCors } = require('./_cors');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    // 1. Initial Search (Get more than 10 because we will filter some out)
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: '15', 
      key: YOUTUBE_API_KEY
    });

    const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`);
    const searchData = await searchRes.json();
    
    if (!searchData.items) return res.status(200).json([]);

    // 2. Get the IDs to fetch detailed metadata
    const videoIds = searchData.items.map(item => item.id.videoId).join(',');

    // 3. Fetch exact durations and file details
    const detailsParams = new URLSearchParams({
      part: 'contentDetails,status,snippet',
      id: videoIds,
      key: YOUTUBE_API_KEY
    });

    const detailsRes = await fetch(`${VIDEOS_URL}?${detailsParams}`);
    const detailsData = await detailsRes.json();

    // 4. Filter out the Shorts
    // Logic: Shorts are < 60s. We also check for 'dimension: 2d' vs '3d' 
    // though duration is the most reliable "Shorts" killer.
    const filteredResults = detailsData.items.filter(video => {
      const duration = video.contentDetails.duration; // Format: PT1M30S
      
      // Convert ISO 8601 duration to seconds
      const seconds = parseISO8601DurationWithRegex(duration);
      
      // Keep videos longer than 60 seconds
      return seconds > 60;
    });

    res.status(200).json(filteredResults.slice(0, 10));

  } catch (error) {
    res.status(500).json({ error: 'Search failed', detail: error.message });
  }
};

/**
 * Helper to convert ISO 8601 (PT#M#S) to total seconds
 */
function parseISO8601DurationWithRegex(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}
