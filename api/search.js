const fs = require('fs');
const { setCors } = require('./_cors');

module.exports = async (req, res) => {
  setCors(res);

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Query parameter required' });

  let indexData = [];
  try {
    indexData = JSON.parse(fs.readFileSync('index.json'));
  } catch (err) {
    return res.status(500).json({ error: 'Index not found or invalid' });
  }

  const results = indexData.filter(item => 
    (item.title && item.title.toLowerCase().includes(query.toLowerCase())) ||
    (item.description && item.description.toLowerCase().includes(query.toLowerCase())) ||
    (item.keywords && item.keywords.toLowerCase().includes(query.toLowerCase()))
  );

  res.status(200).json({ query, results });
};
