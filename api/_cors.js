var ALLOWED_ORIGINS = [
  'https://stenoip.github.io',
  'https://www.w3schools.com'
];

function setCors(req, res) { // Function signature needs to accept 'req' to check origin
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    // Only set the header if the request origin is in the allowed list
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  setCors: setCors
};
