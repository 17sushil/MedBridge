const express = require("express");
const controller = require("../controllers/reports.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { createReportSchema } = require("../utils/validators/report.schema");

const router = express.Router();

router.use(requireAuth);

// List/view reports
router.get("/", controller.list);

// Only Admin may generate (create) or delete reports
router.post("/", requireRole("ADMIN"), validate(createReportSchema), controller.create);
router.delete("/:id", requireRole("ADMIN"), controller.remove);

module.exports = router;
