const { asyncHandler } = require("../utils/asyncHandler");
const service = require("../services/dashboard.service");

const stats = asyncHandler(async (req, res) => {
  const data = await service.getStats(req.user.hospitalId);
  res.json(data);
});

const overview = asyncHandler(async (req, res) => {
  const data = await service.getInventoryOverview(req.user.hospitalId);
  res.json(data);
});

module.exports = { stats, overview };
