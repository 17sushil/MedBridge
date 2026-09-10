const express = require("express");
const controller = require("../controllers/exchangeRequests.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  createExchangeRequestSchema,
  updateStatusSchema,
} = require("../utils/validators/exchangeRequest.schema");

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole("ADMIN", "STAFF"), controller.list);
router.post("/", requireRole("ADMIN", "STAFF"), validate(createExchangeRequestSchema), controller.create);
router.patch("/:id/status", requireRole("ADMIN"), validate(updateStatusSchema), controller.updateStatus);

module.exports = router;
