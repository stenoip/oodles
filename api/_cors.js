var ALLOWED_ORIGINS = [
  'https://stenoip.github.io',
  'http://127.0.0.1:8888'
];

function setCors(req, res) {
  // Logic to handle cases where only 'res' is passed from index.js
  var actualReq = req;
  var actualRes = res;

  if (!res && req && req.setHeader) {
    // If only one argument was passed and it looks like a response object
    actualRes = req;
    actualReq = req.req; // Most Node environments attach the request to the response
  }

  var origin = (actualReq && actualReq.headers) ? actualReq.headers.origin : null;

  if (ALLOWED_ORIGINS.includes(origin)) {
    // If the origin matches our list, allow it specifically
    actualRes.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Default fallback to your main production domain to prevent total lockout
    actualRes.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }

  actualRes.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  actualRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  setCors: setCors
};
