var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');
var generate = require('./generate');
var crawlOne = generate.crawlOne;

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
  var type = req.body && req.body.type; // Check for 'images'
  
  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  // Common headers to mimic a real browser (prevents 403 blocks)
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  };

  try {
    // ==========================================
    // IMAGE SEARCH MODE
    // ==========================================
    if (type === 'images') {
      console.log('Starting Image Search for:', q);
      
      const [bingImg, yahooImg, braveImg] = await Promise.allSettled([
        // Bing Images
        axios.get(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&qs=ds&form=QBID&first=1`, { headers }),
        // Yahoo Images
        axios.get(`https://images.search.yahoo.com/search/images?q=${encodeURIComponent(q)}`, { headers }),
        // Brave Images
        axios.get(`https://search.brave.com/images?q=${encodeURIComponent(q)}&source=web`, { headers })
      ]);

      let imageResults = [];

      // --- Bing Image Processing ---
      if (bingImg.status === 'fulfilled') {
        const $b = cheerio.load(bingImg.value.data);
        $b('a.iusc').each((i, el) => {
          try {
            const m = JSON.parse($b(el).attr('m')); // Bing stores metadata in 'm' attribute
            if (m.murl) {
              imageResults.push({
                title: m.desc || m.t,
                url: m.murl, // Full size image
                thumbnail: m.turl,
                source: 'Bing Images'
              });
            }
          } catch (e) { /* ignore parse errors */ }
        });
        console.log('Bing Images found:', imageResults.filter(r => r.source === 'Bing Images').length);
      }

      // --- Yahoo Image Processing ---
      if (yahooImg.status === 'fulfilled') {
        const $y = cheerio.load(yahooImg.value.data);
        // Yahoo is often tricky; looking for list items or standard anchors
        $y('li a').each((i, el) => {
            const href = $y(el).attr('href');
            const img = $y(el).find('img').attr('src');
            // Yahoo sometimes uses a redirect URL; we try to grab it
            if (href && img && href.includes('imgurl=')) {
                // Try to extract real URL from query param if possible
                const match = href.match(/imgurl=([^&]+)/);
                const realUrl = match ? decodeURIComponent(match[1]) : href;
                imageResults.push({
                    title: $y(el).attr('aria-label') || 'Yahoo Image',
                    url: realUrl,
                    thumbnail: img,
                    source: 'Yahoo Images'
                });
            }
        });
        console.log('Yahoo Images processed.');
      }

      // --- Brave Image Processing ---
      if (braveImg.status === 'fulfilled') {
         // Brave is heavily JS/React. Axios might only get the shell. 
         // We look for a <script> tag or fallback to basic parsing if they serve static.
         const $br = cheerio.load(braveImg.value.data);
         // Attempt to find images in standard tags just in case
         $br('img.image-result').each((i, el) => {
             imageResults.push({
                 title: $br(el).attr('alt') || 'Brave Image',
                 url: $br(el).attr('src'),
                 thumbnail: $br(el).attr('src'),
                 source: 'Brave Images'
             });
         });
         // If Brave returned a script with data (common in SPAs), parsing would go here.
         console.log('Brave Images processed.');
      }

      res.status(200).json({ results: imageResults });
      return;
    }

    // ==========================================
    // TEXT SEARCH MODE (Original Logic)
    // ==========================================
    
    // --- Bing scraping ---
    var bingHtml = await axios.get('https://www.bing.com/search?q=' + encodeURIComponent(q), { headers });
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
    var yahooHtml = await axios.get('https://search.yahoo.com/search?p=' + encodeURIComponent(q), { headers });
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
    var ddgHtml = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers });
    var $ddg = cheerio.load(ddgHtml.data);
    var ddgResults = [];

    $ddg('div.result.results_links.results_links_deep.web-result').each(function () {
      var title = $ddg(this).find('h2.result__title a.result__a').text().trim();
      var url = $ddg(this).find('h2.result__title a.result__a').attr('href');
      var desc = $ddg(this).find('a.result__snippet').text().trim();

      if (url && url.startsWith('//duckduckgo.com/l/?uddg=')) {
        try {
          const parsed = new URL(url, 'https://duckduckgo.com');
          const target = parsed.searchParams.get('uddg');
          if (target) url = decodeURIComponent(target);
        } catch (e) { }
      }

      if (title && url) {
        ddgResults.push({ title, url, description: desc, source: 'DuckDuckGo' });
      }
    });
    console.log('DuckDuckGo results found:', ddgResults.length);

    // --- Combine and crawl ---
    var combined = bingResults.concat(yahooResults).concat(ddgResults);
    var crawledResults = [];

    // Parallel crawling for better performance
    const crawlPromises = combined.map(async (result) => {
      console.log('Crawling', result.source, result.url);
      try {
        var crawled = await crawlOne(result.url);
        return {
          title: crawled.title,
          url: crawled.url,
          description: crawled.description,
          headings: crawled.headings,
          content: crawled.content,
          source: result.source,
          _score: 0
        };
      } catch (e) {
        return {
          title: result.title,
          url: result.url,
          description: result.description || 'Failed to crawl',
          headings: [],
          content: '',
          source: result.source,
          _score: 0
        };
      }
    });

    crawledResults = await Promise.all(crawlPromises);

    res.status(200).json({ results: crawledResults });
  } catch (err) {
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
