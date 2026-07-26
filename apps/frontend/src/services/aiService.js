// AI integration seam — wired to backend /api/ai/* which calls the XGBoost ML service.
// UI components (AIInsightPanel, AI Assistant, etc.) stay unchanged.

import { request } from "./httpClient";

export const aiService = {
  isEnabled: true,

  async getForecastInsight() {
    try {
      return await request("/ai/forecast-insight");
    } catch (err) {
      return {
        available: false,
        message:
          err.message ||
          "AI-powered demand forecasting isn't connected yet. Start the ML service on port 8000.",
      };
    }
  },

  async getSmartMatchSuggestions() {
    try {
      return await request("/ai/smart-match");
    } catch (err) {
      return {
        available: false,
        message:
          err.message ||
          "Smart exchange matching is offline. Start the ML service on port 8000.",
      };
    }
  },

  async askAssistant(question) {
    try {
      const res = await request("/ai/assistant", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      // Frontend AIAssistant renders res.message
      return {
        available: res.available !== false,
        message: res.message || res.answer || "No response.",
      };
    } catch (err) {
      return {
        available: false,
        message:
          err.message ||
          "The MedBridge Assistant could not reach the API/ML service.",
      };
    }
  },
};