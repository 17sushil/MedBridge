const express = require("express");
const controller = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const {
  registerHospitalSchema,
  registerStaffSchema,
  loginSchema,
} = require("../utils/validators/auth.schema");

const router = express.Router();

// Onboard a new hospital + its first admin account.
router.post("/register-hospital", validate(registerHospitalSchema), controller.registerHospital);

// Add a staff account to an existing hospital.
router.post("/register", validate(registerStaffSchema), controller.registerStaff);

router.post("/login", validate(loginSchema), controller.login);

router.get("/me", requireAuth, controller.me);

module.exports = router;
