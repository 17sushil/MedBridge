const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const ml = require("../services/mlClient");
const { resolveHospitalCode } = require("../services/demandForecast.service");
const medicinesService = require("../services/medicines.service");

const router = express.Router();
router.use(requireAuth);

/**
 * Response shapes match apps/frontend/src/services/aiService.js
 * and AIInsightPanel / AIAssistant (available + message).
 */

router.get(
  "/forecast-insight",
  asyncHandler(async (req, res) => {
    const code = await resolveHospitalCode(req.user.hospitalId);
    if (!code) {
      return res.json({
        available: false,
        message:
          "This hospital is not linked to the ML demo codes yet. Re-run backend seed after ML CSVs are present.",
      });
    }

    try {
      const [detail, health] = await Promise.all([
        ml.getForecastDetail(code, 5),
        ml.health().catch(() => null),
      ]);

      const top = (detail.items || []).slice(0, 3);
      const lines = top.map(
        (i) => `${i.generic_name} (~${Math.round(i.predicted_demand)} units)`
      );
      const r2 = health?.test_metrics?.R2;
      const r2Text = r2 != null ? ` Model test R² ≈ ${Number(r2).toFixed(3)}.` : "";

      return res.json({
        available: true,
        message: top.length
          ? `XGBoost forecast for ${code} (week ${detail.week_start}): highest need — ${lines.join("; ")}.${r2Text}`
          : `XGBoost forecast is connected for ${code}.${r2Text}`,
      });
    } catch (err) {
      return res.json({
        available: false,
        message: `AI forecast offline (${err.message}). Start ML on port 8000 for live XGBoost insights.`,
      });
    }
  })
);

router.get(
  "/smart-match",
  asyncHandler(async (req, res) => {
    const code = await resolveHospitalCode(req.user.hospitalId);
    try {
      const data = await ml.getSmartMatches({
        hospitalCode: code || undefined,
        demoOnly: true,
        topK: 5,
      });
      const items = data.items || [];
      if (!items.length) {
        return res.json({
          available: true,
          message: "No strong exchange matches right now for your hospital network.",
        });
      }
      const top = items[0];
      return res.json({
        available: true,
        message: `Best match: ${top.from_hospital_name} → ${top.to_hospital_name} for ${top.generic_name} x${top.suggested_qty} (${top.distance_km} km, ${top.priority}). ${items.length - 1} more suggestion(s) available.`,
      });
    } catch (err) {
      return res.json({
        available: false,
        message: `Smart matching offline (${err.message}). Start the ML service on port 8000.`,
      });
    }
  })
);

router.post(
  "/assistant",
  asyncHandler(async (req, res) => {
    const q = String((req.body && (req.body.question || req.body.q || req.body.message)) || "").trim();
    const hospitalId = req.user.hospitalId;
    const code = await resolveHospitalCode(hospitalId);

    if (!q) {
      return res.json({
        available: true,
        message: "Ask about expiry, low stock, demand forecast, or exchange matches.",
      });
    }

    const ql = q.toLowerCase();

    try {
      if (ql.includes("expir")) {
        const days = ql.includes("week") ? 14 : 30;
        const dbExp = await medicinesService.expiringSoon(hospitalId, days);
        const names = dbExp.slice(0, 8).map((m) => `${m.name} (${m.batch})`);
        return res.json({
          available: true,
          message: names.length
            ? `Medicines expiring within ${days} days: ${names.join("; ")}.`
            : `No medicines in your inventory expire within ${days} days.`,
        });
      }

      if (ql.includes("forecast") || ql.includes("demand") || ql.includes("short")) {
        if (!code) {
          return res.json({
            available: false,
            message: "Hospital is not linked to an ML code for forecasting.",
          });
        }
        const detail = await ml.getForecastDetail(code, 5);
        const lines = (detail.items || [])
          .slice(0, 5)
          .map((i) => `${i.generic_name}: ~${Math.round(i.predicted_demand)} units`);
        return res.json({
          available: true,
          message: `XGBoost demand forecast (${code}, week ${detail.week_start}): ${lines.join("; ")}.`,
        });
      }

      if (ql.includes("exchange") || ql.includes("match") || ql.includes("request") || ql.includes("hospital")) {
        const data = await ml.getSmartMatches({ hospitalCode: code, demoOnly: true, topK: 5 });
        const items = data.items || [];
        if (!items.length) {
          return res.json({ available: true, message: "No exchange matches found right now." });
        }
        const lines = items.slice(0, 4).map(
          (m) =>
            `${m.from_hospital_name} → ${m.to_hospital_name}: ${m.generic_name} x${m.suggested_qty}`
        );
        return res.json({
          available: true,
          message: `Suggested partners: ${lines.join(" | ")}`,
        });
      }

      if (ql.includes("low") || ql.includes("stock") || ql.includes("insulin")) {
        if (code) {
          const low = await ml.getLowStock(code, 8);
          const lines = (low.items || []).map(
            (i) =>
              `${i.generic_name} (${i.days_of_cover != null ? Number(i.days_of_cover).toFixed(1) + "d cover" : "low"})`
          );
          return res.json({
            available: true,
            message: lines.length ? `Low stock: ${lines.join("; ")}` : "No low-stock SKUs in the ML snapshot.",
          });
        }
      }

      if (ql.includes("exchange activity") || ql.includes("summarize") || ql.includes("month")) {
        return res.json({
          available: true,
          message:
            "Check Exchange Requests for live status. I can also suggest partners — ask “suggest a hospital to request stock from”.",
        });
      }

      return res.json({
        available: true,
        message:
          'Try: "Which medicines expire in the next 2 weeks?", "show demand forecast", or "suggest a hospital to request insulin from".',
      });
    } catch (err) {
      return res.json({
        available: false,
        message: `Assistant could not reach the ML service: ${err.message}`,
      });
    }
  })
);

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      const h = await ml.health();
      res.json({ available: true, message: "ML service online", mlServiceUrl: ml.baseUrl(), ...h });
    } catch (err) {
      res.json({ available: false, message: err.message, mlServiceUrl: ml.baseUrl() });
    }
  })
);

module.exports = router;
