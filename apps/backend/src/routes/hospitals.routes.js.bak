const express = require("express");
const controller = require("../controllers/hospitals.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/", controller.list);
router.get("/:id", controller.getOne);

module.exports = router;
