const { asyncHandler } = require("../utils/asyncHandler");
const authService = require("../services/auth.service");

const registerHospital = asyncHandler(async (req, res) => {
  const result = await authService.registerHospitalAndAdmin(req.body);
  res.status(201).json(result);
});

const registerStaff = asyncHandler(async (req, res) => {
  const result = await authService.registerStaff(req.body);
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

module.exports = { registerHospital, registerStaff, login, me };
