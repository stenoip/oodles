var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

// Helper function to create a delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

  // Define pagination and request constants
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  const MAX_PAGES_TO_SCRAPE = 3; // Scrape first 3 pages (Page 1, 2, 3)
  const PAUSE_BETWEEN_PAGES_MS = 2000; // 2 seconds delay
  
  const BING_RESULTS_PER_PAGE = 10;
  const YAHOO_RESULTS_PER_PAGE = 10;
  const BRAVE_RESULTS_PER_PAGE = 10; 

  const AXIOS_CONFIG = {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 8000 // Increased timeout to 8s
  };

  try {
    let combined = [];

    // --- 1. Brave scraping with Pagination and Delay ---
    console.log('Starting Brave scraping...');
    var braveResults = [];

    for (let page = 0; page < MAX_PAGES_TO_SCRAPE; page++) {
        if (page > 0) await sleep(PAUSE_BETWEEN_PAGES_MS);
        
        const offset = page * BRAVE_RESULTS_PER_PAGE;
        const braveUrl = `https://search.brave.com/search?q=${encodeURIComponent(q)}&offset=${offset}&spellcheck=0`;

        try {
            var braveHtml = await axios.get(braveUrl, AXIOS_CONFIG);
            var $brave = cheerio.load(braveHtml.data);

            // Refined Brave selector to capture results more reliably
            $brave('div.result').each(function () {
              var title = $brave(this).find('a.title').text().trim();
              var url = $brave(this).find('a.title').attr('href');
              var desc = $brave(this).find('div.snippet-content').text().trim();
              
              if (title && url && url.startsWith('http')) {
                if (!braveResults.some(r => r.url === url)) {
                    braveResults.push({ title, url, description: desc, source: 'Brave' });
                }
              }
            });
            console.log(`Brave results found on page ${page + 1}: ${braveResults.length} total.`);

            if ($brave('div.result').length === 0) break; 

        } catch (error) {
            console.error(`Error scraping Brave page ${page + 1}: ${error.message}`);
            break;
        }
    }
    combined = combined.concat(braveResults);


    // --- 2. Bing scraping with Pagination and Delay ---
    console.log('Starting Bing scraping...');
    var bingResults = [];
    
    for (let page = 0; page < MAX_PAGES_TO_SCRAPE; page++) {
        if (page > 0) await sleep(PAUSE_BETWEEN_PAGES_MS);
        
        const firstParam = (page * BING_RESULTS_PER_PAGE) + 1;
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&first=${firstParam}`;

        try {
            var bingHtml = await axios.get(bingUrl, AXIOS_CONFIG);
            var $bing = cheerio.load(bingHtml.data);
            
            $bing('li.b_algo').each(function () {
              var title = $bing(this).find('h2').text();
              var url = $bing(this).find('a').attr('href');
              var desc = $bing(this).find('p').text();
              if (title && url) {
                if (!bingResults.some(r => r.url === url)) {
                    bingResults.push({ title, url, description: desc, source: 'Bing' });
                }
              }
            });
            console.log(`Bing results found on page ${page + 1}: ${bingResults.length} total.`);

            if ($bing('li.b_algo').length === 0) break; 
            
        } catch (error) {
            console.error(`Error scraping Bing page ${page + 1}: ${error.message}`);
            break;
        }
    }
    combined = combined.concat(bingResults);

    // --- 3. Yahoo scraping with Pagination and Delay ---
    console.log('Starting Yahoo scraping...');
    var yahooResults = [];

    for (let page = 0; page < MAX_PAGES_TO_SCRAPE; page++) {
        if (page > 0) await sleep(PAUSE_BETWEEN_PAGES_MS);
        
        const bParam = (page * YAHOO_RESULTS_PER_PAGE) + 1;
        const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(q)}&b=${bParam}`;

        try {
            var yahooHtml = await axios.get(yahooUrl, AXIOS_CONFIG);
            var $yahoo = cheerio.load(yahooHtml.data);
            
            $yahoo('div.algo-sr').each(function () {
              var title = $yahoo(this).find('h3.title a').text();
              var url = $yahoo(this).find('h3.title a').attr('href');
              var desc = $yahoo(this).find('.compText').text();
              if (title && url) {
                if (!yahooResults.some(r => r.url === url)) {
                    yahooResults.push({ title, url, description: desc, source: 'Yahoo' });
                }
              }
            });
            console.log(`Yahoo results found on page ${page + 1}: ${yahooResults.length} total.`);

            if ($yahoo('div.algo-sr').length === 0) break;
            
        } catch (error) {
            console.error(`Error scraping Yahoo page ${page + 1}: ${error.message}`);
            break;
        }
    }
    combined = combined.concat(yahooResults);

    // --- 4. DuckDuckGo scraping (Single Page - No Pagination due to complexity) ---
    console.log('Starting DuckDuckGo scraping (Page 1 only)...');
    var ddgResults = [];

    try {
        var ddgHtml = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), AXIOS_CONFIG);
        var $ddg = cheerio.load(ddgHtml.data);
    
        $ddg('div.result.results_links.results_links_deep.web-result').each(function () {
          var title = $ddg(this).find('h2.result__title a.result__a').text().trim();
          var url = $ddg(this).find('h2.result__title a.result__a').attr('href');
          var desc = $ddg(this).find('a.result__snippet').text().trim();
    
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
    } catch (error) {
        console.error(`Error scraping DuckDuckGo: ${error.message}`);
    }
    combined = combined.concat(ddgResults);
    
    
    // --- 5. Crawl Destination Pages (Unchanged Logic) ---
    console.log(`Total unique search results found: ${combined.length}. Starting crawl...`);
    var crawledResults = [];
    
    const LOW_VALUE_FILTERS = ['favicon', 'icon', 'data:image', 'instagram', 'twitter', 'facebook', 'linkedin', 'google', 'wiki'];

    for (var i = 0; i < combined.length; i++) {
      var result = combined[i];
      if (!result.url.startsWith('http')) continue;
      
      console.log(`[${i + 1}/${combined.length}] Crawling destination: ${result.url}`);

      // Adding a small delay here too, to be cautious
      await sleep(500); 

      try {
        var pageResponse = await axios.get(result.url, AXIOS_CONFIG);
        var $page = cheerio.load(pageResponse.data);

        // --- EXTRACT ALL IMAGES WITHOUT RANKING ---
        var finalImages = new Set();
        
        $page('img').each(function() {
            var src = $page(this).attr('src') || $page(this).attr('data-src');
            
            if (src) {
                try {
                    var absoluteUrl = new URL(src, result.url).href;
                    if (!absoluteUrl.startsWith('http')) return; 

                    let lowerUrl = absoluteUrl.toLowerCase();
                    let isBase64 = lowerUrl.startsWith('data:');
                    
                    if (isBase64) return; 

                    let isLowValue = LOW_VALUE_FILTERS.some(filter => lowerUrl.includes(filter));
                    
                    if (!isLowValue) {
                         finalImages.add(absoluteUrl);
                    }

                } catch (err) { 
                    // Invalid URL
                }
            }
        });
        
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
          images: finalImagesArray, 
          source: result.source,
          _score: 0
        });

      } catch (e) {
        console.error(`Failed to crawl ${result.url}: ${e.message}`);
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
