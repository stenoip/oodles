var chromium = require('@sparticuz/chromium');
var puppeteer = require('puppeteer-core');
var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('./_cors');

// Helper to filter out logos, icons, and junk
function isValidImage(url) {
  if (!url) return false;
  var lower = url.toLowerCase();
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

  var headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  };

  try {
    // ==========================================
    // 🖼️ IMAGE SEARCH (Using Headless for Depth)
    // ==========================================
    if (type === 'image') {
      var browser = null;
      try {
        browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          ignoreHTTPSErrors: true,
        });

        var page = await browser.newPage();
        await page.setUserAgent(headers['User-Agent']);
        
        // We target Bing as the primary high-res source for headless
        await page.goto(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=QBID`, { 
          waitUntil: 'networkidle2',
          timeout: 15000 
        });

        var images = await page.evaluate(function() {
          var results = [];
          var nodes = document.querySelectorAll('a.iusc');
          nodes.forEach(function(node) {
            try {
              var m = JSON.parse(node.getAttribute('m'));
              if (m.murl) {
                results.push({
                  title: m.desc || "Image",
                  thumbnail: m.turl,
                  url: m.murl,
                  pageUrl: m.purl,
                  source: "Bing"
                });
              }
            } catch (e) {}
          });
          return results;
        });

        await browser.close();
        
        // Filter out junk from the final array
        var filteredImages = images.filter(function(img) {
            return isValidImage(img.url);
        }).slice(0, 40);

        return res.status(200).json({ items: filteredImages, total: filteredImages.length });

      } catch (browserError) {
        if (browser) await browser.close();
        throw browserError;
      }
    }

    // ==========================================
    // 📄 WEB SEARCH (Standard - Including Brave)
    // ==========================================
    
    var requests = [
        axios.get(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, { headers }),
        axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}`, { headers }),
        axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers }),
        axios.get(`https://search.brave.com/search?q=${encodeURIComponent(q)}`, { headers })
    ];

    var responses = await Promise.allSettled(requests);
    var combined = [];

    // 1. Bing Parsing
    if (responses[0].status === 'fulfilled') {
        var $bing = cheerio.load(responses[0].value.data);
        $bing('li.b_algo').each(function() {
            var title = $bing(this).find('h2').text();
            var url = $bing(this).find('a').attr('href');
            var desc = $bing(this).find('p').text();
            if (title && url) combined.push({ title: title, url: url, snippet: desc, source: 'Bing' });
        });
    }

    // 2. Yahoo Parsing
    if (responses[1].status === 'fulfilled') {
        var $yahoo = cheerio.load(responses[1].value.data);
        $yahoo('div.algo-sr').each(function() {
            var title = $yahoo(this).find('h3.title a').text();
            var url = $yahoo(this).find('h3.title a').attr('href');
            var desc = $yahoo(this).find('.compText').text();
            if (title && url) combined.push({ title: title, url: url, snippet: desc, source: 'Yahoo' });
        });
    }

    // 3. DuckDuckGo Parsing
    if (responses[2].status === 'fulfilled') {
        var $ddg = cheerio.load(responses[2].value.data);
        $ddg('div.result').each(function() {
            var title = $ddg(this).find('h2.result__title a').text().trim();
            var url = $ddg(this).find('h2.result__title a').attr('href');
            var desc = $ddg(this).find('a.result__snippet').text().trim();
            if (url && url.startsWith('//duckduckgo.com/l/?uddg=')) {
                try { url = decodeURIComponent(new URL(url, 'https://duckduckgo.com').searchParams.get('uddg')); } catch(e){}
            }
            if (title && url) combined.push({ title: title, url: url, snippet: desc, source: 'DuckDuckGo' });
        });
    }

    // 4. Brave Parsing
    if (responses[3].status === 'fulfilled') {
        var $brave = cheerio.load(responses[3].value.data);
        $brave('.snippet').each(function() {
            var title = $brave(this).find('.snippet-title').text().trim();
            var url = $brave(this).find('a').attr('href');
            var desc = $brave(this).find('.snippet-description').text().trim();
            if (title && url) combined.push({ title: title, url: url, snippet: desc, source: 'Brave' });
        });
    }

    res.status(200).json({ items: combined, total: combined.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
