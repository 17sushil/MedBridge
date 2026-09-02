const { ApiError } = require("../utils/ApiError");

// Password complexity check
function validatePasswordComplexity(password) {
  if (!password || password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ApiError(400, "Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    throw new ApiError(400, "Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    throw new ApiError(400, "Password must contain at least one number");
  }
  // Optional: special char
  // if (!/[!@#$%^&*]/.test(password)) throw new ApiError(400, "Password must contain special char");
}

const failedAttempts = new Map(); // email -> {count, lockUntil}

function checkAccountLockout(email) {
  const normalized = String(email).toLowerCase().trim();
  const record = failedAttempts.get(normalized);
  if (record && record.lockUntil && Date.now() < record.lockUntil) {
    const minutes = Math.ceil((record.lockUntil - Date.now()) / 60000);
    throw new ApiError(429, `Account locked due to failed attempts. Try again in ${minutes} minutes`);
  }
}

function recordFailedAttempt(email) {
  const normalized = String(email).toLowerCase().trim();
  let record = failedAttempts.get(normalized) || { count: 0, lockUntil: null };
  record.count += 1;
  if (record.count >= 5) {
    record.lockUntil = Date.now() + 15 * 60 * 1000; // 15 min lock
    record.count = 0;
  }
  failedAttempts.set(normalized, record);
}

function clearFailedAttempts(email) {
  const normalized = String(email).toLowerCase().trim();
  failedAttempts.delete(normalized);
}

// Cleanup every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of failedAttempts.entries()) {
    if (rec.lockUntil && now > rec.lockUntil) failedAttempts.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = { validatePasswordComplexity, checkAccountLockout, recordFailedAttempt, clearFailedAttempts };
