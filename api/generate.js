var fetch = require('node-fetch');
var cheerio = require('cheerio');
var _cors = require('./_cors');

module.exports = async function (req, res) {
  _cors.setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const urls = body.urls || [];
    const recursiveLevel = body.recursiveLevel || 1;
    const includeAllText = body.includeAllText || false;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty URLs array' });
    }

    // Helper function to fetch and extract metadata from a single URL
    async function scrapePage(url, depth = 1, visited = new Set()) {
      if (visited.has(url) || depth > recursiveLevel) return [];
      visited.add(url);

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MetaCrawler/1.0)' },
          timeout: 10000
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        const description =
          $('meta[name="description"]').attr('content') ||
          $('meta[name="Description"]').attr('content') ||
          $('meta[property="og:description"]').attr('content') ||
          '';

        const keywords =
          $('meta[name="keywords"]').attr('content') ||
          $('meta[name="Keywords"]').attr('content') ||
          '';

        const allText = includeAllText
          ? $('body').text().replace(/\s+/g, ' ').trim()
          : '';

        // --- NEW: Image Extraction Logic ---
        const images = [];
        $('img').each((_, el) => {
          const src = $(el).attr('src');
          if (src) {
            try {
              // Convert relative paths to absolute URLs
              const absoluteUrl = new URL(src, url).href;
              images.push(absoluteUrl);
            } catch (err) {
              // Ignore invalid URLs
            }
          }
        });
        // -----------------------------------

        const siteData = {
          url,
          title: $('title').text() || '',
          description,
          keywords,
          'all-text': allText,
          images: images // Added images to response
        };

        let results = [siteData];

        // Recursive crawling if requested
        if (depth < recursiveLevel) {
          const links = $('a[href]')
            .map((_, el) => $(el).attr('href'))
            .get()
            .filter(href => href && href.startsWith('http'));

          const uniqueLinks = [...new Set(links)].slice(0, 5); // limit per page

          const childResults = await Promise.allSettled(
            uniqueLinks.map(link => scrapePage(link, depth + 1, visited))
          );

          for (const cr of childResults) {
            if (cr.status === 'fulfilled') results = results.concat(cr.value);
          }
        }

        return results;
      } catch (err) {
        return [{ url, error: 'Failed to fetch or parse', details: err.message }];
      }
    }

    // Fetch all URLs in parallel
    const allResults = await Promise.allSettled(urls.map(url => scrapePage(url)));
    const indexData = [];

    for (const r of allResults) {
      if (r.status === 'fulfilled') indexData.push(...r.value);
      else indexData.push({ error: 'Failed to process URL' });
    }

    res.status(200).json({ success: true, data: indexData });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid JSON or request format' });
  }
};
