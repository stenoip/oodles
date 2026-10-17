var ALLOWED_ORIGINS = [
  'https://stenoip.com',
  'http://127.0.0.1:8888',
  'http://localhost',
  'capacitor://localhost',
  'http://localhost:3000'
];

function setCors(req, res) {
  var actualReq = req;
  var actualRes = res;

  if (!res && req && req.setHeader) {
    actualRes = req;
    actualReq = req.req;
  }

  var origin = (actualReq && actualReq.headers) ? actualReq.headers.origin : null;

  // Check if origin is allowed or matches local/capacitor patterns
  if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('capacitor://')) {
    actualRes.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    actualRes.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }

  actualRes.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  actualRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  setCors: setCors
};
