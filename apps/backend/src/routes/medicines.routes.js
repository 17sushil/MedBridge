const express = require("express");
const controller = require("../controllers/medicines.controller");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { createMedicineSchema, updateMedicineSchema } = require("../utils/validators/medicine.schema");

const router = express.Router();

router.use(requireAuth);

// Specific routes before "/:id" so they aren't swallowed by the param route.
router.get("/meta/expiring-soon", controller.expiringSoon);
router.get("/meta/categories", controller.categories);

router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.post("/", validate(createMedicineSchema), controller.create);
router.patch("/:id", validate(updateMedicineSchema), controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
