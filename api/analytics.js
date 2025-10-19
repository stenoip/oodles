var cors = require('./_cors');

module.exports = async function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    var body = req.body || {};
    var url = body.url || '';
    var query = body.query || '';
    var ts = Date.now();

    // In production, store to a database or logging service.
    // For now, just acknowledge receipt.
    res.status(200).json({ ok: true, received: { url: url, query: query, ts: ts } });
  } catch (e) {
    res.status(500).json({ error: 'Analytics failed', details: e.message });
  }
};
