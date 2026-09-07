const { asyncHandler } = require("../utils/asyncHandler");
const service = require("../services/demandForecast.service");

const getForecast = asyncHandler(async (req, res) => {
  const data = await service.getForecast(req.user.hospitalId);
  res.json(data);
});

const getDailyForecast = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
  const data = await service.getDailyForecast(req.user.hospitalId, days);
  res.json(data);
});

module.exports = { getForecast, getDailyForecast };
