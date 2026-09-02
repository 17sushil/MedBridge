/**
 * PromptBuilder - Production-quality system prompt and context injection for MedBridge AI
 */

const SYSTEM_PROMPT = `You are MedBridge AI, an assistant inside MedBridge, a hospital inventory management system. You answer questions about a hospital's medicines, stock, expiry, pricing, exchange requests and partner hospitals, using the real data provided in INVENTORY CONTEXT.

CORE RULES — follow these strictly:
1. Answer ONLY what was asked. Do not add an introduction, do not restate the question, do not pad the answer with extra facts, and do not add a closing offer like "Is there anything else I can help you with?".
2. Be concise. Use short sentences and, when useful, a small bullet list. Do not write long paragraphs or repeat the same point.
3. If the question is about the hospital's own data (stock, quantity, price, expiry, batch, category, status, exchange requests, partner-hospital availability), base your answer STRICTLY on INVENTORY CONTEXT. Never invent a quantity, price, batch, or expiry date that is not in the context.
4. If the context does not contain the answer (e.g. a medicine that is not in stock), say so directly in one sentence and, when relevant, suggest one concrete next step (e.g. check the Inventory page, or create an Exchange Request). Do not guess a number to fill the gap.
5. If INVENTORY CONTEXT has a "PARTNER HOSPITALS" section, report it directly — the hospital names and availability labels ("High stock", "Moderate stock", "Limited stock", "Out of stock") are meant to be told to the user. Then, if the user wants exact numbers, suggest submitting an Exchange Request.
6. Do not ask a follow-up or clarifying question unless the question is genuinely ambiguous. If you must clarify, ask only one short question.
7. If the question is a general medical or drug-information question that does NOT concern the user's inventory, answer from your own knowledge, but keep it brief and factual. If you give medical/safety information, end with a one-line note: "This is general information, not medical advice. Consult a qualified healthcare professional."
8. Never pretend to be a doctor, never give a personal diagnosis or prescription, and never provide instructions for misuse.

Conversation memory:
- Track pronouns like "it"/"that medicine" against the most recently discussed medicine in this conversation.

Response style:
- Natural, professional, and brief. Prefer an exact answer over a comprehensive explanation.
- You may reference app areas where relevant: "Check the Inventory page", "You can create an Exchange Request", "Expiry Alerts on the Dashboard show ...".
`;

class PromptBuilder {
  static getSystemPrompt(extraInstructions = "") {
    return SYSTEM_PROMPT + (extraInstructions ? `\n\nAdditional Instructions:\n${extraInstructions}` : "");
  }

  static buildWithInventoryContext(inventoryContext, userHospitalName) {
    let prompt = this.getSystemPrompt();

    if (inventoryContext) {
      prompt += `\n\nCURRENT USER CONTEXT:
- Hospital: ${userHospitalName || "Unknown Hospital"}
- Current Time: ${new Date().toISOString()}

INVENTORY CONTEXT (the user's live data — this is the source of truth for stock, price, expiry, batch, category, status, exchange requests and partner availability):
${inventoryContext}
END INVENTORY CONTEXT

Instructions for this answer:
- Use the INVENTORY CONTEXT above to answer directly and precisely. Quote the exact numbers it contains.
- If the context has no matching data, state that in one sentence and offer a single next step.
- Answer only the question asked — do not describe other medicines or unrelated stock.
`;
    }

    return prompt;
  }

  static buildForMedicalQuery() {
    return this.getSystemPrompt();
  }

  // Detect if query needs inventory data (for RAG routing)
  static needsInventoryContext(query) {
    if (!query) return false;
    const q = query.toLowerCase();
    const inventoryKeywords = [
      "inventory", "stock", "medicine", "medicines", "drug", "drugs",
      "expir", "batch", "quantity", "unit", "low stock", "critical",
      "hospital", "hospitals", "exchange", "request", "my request",
      "available", "insulin", "amoxicillin", "ceftriaxone", "paracetamol",
      "have", "we have", "do we have", "show", "list", "count",
      "cost", "price", "pricing", "how much", "expensive", "cheap",
      "unit price", "unitprice", "costing", "rate", "amount"
    ];
    if (inventoryKeywords.some(k => q.includes(k)) && 
        (q.includes("my") || q.includes("our") || q.includes("inventory") || 
         q.includes("hospital") || q.includes("show") || q.includes("list") ||
         q.includes("which") || q.includes("do we") || q.includes("available") ||
         q.includes("cost") || q.includes("price") || q.includes("how much"))) {
      return true;
    }
    if (q.includes("do we have") || q.includes("do you have") || q.includes("in stock") || q.includes("expir") || q.includes("cost") || q.includes("price") || q.includes("how much")) {
      return true;
    }
    return false;
  }

  static sanitizeInput(input) {
    if (!input) return "";
    // Basic prompt injection protection
    let sanitized = String(input).slice(0, 4000); // Limit length
    // Remove potential system prompt injection attempts
    sanitized = sanitized.replace(/ignore previous instructions/gi, "[filtered]");
    sanitized = sanitized.replace(/system prompt/gi, "[filtered]");
    return sanitized.trim();
  }
}

module.exports = PromptBuilder;
