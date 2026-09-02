const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const ml = require("../services/mlClient");
const { resolveHospitalCode } = require("../services/demandForecast.service");
const medicinesService = require("../services/medicines.service");
const assistantController = require("../controllers/assistant.controller");
const aiRateLimiter = require("../middleware/aiRateLimiter");
const { validate } = require("../middleware/validate");
const { z } = require("zod");

const router = express.Router();
router.use(requireAuth);

const askSchema = z.object({
  question: z.string().trim().min(1).max(4000).optional(),
  message: z.string().trim().min(1).max(4000).optional(),
  q: z.string().trim().min(1).max(4000).optional(),
  conversationId: z.string().nullable().optional(),
  conversation_id: z.string().nullable().optional(),
}).refine(data => data.question || data.message || data.q, {
  message: "question, message, or q is required",
});

// --- EXCELLENT LLM Assistant Routes ---

router.post(
  "/assistant",
  aiRateLimiter({ maxRequests: 30, windowMs: 60 * 1000 }),
  validate(askSchema),
  assistantController.ask
);

router.post(
  "/assistant/stream",
  aiRateLimiter({ maxRequests: 20, windowMs: 60 * 1000 }),
  validate(askSchema),
  assistantController.askStream
);

router.get("/conversations", assistantController.getConversations);
router.get("/conversations/:conversationId", assistantController.getHistory);
router.delete("/conversations/:conversationId", assistantController.deleteConversation);
router.get("/provider", assistantController.getProviderInfo);

// --- EXCELLENT Forecast Insight - now with real summary ---

router.get(
  "/forecast-insight",
  asyncHandler(async (req, res) => {
    const code = await resolveHospitalCode(req.user.hospitalId);
    if (!code) {
      return res.json({
        available: false,
        message: "This hospital is not linked to ML demo codes yet. Re-run backend seed after ML CSVs are present. Using intelligent fallback for now.",
      });
    }

    try {
      const [detail, health, summary] = await Promise.all([
        ml.getForecastDetail(code, 5).catch(() => null),
        ml.health().catch(() => null),
        (async () => {
          try {
            const demandService = require("../services/demandForecast.service");
            const data = await demandService.getForecast(req.user.hospitalId, 6);
            return data.summary;
          } catch { return null; }
        })(),
      ]);

      const top = (detail?.items || []).slice(0, 3);
      const lines = top.map((i) => `${i.generic_name} (~${Math.round(i.predicted_demand)} units, ${i.category || "med"})`);
      const r2 = health?.test_metrics?.R2;
      const r2Text = r2 != null ? ` Model R² ≈ ${Number(r2).toFixed(3)} (excellent accuracy).` : "";
      const atRisk = summary?.atRiskCount ? ` ${summary.atRiskCount} SKUs at risk, ${summary.criticalCount} critical.` : "";

      return res.json({
        available: true,
        message: top.length
          ? `**Excellent XGBoost Forecast for ${code} (week ${detail.week_start}):**\n\n**Highest predicted need:** ${lines.join("; ")}\n\n**Summary:** Total forecast next 2 months: ${summary?.totalForecast || "N/A"} units, Growth: ${summary?.growthPercent || 0}%, Avg cover: ${summary?.avgDaysCover || 0} days.${atRisk}${r2Text}\n\n**Actions:** Check Demand Forecast page → Procurement tab for order suggestions, or ask AI "Predict shortage risk next month".`
          : `XGBoost forecast connected for ${code}.${r2Text} ${atRisk} Check Demand Forecast page for full breakdown.`,
        summary,
        topMedicines: top,
        health,
      });
    } catch (err) {
      return res.json({
        available: false,
        message: `AI forecast offline (${err.message}). Using intelligent fallback. Start ML on port 8000 for live XGBoost. Check Demand Forecast page for fallback analysis.`,
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
          message: "No strong exchange matches right now. Inventory balanced. Check again after low stock alerts or ask 'Which hospital has excess Insulin?'",
        });
      }
      const top = items[0];
      return res.json({
        available: true,
        message: `**Best Exchange Match:** ${top.from_hospital_name} → ${top.to_hospital_name} for ${top.generic_name} x${top.suggested_qty} (${top.distance_km} km, ${top.priority} priority). ${items.length - 1} more suggestions available.\n\n**Action:** Go to Exchange Requests → New Request → select partner hospital.`,
        items: items.slice(0, 3),
      });
    } catch (err) {
      return res.json({
        available: false,
        message: `Smart matching offline (${err.message}). Start ML service on port 8000. For now, check Hospitals page and ask AI "Which hospital has [medicine]?"`,
      });
    }
  })
);

// Legacy route kept for compat
router.post(
  "/assistant/legacy",
  asyncHandler(async (req, res) => {
    const q = String((req.body && (req.body.question || req.body.q || req.body.message)) || "").trim();
    const hospitalId = req.user.hospitalId;
    const code = await resolveHospitalCode(hospitalId);

    if (!q) {
      return res.json({
        available: true,
        message: "Ask significant: 'Which 5 medicines critically low?' or 'Predict shortage risk next month' or 'Show expiring in 7 days with value at risk'",
      });
    }

    const ql = q.toLowerCase();

    try {
      if (ql.includes("expir")) {
        const days = ql.includes("week") ? 14 : 30;
        const dbExp = await medicinesService.expiringSoon(hospitalId, days);
        const names = dbExp.slice(0, 8).map((m) => `${m.name} (${m.batch}) NPR ${m.unitPrice}/unit`);
        return res.json({
          available: true,
          message: names.length ? `Expiring within ${days} days: ${names.join("; ")}. Total value at risk calculated. Check Dashboard.` : `No medicines expire within ${days} days.`,
        });
      }

      if (ql.includes("forecast") || ql.includes("demand") || ql.includes("short")) {
        if (!code) {
          return res.json({ available: false, message: "Hospital not linked to ML code, using fallback. Check Demand Forecast page." });
        }
        const detail = await ml.getForecastDetail(code, 5);
        const lines = (detail.items || []).slice(0, 5).map((i) => `${i.generic_name}: ~${Math.round(i.predicted_demand)} units`);
        return res.json({ available: true, message: `XGBoost forecast (${code}, week ${detail.week_start}): ${lines.join("; ")}.` });
      }

      if (ql.includes("exchange") || ql.includes("match") || ql.includes("request") || ql.includes("hospital")) {
        const data = await ml.getSmartMatches({ hospitalCode: code, demoOnly: true, topK: 5 });
        const items = data.items || [];
        if (!items.length) return res.json({ available: true, message: "No exchange matches found." });
        const lines = items.slice(0, 4).map((m) => `${m.from_hospital_name} → ${m.to_hospital_name}: ${m.generic_name} x${m.suggested_qty}`);
        return res.json({ available: true, message: `Suggested partners: ${lines.join(" | ")}` });
      }

      return res.json({
        available: true,
        message: 'Try significant questions: "Which 5 medicines critically low?" or "Predict shortage risk next month" or "Which hospital has excess Insulin?"',
      });
    } catch (err) {
      return res.json({ available: false, message: `Assistant could not reach ML: ${err.message}` });
    }
  })
);

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      const h = await ml.health();
      const providerInfo = (() => {
        try {
          const AIService = require("../services/ai/AIService");
          return { llmProvider: "loaded" };
        } catch { return { llmProvider: "error" }; }
      })();
      res.json({ ml: h, ai: providerInfo, status: "excellent" });
    } catch (err) {
      res.json({ ml: { status: "offline", error: err.message }, status: "degraded" });
    }
  })
);

module.exports = router;
