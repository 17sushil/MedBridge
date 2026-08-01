const BaseProvider = require("./BaseProvider");

/**
 * MockProvider - Development fallback when no API keys are configured
 * Provides intelligent, medically responsible responses without calling external LLM
 * Used to keep the app functional in dev and for testing
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
    const query = (lastUser?.content || "").toLowerCase();

    // Simulate thinking delay
    await new Promise(r => setTimeout(r, 400));

    let content = "";

    // Check if context injection happened via systemPrompt
    const hasInventoryContext = systemPrompt && systemPrompt.includes("INVENTORY CONTEXT");

    if (query.includes("paracetamol")) {
      content = `**Paracetamol (Acetaminophen)** is a widely used analgesic and antipyretic.

**What it does:**
- Reduces fever by acting on the brain's temperature-regulating center
- Relieves mild to moderate pain (headache, toothache, muscle ache)

**Important safety:**
- Always follow label dosage or clinician advice
- Adult typical max is 4g per day, but lower for liver issues or alcohol use
- **Overdose can cause serious liver damage** — never exceed recommended dose
- Avoid if you have severe liver disease unless advised by clinician

**When to seek care:**
- Pain/fever persists >3 days
- You have liver disease, drink heavily, or take other medicines

*This is general information, not medical advice. Consult a qualified healthcare professional for personal decisions.*`;

      if (query.includes("ibuprofen") || (messages.length > 2 && messages[messages.length-3]?.content?.toLowerCase()?.includes("ibuprofen"))) {
        content += `\n\n**Paracetamol + Ibuprofen together:**\nThey work differently and are sometimes used alternately for certain conditions, but you should only combine them if a clinician advises it. Avoid if you have stomach ulcers, kidney disease, or are on blood thinners. Ask your pharmacist or doctor first.`;
      }
    } else if (query.includes("ibuprofen")) {
      content = `**Ibuprofen** is a non-steroidal anti-inflammatory drug (NSAID).

**Uses:** Pain relief, fever reduction, inflammation (e.g., muscle sprain)

**Common side effects:** Stomach upset, nausea, headache, raised blood pressure with long use. Higher risk of stomach ulcer/bleeding.

**Contraindications:** History of ulcer/bleed, severe kidney disease, late pregnancy, allergy to NSAIDs

**Storage:** Store below 30°C, keep away from moisture

*Not personal advice — consult healthcare professional.*`;
    } else if (query.includes("hypertension") || query.includes("high blood pressure")) {
      content = `**Hypertension** = persistently high blood pressure (often ≥130/80 mmHg, definitions vary by guideline).

**Why it matters:** Increases risk of heart disease, stroke, kidney disease

**Common causes:** Genetics, high salt intake, obesity, lack of exercise, stress, some medicines

**Management generally includes:** Low-salt diet (DASH), regular exercise, weight control, limiting alcohol, not smoking, prescribed medicines if needed

**Seek care if:** Very high readings, chest pain, severe headache, vision changes — emergency services.

*Educational only — not a diagnosis.*`;
    } else if (query.includes("diabetes")) {
      content = `**Diabetes** is a condition where blood sugar is too high.

- **Type 1:** Immune system destroys insulin-producing cells → needs insulin
- **Type 2:** Body resists insulin or doesn't make enough — linked to lifestyle + genetics

**Common symptoms:** Frequent urination, excessive thirst/hunger, fatigue, blurred vision

**Prevention / control:** Balanced diet, exercise, weight management, regular check-ups, take medicines as prescribed

If you have symptoms, consult clinician for testing.`;
    } else if (query.includes("antibiotic")) {
      content = `**Antibiotics** = medicines that treat bacterial infections (not viruses like common cold).

**Key points:**
- Take exactly as prescribed, complete the course
- Don't share antibiotics or use leftovers
- Overuse contributes to antibiotic resistance

**Side effects can include:** Nausea, diarrhea, allergic reaction

**Storage:** Follow label — some need refrigeration

*Always follow clinician guidance.*`;
    } else if (hasInventoryContext) {
      // If we have inventory context injected, we should summarize it
      // The actual context text is in systemPrompt, but we will just acknowledge
      const lastMsg = messages[messages.length - 1]?.content || "";
      content = `Based on the live MedBridge inventory data injected into my context, here's what I found for your hospital. The details are from your actual database, not hallucinated.

${systemPrompt.includes("INVENTORY CONTEXT") ? systemPrompt.split("INVENTORY CONTEXT:")[1]?.split("END INVENTORY")[0]?.trim() || "" : ""}

If you need specific actions (like creating an exchange request for low stock), I can guide you.`;

      // If no real context retrieved, explain
      if (content.length < 100) {
        content = `I checked your live MedBridge inventory for this hospital. No matching items found for that query, or inventory is empty.

Try asking:
- "Show medicines expiring this month"
- "Do we have Insulin?"
- "What's low stock?"`;
      }
    } else {
      content = `I'm MedBridge AI, your healthcare inventory assistant.

I can help with:

**Medical information:**
- Medicines: uses, side effects, contraindications, interactions
- Diseases, symptoms, first aid, vaccines, terminology
- Storage, expiry, preventive care

**MedBridge live data:**
- "Show available medicines"
- "Which medicines expire this month?"
- "Do we have Insulin?"
- "Show my exchange requests"
- "Which hospitals have Ceftriaxone?"

**Safety:** I provide general information only — not diagnosis or prescriptions. Always consult qualified healthcare professionals for personal decisions.

What would you like to know?`;
    }

    return {
      content,
      tokens: { prompt: 0, completion: content.length / 4, total: content.length / 4 },
      model: this.model,
    };
  }
}

module.exports = MockProvider;
