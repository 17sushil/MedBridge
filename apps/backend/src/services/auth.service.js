const bcrypt = require("bcryptjs");
const prisma = require("../config/db");
const { signToken } = require("../utils/jwt");
const { ApiError } = require("../utils/ApiError");
const { seedNewHospitalHistory } = require("./seedNewHospital.service");

const SALT_ROUNDS = 10;

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    hospitalId: user.hospitalId,
    hospital: user.hospital
      ? { id: user.hospital.id, name: user.hospital.name }
      : undefined,
  };
}

// Onboards a brand-new hospital onto the platform along with its first
// admin user.
async function registerHospitalAndAdmin({ hospitalName, location, type, name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const hospital = await prisma.hospital.create({
    data: { name: hospitalName, location, type: type || "General" },
  });

  // Fire-and-forget: signup should feel instant, seeding finishes in the
  // background a few seconds later without blocking the response.
  seedNewHospitalHistory(hospital).catch((err) =>
    console.error("Background seeding error:", err)
  );

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "ADMIN", hospitalId: hospital.id },
    include: { hospital: true },
  });

  const token = signToken({ sub: user.id, hospitalId: user.hospitalId, role: user.role });
  return { token, user: toPublicUser(user) };
}

// Adds a staff member to an existing hospital.
async function registerStaff({ name, email, password, hospitalId }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "An account with this email already exists");

  const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
  if (!hospital) throw new ApiError(404, "Hospital not found");

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "STAFF", hospitalId },
    include: { hospital: true },
  });

  const token = signToken({ sub: user.id, hospitalId: user.hospitalId, role: user.role });
  return { token, user: toPublicUser(user) };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email }, include: { hospital: true } });
  if (!user) throw new ApiError(401, "Incorrect email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Incorrect email or password");

  const token = signToken({ sub: user.id, hospitalId: user.hospitalId, role: user.role });
  return { token, user: toPublicUser(user) };
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { hospital: true } });
  if (!user) throw new ApiError(404, "User not found");
  return toPublicUser(user);
}

module.exports = { registerHospitalAndAdmin, registerStaff, login, getProfile, toPublicUser };