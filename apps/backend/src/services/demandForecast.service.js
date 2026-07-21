const prisma = require("../config/db");

// NOTE: this is a naive placeholder (trailing average), not a real
// forecasting model. It exists so the /demand-forecast endpoint and
// chart have real numbers to render. Swap the `forecast` calculation
// for a real model/service later — the response shape can stay the same.
async function getForecast(hospitalId, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const movements = await prisma.inventoryMovement.findMany({
    where: { hospitalId, type: "OUT", occurredAt: { gte: since } },
  });

  const byMonth = {};
  for (const m of movements) {
    const key = `${m.occurredAt.getFullYear()}-${m.occurredAt.getMonth()}`;
    byMonth[key] = (byMonth[key] || 0) + m.quantity;
  }

  const result = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    result.push({
      month: d.toLocaleDateString("en-US", { month: "short" }),
      actual: byMonth[key] || 0,
    });
  }

  // Naive forecast: trailing 3-month average, projected 2 months forward.
  const lastValues = result.slice(-3).map((r) => r.actual);
  const avg = lastValues.reduce((a, b) => a + b, 0) / (lastValues.length || 1);

  const withForecast = result.map((r) => ({ ...r, forecast: Math.round(r.actual) }));
  for (let i = 1; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    withForecast.push({
      month: d.toLocaleDateString("en-US", { month: "short" }),
      actual: null,
      forecast: Math.round(avg * (1 + 0.05 * i)),
    });
  }

  return withForecast;
}

module.exports = { getForecast };
