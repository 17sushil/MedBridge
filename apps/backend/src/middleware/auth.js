const { verifyToken } = require("../utils/jwt");
const { ApiError } = require("../utils/ApiError");
const prisma = require("../config/db");

// Verifies the Bearer token and attaches { id, hospitalId, role } to req.user.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      throw new ApiError(401, "Authentication required");
    }

    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new ApiError(401, "Invalid session — user no longer exists");
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
    };
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return next(new ApiError(401, "Invalid or expired session"));
    }
    next(err);
  }
}

// Restricts a route to specific roles, e.g. requireRole("ADMIN").
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "You don't have permission to do this"));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
