const { asyncHandler } = require("../utils/asyncHandler");
const service = require("../services/reports.service");

const list = asyncHandler(async (req, res) => {
  const reports = await service.listForHospital(req.user.hospitalId);
  res.json(reports);
});

const create = asyncHandler(async (req, res) => {
  const report = await service.create(req.user.hospitalId, req.body);
  res.status(201).json(report);
});

module.exports = { list, create };
