var express = require('express');
var fs = require('fs');
var cors = require('cors');

var app = express();
var port = process.env.PORT || 3000;

// Allow only your GitHub Pages domain
var corsOptions = {
  origin: 'https://stenoip.github.io',
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.get('/search', function(req, res) {
  var query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter ?q=' });
  }

  fs.readFile('index.json', 'utf8', function(err, data) {
    if (err) {
      return res.status(500).json({ error: 'Failed to read index.json' });
    }

    var index = JSON.parse(data);
    var results = index.filter(function(item) {
      return item.title.toLowerCase().includes(query.toLowerCase()) ||
             item.description.toLowerCase().includes(query.toLowerCase());
    });

    res.json({ results: results });
  });
});

app.listen(port, function() {
  console.log('Oodles backend running on port ' + port);
});
