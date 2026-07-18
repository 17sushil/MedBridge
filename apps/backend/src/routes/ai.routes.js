const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// These mirror src/services/aiService.js on the frontend exactly, so
// swapping the frontend from mock responses to real API calls is a
// drop-in change once a model is wired up here.

router.get("/forecast-insight", (req, res) => {
  res.json({
    available: false,
    message:
      "AI-powered demand forecasting isn't connected yet. Once enabled, this will highlight predicted shortages before they happen.",
  });
});

router.get("/smart-match", (req, res) => {
  res.json({
    available: false,
    message:
      "Smart exchange matching will suggest the best partner hospital for a request based on stock, distance, and expiry.",
  });
});

router.post("/assistant", (req, res) => {
  res.json({
    available: false,
    message:
      "The MedBridge Assistant is coming soon. It will be able to answer questions like \"which medicines expire this month?\" directly.",
  });
});

module.exports = router;
