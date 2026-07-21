const prisma = require("../config/db");

async function getStats(hospitalId) {
  const medicines = await prisma.medicine.findMany({
    where: { hospitalId },
    select: { quantity: true, unitPrice: true },
  });

  const totalMedicines = medicines.reduce((sum, m) => sum + m.quantity, 0);
  const totalValue = medicines.reduce((sum, m) => sum + m.quantity * m.unitPrice, 0);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const expiringSoon = await prisma.medicine.count({
    where: { hospitalId, expiry: { lte: cutoff } },
  });

  const activeExchanges = await prisma.exchangeRequest.count({
    where: {
      OR: [{ fromHospitalId: hospitalId }, { toHospitalId: hospitalId }],
      status: { in: ["PENDING", "APPROVED", "IN_TRANSIT"] },
    },
  });

  return {
    totalMedicines: { value: totalMedicines },
    totalValue: { value: Math.round(totalValue) },
    expiringSoon: { value: expiringSoon, window: "30 days" },
    activeExchanges: { value: activeExchanges, label: "In progress" },
  };
}

// Stock in/out totals for each of the last 7 days — powers the trend chart.
async function getInventoryOverview(hospitalId) {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const movements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, occurredAt: { gte: since } },
  });

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toISOString().slice(0, 10),
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      stockIn: 0,
      stockOut: 0,
    });
  }

  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  for (const m of movements) {
    const key = m.occurredAt.toISOString().slice(0, 10);
    const bucket = byKey[key];
    if (!bucket) continue;
    if (m.type === "IN") bucket.stockIn += m.quantity;
    else bucket.stockOut += m.quantity;
  }

  return days.map(({ day, stockIn, stockOut }) => ({ day, stockIn, stockOut }));
}

module.exports = { getStats, getInventoryOverview };
