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
  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    // --- Bing web search ---
    const bingHtml = await axios.get('https://www.bing.com/search?q=' + encodeURIComponent(q));
    const $bing = cheerio.load(bingHtml.data);
    const bingResults = [];
    $bing('li.b_algo').each(function () {
      const title = $bing(this).find('h2').text();
      const url = $bing(this).find('a').attr('href');
      const desc = $bing(this).find('p').text();
      if (title && url) {
        bingResults.push({ title, url, description: desc, source: 'Bing' });
      }
    });

    // --- Yahoo web search ---
    const yahooHtml = await axios.get('https://search.yahoo.com/search?p=' + encodeURIComponent(q));
    const $yahoo = cheerio.load(yahooHtml.data);
    const yahooResults = [];
    $yahoo('div.algo-sr').each(function () {
      const title = $yahoo(this).find('h3.title a').text();
      const url = $yahoo(this).find('h3.title a').attr('href');
      const desc = $yahoo(this).find('.compText').text();
      if (title && url) {
        yahooResults.push({ title, url, description: desc, source: 'Yahoo' });
      }
    });

    // --- DuckDuckGo web search ---
    const ddgHtml = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q));
    const $ddg = cheerio.load(ddgHtml.data);
    const ddgResults = [];
    $ddg('div.result.results_links.results_links_deep.web-result').each(function () {
      let title = $ddg(this).find('h2.result__title a.result__a').text().trim();
      let url = $ddg(this).find('h2.result__title a.result__a').attr('href');
      let desc = $ddg(this).find('a.result__snippet').text().trim();

      if (url && url.startsWith('//duckduckgo.com/l/?uddg=')) {
        try {
          const parsed = new URL(url, 'https://duckduckgo.com');
          const target = parsed.searchParams.get('uddg');
          if (target) url = decodeURIComponent(target);
        } catch (e) {}
      }

      if (title && url) {
        ddgResults.push({ title, url, description: desc, source: 'DuckDuckGo' });
      }
    });

    // --- Bing Images ---
    const bingImgHtml = await axios.get('https://www.bing.com/images/search?q=' + encodeURIComponent(q));
    const $bingImg = cheerio.load(bingImgHtml.data);
    const bingImageResults = [];
    $bingImg('a.iusc').each(function () {
      const m = $bingImg(this).attr('m'); // contains JSON metadata
      if (m) {
        try {
          const meta = JSON.parse(m);
          if (meta.murl) {
            bingImageResults.push({ image: meta.murl, source: 'Bing Images' });
          }
        } catch (e) {}
      }
    });

    // --- Yahoo Images ---
    const yahooImgHtml = await axios.get('https://images.search.yahoo.com/search/images?p=' + encodeURIComponent(q));
    const $yahooImg = cheerio.load(yahooImgHtml.data);
    const yahooImageResults = [];
    $yahooImg('li.ld').each(function () {
      const img = $yahooImg(this).find('img').attr('src');
      if (img) {
        yahooImageResults.push({ image: img, source: 'Yahoo Images' });
      }
    });

    // --- Brave Images ---
    const braveImgHtml = await axios.get('https://search.brave.com/images?q=' + encodeURIComponent(q));
    const $braveImg = cheerio.load(braveImgHtml.data);
    const braveImageResults = [];
    $braveImg('img').each(function () {
      const src = $braveImg(this).attr('src');
      if (src && src.startsWith('http')) {
        braveImageResults.push({ image: src, source: 'Brave Images' });
      }
    });

    // --- Combine all ---
    const combined = bingResults.concat(yahooResults).concat(ddgResults);
    const crawledResults = [];

    for (let result of combined) {
      try {
        const crawled = await crawlOne(result.url);
        crawledResults.push({
          title: crawled.title,
          url: crawled.url,
          description: crawled.description,
          headings: crawled.headings,
          content: crawled.content,
          images: crawled.images,
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
          images: [],
          source: result.source,
          _score: 0
        });
      }
    }

    res.status(200).json({
      results: crawledResults,
      imageResults: bingImageResults.concat(yahooImageResults).concat(braveImageResults)
    });
  } catch (err) {
    res.status(500).json({ error: 'MetaSearch failed', details: err.message });
  }
};
