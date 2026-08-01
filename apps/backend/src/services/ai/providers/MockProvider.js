const BaseProvider = require("./BaseProvider");

/**
 * MockProvider - Development fallback when no API keys are configured
 * Provides intelligent, medically responsible responses without calling external LLM
 * Now handles cost/price queries and medical terminologies properly
 */
class MockProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.model = "mock-llm-medbridge-v1";
  }

  validateConfig() {
    return { valid: true };
  }

  async chat({ systemPrompt, messages }, options = {}) {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    const query = (lastUser?.content || "");
    const q = query.toLowerCase();

    await new Promise(r => setTimeout(r, 400));

    let content = "";
    const hasInventoryContext = systemPrompt && systemPrompt.includes("INVENTORY CONTEXT");
    let inventoryContextText = "";
    if (hasInventoryContext) {
      try {
        inventoryContextText = systemPrompt.split("INVENTORY CONTEXT:")[1]?.split("END INVENTORY")[0]?.trim() || "";
      } catch {}
    }

    const isCostQuery = q.includes("cost") || q.includes("price") || q.includes("how much") || q.includes("pricing") || q.includes("expensive") || q.includes("cheap");
    const isParacetamol = q.includes("paracetamol") || q.includes("acetaminophen");
    const isIbuprofen = q.includes("ibuprofen");

    if (isCostQuery) {
      if (hasInventoryContext && inventoryContextText) {
        if (inventoryContextText.includes("Not found") || inventoryContextText.includes("No medicines found")) {
          content = `I checked your live MedBridge inventory, but **could not find pricing** for that medicine in your hospital.

${inventoryContextText}

**What you can do:**
- Check Inventory page for all medicines with prices
- Request stock from partner hospitals via Exchange Requests
- Prices vary by supplier, batch, and hospital — always confirm with procurement

If you tell me the exact medicine name, I can search again.`;
        } else if (inventoryContextText.includes("Unit Price") || inventoryContextText.includes("Price: $") || inventoryContextText.includes("$")) {
          content = `Based on **live MedBridge inventory pricing** for your hospital:

${inventoryContextText}

**Pricing Notes:**
- **Unit Price** = cost per unit (tablet, vial, box) — see batch details above
- **Terminology:** 
  - *Generic name* = active ingredient (e.g., Paracetamol)
  - *Batch* = manufacturing lot number
  - *Unit* = how it's counted (boxes, strips, vials)
  - *Unit Price* = price per unit from inventory system
  - *Quantity* = how many units you have in stock
  - *Total value* = quantity × unit price
- Prices may vary by supplier/hospital and over time — check with pharmacy/procurement for final billing
- You can view all pricing in **Inventory** page

Need cost for another medicine? Just ask "How much does [medicine] cost?"`;
        } else {
          content = `I tried to fetch live pricing from your MedBridge inventory, but no pricing context was available.

${inventoryContextText}

**General pricing info:** Medicine costs vary by generic vs brand, strength, dosage form, supplier and hospital contract, batch and expiry. Please check Inventory page where unit price is shown per batch.`;
        }
      } else {
        if (isParacetamol) {
          content = `**Paracetamol cost — general info + how to check live pricing:**

**General market range (varies widely):**
- Nepal: Often NPR 1-5 per tablet for generic 500mg, but depends on brand
- US: $0.02-$0.10 per 500mg tablet generic

**For YOUR hospital's actual price:**
Based on your query, I should have fetched inventory with unitPrice. Ask "How much does Paracetamol cost?" and I will query your MedBridge inventory database which has exact batch-wise pricing:

Example:
- Paracetamol | Batch: B123 | Unit Price: $0.05 per tablet | Qty: 100 tablets | Expiry: 2026-12-01

**Terminology for cost:**
- *Unit Price* = price per single unit
- *Quantity* = stock count
- *Total Value* = unit price × quantity
- *Batch* = lot number

Check **Inventory** page → search Paracetamol → you will see Unit Price column.

*Prices change - always confirm with pharmacy.*`;
        } else {
          content = `**Medicine cost / pricing:**

Medicine prices in MedBridge come from **live inventory (unitPrice field)**:
- Each batch has its own unit price per unit (box/strip/vial)
- To get exact cost, ask: "How much does [medicine name] cost?" — I will then query your hospital's live inventory

**Example questions:**
- "How much does Paracetamol cost?"
- "What is the price of Amoxicillin?"
- "Show Insulin pricing"

**Medical terminology for cost:**
- *Generic name* = Paracetamol
- *Brand name* = e.g., Tylenol
- *Strength* = 500mg
- *Dosage form* = tablet
- *Unit* = boxes, strips, tablets
- *Unit Price* = $ per unit
- *Batch* = BATCH-001

Try asking for a specific medicine now!`;
        }
      }
      return {
        content: content + "\n\n*Pricing from live inventory; general info not medical advice. Consult pharmacy for billing.*",
        tokens: { prompt: 0, completion: content.length / 4, total: content.length / 4 },
        model: this.model,
      };
    }

    if (isParacetamol) {
      content = `**Paracetamol (Acetaminophen)** — *Generic name:* Paracetamol, *Brand examples:* Tylenol, *Category:* Analgesic/Antipyretic, *Form:* Tablet 500mg, Syrup, Injection

**What it does (Indications):**
- Reduces fever (antipyretic) by acting on hypothalamus
- Relieves mild-moderate pain (analgesic): headache, toothache, muscle ache, cold symptoms

**Terminology:**
- *Dosage form* = tablet/capsule/syrup
- *Strength* = e.g., 500mg per tablet
- *Indication* = reason to use
- *Contraindication* = reason NOT to use
- *Side effect* = unwanted effect

**Important safety:**
- Follow label dosage; adult max often 4g/day but lower if liver disease/alcohol use
- **Overdose → liver damage (hepatotoxicity)** — emergency
- Contraindicated: severe liver disease (consult clinician)

**Side effects (Adverse reactions):** Rare at normal dose: nausea, rash; overdose: liver failure
**Storage:** Below 30°C, dry place, check expiry (batch expiry date in inventory)
**Cost:** Ask "How much does Paracetamol cost?" — I will show live unitPrice from your inventory with batch details.

*General info, not medical advice.*`;

      if (q.includes("ibuprofen") || (messages.length > 2 && messages[messages.length-3]?.content?.toLowerCase()?.includes("ibuprofen"))) {
        content += `\n\n**Paracetamol + Ibuprofen interaction:** Different mechanisms (Paracetamol central, Ibuprofen NSAID peripheral). Sometimes alternated for fever per clinician advice, but check contraindications: NSAIDs ↑ risk of stomach ulcer, kidney injury, bleeding, especially with anticoagulants. Ask pharmacist/doctor.`;
      }
    } else if (isIbuprofen) {
      content = `**Ibuprofen** — *Generic:* Ibuprofen, *Brand:* Advil, *Category:* NSAID, *Form:* 200mg/400mg tablet

**Uses:** Pain, fever, inflammation
**Terminology:** *NSAID* = Non-Steroidal Anti-Inflammatory Drug, *Contraindication* = ulcer, severe kidney disease
**Side effects:** Stomach upset, ulcer/bleed risk, raised BP, kidney injury with long use
**Storage:** <30°C, check batch expiry
**Cost:** Ask "Ibuprofen price" for live pricing.

*Not personal advice.*`;
    } else if (q.includes("hypertension") || q.includes("high blood pressure")) {
      content = `**Hypertension** = persistently high BP (often ≥130/80 mmHg). Terminology: Systolic/Diastolic, mmHg, essential vs secondary. Why matters: ↑ risk heart disease, stroke. Management: DASH diet low salt, exercise, weight, limit alcohol. Emergency: chest pain/severe headache → emergency services. *Educational only.*`;
    } else if (q.includes("diabetes")) {
      content = `**Diabetes** — hyperglycemia. Terminology: Type 1 autoimmune insulin deficiency, Type 2 insulin resistance, HbA1c, fasting glucose. Symptoms: Polyuria, polydipsia, polyphagia. Management: diet, exercise, monitoring. *Consult clinician.*`;
    } else if (q.includes("antibiotic")) {
      content = `**Antibiotic** — treats bacterial infections (not viral). Terminology: Generic, Spectrum, Resistance, Batch, Expiry. Take as prescribed, complete course, check expiry. Side effects: nausea, diarrhea. *Follow clinician.*`;
    } else if (hasInventoryContext) {
      content = `Based on **live MedBridge inventory data** (not hallucinated):

${inventoryContextText}

If you need pricing, ask "How much does [medicine] cost?" — I will show unitPrice with batch details. Need actions like Exchange Request for low stock? I can guide you.`;
    } else {
      content = `I'm **MedBridge AI** — understands medical terminologies: generic name, brand name, dosage form, strength, batch, expiry, unit, unit price, category, indications, contraindications, side effects, interactions, storage.

**Medical:** What does Paracetamol do? Side effects of Ibuprofen? Can Paracetamol + Ibuprofen be taken together?
**Cost/Pricing (live):** How much does Paracetamol cost? Price of Amoxicillin? Show Insulin pricing - I will show batch-wise unitPrice, quantity, expiry
**Inventory RAG:** Show available medicines, Which medicines expire this month?, Do we have Insulin?, Which hospital has Ceftriaxone?

**Safety:** General info only, not diagnosis/prescription. Consult professional.`;
    }

    return {
      content,
      tokens: { prompt: 0, completion: content.length / 4, total: content.length / 4 },
      model: this.model,
    };
  }
}

module.exports = MockProvider;
