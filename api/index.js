/*
########  ########  ########    ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##        ##
##    ##  ##    ##  ##      ##  ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##              ##
########  ########  ########    ########  ######    ########    Search
*/
'use strict';

var { setCors } = require('./_cors');
var metasearch = require('./metasearch');

module.exports = async function (req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Map URL parameters (GET) to the body object (POST-style) for metasearch.js
    var q = req.query.q || (req.body && req.body.q);
    var type = req.query.type || (req.body && req.body.type);
    
    // Inject into req.body so metasearch.js sees them
    req.body = { q: q, type: type };

    try {
        // Direct internal call to our logic
        return await metasearch(req, res);
    } catch (err) {
        console.error('Routing Error:', err);
        res.status(500).json({ error: 'Oodles Internal Router Error', details: err.message });
    }
};
