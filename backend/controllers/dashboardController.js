const service = require('../services/dashboardService');

exports.get = async (req, res, next) => {
  try { res.json({ data: await service.getDashboard() }); }
  catch (error) { next(error); }
};
