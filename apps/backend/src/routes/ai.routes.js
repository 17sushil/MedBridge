const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const ml = require("../services/mlClient");
const { resolveHospitalCode } = require("../services/demandForecast.service");
const medicinesService = require("../services/medicines.service");
const prisma = require("../config/db");

const router = express.Router();
router.use(requireAuth);

router.get(
  "/forecast-insight",
  asyncHandler(async (req, res) => {
    const hospitalId = req.user.hospitalId;
    const code = await resolveHospitalCode(hospitalId);

    if (code) {
      try {
        const [detail, health] = await Promise.all([
          ml.getForecastDetail(code, 5).catch(() => null),
          ml.health().catch(() => null),
        ]);
        if (detail && detail.items && detail.items.length) {
          const top = detail.items.slice(0, 3);
          const lines = top.map((i) => `${i.generic_name} (~${Math.round(i.predicted_demand)} units)`);
          const r2 = health?.test_metrics?.R2;
          const r2Text = r2 != null ? ` R² ${Number(r2).toFixed(3)}.` : "";
          return res.json({
            available: true,
            message: `Forecast for ${code} (week ${detail.week_start}): ${lines.join("; ")}.${r2Text}`,
            items: top.map((i, idx) => ({ rank: idx + 1, name: i.generic_name, category: i.category, demand: Math.round(i.predicted_demand) })),
            headline: `Top forecast for ${code}`,
            meta: r2Text,
          });
        }
      } catch (e) {
        console.warn(`Forecast insight ML failed: ${e.message}`);
      }
    }

    try {
      const since = new Date();
      since.setMonth(since.getMonth() - 1);
      const movements = await prisma.inventoryMovement.findMany({
        where: { hospitalId, type: { in: ["CONSUMPTION", "OUT"] }, occurredAt: { gte: since } },
        include: { medicine: { select: { name: true, category: true } } },
        take: 50,
      });
      const agg = {};
      movements.forEach(m => {
        const name = m.medicine?.name || m.medicineId;
        if (!agg[name]) agg[name] = { name, category: m.medicine?.category || "General", total: 0 };
        agg[name].total += m.quantity;
      });
      const top = Object.values(agg).sort((a, b) => b.total - a.total).slice(0, 3);
      if (top.length) {
        return res.json({
          available: true,
          message: `Based on last 30 days consumption: ${top.map(t => `${t.name} (${t.total} units)`).join("; ")}. Avg daily use calculated for reorder planning.`,
          items: top.map((t, idx) => ({ rank: idx + 1, name: t.name, category: t.category, demand: t.total })),
          headline: "Consumption-based forecast (fallback)",
          meta: "ML offline, using DB consumption",
        });
      }
    } catch (e) {
      console.warn(`Forecast fallback failed: ${e.message}`);
    }

    return res.json({
      available: true,
      message: "Forecast data building. Check Demand Forecast page for chart and all medicines forecast with predicted demand numbers.",
    });
  })
);

router.get(
  "/smart-match",
  asyncHandler(async (req, res) => {
    const hospitalId = req.user.hospitalId;
    const code = await resolveHospitalCode(hospitalId);

    if (code) {
      try {
        const data = await ml.getSmartMatches({ hospitalCode: code, demoOnly: true, topK: 5 });
        const items = data.items || [];
        if (items.length) {
          const top = items[0];
          return res.json({
            available: true,
            message: `Best match: ${top.from_hospital_name} → ${top.to_hospital_name} for ${top.generic_name} x${top.suggested_qty} (${top.distance_km} km, ${top.priority}).`,
            items: items.slice(0, 3).map((m, idx) => ({ rank: idx + 1, name: `${m.from_hospital_name} → ${m.toHospital_name || m.to_hospital_name}: ${m.generic_name}`, category: `${m.distance_km} km`, demand: m.suggested_qty })),
            headline: "Smart exchange matches",
            meta: `${items.length} suggestions`,
          });
        }
      } catch (e) {
        console.warn(`Smart match ML failed: ${e.message}`);
      }
    }

    try {
      const lowStockMeds = await prisma.medicine.findMany({
        where: { hospitalId, status: { in: ["CRITICAL", "LOW_STOCK"] } },
        select: { name: true },
        take: 3,
      });

      if (lowStockMeds.length) {
        const hospitals = await prisma.hospital.findMany({
          where: { id: { not: hospitalId } },
          select: { name: true, location: true },
          take: 3,
        });

        if (hospitals.length) {
          return res.json({
            available: true,
            message: `You have ${lowStockMeds.length} low stock items: ${lowStockMeds.map(m => m.name).join(", ")}. Partner hospitals available: ${hospitals.map(h => h.name).join(", ")} - check which has excess via AI assistant "Which hospital has Insulin?"`,
            items: hospitals.map((h, idx) => ({ rank: idx + 1, name: h.name, category: h.location, demand: null })),
            headline: "Partner hospitals for exchange (fallback)",
            meta: "ML offline, using DB",
          });
        }
      }

      return res.json({
        available: true,
        message: "No critical low stock right now. Inventory balanced. Check Exchange Requests for pending actions or ask AI which hospital has specific medicine.",
      });
    } catch (e) {
      console.warn(`Smart match fallback failed: ${e.message}`);
      return res.json({
        available: true,
        message: "Smart matching ready. Start ML service on port 8000 for distance-based suggestions, or check Hospitals page for partner network.",
      });
    }
  })
);

module.exports = router;
