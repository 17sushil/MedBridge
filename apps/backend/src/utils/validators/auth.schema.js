const { z } = require("zod");

const registerHospitalSchema = z.object({
  hospitalName: z.string().min(2),
  location: z.string().min(2),
  type: z.enum(["General", "Specialty", "Clinic"]).optional(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const registerStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  hospitalId: z.string().uuid(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

module.exports = { registerHospitalSchema, registerStaffSchema, loginSchema };
