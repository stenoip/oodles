var cors = require('./_cors');

module.exports = function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  res.status(200).json({ ok: true });
};
