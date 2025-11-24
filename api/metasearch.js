var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');
var generate = require('./generate');
var crawlOne = generate.crawlOne;

// --- Praterich AI Configuration ---
// Note: This URL must be accessible by your Vercel serverless function environment
const PRATERICH_API_URL = 'https://praterich.vercel.app/api/praterich';

/**
 * Calls the Praterich AI endpoint to get an overview and ranked links.
 * @param {string} query The user's search query.
 * @param {Array<Object>} crawledResults The list of search results with content.
 * @returns {Promise<{aiOverview: string, rankedLinks: Array<Object>}>}
 */
async function getAiAugmentation(query, crawledResults) {
    try {
        // Prepare the content parts for the AI model
        // We pass the scraped content for grounding
        const resultContext = crawledResults.map((r, index) => ({
            text: `--- RESULT ${index + 1} from ${r.source} ---\nTITLE: ${r.title}\nURL: ${r.url}\nSNIPPET: ${r.description}\nCONTENT: ${r.content ? r.content.substring(0, 1000) + '...' : 'No content crawled.'}\n`,
        }));
        
        // Add the primary user query as the last part
        const userQueryPart = {
            text: `Based ONLY on the provided search results, do the following tasks:
            1. Write a concise, objective, 2-3 sentence **AI Overview** summarizing the answer to the user query: "${query}".
            2. Identify the **3 BEST** links from the results that are most relevant and authoritative.
            3. For the best 3, return their full object structure (title, url, description, source). Mark the single most authoritative link with "isBest": true.
            
            Output ONLY a JSON object following this exact schema:
            {
              "aiOverview": "Your summary goes here.",
              "rankedLinks": [
                {"title": "...", "url": "...", "description": "...", "source": "...", "isBest": true},
                // ... two more links
              ]
            }
            `,
        };

        // Send the request to the Praterich AI endpoint
        const response = await axios.post(PRATERICH_API_URL, {
            contents: [
                { role: "user", parts: [...resultContext, userQueryPart] }
            ],
            // Use a specific system instruction for search result analysis
            system_instruction: { 
                parts: [{ 
                    text: `You are a search result augmentation engine. You will strictly use the provided content to generate a summary and rank links. Do not hallucinate or use external knowledge. Ensure the output is valid JSON.` 
                }] 
            }
        });
        
        // The AI response is expected to be nested under response.data.text
        const aiResponseText = response.data.text;
        
        // Attempt to parse the JSON embedded in the text response
        const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        console.error("AI response did not contain parsable JSON:", aiResponseText);
        return { aiOverview: null, rankedLinks: null };

    } catch (error) {
        console.error("Error calling Praterich AI for augmentation:", error.message);
        // Return null data on failure so the search still works
        return { aiOverview: null, rankedLinks: null };
    }
}


module.exports = async function (req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // NOTE: For compatibility with the frontend's executeSearch, 
  // which uses a GET method with query parameters, 
  // you might need to check req.query.q as well, 
  // but for now, we stick to the provided POST structure.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var q = req.body && req.body.q;
  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    // --- 1. SEARCH SCRAPING (Bing, Yahoo, DDG) ---
    // ... (Bing, Yahoo, DuckDuckGo scraping logic remains the same)
    
    // --- Bing scraping ---
    var bingHtml = await axios.get('https://www.bing.com/search?q=' + encodeURIComponent(q));
    var $bing = cheerio.load(bingHtml.data);
    var bingResults = [];
    $bing('li.b_algo').each(function () {
      var title = $bing(this).find('h2').text();
      var url = $bing(this).find('a').attr('href');
      var desc = $bing(this).find('p').text();
      if (title && url) {
        bingResults.push({ title, url, description: desc, source: 'Bing' });
      }
    });
    console.log('Bing results found:', bingResults.length);

    // --- Yahoo scraping ---
    var yahooHtml = await axios.get('https://search.yahoo.com/search?p=' + encodeURIComponent(q));
    var $yahoo = cheerio.load(yahooHtml.data);
    var yahooResults = [];
    $yahoo('div.algo-sr').each(function () {
      var title = $yahoo(this).find('h3.title a').text();
      var url = $yahoo(this).find('h3.title a').attr('href');
      var desc = $yahoo(this).find('.compText').text();
      if (title && url) {
        yahooResults.push({ title, url, description: desc, source: 'Yahoo' });
      }
    });
    console.log('Yahoo results found:', yahooResults.length);

    // --- DuckDuckGo scraping ---
    var ddgHtml = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q));
    var $ddg = cheerio.load(ddgHtml.data);
    var ddgResults = [];

    $ddg('div.result.results_links.results_links_deep.web-result').each(function () {
      var title = $ddg(this).find('h2.result__title a.result__a').text().trim();
      var url = $ddg(this).find('h2.result__title a.result__a').attr('href');
      var desc = $ddg(this).find('a.result__snippet').text().trim();

      // Decode DuckDuckGo redirect links
      if (url && url.startsWith('//duckduckgo.com/l/?uddg=')) {
        try {
          const parsed = new URL(url, 'https://duckduckgo.com');
          const target = parsed.searchParams.get('uddg');
          if (target) url = decodeURIComponent(target);
        } catch (e) {
          // ignore decode errors
        }
      }

      if (title && url) {
        ddgResults.push({ title, url, description: desc, source: 'DuckDuckGo' });
      }
    });
    console.log('DuckDuckGo results found:', ddgResults.length);

    // --- 2. COMBINE AND CRAWL ---
    var combined = bingResults.concat(yahooResults).concat(ddgResults);
    var crawledResults = [];

    for (var i = 0; i < combined.length; i++) {
      var result = combined[i];
      console.log('Crawling', result.source, result.url);
      try {
        var crawled = await crawlOne(result.url);
        crawledResults.push({
          title: crawled.title,
          url: crawled.url,
          description: crawled.description,
          headings: crawled.headings,
          content: crawled.content, // Crucial for AI grounding
          source: result.source,
          _score: 0
        });
      } catch (e) {
        crawledResults.push({
          title: result.title,
          url: result.url,
          description: result.description || 'Failed to crawl',
          headings: [],
          content: '',
          source: result.source,
          _score: 0
        });
      }
    }

    // --- 3. AI AUGMENTATION STEP ---
    const { aiOverview, rankedLinks } = await getAiAugmentation(q, crawledResults);
    
    // --- 4. RETURN FINAL RESPONSE ---
    res.status(200).json({ 
        items: crawledResults, // Renamed 'results' to 'items' for frontend compatibility
        total: crawledResults.length,
        aiOverview: aiOverview,
        rankedLinks: rankedLinks
    });

  } catch (err) {
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
