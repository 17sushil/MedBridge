const { z } = require("zod");

const statusEnum = z.enum(["IN_STOCK", "LOW_STOCK", "MEDIUM_STOCK", "CRITICAL"]);

const createMedicineSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  batch: z.string().min(1),
  quantity: z.number().int().min(0),
  unit: z.string().min(1),
  unitPrice: z.number().min(0).optional(),
  expiry: z.coerce.date(),
  status: statusEnum.optional(),
});

const updateMedicineSchema = createMedicineSchema.partial();

module.exports = { createMedicineSchema, updateMedicineSchema };
