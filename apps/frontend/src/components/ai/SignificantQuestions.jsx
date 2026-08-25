import { useState } from "react";

export const SIGNIFICANT_QUESTIONS = {
  "Inventory Intelligence": [
    "Which 5 medicines are critically low and need immediate reorder?",
    "Show all medicines expiring in next 7 days with batch details and value at risk",
    "What is our total inventory value by category? Which category is highest?",
    "List medicines with zero stock but high consumption last month",
    "Which medicines have been overstocked for more than 60 days?",
  ],
  "Cost & Procurement": [
    "What is total cost of medicines expiring this month? How much money at risk?",
    "Which medicines have highest unit price? Show top 10 expensive",
    "Show cost breakdown for antibiotics category",
    "What was total consumption value last month vs this month?",
    "Which medicines should we order to avoid stockout? Calculate total cost",
  ],
  "Demand & Forecasting": [
    "Predict shortage risk for next month based on current consumption rate",
    "Which medicines will need reorder in next 2 weeks based on forecast?",
    "What is demand trend for Paracetamol over last 3 months?",
    "Show forecast accuracy and what it means for our hospital",
    "Which medicines have unpredictable demand and need safety stock?",
  ],
  "Exchange & Network": [
    "Which partner hospital has excess Insulin with high stock?",
    "Suggest best hospital to request Amoxicillin from based on distance and stock",
    "Show pending exchange requests that need my approval",
    "Which hospitals in our network are low on Ceftriaxone?",
    "Create optimal exchange plan to balance inventory",
  ],
  "Safety & Compliance": [
    "List medicines expiring in next 30 days that are critical or controlled",
    "Check for drug interactions between Paracetamol and Ibuprofen in our stock",
    "Which batches need immediate disposal due to expiry?",
    "Show medicines needing cold chain storage and their current status",
    "Generate compliance report for expiring controlled substances",
  ],
  "Analytics & Reports": [
    "Give me summary of inventory turnover this quarter vs last quarter",
    "What is our most consumed medicine category? Why?",
    "Show wastage due to expiry last 3 months and cost",
    "Which supplier provides most medicines? Cost analysis",
    "Generate procurement suggestion list with priority and cost",
  ],
};

export default function SignificantQuestions({ onSelect, disabled }) {
  const [activeCategory, setActiveCategory] = useState("Inventory Intelligence");

  return (
    <div className="sig-questions">
      <div className="sig-questions-header">
        <h4 className="sig-questions-title">Significant Questions</h4>
        <p className="sig-questions-subtitle">Click any question - AI will use live inventory + forecast</p>
      </div>

      <div className="sig-categories">
        {Object.keys(SIGNIFICANT_QUESTIONS).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`sig-category-btn ${activeCategory === cat ? "active" : ""}`}
            disabled={disabled}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="sig-questions-list">
        {SIGNIFICANT_QUESTIONS[activeCategory].map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="sig-question-btn"
            disabled={disabled}
            title={q}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
