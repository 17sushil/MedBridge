const { asyncHandler } = require("../utils/asyncHandler");
const service = require("../services/demandForecast.service");

const getForecast = asyncHandler(async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months) || 6, 3), 12);
  const data = await service.getForecast(req.user.hospitalId, months);
  res.json(data);
});

module.exports = { getForecast };
