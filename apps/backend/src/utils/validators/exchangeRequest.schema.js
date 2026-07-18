const { z } = require("zod");

const createExchangeRequestSchema = z.object({
  medicine: z.string().min(2),
  quantity: z.number().int().min(1),
  unit: z.string().min(1),
  toHospitalId: z.string().uuid(),
});

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "IN_TRANSIT", "COMPLETED", "DECLINED"]),
});

module.exports = { createExchangeRequestSchema, updateStatusSchema };
