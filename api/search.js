var fs = require('fs');
var path = require('path');

module.exports = function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://stenoip.github.io');

  var query = req.query.q;
  if (!query) {
    res.status(400).json({ error: 'Missing query parameter ?q=' });
    return;
  }

  var filePath = path.join(__dirname, '..', 'index.json');
  fs.readFile(filePath, 'utf8', function(err, data) {
    if (err) {
      res.status(500).json({ error: 'Failed to read index.json' });
      return;
    }

    try {
      var index = JSON.parse(data);
      var results = index.filter(function(item) {
        return item.title.toLowerCase().includes(query.toLowerCase()) ||
               item.description.toLowerCase().includes(query.toLowerCase());
      });

      res.status(200).json({ results: results });
    } catch (e) {
      res.status(500).json({ error: 'Invalid JSON format in index.json' });
    }
  });
};
