const { asyncHandler } = require("../utils/asyncHandler");
const service = require("../services/medicines.service");

const list = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 100);
  const { status } = req.query;
  const medicines = await service.listMedicines(req.user.hospitalId, { search, status });
  res.json(medicines);
});

const getOne = asyncHandler(async (req, res) => {
  const medicine = await service.getMedicine(req.user.hospitalId, req.params.id);
  res.json(medicine);
});

const create = asyncHandler(async (req, res) => {
  const medicine = await service.createMedicine(req.user.hospitalId, req.body);
  res.status(201).json(medicine);
});

const update = asyncHandler(async (req, res) => {
  const medicine = await service.updateMedicine(req.user.hospitalId, req.params.id, req.body);
  res.json(medicine);
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteMedicine(req.user.hospitalId, req.params.id);
  res.status(204).send();
});

const expiringSoon = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const medicines = await service.expiringSoon(req.user.hospitalId, days);
  res.json(medicines);
});

const categories = asyncHandler(async (req, res) => {
  const breakdown = await service.categoryBreakdown(req.user.hospitalId);
  res.json(breakdown);
});

module.exports = { list, getOne, create, update, remove, expiringSoon, categories };
