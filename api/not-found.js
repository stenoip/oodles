const { setCors } = require('./_cors');

module.exports = async (req, res) => {
  setCors(res);
  res.status(404).json({ error: 'Endpoint not found' });
};
