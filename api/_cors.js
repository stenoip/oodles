var ALLOWED_ORIGINS = [
  'https://stenoip.github.io',
  'http://localhost:9000'
];

function setCors(req, res) {
  var origin = req.headers.origin;

  // Check if the incoming origin is in our allowed list
  if (ALLOWED_ORIGINS.includes(origin)) {
    // res.set is common in Express; use res.setHeader for native Node.js
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  setCors: setCors
};
