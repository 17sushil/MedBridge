const express = require("express");
const controller = require("../controllers/demandForecast.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);
router.get("/", controller.getForecast);
router.get("/daily", controller.getDailyForecast);

module.exports = router;
