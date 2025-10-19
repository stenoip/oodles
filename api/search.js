var cors = require('./_cors');

function normalize(str) {
  return (str || '').toLowerCase();
}

function scoreItem(item, query) {
  var q = normalize(query);
  var score = 0;

  // Title match = strong
  if (normalize(item.title).includes(q)) score += 5;

  // Headings match = medium
  if (item.headings && item.headings.some(h => normalize(h).includes(q))) score += 3;

  // Description match = medium
  if (normalize(item.description).includes(q)) score += 2;

  // Body content match = weak
  if (normalize(item.content).includes(q)) score += 1;

  // Helpfulness: reward longer content
  if (item.content && item.content.length > 500) score += 2;
  if (item.description && item.description.length > 100) score += 1;

  return score;
}

module.exports = async function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var query = req.query.q || (req.body && req.body.q);
    var index = req.body && req.body.index;

    if (!query || !index) {
      return res.status(400).json({ error: 'Missing query or index' });
    }

    var results = index
      .map(item => ({ ...item, _score: scoreItem(item, query) }))
      .filter(r => r._score > 0)
      .sort((a, b) => b._score - a._score);

    // Don’t expose raw HTML in previews
    results.forEach(r => { delete r.html; });

    res.status(200).json({ results: results });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
