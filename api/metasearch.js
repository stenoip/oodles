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
  var type = req.body && req.body.type; // 'images' or 'web'

  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  // User-Agent is CRITICAL. Without it, Bing/Yahoo return a "Mobile/Basic" version 
  // with completely different HTML classes, often breaking the scraper.
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  };

  try {
    // ==================================================================
    // 🖼️ IMAGE SEARCH (Fixes the "Logo/Icon" issue)
    // ==================================================================
    if (type === 'images') {
      console.log('Fetching images for:', q);

      // We skip Brave for images because it is a Single Page App (React) 
      // and requires a real browser (Puppeteer) to render the image grid.
      // Axios will only see the "loading" skeleton or noscript icons.
      
      const [bingImg, yahooImg] = await Promise.allSettled([
        axios.get(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&qs=ds&form=QBID&first=1`, { headers }),
        axios.get(`https://images.search.yahoo.com/search/images?q=${encodeURIComponent(q)}`, { headers })
      ]);

      let imageResults = [];

      // --- 1. Bing Images (Strict Mode) ---
      if (bingImg.status === 'fulfilled') {
        const $b = cheerio.load(bingImg.value.data);
        // Selector: 'a.iusc' is the specific class for Bing Image Grid Items
        $b('a.iusc').each((i, el) => {
          try {
            // Bing hides the high-res URL in a JSON string inside the 'm' attribute
            const m = JSON.parse($b(el).attr('m')); 
            if (m.murl && m.turl) {
              imageResults.push({
                title: m.desc || m.t || 'Image',
                url: m.murl,       // The high-res image
                thumbnail: m.turl, // The preview thumbnail
                source: 'Bing'
              });
            }
          } catch (e) { /* ignore parse error */ }
        });
      }

      // --- 2. Yahoo Images (Strict Mode) ---
      if (yahooImg.status === 'fulfilled') {
        const $y = cheerio.load(yahooImg.value.data);
        // Selector: '#sres' is the Search Results container. 
        // We only look for 'li' items strictly inside this container to avoid footer icons.
        $y('#sres li').each((i, el) => {
          try {
            // Yahoo usually puts the link in an anchor tag with class 'ld' or direct 'a'
            const anchor = $y(el).find('a').first();
            const imgTag = $y(el).find('img').first();
            const href = anchor.attr('href');
            
            // We verify it looks like a Yahoo image redirect
            if (href && imgTag.attr('src')) {
               // Attempt to find high-res URL in query params (imgurl=...)
               let realUrl = href;
               const match = href.match(/imgurl=([^&]+)/);
               if (match) {
                 realUrl = decodeURIComponent(match[1]);
               }

               // Filter out tiny icons (sometimes 'sp.yimg.com' tracking pixels sneak in)
               if (realUrl.length > 20) { 
                 imageResults.push({
                   title: anchor.attr('aria-label') || 'Yahoo Image',
                   url: realUrl,
                   thumbnail: imgTag.attr('src'),
                   source: 'Yahoo'
                 });
               }
            }
          } catch (e) { }
        });
      }

      console.log(`Found ${imageResults.length} images.`);
      res.status(200).json({ results: imageResults });
      return;
    }

    // ==================================================================
    //  WEB SEARCH 
    // ==================================================================
    
    // --- Bing Web ---
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

    // --- Yahoo Web ---
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

    // --- DuckDuckGo Web ---
    var ddgHtml = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers });
    var $ddg = cheerio.load(ddgHtml.data);
    var ddgResults = [];
    $ddg('div.result').each(function () {
      var title = $ddg(this).find('h2.result__title a').text().trim();
      var url = $ddg(this).find('h2.result__title a').attr('href');
      var desc = $ddg(this).find('a.result__snippet').text().trim();
      
      // Decode DDG redirect
      if (url && url.startsWith('//duckduckgo.com/l/?uddg=')) {
        try { url = decodeURIComponent(new URL(url, 'https://duckduckgo.com').searchParams.get('uddg')); } catch(e){}
      }

      if (title && url) {
        ddgResults.push({ title, url, description: desc, source: 'DuckDuckGo' });
      }
    });

    // Combine
    var combined = [...bingResults, ...yahooResults, ...ddgResults];
    
    // Parallel Crawl for Content
    const crawledResults = await Promise.all(combined.map(async (result) => {
      try {
        var crawled = await crawlOne(result.url);
        return { ...result, ...crawled, _score: 0 };
      } catch (e) {
        return { ...result, headings: [], content: '', _score: 0 };
      }
    }));

    res.status(200).json({ results: crawledResults });

  } catch (err) {
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
