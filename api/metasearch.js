var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

module.exports = async function (req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var q = req.body && req.body.q;
  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  // Define a standard User-Agent for all requests
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  const AXIOS_CONFIG = {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 5000 // 5 second timeout for page fetching
  };

  try {
    // --- 1. Bing scraping ---
    var bingHtml = await axios.get('https://www.bing.com/search?q=' + encodeURIComponent(q), AXIOS_CONFIG);
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

    // --- 2. Yahoo scraping ---
    var yahooHtml = await axios.get('https://search.yahoo.com/search?p=' + encodeURIComponent(q), AXIOS_CONFIG);
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

    // --- 3. DuckDuckGo scraping ---
    var ddgHtml = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), AXIOS_CONFIG);
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

    // --- 4. Combine and Crawl Destination Pages ---
    var combined = bingResults.concat(yahooResults).concat(ddgResults);
    var crawledResults = [];
    
    // Common filter terms for low-value images (social media icons, favicons, etc.)
    // We keep the filters to avoid capturing obvious garbage
    const LOW_VALUE_FILTERS = ['favicon', 'icon', 'data:image', 'instagram', 'twitter', 'facebook', 'linkedin', 'google', 'wiki'];

    for (var i = 0; i < combined.length; i++) {
      var result = combined[i];
      console.log('Crawling destination:', result.url);

      try {
        var pageResponse = await axios.get(result.url, AXIOS_CONFIG);
        var $page = cheerio.load(pageResponse.data);

        // --- EXTRACT ALL IMAGES WITHOUT RANKING ---
        var finalImages = new Set();
        
        // 1. Crawl every <img> tag on the page
        $page('img').each(function() {
            var src = $page(this).attr('src') || $page(this).attr('data-src');
            
            if (src) {
                try {
                    // Convert relative paths to absolute URLs
                    var absoluteUrl = new URL(src, result.url).href;
                    if (!absoluteUrl.startsWith('http')) return; 

                    let lowerUrl = absoluteUrl.toLowerCase();
                    let isBase64 = lowerUrl.startsWith('data:');
                    
                    if (isBase64) return; // Always skip base64

                    // Basic Filter: Skip if URL contains known low-value terms
                    let isLowValue = LOW_VALUE_FILTERS.some(filter => lowerUrl.includes(filter));
                    
                    if (!isLowValue) {
                         finalImages.add(absoluteUrl);
                    }

                } catch (err) { 
                    // Invalid URL
                }
            }
        });
        
        // Convert Set to Array and limit the size
        let finalImagesArray = Array.from(finalImages).slice(0, 20); 


        // --- EXTRACT HEADINGS & TEXT ---
        var headings = [];
        $page('h1, h2, h3').each(function() {
            headings.push($page(this).text().trim());
        });

        // Clean up scripts/styles for clean text extraction
        $page('script').remove();
        $page('style').remove();
        var content = $page('body').text().replace(/\s+/g, ' ').trim().substring(0, 2000);

        crawledResults.push({
          title: $page('title').text().trim() || result.title,
          url: result.url,
          description: $page('meta[name="description"]').attr('content') || result.description,
          headings: headings,
          content: content,
          images: finalImagesArray, // Use the non-ranked list
          source: result.source,
          _score: 0
        });

      } catch (e) {
        console.error('Failed to crawl', result.url, e.message);
        crawledResults.push({
          title: result.title,
          url: result.url,
          description: result.description || 'Failed to crawl',
          headings: [],
          content: '',
          images: [],
          source: result.source,
          _score: 0
        });
      }
    }

    res.status(200).json({ results: crawledResults });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
