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

async function createMedicine(hospitalId, data) {
  return prisma.medicine.create({ data: { ...data, hospitalId } });
}

async function updateMedicine(hospitalId, id, data) {
  await getMedicine(hospitalId, id); // ensures it exists & belongs to this hospital
  return prisma.medicine.update({ where: { id }, data });
}

async function deleteMedicine(hospitalId, id) {
  await getMedicine(hospitalId, id);
  await prisma.medicine.delete({ where: { id } });
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
