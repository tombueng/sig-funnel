// Vercel serverless function — GET /api/session/:key/status
const routes = require('../../../src/routes');

module.exports = async function handler(req, res) {
  req.params = { key: req.query.key };
  return routes.getStatus(req, res);
};
