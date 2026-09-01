const express = require("express");
const controller = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  registerHospitalSchema,
  registerStaffSchema,
  loginSchema,
  updateProfileSchema,
  deleteAccountSchema,
} = require("../utils/validators/auth.schema");

const router = express.Router();

// Onboard a new hospital + its first admin account.
router.post("/register-hospital", validate(registerHospitalSchema), controller.registerHospital);

// Add a staff account to an existing hospital.
// Only an ADMIN of the SAME hospital may create staff accounts — otherwise any
// authenticated user could mint accounts on arbitrary hospitals.
router.post("/register", requireAuth, requireRole("ADMIN"), validate(registerStaffSchema), controller.registerStaff);

router.post("/login", validate(loginSchema), controller.login);

router.get("/me", requireAuth, controller.me);
router.patch("/me", requireAuth, validate(updateProfileSchema), controller.updateMe);

router.delete("/me", requireAuth, validate(deleteAccountSchema), controller.deleteAccount);

module.exports = router;
