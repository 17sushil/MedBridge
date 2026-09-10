const express = require("express");
const controller = require("../controllers/notifications.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

// Admin-only: notifications of exchange requests and operational alerts.
router.get("/", requireRole("ADMIN"), controller.list);
router.patch("/read-all", requireRole("ADMIN"), controller.markAllRead);
router.patch("/:id/read", requireRole("ADMIN"), controller.markOneRead);

module.exports = router;
