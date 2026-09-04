const prisma = require("../config/db");

/**
 * Audit Log Service - Tracks critical actions for security & compliance
 */

async function createLog({ hospitalId, userId, action, entity, entityId, oldValue, newValue }) {
  try {
    return await prisma.auditLog.create({
      data: {
        hospitalId,
        userId,
        action,
        entity,
        entityId,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
      },
    });
  } catch (err) {
    console.warn("[AuditLog] Failed to create log:", err.message);
    return null;
  }
}

async function getLogs(hospitalId, { limit = 50, action, entity } = {}) {
  const where = { hospitalId };
  if (action) where.action = action;
  if (entity) where.entity = entity;

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
}

module.exports = { createLog, getLogs };
