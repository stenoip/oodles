var cors = require('./_cors');

module.exports = function(req, res) {
  cors.setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  var acceptsHtml = (req.headers.accept || '').indexOf('text/html') !== -1;

  if (acceptsHtml) {
    res.status(404).send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Oodles — 404</title>' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<style>body{background:#c0c0c0;font-family:Courier New,monospace;color:#000080;margin:0}' +
      'header{background:#000080;text-align:center;padding:20px;border-bottom:3px double #fff}' +
      '.wrap{max-width:800px;margin:0 auto;padding:30px 20px}' +
      '.panel{background:#fff;border:2px groove #808080;padding:20px}' +
      'a.btn{display:inline-block;margin-top:12px;padding:8px 14px;background:#000080;color:#fff;border:2px outset #fff;text-decoration:none}' +
      'a.btn:hover{background:#ffcc00;color:#000}' +
      '</style></head><body><header><h1 style="color:#fff;margin:0;">Oodles</h1></header>' +
      '<div class="wrap"><div class="panel"><h2>404 — Not found</h2>' +
      '<p>The resource you requested does not exist.</p>' +
      '<a class="btn" href="https://stenoip.github.io/oodles/">Go to Oodles home</a>' +
      '</div></div></body></html>'
    );
    return;
  }

  res.status(404).json({ error: 'Not found', path: req.url });
};
