var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');
var generate = require('./generate');
var crawlOne = generate.crawlOne;

// Helper to filter out logos, icons, and junk
function isValidImage(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Filter out common junk filenames found in sidebars/footers
  if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('sprite')) return false;
  if (lower.includes('transparent.png') || lower.includes('blank.gif')) return false;
  return true;
}

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
  var type = req.body && req.body.type; 

  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  // Mimic a real desktop browser to get the correct HTML layout
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  };

  try {
    // ==========================================
    // IMAGE SEARCH
    // ==========================================
    if (type === 'image') { // Matches what your frontend sends ('image')
      console.log('Searching images for:', q);

      const [bingImg, yahooImg] = await Promise.allSettled([
        axios.get(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&qs=ds&form=QBID`, { headers }),
        axios.get(`https://images.search.yahoo.com/search/images?p=${encodeURIComponent(q)}`, { headers })
      ]);

      let imageResults = [];

      // --- 1. Bing Images (High Precision) ---
      if (bingImg.status === 'fulfilled') {
        const $b = cheerio.load(bingImg.value.data);
        // Only target the specific class 'iusc' which Bing uses for result tiles
        $b('a.iusc').each((i, el) => {
          try {
            const m = JSON.parse($b(el).attr('m')); 
            if (m.murl && m.turl && isValidImage(m.murl)) {
              imageResults.push({
                title: m.desc || m.t || 'Image',
                pageUrl: m.purl,      // The webpage hosting the image
                thumbnail: m.turl,    // The actual image source
                source: 'Bing'
              });
            }
          } catch (e) { }
        });
      }

      // --- 2. Yahoo Images (Strict Container) ---
      if (yahooImg.status === 'fulfilled') {
        const $y = cheerio.load(yahooImg.value.data);
        // ONLY look inside '#sres' (Search Results). Ignore header/footer.
        $y('#sres li').each((i, el) => {
          try {
             // Yahoo puts the metadata in an anchor tag
             const a = $y(el).find('a').first();
             const img = $y(el).find('img').first();
             
             let imgUrl = img.attr('src');
             let pageUrl = a.attr('href');

             // Sometimes high-res is hidden in href params
             if (pageUrl && pageUrl.includes('imgurl=')) {
                const match = pageUrl.match(/imgurl=([^&]+)/);
                if (match) imgUrl = decodeURIComponent(match[1]);
             }

             if (imgUrl && isValidImage(imgUrl)) {
               imageResults.push({
                 title: a.attr('aria-label') || 'Yahoo Image',
                 pageUrl: pageUrl,
                 thumbnail: imgUrl,
                 source: 'Yahoo'
               });
             }
          } catch(e) {}
        });
      }

      console.log(`Found ${imageResults.length} clean images.`);
      res.status(200).json({ items: imageResults, total: imageResults.length });
      return;
    }

    // ==========================================
    //  WEB SEARCH (Standard)
    // ==========================================
    
    // 1. Fetch Pages
    const [bingHtml, yahooHtml, ddgHtml] = await Promise.allSettled([
        axios.get(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, { headers }),
        axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}`, { headers }),
        axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers })
    ]);

    var combined = [];

    // Bing Web Parsing
    if (bingHtml.status === 'fulfilled') {
        const $ = cheerio.load(bingHtml.value.data);
        $('li.b_algo').each((i, el) => {
            const title = $(el).find('h2').text();
            const url = $(el).find('a').attr('href');
            const desc = $(el).find('p').text();
            if (title && url) combined.push({ title, url, snippet: desc, source: 'Bing' });
        });
    }

    // Yahoo Web Parsing
    if (yahooHtml.status === 'fulfilled') {
        const $ = cheerio.load(yahooHtml.value.data);
        $('div.algo-sr').each((i, el) => {
            const title = $(el).find('h3.title a').text();
            const url = $(el).find('h3.title a').attr('href');
            const desc = $(el).find('.compText').text();
            if (title && url) combined.push({ title, url, snippet: desc, source: 'Yahoo' });
        });
    }

    // DuckDuckGo Web Parsing
    if (ddgHtml.status === 'fulfilled') {
        const $ = cheerio.load(ddgHtml.value.data);
        $('div.result').each((i, el) => {
            const title = $(el).find('h2.result__title a').text().trim();
            let url = $(el).find('h2.result__title a').attr('href');
            const desc = $(el).find('a.result__snippet').text().trim();
            
            if (url && url.startsWith('//duckduckgo.com/l/?uddg=')) {
                try { url = decodeURIComponent(new URL(url, 'https://duckduckgo.com').searchParams.get('uddg')); } catch(e){}
            }
            if (title && url) combined.push({ title, url, snippet: desc, source: 'DuckDuckGo' });
        });
    }

    // Respond immediately with search snippets (Fast)
    // We do NOT deep crawl here to keep it fast.
    res.status(200).json({ items: combined, total: combined.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
