const { asyncHandler } = require("../utils/asyncHandler");
const authService = require("../services/auth.service");

const registerHospital = asyncHandler(async (req, res) => {
  const result = await authService.registerHospitalAndAdmin(req.body);
  res.status(201).json(result);
});

const registerStaff = asyncHandler(async (req, res) => {
  const result = await authService.registerStaff(req.body, req.user.hospitalId);
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.json(user);
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);
  res.json(user);
});

const deleteAccount = asyncHandler(async (req, res) => {
  await authService.deleteAccount(req.user.id, req.body.password);
  res.status(204).send();
});

module.exports = { registerHospital, registerStaff, login, me, updateMe, deleteAccount };
