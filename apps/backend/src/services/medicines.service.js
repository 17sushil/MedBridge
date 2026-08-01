const prisma = require("../config/db");
const { ApiError } = require("../utils/ApiError");

async function listMedicines(hospitalId, { search, status } = {}) {
  return prisma.medicine.findMany({
    where: {
      hospitalId,
      status: status || undefined,
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
            { batch: { contains: search, mode: "insensitive" } },
            { medicineCode: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: { expiry: "asc" },
  });
}

async function getMedicine(hospitalId, id) {
  const medicine = await prisma.medicine.findFirst({ where: { id, hospitalId } });
  if (!medicine) throw new ApiError(404, "Medicine not found");
  return medicine;
}

function computeStatusFromQuantity(qty, explicitStatus) {
  if (explicitStatus) return explicitStatus;
  if (qty <= 0) return "CRITICAL";
  if (qty < 5) return "CRITICAL";
  if (qty < 15) return "LOW_STOCK";
  if (qty < 40) return "MEDIUM_STOCK";
  return "IN_STOCK";
}

async function createMedicine(hospitalId, data) {
  const quantity = Number(data.quantity) || 0;
  const status = computeStatusFromQuantity(quantity, data.status);
  const payload = { ...data, quantity, status, hospitalId };

  const created = await prisma.medicine.create({ data: payload });

  await prisma.inventoryMovement.create({
    data: {
      hospitalId,
      medicineId: created.id,
      type: "IN",
      quantity: created.quantity,
    },
  });

  if (status === "CRITICAL" || status === "LOW_STOCK") {
    await prisma.notification.create({
      data: {
        hospitalId,
        title: `${created.name} is ${status === "CRITICAL" ? "critical" : "low"}`,
        body: `${created.name} (${created.batch}) has only ${created.quantity} ${created.unit} left.`,
        type: status === "CRITICAL" ? "CRITICAL" : "INFO",
      },
    });
  }

  return created;
}

async function updateMedicine(hospitalId, id, data) {
  const existing = await getMedicine(hospitalId, id);
  const newQty = data.quantity !== undefined ? Number(data.quantity) : existing.quantity;

  if (data.quantity !== undefined && !data.status) {
    data.status = computeStatusFromQuantity(newQty, null);
  }

  const updated = await prisma.medicine.update({ where: { id }, data });

  if (data.quantity !== undefined && Number(data.quantity) !== existing.quantity) {
    const diff = Number(data.quantity) - existing.quantity;
    if (diff !== 0) {
      await prisma.inventoryMovement.create({
        data: {
          hospitalId,
          medicineId: id,
          type: diff > 0 ? "IN" : "OUT",
          quantity: Math.abs(diff),
        },
      });
    }

    if (updated.status === "CRITICAL" || updated.status === "LOW_STOCK") {
      await prisma.notification.create({
        data: {
          hospitalId,
          title: `${updated.name} is ${updated.status === "CRITICAL" ? "critical" : "low"}`,
          body: `${updated.name} now has ${updated.quantity} ${updated.unit} left.`,
          type: updated.status === "CRITICAL" ? "CRITICAL" : "INFO",
        },
      });
    }
  }

  return updated;
}

async function deleteMedicine(hospitalId, id) {
  await getMedicine(hospitalId, id);
  await prisma.$transaction(async (tx) => {
    await tx.inventoryMovement.deleteMany({ where: { medicineId: id } });
    await tx.medicine.delete({ where: { id } });
  });
}

// Medicines expiring within `days` days, soonest first — powers the
// dashboard's "Expiry Alerts" panel.
async function expiringSoon(hospitalId, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  return prisma.medicine.findMany({
    where: { hospitalId, expiry: { lte: cutoff } },
    orderBy: { expiry: "asc" },
  });
}

// Distribution of quantity across categories — powers the category donut chart.
async function categoryBreakdown(hospitalId) {
  const rows = await prisma.medicine.groupBy({
    by: ["category"],
    where: { hospitalId },
    _sum: { quantity: true },
  });
  const total = rows.reduce((sum, r) => sum + (r._sum.quantity || 0), 0) || 1;
  return rows.map((r) => ({
    name: r.category,
    value: Math.round(((r._sum.quantity || 0) / total) * 100),
  }));
}

module.exports = {
  listMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  expiringSoon,
  categoryBreakdown,
};
