const BaseProvider = require("./BaseProvider");

/**
 * MockProvider - Local fallback when no LLM API key is configured (or the key
 * has no available quota, e.g. Google's AQ. keys). It never calls a model.
 *
 * Behaviour contract (kept consistent with the real providers):
 * - Answer ONLY what was asked, concisely.
 * - When live inventory data is injected (INVENTORY CONTEXT), use it as the
 *   source of truth and never invent a quantity, price, batch, or expiry.
 * - For availability questions ("Do we have X?", "Is X in stock?") give a
 *   direct yes/no + quantity from the context, not a generic template.
 */
class MockProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.model = "mock-llm-medbridge-v1";
  }

  validateConfig() {
    return { valid: true };
  }

  // ------------------------------------------------------------------
  // Intent detection
  // ------------------------------------------------------------------

  detectPersonalAdviceRequest(q) {
    const phrases = [
      "should i take",
      "should i give",
      "can i give my",
      "can i give him",
      "can i give her",
      "can i take this",
      "how many tablets should",
      "how many mg should i",
      "what dose should i",
      "what dose should my",
      "prescribe me",
      "diagnose me",
      "what do i have",
      "is it safe for my baby",
      "is it safe for my child",
      "is it safe for me",
      "am i having",
      "do i have a",
    ];
    return phrases.some((p) => q.includes(p));
  }

  detectGreeting(q) {
    const patterns = [
      /^hi\b/,
      /^hey\b/,
      /^hello\b/,
      /^yo\b/,
      /^hiya\b/,
      /^namaste\b/,
      /^good (morning|afternoon|evening)\b/,
      /\bgood (morning|afternoon|evening)\b/,
      /\bhow are you\b/,
      /\bwhat('s| is) up\b/,
      /\bsup\b/,
    ];
    return patterns.some((re) => re.test(q));
  }

  detectFarewell(q) {
    const patterns = [
      /\bbye\b/,
      /\bgoodbye\b/,
      /\bgood bye\b/,
      /\bsee (you|ya)\b/,
      /\bsee you later\b/,
      /\btake care\b/,
      /\bgood ?night\b/,
      /\blater\b/,
      /\bi('m| am) (leaving|off|done|going)\b/,
      /\bthat('s| is) all\b/,
      /\bnothing else\b/,
      /\bthanks? (bye|goodbye)\b/,
    ];
    return patterns.some((re) => re.test(q));
  }

  detectOffTopic(q) {
    const smallTalk = [
      /\bthanks?\b/,
      /\bthank you\b/,
      /\bwho (are|r) (you|u)\b/,
      /\bwhat can you do\b/,
      /\bhelp me\b/,
      /\bwho (made|built|created) you\b/,
      /\btell me a joke\b/,
      /\bwhat('s| is) your name\b/,
    ];
    const nonMedicine = [
      "weather",
      "football",
      "cricket",
      "basketball",
      "stock market",
      "share price",
      "cryptocurrency",
      "bitcoin",
      "movie",
      "netflix",
      "recipe",
      "holiday plan",
      "flight ticket",
      "python code",
      "javascript code",
      "write code",
      "fix my code",
      "debug this",
      "sql query",
      "essay",
      "homework",
      "poem",
      "song lyrics",
      "translate this",
      "horoscope",
      "politics",
      "election",
    ];
    return smallTalk.some((re) => re.test(q)) || nonMedicine.some((p) => q.includes(p));
  }

  // ------------------------------------------------------------------
  // Concise response builders
  // ------------------------------------------------------------------

  greetingResponse() {
    return "Hi, I'm MedBridge AI.\n\nAsk me about your inventory, medicine prices, expiries, or stock levels. For example: \"Do we have Insulin?\", \"How much does Paracetamol cost?\", or \"What is low in stock?\"";
  }

  farewellResponse() {
    return "Goodbye! Ask me anytime about stock levels, prices, or expiries.";
  }

  offTopicResponse(originalQuery) {
    const trimmed = String(originalQuery || "").trim().slice(0, 120);
    return `I'm the MedBridge assistant — I work with medicine information and this hospital's live inventory.${trimmed ? ` (You asked: "${trimmed}")` : ""}\n\nTry \"Do we have Insulin?\" or \"How much does Paracetamol cost?\"`;
  }

  personalAdviceResponse() {
    return "I can't give personal dosing, diagnosis, or prescription advice — that needs a clinician who knows the patient's history, weight, and other medicines.\n\nIf this is urgent (breathing difficulty, chest pain, suspected overdose, uncontrolled bleeding), treat it as an emergency.\n\n*General information only — not medical advice. Please consult a qualified healthcare professional.*";
  }

  // ------------------------------------------------------------------
  // Parse the injected INVENTORY CONTEXT into structured records
  // ------------------------------------------------------------------

  parseContext(text) {
    const records = [];
    if (!text) return records;
    // Each inventory line looks like:
    //   - Name | Batch: B123 | Qty: 200 units | ... | Price: $0.05 per unit
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!line.startsWith("- ")) continue;
      const body = line.slice(2);
      const parts = body.split("|").map((p) => p.trim());
      const rec = {};
      for (const part of parts) {
        const eq = part.indexOf(":");
        if (eq === -1) continue;
        const key = part.slice(0, eq).trim().toLowerCase();
        const val = part.slice(eq + 1).trim();
        if (key === "qty") {
          const m = val.match(/^([\d.]+)/);
          rec.qty = m ? parseFloat(m[1]) : null;
          rec.unit = val.replace(/^[\d.]+\s*/, "").trim();
        } else if (key === "batch") rec.batch = val;
        else if (key === "expiry") rec.expiry = val;
        else if (key === "status") rec.status = val;
        else if (key === "unit price" || key === "price") rec.price = val;
        else if (key === "category") rec.category = val;
      }
      if (!rec.name && /\|\s*Qty:/.test(line)) {
        rec.name = parts[0].replace(/^[- ]*/, "").trim();
      } else if (!rec.name) {
        rec.name = parts[0].replace(/^[- ]*/, "").trim();
      }
      if (rec.name) records.push(rec);
    }
    return records;
  }

  findMedicine(records, name) {
    const n = String(name || "").toLowerCase();
    return records.find((r) => r.name && r.name.toLowerCase().includes(n));
  }

  // ------------------------------------------------------------------
  // Main chat
  // ------------------------------------------------------------------

  async chat({ systemPrompt, messages }, options = {}) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const query = lastUser?.content || "";
    const q = query.toLowerCase();

    await new Promise((r) => setTimeout(r, 250));

    const hasInventoryContext = systemPrompt && systemPrompt.includes("INVENTORY CONTEXT");
    let inventoryContextText = "";
    if (hasInventoryContext) {
      try {
        inventoryContextText =
          systemPrompt.split("INVENTORY CONTEXT:")[1]?.split("END INVENTORY")[0]?.trim() || "";
      } catch {}
    }
    const records = this.parseContext(inventoryContextText);

    const isCostQuery =
      q.includes("cost") || q.includes("price") || q.includes("how much") ||
      q.includes("pricing") || q.includes("expensive") || q.includes("cheap");
    const isAvailability =
      /do we have|do you have|is there|have .* available|is .* available|have .* in stock|is .* in stock|in stock|available/.test(q);
    const isExpiring = q.includes("expire") || q.includes("expiry") || q.includes("expiring");
    const isLowStock = q.includes("low") || q.includes("critical") || q.includes("shortage");
    const isPartner =
      q.includes("which hospital") || q.includes("who has") || q.includes("has ") ||
      q.includes("partner") || q.includes("another hospital");

    // Safety first.
    if (this.detectPersonalAdviceRequest(q)) {
      return this._done(this.personalAdviceResponse());
    }

    // Greeting / farewell / thanks / off-topic.
    if (this.detectGreeting(q)) return this._done(this.greetingResponse());
    if (this.detectFarewell(q)) return this._done(this.farewellResponse());
    if (/\b(thanks?|thank you)\b/.test(q)) return this._done("You're welcome! Ask me anytime about stock, prices, expiries, or which partner hospital has a medicine.");
    if (this.detectOffTopic(q)) return this._done(this.offTopicResponse(query));

    // ---------- Low stock ----------
    // Checked first so "what is low in stock" is a low-stock question, not an
    // availability question. Raw context blocks read as-is.
    if (isLowStock) {
      if (/No low or critical stock|healthy|None found|No medicines found/i.test(inventoryContextText)) {
        return this._done("No low or critical stock right now — your inventory is healthy.");
      }
      return this._done(
        inventoryContextText
          ? `Low / critical stock:\n\n${inventoryContextText}\n\nAsk \"Which hospital has [medicine]?\" to see partner hospitals that may stock it.`
          : "I couldn't load stock levels just now.",
      );
    }

    // ---------- Expiring ----------
    if (isExpiring) {
      if (/No medicines expiring|None found|No medicines found|nothing is expiring/i.test(inventoryContextText)) {
        return this._done("No medicines are expiring in the next 30 days. Your inventory is clear on expiry.");
      }
      return this._done(
        inventoryContextText
          ? `Expiring soon:\n\n${inventoryContextText}\n\nPlan usage or an exchange before the date passes.`
          : "I couldn't load expiry data just now. Check the Expiry Alerts on the Dashboard.",
      );
    }

    // ---------- Availability ("Do we have X?") ----------
    if (isAvailability) {
      const wanted = this._extractMedicine(query);
      if (!wanted) {
        return this._done(
          hasInventoryContext
            ? "I can check availability, but I need the exact medicine name. Which medicine do you want to check?"
            : "I can tell you what's in stock if you name a medicine. Which one?",
        );
      }
      const found = this.findMedicine(records, wanted);
      const header = /INVENTORY SEARCH FOR/i.test(inventoryContextText)
        ? "INVENTORY SEARCH FOR"
        : null;
      const notFound = header || /No exact matching medicine|not found|None found/i.test(
        inventoryContextText,
      );
      if (found && found.qty != null && !notFound) {
        const exp = found.expiry ? `, expires ${found.expiry}` : "";
        const price = found.price ? `, unit price ${found.price}` : "";
        return this._done(
          `Yes — you have **${found.qty} ${found.unit || "units"}** of ${this._cap(found.name)} in stock${exp}${price}.${found.batch ? ` (Batch: ${found.batch})` : ""}`,
        );
      }
      return this._done(
        `No — your hospital's live inventory has no batch of **${this._cap(wanted)}** in stock right now.` +
          "\n\nAsk \"Which hospital has " + this._cap(wanted) + "?\" to see partner hospitals that may have it, and raise an Exchange Request."
      );
    }

    // ---------- Cost / pricing ----------
    if (isCostQuery) {
      if (hasInventoryContext && inventoryContextText) {
        if (/COST\/PRICING/i.test(inventoryContextText) || records.some((r) => r.price)) {
          const lines = records
            .map((r) => `- ${this._cap(r.name)}: ${r.price}${r.expiry ? ` (exp ${r.expiry})` : ""}`)
            .join("\n");
          return this._done(
            `Live pricing from your inventory:\n\n${lines || inventoryContextText}\n\nPrices are per unit and vary by supplier/batch — confirm with procurement.`,
          );
        }
        return this._done(
          "I checked your live inventory but couldn't find a price for that medicine.\n\nTell me the exact medicine name and I'll search again.",
        );
      }
      return this._done(
        "I need live inventory data to give an exact price. On the Inventory page each medicine shows a unit price per batch.\n\n*Pricing from live inventory; not medical advice.*",
      );
    }

    // ---------- Partner hospitals ----------
    if (isPartner) {
      if (/PARTNER HOSPITALS/i.test(inventoryContextText)) {
        return this._done(
          `${inventoryContextText}\n\nExact quantities and prices are private to each hospital — raise an Exchange Request to confirm availability.`,
        );
      }
      return this._done(
        inventoryContextText
          ? inventoryContextText
          : "I couldn't find partner-hospital availability just now. Check the Hospitals page and raise an Exchange Request.",
      );
    }

    // ---------- General medicine info (concise) ----------
    const medicalInfo = this.conciseMedicalInfo(query);
    if (medicalInfo) return this._done(medicalInfo);

    // ---------- Fallback with context ----------
    if (hasInventoryContext && inventoryContextText) {
      const lines = records.map((r) => `- ${r.name}: ${r.qty ?? "?"} ${r.unit || "units"}${r.expiry ? `, exp ${r.expiry}` : ""}`).join("\n");
      return this._done(
        lines
          ? `Here's what I found from your hospital's live inventory:\n\n${lines}`
          : inventoryContextText,
      );
    }

    return this._done(
      "I'm MedBridge AI. Ask me about stock levels, medicine prices, expiries, low stock, or which partner hospital has a medicine.",
    );
  }

  conciseMedicalInfo(q) {
    const lower = q.toLowerCase();
    if (lower.includes("paracetamol") || lower.includes("acetaminophen")) {
      return "**Paracetamol (acetaminophen)** is a pain reliever and fever reducer. It's used for headache, toothache, and cold symptoms.\n\nFollow the label dose and don't exceed the recommended amount — overdose can damage the liver.\n\n*General information, not medical advice. Consult a qualified healthcare professional.*";
    }
    if (lower.includes("ibuprofen")) {
      return "**Ibuprofen** is a non-steroidal anti-inflammatory (NSAID) used for pain, fever, and inflammation.\n\nCommon side effects: stomach upset and, with long use, ulcer or kidney issues. Avoid in severe kidney disease or ulcers.\n\n*General information, not medical advice. Consult a qualified healthcare professional.*";
    }
    if (lower.includes("hypertension") || lower.includes("high blood pressure")) {
      return "**High blood pressure (hypertension)** is persistently elevated blood pressure (often ≥130/80 mmHg), which raises the risk of heart disease and stroke.\n\nManagement includes a low-salt diet, exercise, and weight control. Emergency signs (chest pain, severe headache) need urgent care. *Educational only.*";
    }
    if (lower.includes("diabetes")) {
      return "**Diabetes** is high blood sugar — type 1 is insulin deficiency, type 2 is insulin resistance.\n\nSymptoms can include increased thirst, urination, and hunger. Management is diet, exercise, and monitoring. *Consult a clinician.*";
    }
    if (lower.includes("antibiotic")) {
      return "**Antibiotics** treat bacterial infections, not viral ones. Take the full course as prescribed and check the batch expiry. Side effects can include nausea and diarrhea. *Follow your clinician.*";
    }
    return null;
  }

  _extractMedicine(query) {
    // Try explicit "Do we have X?", "is X in stock", "X available"
    const patterns = [
      /do we have (?:any |some )?(?:of )?([a-z]+)\b/i,
      /do you have (?:any |some )?(?:of )?([a-z]+)\b/i,
      /is there (?:any |some )?(?:of )?([a-z]+)\b/i,
      /is (?:a |an )?([a-z]+) (?:in stock|available)/i,
      /(?:have|got) (?:any |some )?([a-z]+)(?: in stock| available)?/i,
      /([a-z]+) available/i,
      /([a-z]+) in stock/i,
    ];
    const stop = new Set([
      "much", "does", "cost", "price", "the", "an", "a", "is", "of", "all",
      "my", "our", "inventory", "medicine", "medicines", "stock", "drug",
      "drugs", "show", "list", "view", "display", "available", "hospital",
      "hospitals", "how", "what", "which", "who", "when", "and", "or", "to", "we",
    ]);
    for (const re of patterns) {
      const m = query.match(re);
      if (m && m[1]) {
        const w = m[1].toLowerCase();
        if (!stop.has(w) && w.length > 2) return w;
      }
    }
    // Fall back to the parser's medicine list if one medicine is present in context
    return null;
  }

  _cap(name) {
    const s = String(name || "").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  _done(content) {
    return {
      content,
      tokens: { prompt: 0, completion: content.length / 4, total: content.length / 4 },
      model: this.model,
    };
  }
}

module.exports = MockProvider;
