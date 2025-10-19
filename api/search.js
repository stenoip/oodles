var cors = require('./_cors');

function normalize(str) {
  return (str || '').toLowerCase();
}

// Very simple stemming (truncate common suffixes)
function stem(word) {
  var w = word.toLowerCase();
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);
  return w;
}

// Simple synonym dictionary (extend as needed)
function getSynonyms(term) {
  var dict = {
    run: ['running', 'ran', 'jog', 'sprint'],
    eat: ['eating', 'ate', 'consume', 'dine'],
    quick: ['fast', 'rapid', 'speedy'],
    learn: ['study', 'training', 'education']
  };
  var key = stem(term);
  return dict[key] || [];
}

function expandQueryTerms(query) {
  var tokens = query.split(/\s+/).map(function(t) { return t.trim(); }).filter(Boolean);
  var expanded = {};
  tokens.forEach(function(t) {
    var base = stem(t);
    expanded[base] = true;
    expanded[t.toLowerCase()] = true;
    getSynonyms(t).forEach(function(s) {
      expanded[stem(s)] = true;
      expanded[s.toLowerCase()] = true;
    });
  });
  return Object.keys(expanded);
}

// Weight tuning: adjust these to shape relevance
var WEIGHTS = {
  title: 10,
  heading: 6,
  description: 4,
  content: 2,
  helpful_long_content: 3,
  helpful_rich_description: 1,
  synonym_hit: 1
};

function scoreItem(item, queryTerms) {
  var score = 0;

  // Prepare fields
  var title = normalize(item.title);
  var description = normalize(item.description);
  var content = normalize(item.content || '');
  var headings = (item.headings || []).map(function(h) { return normalize(h); });

  // Exact term hits
  queryTerms.forEach(function(term) {
    if (title.indexOf(term) !== -1) score += WEIGHTS.title;
    if (headings.some(function(h) { return h.indexOf(term) !== -1; })) score += WEIGHTS.heading;
    if (description.indexOf(term) !== -1) score += WEIGHTS.description;
    if (content.indexOf(term) !== -1) score += WEIGHTS.content;
  });

  // Helpfulness signals
  if (content && content.length > 1000) score += WEIGHTS.helpful_long_content;
  if (description && description.length > 150) score += WEIGHTS.helpful_rich_description;

  return score;
}

module.exports = async function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Inputs can be POST { q, index, page, limit } or GET ?q=&page=&limit=
    var q = (req.method === 'GET' ? (req.query && req.query.q) : (req.body && req.body.q)) || '';
    var index = (req.method === 'GET' ? null : (req.body && req.body.index)) || null;
    var page = parseInt((req.method === 'GET' ? (req.query && req.query.page) : (req.body && req.body.page)) || 1, 10);
    var limit = parseInt((req.method === 'GET' ? (req.query && req.query.limit) : (req.body && req.body.limit)) || 10, 10);

    if (!q) {
      res.status(400).json({ error: 'Missing query parameter q' });
      return;
    }

    // If no index provided, ad-hoc single url search via GET /search?q=...&url=...
    if (!index) {
      var url = req.query && req.query.url;
      if (!url) {
        res.status(400).json({ error: 'Provide index in POST body or include ?url= for ad-hoc search' });
        return;
      }
      // Minimal ad-hoc crawl
      var axios = require('axios');
      var cheerio = require('cheerio');
      try {
        var response = await axios.get(url, { timeout: 15000 });
        var $ = cheerio.load(response.data);
        var title = $('title').first().text() || url;
        var description = $('meta[name="description"]').attr('content') || 'No description available';
        var headings = [];
        $('h1,h2,h3').each(function() { headings.push($(this).text()); });
        var content = $('body').text().replace(/\s+/g, ' ').trim();
        index = [{ title: title, url: url, description: description, headings: headings, content: content }];
      } catch (e) {
        res.status(500).json({ error: 'Failed ad-hoc crawl', details: e.message });
        return;
      }
    }

    if (!Array.isArray(index)) {
      res.status(400).json({ error: 'index must be an array of items' });
      return;
    }

    // Expand query with stems/synonyms
    var queryTerms = expandQueryTerms(q);

    // Score, filter, sort
    var scored = index.map(function(item) {
      var s = scoreItem(item, queryTerms);
      return { _score: s, item: item };
    }).filter(function(r) { return r._score > 0; })
      .sort(function(a, b) { return b._score - a._score; });

    // Pagination
    var total = scored.length;
    var start = Math.max(0, (page - 1) * limit);
    var paged = scored.slice(start, start + limit).map(function(r) {
      var out = {
        title: r.item.title,
        url: r.item.url,
        description: r.item.description,
        headings: r.item.headings,
        content: r.item.content,
        _score: r._score
      };
      // Keep html out of previews
      return out;
    });

    res.status(200).json({
      query: q,
      page: page,
      limit: limit,
      total: total,
      results: paged
    });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
