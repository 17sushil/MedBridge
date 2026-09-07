/**
 * HTTP client for the MedBridge Python ML service (FastAPI + XGBoost).
 *
 * ML service default: http://localhost:8000
 * Override with ML_SERVICE_URL in .env
 */

const DEFAULT_TIMEOUT_MS = 120000;
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 2;

function baseUrl() {
  return (process.env.ML_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mlFetch(path, { method = "GET", query, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt);
    try {
      return await mlFetchOnce(path, { method, query, body, timeoutMs });
    } catch (e) {
      // Retry only transient failures: cold start (502/503/504/timeout/net).
      const transient =
        e.status === 502 || e.status === 503 || e.status === 504 || e.status === 0;
      if (!transient) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

async function mlFetchOnce(path, { method = "GET", query, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(
        (data && (data.detail || data.message)) || `ML service error ${res.status}`
      );
      err.status = res.status;
      err.data = data;
      err.ml = true;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error(`ML service timeout after ${timeoutMs}ms (${baseUrl()})`);
      err.status = 504;
      err.ml = true;
      throw err;
    }
    if (e.ml) throw e;
    const err = new Error(
      `Cannot reach ML service at ${baseUrl()}: ${e.message}. Start it with: cd apps/ml-service && uvicorn app.api.server:app --port 8000`
    );
    err.status = 503;
    err.ml = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function health() {
  return mlFetch("/health");
}

async function getForecastChart(hospitalCode, months = 6) {
  return mlFetch("/forecast/chart", { query: { hospital_id: hospitalCode, months } });
}

async function getForecastDetail(hospitalCode, top = 50) {
  return mlFetch("/forecast", { query: { hospital_id: hospitalCode, top } });
}

async function getExpiryAlerts(hospitalCode, days = 90, limit = 100) {
  return mlFetch("/expiry", {
    query: { hospital_id: hospitalCode || undefined, days, limit },
  });
}

async function getLowStock(hospitalCode, limit = 100) {
  return mlFetch("/low-stock", {
    query: { hospital_id: hospitalCode || undefined, limit },
  });
}

async function getSmartMatches({ hospitalCode, medicineId, demoOnly = true, topK = 20 } = {}) {
  return mlFetch("/exchange/suggest", {
    query: {
      hospital_id: hospitalCode || undefined,
      medicine_id: medicineId || undefined,
      demo_only: demoOnly ? "true" : "false",
      top_k: topK,
    },
  });
}

async function getInventorySummary(hospitalCode) {
  return mlFetch("/inventory/summary", { query: { hospital_id: hospitalCode } });
}

async function getMetrics() {
  return mlFetch("/metrics");
}

module.exports = {
  baseUrl,
  health,
  getForecastChart,
  getForecastDetail,
  getExpiryAlerts,
  getLowStock,
  getSmartMatches,
  getInventorySummary,
  getMetrics,
};
