/*
########  ########  ########    ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##        ##
##    ##  ##    ##  ##      ##  ##        ######    ########
##    ##  ##    ##  ##      ##  ##        ##              ##
########  ########  ########    ########  ######    ########    Search

Copyright Stenoip Company. All rights reserved.
*/
'use strict';

var { setCors } = require('./_cors');
var metasearch = require('./metasearch');

module.exports = async function (req, res) {
    setCors(res);
    
    // This file now acts as a direct proxy to metasearch.js
    // This ensures that the Puppeteer/Headless logic is always used.
    try {
        return await metasearch(req, res);
    } catch (err) {
        console.error('Routing Error:', err);
        res.status(500).json({ error: 'Oodles Internal Router Error' });
    }
};
