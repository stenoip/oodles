var chromium = require('@sparticuz/chromium');
var puppeteer = require('puppeteer-core');
var axios = require('axios');
var cheerio = require('cheerio');

function isValidImage(url) {
  if (!url) return false;
  var lower = url.toLowerCase();
  if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('sprite')) return false;
  return true;
}

module.exports = async function (req, res) {
  var q = req.body.q;
  var type = req.body.type || 'web';

  if (!q) return res.status(400).json({ error: 'Missing query' });

  var headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  try {
    // --- IMAGE SEARCH (HEADLESS MODE) ---
    if (type === 'image') {
      var browser = await puppeteer.launch({
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      var page = await browser.newPage();
      await page.goto(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}`, { waitUntil: 'networkidle2' });

      var images = await page.evaluate(function() {
        return Array.from(document.querySelectorAll('a.iusc')).map(function(node) {
          try {
            var m = JSON.parse(node.getAttribute('m'));
            return { title: m.desc, thumbnail: m.turl, originalUrl: m.murl, pageUrl: m.purl, source: 'Bing' };
          } catch (e) { return null; }
        }).filter(Boolean);
      });

      await browser.close();
      return res.status(200).json({ items: images.filter(img => isValidImage(img.originalUrl)).slice(0, 50), total: images.length });
    }

    // --- WEB SEARCH (AXIOS MODE - LOW RAM) ---
    var urls = [
      `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
      `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
      `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`
    ];

    var responses = await Promise.allSettled(urls.map(u => axios.get(u, { headers, timeout: 5000 })));
    var combined = [];

    responses.forEach(function(res, idx) {
      if (res.status === 'fulfilled') {
        var $ = cheerio.load(res.value.data);
        if (idx === 0) { // Brave
          $('.snippet').each(function() {
            combined.push({ title: $(this).find('.snippet-title').text(), url: $(this).find('a').attr('href'), snippet: $(this).find('.snippet-description').text(), source: 'Brave' });
          });
        } else if (idx === 1) { // Bing
          $('li.b_algo').each(function() {
            combined.push({ title: $(this).find('h2').text(), url: $(this).find('a').attr('href'), snippet: $(this).find('p').text(), source: 'Bing' });
          });
        }
      }
    });

    res.status(200).json({ items: combined, total: combined.length });

  } catch (err) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
