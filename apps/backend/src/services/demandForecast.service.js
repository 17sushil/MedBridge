const prisma = require("../config/db");
const ml = require("./mlClient");

async function resolveHospitalCode(hospitalId) {
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: { externalCode: true, name: true },
  });
  return hospital?.externalCode || null;
}

async function fallbackForecast(hospitalId, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const movements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, type: { in: ["CONSUMPTION", "EXCHANGE_OUT", "EXPIRY_WRITEOFF", "OUT"] }, occurredAt: { gte: since } },
  });
  const byMonth = new Map();
  for (const m of movements) {
    const key = `${m.occurredAt.getFullYear()}-${String(m.occurredAt.getMonth()).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) || 0) + m.quantity);
  }
  const now = new Date();
  const history = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", { month: "short" });
    history.push({ month: label, actual: byMonth.get(key) || 0, forecast: null });
  }
  const last3 = history.slice(-3).map(h => h.actual);
  const avg3 = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
  const trend = last3.length >= 2 ? (last3[last3.length - 1] - last3[0]) / 2 : 0;
  const result = history.map(row => ({ ...row, forecast: Math.round(row.actual * 0.9 + avg3 * 0.1) }));
  for (let i = 1; i <= 2; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    result.push({ month: date.toLocaleDateString("en-US", { month: "short" }), actual: null, forecast: Math.max(0, Math.round((avg3 + trend * i) * 1.05)), isFuture: true });
  }
  return result;
}

async function getAllMedicinesForecast(hospitalId) {
  const medicines = await prisma.medicine.findMany({ where: { hospitalId } });
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const movements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, type: { in: ["CONSUMPTION", "OUT"] }, occurredAt: { gte: since } },
  });
  const consMap = new Map();
  movements.forEach(m => consMap.set(m.medicineId, (consMap.get(m.medicineId) || 0) + m.quantity));

  return medicines.map(med => {
    const monthly = consMap.get(med.id) || 5;
    const daily = monthly / 30;
    const daysCover = daily > 0 ? Math.floor(med.quantity / daily) : 999;
    return {
      medicineId: med.id,
      name: med.name,
      category: med.category,
      unit: med.unit,
      currentStock: med.quantity,
      avgMonthly: monthly,
      predictedNextMonth: Math.round(monthly * 1.1),
      daysOfCover: daysCover,
      unitPrice: med.unitPrice,
      status: med.status,
      batch: med.batch,
      expiry: med.expiry,
    };
  }).sort((a, b) => a.daysOfCover - b.daysOfCover);
}

async function getTopMedicines(hospitalId) {
  const all = await getAllMedicinesForecast(hospitalId);
  return all.sort((a, b) => b.avgMonthly - a.avgMonthly).slice(0, 5);
}

async function getRisks(hospitalId) {
  const all = await getAllMedicinesForecast(hospitalId);
  const now = new Date();
  const risks = [];
  for (const med of all) {
    const expiryDays = Math.floor((new Date(med.expiry) - now) / (1000 * 60 * 60 * 24));
    let riskLevel = null;
    let reason = "";
    if (med.status === "CRITICAL" || med.daysOfCover < 7) { riskLevel = "CRITICAL"; reason = `${med.daysOfCover}d cover`; }
    else if (med.status === "LOW_STOCK" || med.daysOfCover < 14) { riskLevel = "HIGH"; reason = `${med.daysOfCover}d cover`; }
    else if (expiryDays >= 0 && expiryDays < 14) { riskLevel = "EXPIRY"; reason = `Expires in ${expiryDays}d`; }
    if (riskLevel) risks.push({ ...med, riskLevel, reason });
  }
  return risks.slice(0, 6);
}

async function getForecast(hospitalId, months = 6) {
  const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId }, select: { name: true, externalCode: true } });
  const hospitalCode = hospital?.externalCode;
  let chartData = [];
  let source = "fallback";
  let mlHealth = null;

  if (hospitalCode) {
    try {
      const [chartRes, healthRes] = await Promise.all([
        ml.getForecastChart(hospitalCode, months).catch(() => null),
        ml.health().catch(() => null),
      ]);
      if (chartRes?.series?.length) {
        chartData = chartRes.series;
        source = "xgboost";
        mlHealth = healthRes;
      }
    } catch (e) { console.warn(`ML unavailable: ${e.message}`); }
  }

  if (!chartData.length) chartData = await fallbackForecast(hospitalId, months);

  const allMedicines = await getAllMedicinesForecast(hospitalId);
  const topMedicines = allMedicines.sort((a, b) => b.avgMonthly - a.avgMonthly).slice(0, 5);
  const risks = await getRisks(hospitalId);

  const actuals = chartData.filter(d => d.actual != null).map(d => d.actual);
  const totalActual = actuals.reduce((a, b) => a + b, 0);
  const totalForecast = chartData.filter(d => d.isFuture).reduce((a, b) => a + (b.forecast || 0), 0);
  const last = actuals[actuals.length - 1] || 0;
  const prev = actuals[actuals.length - 2] || 0;
  const growth = prev > 0 ? ((last - prev) / prev) * 100 : 0;

  return {
    chart: chartData,
    summary: {
      totalActual,
      totalForecast,
      growthPercent: Number(growth.toFixed(1)),
      atRiskCount: risks.length,
      criticalCount: risks.filter(r => r.riskLevel === "CRITICAL").length,
      expiryCount: risks.filter(r => r.riskLevel === "EXPIRY").length,
      accuracy: mlHealth?.test_metrics?.R2 ? Number(mlHealth.test_metrics.R2).toFixed(3) : null,
      avgDaysCover: allMedicines.length ? Math.round(allMedicines.reduce((a, b) => a + (b.daysOfCover < 900 ? b.daysOfCover : 30), 0) / allMedicines.length) : 0,
    },
    topMedicines,
    allMedicines, // NEW: all medicines forecast as requested
    shortageRisks: risks,
    meta: {
      source,
      hospitalCode: hospitalCode || "local",
      hospitalName: hospital?.name || "Hospital",
      model: source === "xgboost" ? "XGBoost" : "Weighted Avg",
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = { getForecast, resolveHospitalCode };
