const fetch = require('node-fetch');
const { setCors } = require('./_cors'); // Assuming _cors.js is in the same directory

// The YouTube Data API Key must be set as an Environment Variable in Vercel.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; 

// Base URL for the YouTube Search API
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3/search';

/**
 * Serverless function to search videos using the YouTube Data API.
 * @param {object} req - HTTP request object.
 * @param {object} res - HTTP response object.
 */
module.exports = async (req, res) => {
  // Apply CORS headers for the allowed origin (stenoip.github.io)
  setCors(res);

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Ensure API Key is available
  if (!YOUTUBE_API_KEY) {
    res.status(500).json({ error: 'Server configuration error: YOUTUBE_API_KEY is not set.' });
    return;
  }

  // Extract the search query from the request URL parameters
  const { query } = req.query;

  if (!query) {
    res.status(400).json({ error: 'Missing required query parameter: "query"' });
    return;
  }

  // Construct the full API URL
  const apiUrl = `${YOUTUBE_API_BASE_URL}?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;

  try {
    // 1. Fetch data from the YouTube API
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
        // Handle API error responses (e.g., key invalid, daily limit exceeded)
        const errorText = await response.text();
        console.error(`YouTube API Error (${response.status}): ${errorText}`);
        res.status(response.status).json({ 
            error: 'Failed to fetch results from YouTube API.', 
            details: JSON.parse(errorText) // Attempt to parse detailed error
        });
        return;
    }

    // 2. Parse the JSON response
    const data = await response.json();

    // 3. Respond with the search results
    res.status(200).json(data.items);

  } catch (error) {
    console.error('Video search failed:', error);
    res.status(500).json({ error: 'Internal Server Error during API request.', detail: error.message });
  }
};
