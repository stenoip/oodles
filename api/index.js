var express = require('express');
var axios = require('axios');
var cheerio = require('cheerio');
var cors = require('cors');

var app = express();
app.use(cors());

function buildSearchUrls(query) {
  return {
    bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    yahoo: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`,
    brave: `https://search.brave.com/search?q=${encodeURIComponent(query)}`
  };
}


async function crawlEngine(url, engine) {
  try {
    var res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    var $ = cheerio.load(res.data);
    var results = [];

  

    if (engine === 'bing') {
      $('li.b_algo').each(function () {
        var title = $(this).find('h2').text();
        var link = $(this).find('a').attr('href');
        var snippet = $(this).find('p').text();
        if (title && link) results.push({ title, link, snippet, source: 'Bing' });
      });
    }

    if (engine === 'yahoo') {
      $('div.dd.algo').each(function () {
        var title = $(this).find('h3.title').text();
        var link = $(this).find('a').attr('href');
        var snippet = $(this).find('div.compText').text();
        if (title && link) results.push({ title, link, snippet, source: 'Yahoo' });
      });
    }

 if (engine === 'brave') {
  $('div.result').each(function () {
    var title = $(this).find('a').text();
    var link = $(this).find('a').attr('href');
    var snippet = $(this).find('div.snippet').text();

    if (title && link) {
      results.push({
        title: title,
        link: link,
        snippet: snippet,
        source: 'Brave'
      });
    }
  });
}


    if (title && link) {
      results.push({
        title: title,
        link: link.startsWith('/') ? 'https://duckduckgo.com/html/' + link : link,
        snippet: snippet,
        source: 'DuckDuckGo'
      });
    }
  });
}


    return results;
  } catch (err) {
    console.error(`Error crawling ${engine}:`, err.message);
    return [];
  }
}

app.get('/metasearch', async function (req, res) {
  var query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  var urls = buildSearchUrls(query);
  var engines = Object.keys(urls);

  var allResults = [];

  for (var i = 0; i < engines.length; i++) {
    var engine = engines[i];
    var engineResults = await crawlEngine(urls[engine], engine);
    allResults = allResults.concat(engineResults);
  }

  res.json({ results: allResults });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Oodlebot backend running on port ' + PORT);
});
