/*
########  ########  ########    ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##        ##
##    ##  ##    ##  ##      ##  ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##              ##
########  ########  ########    ########  ######    ########    Search

Copyright Stenoip Company. All rights reserved.
*/
'use strict';

// Import the CORS helper and the search logic
var { setCors } = require('./_cors');
var metasearch = require('./metasearch');

module.exports = async function (req, res) {
    // 1. Set CORS headers so the frontend can receive the data
    setCors(res);

    // 2. Handle the pre-flight request from browsers
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    /**
     * 3. Bridge GET and POST:
     * Your frontend sends GET requests like: /api?q=hello&type=image
     * Our headless logic in metasearch.js reads from req.body.
     * We map the query parameters into the body object here.
     */
    var q = (req.query && req.query.q) || (req.body && req.body.q);
    var type = (req.query && req.query.type) || (req.body && req.body.type) || 'web';
    
    // Normalize the body for the next module
    req.body = {
        q: q,
        type: type
    };

    try {
        // 4. Execute the search logic
        // This will trigger Puppeteer for images or Axios for web
        return await metasearch(req, res);
    } catch (err) {
        console.error('Routing Error in index.js:', err);
        
        // Prevent the backend from hanging on error
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Oodles Search Router Error', 
                message: err.message 
            });
        }
    }
};
