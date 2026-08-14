const bcrypt = require("bcryptjs");
const prisma = require("../config/db");
const { signToken } = require("../utils/jwt");
const { ApiError } = require("../utils/ApiError");
const { deleteAccountSchema } = require("../utils/validators/auth.schema");

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

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "ADMIN", hospitalId: hospital.id },
    include: { hospital: true },
  });

  const token = signToken({ sub: user.id, hospitalId: user.hospitalId, role: user.role });
  return { token, user: toPublicUser(user) };
}

// Adds a staff member to an existing hospital.
// `callerHospitalId` is the hospital of the authenticated admin making the
// request; staff accounts may only be created within that same hospital.
async function registerStaff({ name, email, password, hospitalId }, callerHospitalId) {
  if (callerHospitalId && hospitalId !== callerHospitalId) {
    throw new ApiError(403, "You can only add staff to your own hospital");
  }

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

async function updateProfile(userId, { name, email }) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new ApiError(404, "User not found");

  if (email && email !== existing.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) throw new ApiError(409, "Email already in use");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: name || undefined,
      email: email || undefined,
    },
    include: { hospital: true },
  });

  return toPublicUser(updated);
}

  async function deleteAccount(userId, password) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "User not found");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new ApiError(401, "Incorrect password");

    await prisma.user.delete({ where: { id: userId } });
  }

module.exports = { registerHospitalAndAdmin, registerStaff, login, getProfile, updateProfile, deleteAccount, toPublicUser };
