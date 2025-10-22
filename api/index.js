var express = require('express');
var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('cors');

var app = express();
app.use(cors());

// ------------ Config ------------
var CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
var DEFAULT_PAGE = 1;
var DEFAULT_SIZE = 10;

var cache = new Map(); // key -> { timestamp, data }

// ------------ Helpers ------------
function cacheKey(params) {
  return JSON.stringify(params);
}

function setCache(key, data) {
  cache.set(key, { timestamp: Date.now(), data: data });
}

function getCache(key) {
  var entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function buildSearchUrls(query) {
  return {
    bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    yahoo: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`,
    brave: `https://search.brave.com/search?q=${encodeURIComponent(query)}`
  };
}

function buildImageUrls(query) {
  return {
    bing: `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`,
    yahoo: `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}`
  };
}

function buildVideoUrls(query) {
  return {
    bing: `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}`,
    yahoo: `https://video.search.yahoo.com/search/video?p=${encodeURIComponent(query)}`
  };
}

async function fetchHtml(url) {
  var res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
                'image/webp,image/apng,*/*;q=0.8'
    },
    // Follow redirects to final HTML
    maxRedirects: 5,
    timeout: 15000
  });
  return res.data;
}

// ------------ Parsers ------------
function parseBingWeb(html) {
  var $ = cheerio.load(html);
  var results = [];
  $('li.b_algo').each(function () {
    var title = $(this).find('h2').text().trim();
    var link = $(this).find('h2 a').attr('href');
    var snippet = $(this).find('p').text().trim();
    if (title && link) results.push({ title: title, link: link, snippet: snippet, source: 'Bing' });
  });
  return results;
}

function parseYahooWeb(html) {
  var $ = cheerio.load(html);
  var results = [];
  // Yahoo sometimes uses different containers; include a couple fallbacks
  $('div.dd.algo, div.algo').each(function () {
    var title = $(this).find('h3.title, h3').first().text().trim();
    var link = $(this).find('a').first().attr('href');
    var snippet = $(this).find('div.compText, p').first().text().trim();
    if (title && link) results.push({ title: title, link: link, snippet: snippet, source: 'Yahoo' });
  });
  return results;
}

function parseBraveWeb(html) {
  var $ = cheerio.load(html);
  var results = [];
  // Brave’s structure changes; try multiple patterns
  // Common container: div.result or article.result; title often in a.result-title or h3 a
  $('div.result, article.result').each(function () {
    var anchor = $(this).find('a.result-title, h3 a, a').first();
    var title = anchor.text().trim();
    var link = anchor.attr('href');
    // Snippet candidates
    var snippet = $(this).find('div.snippet, .text-snippet, p').first().text().trim();
    if (title && link) results.push({ title: title, link: link, snippet: snippet, source: 'Brave' });
  });

  // Fallback: brave sometimes nests results differently
  if (results.length === 0) {
    $('a[href]').each(function () {
      var title = $(this).text().trim();
      var link = $(this).attr('href');
      if (title && link && link.startsWith('http')) {
        results.push({ title: title, link: link, snippet: '', source: 'Brave' });
      }
    });
  }

  return results;
}

function parseBingImages(html) {
  var $ = cheerio.load(html);
  var items = [];
  $('a.iusc').each(function () {
    var m = $(this).attr('m'); // JSON metadata
    try {
      var meta = m ? JSON.parse(m) : null;
      if (meta && meta.murl) {
        var thumb = meta.turl || '';
        items.push({
          title: meta.titl || '',
          imageUrl: meta.murl,
          thumbnailUrl: thumb,
          sourcePage: meta.purl || '',
          source: 'Bing'
        });
      }
    } catch (e) {}
  });
  return items;
}

function parseYahooImages(html) {
  var $ = cheerio.load(html);
  var items = [];
  $('li.ld, div#res li').each(function () {
    var img = $(this).find('img').first();
    var anchor = $(this).find('a').first();
    var title = img.attr('alt') || anchor.attr('title') || '';
    var thumbnailUrl = img.attr('src') || '';
    var sourcePage = anchor.attr('href') || '';
    if (thumbnailUrl && sourcePage) {
      items.push({
        title: title.trim(),
        imageUrl: thumbnailUrl, // Yahoo often uses proxied thumbnails; treat as imageUrl if no better field
        thumbnailUrl: thumbnailUrl,
        sourcePage: sourcePage,
        source: 'Yahoo'
      });
    }
  });
  return items;
}

function parseBingVideos(html) {
  var $ = cheerio.load(html);
  var items = [];
  $('li.video-item, div.mc_vtvc').each(function () {
    var anchor = $(this).find('a').first();
    var title = anchor.attr('title') || anchor.text().trim();
    var link = anchor.attr('href');
    var thumb = $(this).find('img').attr('src') || '';
    if (title && link) {
      items.push({
        title: title,
        videoUrl: link,
        thumbnailUrl: thumb,
        source: 'Bing'
      });
    }
  });
  return items;
}

function parseYahooVideos(html) {
  var $ = cheerio.load(html);
  var items = [];
  $('li.vd, div#res li').each(function () {
    var anchor = $(this).find('a').first();
    var img = $(this).find('img').first();
    var title = anchor.attr('title') || anchor.text().trim();
    var link = anchor.attr('href');
    var thumb = img.attr('src') || '';
    if (title && link) {
      items.push({
        title: title,
        videoUrl: link,
        thumbnailUrl: thumb,
        source: 'Yahoo'
      });
    }
  });
  return items;
}

// ------------ Crawlers ------------
async function crawlWeb(query) {
  var urls = buildSearchUrls(query);
  var all = [];

  // Bing
  try {
    var bingHtml = await fetchHtml(urls.bing);
    var bing = parseBingWeb(bingHtml);
    all = all.concat(bing);
  } catch (e) {
    console.error('Bing crawl error:', e.message);
  }

  // Yahoo
  try {
    var yahooHtml = await fetchHtml(urls.yahoo);
    var yahoo = parseYahooWeb(yahooHtml);
    all = all.concat(yahoo);
  } catch (e) {
    console.error('Yahoo crawl error:', e.message);
  }

  // Brave
  try {
    var braveHtml = await fetchHtml(urls.brave);
    var brave = parseBraveWeb(braveHtml);
    all = all.concat(brave);
  } catch (e) {
    console.error('Brave crawl error:', e.message);
  }

  return all;
}

async function crawlImages(query) {
  var urls = buildImageUrls(query);
  var items = [];

  // Bing Images
  try {
    var bingHtml = await fetchHtml(urls.bing);
    var bing = parseBingImages(bingHtml);
    items = items.concat(bing);
  } catch (e) {
    console.error('Bing images error:', e.message);
  }

  // Yahoo Images
  try {
    var yahooHtml = await fetchHtml(urls.yahoo);
    var yahoo = parseYahooImages(yahooHtml);
    items = items.concat(yahoo);
  } catch (e) {
    console.error('Yahoo images error:', e.message);
  }

  return items;
}

async function crawlVideos(query) {
  var urls = buildVideoUrls(query);
  var items = [];

  // Bing Videos
  try {
    var bingHtml = await fetchHtml(urls.bing);
    var bing = parseBingVideos(bingHtml);
    items = items.concat(bing);
  } catch (e) {
    console.error('Bing videos error:', e.message);
  }

  // Yahoo Videos
  try {
    var yahooHtml = await fetchHtml(urls.yahoo);
    var yahoo = parseYahooVideos(yahooHtml);
    items = items.concat(yahoo);
  } catch (e) {
    console.error('Yahoo videos error:', e.message);
  }

  return items;
}

// ------------ Pagination ------------
function paginate(items, page, size) {
  var start = (page - 1) * size;
  var end = start + size;
  var total = items.length;
  var totalPages = Math.max(1, Math.ceil(total / size));
  return {
    page: page,
    size: size,
    total: total,
    totalPages: totalPages,
    items: items.slice(start, end)
  };
}

// ------------ Routes ------------
app.get('/metasearch', async function (req, res) {
  try {
    var query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    var page = parseInt(req.query.page || DEFAULT_PAGE, 10);
    var size = parseInt(req.query.size || DEFAULT_SIZE, 10);
    var includeImages = String(req.query.includeImages || 'false') === 'true';
    var includeVideos = String(req.query.includeVideos || 'false') === 'true';

    var key = cacheKey({ type: 'metasearch', q: query, includeImages: includeImages, includeVideos: includeVideos });
    var cached = getCache(key);

    var webResults, imageResults, videoResults;

    if (cached) {
      webResults = cached.webResults;
      imageResults = cached.imageResults || [];
      videoResults = cached.videoResults || [];
    } else {
      webResults = await crawlWeb(query);
      imageResults = includeImages ? await crawlImages(query) : [];
      videoResults = includeVideos ? await crawlVideos(query) : [];
      setCache(key, { webResults: webResults, imageResults: imageResults, videoResults: videoResults });
    }

    var pagedWeb = paginate(webResults, page, size);

    res.json({
      query: query,
      web: pagedWeb,
      images: includeImages ? imageResults.slice(0, 50) : [],
      videos: includeVideos ? videoResults.slice(0, 50) : [],
      engines: ['Bing', 'Yahoo', 'Brave'],
      cache: !!cached
    });
  } catch (err) {
    console.error('metasearch error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ------------ Server ------------
var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Oodlebot backend running on port ' + PORT);
});
