const { setCors } = require('./_cors');
let searchCount = 0;

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'POST') {
    searchCount++;
    return res.status(200).json({ message: 'Search recorded', searchCount });
  } else if (req.method === 'GET') {
    return res.status(200).json({ searchCount });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
