const BaseProvider = require("./BaseProvider");

/**
 * MockProvider - SIMPLIFIED, FAST, NO INFINITE RESPONSE
 * Concise responses, no lag, no infinite loops
 */
class MockProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.model = "mock-fast-v2";
  }

  validateConfig() { return { valid: true }; }

  async chat({ systemPrompt, messages }) {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    const query = (lastUser?.content || "").toLowerCase();

    // Simulate small delay, not long
    await new Promise(r => setTimeout(r, 200));

    const hasContext = systemPrompt && systemPrompt.includes("INVENTORY CONTEXT");
    let contextText = "";
    if (hasContext) {
      try { contextText = systemPrompt.split("INVENTORY CONTEXT:")[1]?.split("END CONTEXT")[0]?.trim() || ""; } catch {}
    }

    let content = "";

    // Concise, fast responses - max 120 words
    if (contextText && contextText.length > 10 && !contextText.includes("No ") && !contextText.includes("No inventory")) {
      // Has live data - use it directly, concise
      content = `**Live Data:**\n${contextText}\n\n**Action:** Check Inventory page for details or create Exchange Request if needed.`;
    } else if (query.includes("low") || query.includes("critical")) {
      content = hasContext && contextText ? `**Low Stock:**\n${contextText}\n\n**Action:** Reorder immediately if <7 days cover.` : `No critical low stock found. Check Inventory → filter by Critical.\n\n**Tip:** Ask "Which medicines are critically low?" for live list.`;
    } else if (query.includes("expir")) {
      content = hasContext && contextText ? `**Expiring Soon:**\n${contextText}\n\n**Action:** Consider exchange with high-use hospital.` : `No expiring medicines in selected window. Check Dashboard → Expiry Alerts.`;
    } else if (query.includes("cost") || query.includes("price")) {
      content = hasContext && contextText ? `**Cost:**\n${contextText}\n\nUnit Price = per unit, Total = Qty × Price.` : `Ask "How much does [medicine] cost?" for live pricing from inventory.`;
    } else if (query.includes("hospital")) {
      content = hasContext && contextText ? `**Hospitals:**\n${contextText}\n\n**Action:** Request from High stock hospital via Exchange Requests.` : `Partner hospitals available. Ask "Which hospital has [medicine]?"`;
    } else if (query.includes("paracetamol")) {
      content = `**Paracetamol:** Analgesic/antipyretic, 500mg tablet. Reduces fever/pain. Max 4g/day adult, avoid in severe liver disease. Overdose = liver damage. Store <30°C.\n\nFor live stock/cost, ask "Paracetamol cost?"`;
    } else {
      content = `I can help with:\n- Low stock: "Which medicines critically low?"\n- Expiring: "Show expiring in 7 days"\n- Cost: "How much does Insulin cost?"\n- Hospitals: "Which hospital has Amoxicillin?"\n- Forecast: Check Demand Forecast page\n\nAsk a specific question for live data.`;
    }

    // Ensure concise - truncate if too long
    if (content.length > 800) content = content.slice(0, 800) + "\n\n... (truncated for speed)";

    return {
      content,
      tokens: { prompt: 0, completion: content.length / 4, total: content.length / 4 },
      model: this.model,
    };
  }

  // FIXED: Fast streaming, no infinite loop, yields chunks not full content repeatedly
  async *chatStream({ systemPrompt, messages }) {
    const result = await this.chat({ systemPrompt, messages });
    // Split into 3-4 chunks only, not per word (prevents lag)
    const chunkSize = Math.ceil(result.content.length / 4);
    for (let i = 0; i < result.content.length; i += chunkSize) {
      yield result.content.slice(0, i + chunkSize);
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

module.exports = MockProvider;
