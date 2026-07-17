// AI integration seam.
//
// Nothing here calls a model yet — it's a stable interface so the UI
// (AIInsightPanel, AI Assistant page, future smart-matching in
// Exchange Requests) can be built now and wired to a real model
// later without changing any component code.
//
// When ready, point these at your API route, e.g.:
//   const res = await fetch("/api/ai/forecast", { method: "POST", body: ... })

export const aiService = {
  isEnabled: false,

  async getForecastInsight() {
    return {
      available: false,
      message:
        "AI-powered demand forecasting isn't connected yet. Once enabled, this panel will highlight predicted shortages before they happen.",
    };
  },

  async getSmartMatchSuggestions() {
    return {
      available: false,
      message:
        "Smart exchange matching will suggest the best partner hospital for a request based on stock, distance, and expiry.",
    };
  },

  async askAssistant(_question) {
    return {
      available: false,
      message:
        "The MedBridge Assistant is coming soon. It will be able to answer questions like \"which medicines expire this month?\" directly.",
    };
  },
};
