const prisma = require("../config/db");
const ml = require("./mlClient");

async function resolveHospitalCode(hospitalId) {
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: { externalCode: true },
  });
  return hospital?.externalCode || null;
}

async function fallbackForecast(hospitalId, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const movements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, type: "OUT", occurredAt: { gte: since } },
  });

  const byMonth = new Map();
  for (const movement of movements) {
    const key = `${movement.occurredAt.getFullYear()}-${movement.occurredAt.getMonth()}`;
    byMonth.set(key, (byMonth.get(key) || 0) + movement.quantity);
  }

  const now = new Date();
  const history = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    history.push({
      month: date.toLocaleDateString("en-US", { month: "short" }),
      actual: byMonth.get(key) || 0,
    });
  }

  const average = history.slice(-3).reduce((sum, row) => sum + row.actual, 0) / 3;
  const result = history.map((row) => ({ ...row, forecast: Math.round(row.actual) }));
  for (let i = 1; i <= 2; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    result.push({
      month: date.toLocaleDateString("en-US", { month: "short" }),
      actual: null,
      forecast: Math.round(average * (1 + 0.05 * i)),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Daily forecast (day-by-day values, anchored to weekly totals by the ML
// service so the daily and weekly views always agree).
// ---------------------------------------------------------------------------

async function fallbackDailyForecast(hospitalId, days = 30) {
  // DB-only fallback: last 3 weeks of OUT movements -> flat daily average.
  const since = new Date();
  since.setDate(since.getDate() - 21);
  const movements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, type: "OUT", occurredAt: { gte: since } },
    select: { occurredAt: true, quantity: true },
  });

  const byDay = new Map();
  for (const movement of movements) {
    const key = movement.occurredAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + movement.quantity);
  }
  const total = [...byDay.values()].reduce((sum, value) => sum + value, 0);
  const avgPerDay = Math.round(total / 21);

  const dailyTotals = [];
  const now = new Date();
  for (let i = 1; i <= days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = date.toISOString().slice(0, 10);
    dailyTotals.push({
      date: iso,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      predicted_demand: avgPerDay,
      week_start: new Date(date.getTime() - ((date.getDay() + 6) % 7) * 86400000)
        .toISOString()
        .slice(0, 10),
    });
  }

  const weekMap = new Map();
  for (const row of dailyTotals) {
    const key = row.week_start;
    const entry = weekMap.get(key) || { week_total: 0, days_covered: 0 };
    entry.week_total += row.predicted_demand;
    entry.days_covered += 1;
    weekMap.set(key, entry);
  }
  const weekSummary = [...weekMap.entries()].map(([week_start, entry]) => ({
    week_start,
    week_total: entry.week_total,
    days_covered: entry.days_covered,
  }));

  return {
    available: false,
    source: "database-fallback",
    days,
    daily_totals: dailyTotals,
    week_summary: weekSummary,
    topMedicines: [],
    consistency_error: 0,
    weekly_consistency_ok: true,
    last_observed_date: dailyTotals[0]?.date || null,
    first_forecast_date: dailyTotals[0]?.date || null,
    message:
      "ML service unavailable: showing a flat database-average daily estimate.",
  };
}

async function getDailyForecast(hospitalId, days = 30) {
  const hospitalCode = await resolveHospitalCode(hospitalId);
  if (hospitalCode) {
    try {
      const forecast = await ml.getDailyForecast(hospitalCode, days);
      if (forecast && Array.isArray(forecast.daily_totals) && forecast.daily_totals.length) {
        return forecast;
      }
    } catch (error) {
      console.warn(`ML daily forecast unavailable for ${hospitalCode}: ${error.message}`);
    }
  }
  return fallbackDailyForecast(hospitalId, days);
}

// Uses the model for hospitals that are linked to an ML dataset. The existing
// database-derived calculation remains a graceful fallback for new hospitals
// and when the ML service is unavailable.
async function getForecast(hospitalId, months = 6) {
  const hospitalCode = await resolveHospitalCode(hospitalId);
  if (hospitalCode) {
    try {
      const forecast = await ml.getForecastChart(hospitalCode, months);
      if (Array.isArray(forecast.series) && forecast.series.length) return forecast.series;
    } catch (error) {
      // The forecast screen must stay usable if a separately deployed ML
      // service is starting up or temporarily unavailable.
      console.warn(`ML forecast unavailable for ${hospitalCode}: ${error.message}`);
    }
  }
  return fallbackForecast(hospitalId, months);
}

module.exports = {
  getForecast,
  getDailyForecast,
  fallbackForecast,
  fallbackDailyForecast,
  resolveHospitalCode,
};
