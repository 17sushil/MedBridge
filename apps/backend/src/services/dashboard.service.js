const prisma = require("../config/db");

/**
 * Dashboard Service - FIXED, USEFUL, PRODUCTIVE
 * Fixes logical errors, adds useful metrics, removes unnecessary
 */

async function getStats(hospitalId) {
  const now = new Date();
  const cutoff30 = new Date();
  cutoff30.setDate(now.getDate() + 30);
  const lastMonthStart = new Date();
  lastMonthStart.setMonth(now.getMonth() - 1);
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(now.getMonth() - 2);

  const medicines = await prisma.medicine.findMany({
    where: { hospitalId },
    select: { quantity: true, unitPrice: true, expiry: true, status: true },
  });

  const totalSKUs = medicines.length;
  const totalUnits = medicines.reduce((sum, m) => sum + m.quantity, 0);
  const totalValue = medicines.reduce((sum, m) => sum + m.quantity * m.unitPrice, 0);

  // Expiring in 30 days (future only, not expired) - FIXED logical error
  const expiringSoon = await prisma.medicine.count({
    where: { hospitalId, expiry: { gte: now, lte: cutoff30 } },
  });

  // Already expired - NEW useful metric
  const expiredCount = await prisma.medicine.count({
    where: { hospitalId, expiry: { lt: now } },
  });

  // Value at risk (expiring soon)
  const expiringMeds = await prisma.medicine.findMany({
    where: { hospitalId, expiry: { gte: now, lte: cutoff30 } },
    select: { quantity: true, unitPrice: true },
  });
  const valueAtRisk = expiringMeds.reduce((sum, m) => sum + m.quantity * m.unitPrice, 0);

  // Low stock & critical - USEFUL
  const lowStockCount = await prisma.medicine.count({
    where: { hospitalId, status: { in: ["LOW_STOCK", "MEDIUM_STOCK"] } },
  });
  const criticalCount = await prisma.medicine.count({
    where: { hospitalId, status: "CRITICAL" },
  });

  const activeExchanges = await prisma.exchangeRequest.count({
    where: {
      OR: [{ fromHospitalId: hospitalId }, { toHospitalId: hospitalId }],
      status: { in: ["PENDING", "APPROVED", "IN_TRANSIT"] },
    },
  });

  // Calculate delta for last month vs previous - FIXED to provide real delta
  const lastMonthMovements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, occurredAt: { gte: lastMonthStart } },
    select: { type: true, quantity: true },
  });
  const prevMonthMovements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, occurredAt: { gte: twoMonthsAgo, lt: lastMonthStart } },
    select: { type: true, quantity: true },
  });

  const lastMonthIn = lastMonthMovements.filter(m => ["IN", "PROCUREMENT", "EXCHANGE_IN"].includes(m.type)).reduce((a, b) => a + b.quantity, 0);
  const prevMonthIn = prevMonthMovements.filter(m => ["IN", "PROCUREMENT", "EXCHANGE_IN"].includes(m.type)).reduce((a, b) => a + b.quantity, 0);
  
  const calcDelta = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const unitsDelta = calcDelta(lastMonthIn, prevMonthIn);

  return {
    totalMedicines: { 
      value: totalSKUs, 
      units: totalUnits,
      delta: unitsDelta > 0 ? Math.abs(unitsDelta) : unitsDelta,
      trend: unitsDelta >= 0 ? "up" : "down",
      helper: `${totalUnits.toLocaleString()} units total`
    },
    totalValue: { 
      value: Math.round(totalValue),
      delta: Math.abs(unitsDelta),
      trend: unitsDelta >= 0 ? "up" : "down",
      helper: `NPR ${Math.round(valueAtRisk).toLocaleString()} at risk`
    },
    expiringSoon: { 
      value: expiringSoon, 
      expired: expiredCount,
      window: "30 days",
      valueAtRisk: Math.round(valueAtRisk),
      helper: expiredCount > 0 ? `${expiredCount} already expired` : "No expired"
    },
    activeExchanges: { 
      value: activeExchanges, 
      label: activeExchanges > 0 ? `${activeExchanges} in progress` : "All completed",
      lowStock: lowStockCount,
      critical: criticalCount,
      helper: criticalCount > 0 ? `${criticalCount} critical needs attention` : `${lowStockCount} low stock`
    },
    // NEW useful metrics
    lowStock: { value: lowStockCount, critical: criticalCount },
    valueAtRisk: { value: Math.round(valueAtRisk), count: expiringSoon },
  };
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function buildOverviewBuckets(period) {
  const now = startOfDay(new Date());

  if (period === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const buckets = [];
    const cursor = new Date(monthStart);
    while (cursor <= now) {
      const bucketStart = startOfDay(cursor);
      const bucketEnd = endOfDay(new Date(cursor));
      bucketEnd.setDate(bucketEnd.getDate() + 6);
      if (bucketEnd > endOfDay(now)) bucketEnd.setTime(endOfDay(now).getTime());
      buckets.push({
        key: bucketStart.toISOString().slice(0, 10),
        day: bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start: bucketStart,
        end: bucketEnd,
        stockIn: 0,
        stockOut: 0,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }

  if (period === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const buckets = [];
    const cursor = new Date(now.getFullYear(), quarterStartMonth, 1);
    while (cursor <= now) {
      const bucketStart = startOfDay(cursor);
      const monthEnd = endOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
      const bucketEnd = monthEnd > endOfDay(now) ? endOfDay(now) : monthEnd;
      buckets.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        day: cursor.toLocaleDateString("en-US", { month: "short" }),
        start: bucketStart,
        end: bucketEnd,
        stockIn: 0,
        stockOut: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
  }

  const buckets = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const bucketStart = startOfDay(d);
    buckets.push({
      key: bucketStart.toISOString().slice(0, 10),
      day: bucketStart.toLocaleDateString("en-US", { weekday: "short" }),
      start: bucketStart,
      end: endOfDay(d),
      stockIn: 0,
      stockOut: 0,
    });
  }
  return buckets;
}

function movementInBucket(occurredAt, bucket) {
  const t = occurredAt.getTime();
  return t >= bucket.start.getTime() && t <= bucket.end.getTime();
}

async function getInventoryOverview(hospitalId, period = "week") {
  const buckets = buildOverviewBuckets(period);
  if (!buckets.length) return [];

  const since = buckets[0].start;
  const movements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, occurredAt: { gte: since } },
  });

  const stockInTypes = new Set(["IN", "PROCUREMENT", "EXCHANGE_IN"]);
  const stockOutTypes = new Set(["OUT", "CONSUMPTION", "EXCHANGE_OUT", "EXPIRY_WRITEOFF"]);

  for (const movement of movements) {
    const bucket = buckets.find((item) => movementInBucket(movement.occurredAt, item));
    if (!bucket) continue;
    if (stockInTypes.has(movement.type)) bucket.stockIn += movement.quantity;
    if (stockOutTypes.has(movement.type)) bucket.stockOut += movement.quantity;
  }

  return buckets.map(({ day, stockIn, stockOut }) => ({ day, stockIn, stockOut }));
}

// NEW: Get low stock medicines for dashboard
async function getLowStockAlerts(hospitalId) {
  const medicines = await prisma.medicine.findMany({
    where: { hospitalId, status: { in: ["CRITICAL", "LOW_STOCK"] } },
    orderBy: [{ status: "asc" }, { quantity: "asc" }],
    take: 6,
  });
  return medicines;
}

// NEW: Get value at risk details
async function getValueAtRisk(hospitalId) {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(now.getDate() + 30);
  
  const expiring = await prisma.medicine.findMany({
    where: { hospitalId, expiry: { gte: now, lte: cutoff } },
    orderBy: { expiry: "asc" },
    take: 5,
  });

  const totalValue = expiring.reduce((sum, m) => sum + m.quantity * m.unitPrice, 0);
  return { medicines: expiring, totalValue };
}

module.exports = { getStats, getInventoryOverview, getLowStockAlerts, getValueAtRisk };
