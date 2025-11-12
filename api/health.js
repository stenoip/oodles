const { setCors } = require('./_cors');

module.exports = async (req, res) => {
  setCors(res);
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
};
