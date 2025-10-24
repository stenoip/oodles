// Copyright Stenoip Company

// List of allowed origins
var ALLOWED_ORIGINS = [
  'https://stenoip.github.io',
  'https://www.w3schools.com/html/tryit.asp?filename=tryhtml_basic' // Added the origin for the specified URL
];

function setCors(res, req) {
  // Get the origin from the request headers
  var origin = req.headers.origin;

  // Check if the request origin is in the allowed list
  if (ALLOWED_ORIGINS.includes(origin)) {
    // Set the specific allowed origin header
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // For origins not in the allowed list, you can choose to set a default (e.g., the first one) or not set the header at all.

  }

  // These methods and headers are typically allowed for preflight and standard requests regardless of origin
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  setCors: setCors
};
