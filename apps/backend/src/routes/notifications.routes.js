const express = require("express");
const controller = require("../controllers/notifications.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

// Admin and Staff receive notifications of exchange requests and operational alerts.
// Inventory Manager is scoped strictly to inventory operations.
router.get("/", requireRole("ADMIN", "STAFF"), controller.list);
router.patch("/read-all", requireRole("ADMIN", "STAFF"), controller.markAllRead);
router.patch("/:id/read", requireRole("ADMIN", "STAFF"), controller.markOneRead);

module.exports = router;
