/**
 * PromptBuilder - SIMPLIFIED, FAST, NO LAG
 * Short system prompt, concise responses, no infinite loops
 */

const SYSTEM_PROMPT = `You are MedBridge AI, a fast hospital inventory assistant.

RULES:
- Be concise: max 150 words, use bullet points
- Use live inventory data when provided, show exact numbers
- Never ask clarifying questions if data exists - answer directly
- Never hallucinate quantities/prices not in context
- For partner hospitals, share names + stock labels directly (already privacy-safe)
- For medical info, give general info only, not diagnosis
- End with 1 short action suggestion
- No long paragraphs, no infinite responses

You handle:
- Low stock, expiring, costs, forecast, exchange, hospitals
- Show data in short table if relevant: Medicine | Batch | Qty | Price | Expiry
`;

class PromptBuilder {
  static getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  static buildWithInventoryContext(inventoryContext, userHospitalName) {
    let prompt = this.getSystemPrompt();
    if (inventoryContext) {
      prompt += `\n\nHospital: ${userHospitalName || "Hospital"}\nTime: ${new Date().toISOString().split("T")[0]}\n\nINVENTORY CONTEXT:\n${inventoryContext}\nEND CONTEXT\n\nUse context directly, be concise.`;
    }
    return prompt;
  }

  static needsInventoryContext(query) {
    if (!query) return false;
    const q = query.toLowerCase();
    return ["inventory", "stock", "medicine", "expir", "cost", "price", "hospital", "exchange", "low", "critical", "forecast", "how much", "available", "have"].some(k => q.includes(k));
  }

  static sanitizeInput(input) {
    if (!input) return "";
    return String(input).slice(0, 1000).replace(/ignore previous instructions/gi, "[filtered]").trim();
  }
}

module.exports = PromptBuilder;
