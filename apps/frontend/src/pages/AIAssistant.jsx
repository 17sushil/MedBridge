import { useRef, useEffect, useState } from "react";
import { Sparkles, Send, Copy, Check, Trash2, Bot, User, Loader2, Database, Shield, Lightbulb } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { useAIChat } from "../context/AIChatContext";
import "./AIAssistant.css";

// Good questions that can be asked - useful, productive, not useless
const GOOD_QUESTIONS = [
  { q: "Which medicines are critically low?", cat: "Low Stock", icon: "🚨" },
  { q: "Show expiring in next 7 days with value", cat: "Expiry", icon: "⏰" },
  { q: "How much does Insulin cost? Show batch", cat: "Cost", icon: "💰" },
  { q: "Which hospital has excess Amoxicillin?", cat: "Exchange", icon: "🏥" },
  { q: "Predict shortage for next month", cat: "Forecast", icon: "📈" },
  { q: "What is total inventory value by category?", cat: "Analytics", icon: "📊" },
  { q: "Show pending exchange requests", cat: "Exchange", icon: "📦" },
  { q: "List medicines with expiry <14 days", cat: "Safety", icon: "⚠️" },
  { q: "What is most consumed medicine this month?", cat: "Analytics", icon: "🔥" },
  { q: "Show cost breakdown for antibiotics", cat: "Cost", icon: "💵" },
  { q: "Which batches need disposal?", cat: "Safety", icon: "🗑️" },
  { q: "Suggest reorder list with cost", cat: "Procurement", icon: "🛒" },
];

function SystematicOutput({ text }) {
  if (!text) return null;
  
  // Parse and render in systematic good format
  const lines = text.split("\n");
  return (
    <div className="systematic-output">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="line-spacer" />;
        
        // Header: **Title**
        if (line.trim().startsWith("**") && line.trim().endsWith("**")) {
          const content = line.trim().slice(2, -2);
          return <div key={idx} className="sys-header">{content}</div>;
        }
        
        // Bullet: - or •
        if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
          const content = line.trim().slice(2);
          // Check if it looks like table row: contains |
          if (content.includes("|")) {
            const parts = content.split("|").map(p => p.trim()).filter(Boolean);
            return (
              <div key={idx} className="sys-table-row">
                {parts.map((part, pi) => (
                  <span key={pi} className="sys-cell">{part}</span>
                ))}
              </div>
            );
          }
          return <div key={idx} className="sys-bullet"><span className="bullet-dot">•</span> {content}</div>;
        }
        
        // Action line
        if (line.toLowerCase().includes("action:") || line.toLowerCase().includes("next:")) {
          return <div key={idx} className="sys-action">👉 {line}</div>;
        }
        
        return <div key={idx} className="sys-text">{line}</div>;
      })}
    </div>
  );
}

export default function AIAssistant() {
  const { messages, input, setInput, loading, conversationId, error, sendMessage, handleClear } = useAIChat();
  const [copiedId, setCopiedId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  return (
    <div className="ai-final-page">
      <PageHeader
        title="AI Assistant"
        subtitle="Good questions, systematic format, fast, live inventory"
        actions={
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 size={14} /> Clear
          </Button>
        }
      />

      <div className="ai-final-layout">
        {/* Good Questions Panel - Useful */}
        <Card className="ai-questions-panel">
          <h4><Lightbulb size={14} /> Good Questions to Ask</h4>
          <p>Click any - systematic output, good format, live data</p>
          <div className="questions-grid">
            {GOOD_QUESTIONS.map((item) => (
              <button key={item.q} onClick={() => sendMessage(item.q)} disabled={loading} className="question-chip" title={item.cat}>
                <span className="q-icon">{item.icon}</span>
                <span className="q-text">{item.q}</span>
                <span className="q-cat">{item.cat}</span>
              </button>
            ))}
          </div>

          <div className="ai-capabilities-simple">
            <h5>Systematic Format</h5>
            <ul>
              <li>📦 Inventory: Medicine | Batch | Qty | Price | Expiry in table</li>
              <li>💰 Cost: Qty × Price = Total, Value at Risk</li>
              <li>📈 Forecast: Predicted demand + Days Cover + Action</li>
              <li>🏥 Exchange: Hospital | Stock Level | Distance</li>
            </ul>
          </div>
        </Card>

        {/* Chat - Simple, Attractive, Interactive */}
        <Card className="ai-chat-final">
          <div className="ai-chat-head">
            <div className="ai-head-icon"><Sparkles size={14} /></div>
            <div style={{ flex: 1 }}>
              <div className="ai-head-name">MedBridge AI</div>
              <div className="ai-head-status">
                {loading ? <span><Loader2 size={10} className="spin" /> Analyzing...</span> : <span><Shield size={10} /> Safe <Database size={10} /> Live Inventory</span>}
              </div>
            </div>
            {conversationId && <span className="conv-id">{conversationId.slice(0, 6)}</span>}
          </div>

          <div className="ai-messages">
            {messages.map((m) => (
              <div key={m.id} className={`ai-msg ${m.role}`}>
                <div className="ai-avatar">{m.role === "user" ? <User size={12} /> : <Bot size={12} />}</div>
                <div className={`ai-bubble ${m.role} ${m.isError ? "error" : ""}`}>
                  {m.role === "user" ? <div className="user-text">{m.text}</div> : <SystematicOutput text={m.text} />}
                  <div className="ai-meta">{m.timestamp?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  {m.role === "assistant" && m.text && (
                    <button className="copy-btn" onClick={() => handleCopy(m.id, m.text)}>
                      {copiedId === m.id ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-msg assistant">
                <div className="ai-avatar"><Bot size={12} /></div>
                <div className="ai-bubble assistant"><div className="typing"><span /><span /><span /></div></div>
              </div>
            )}
            {error && <div className="ai-error">{error}</div>}
            <div ref={endRef} />
          </div>

          <div className="ai-footer">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="ai-form">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask good question: which low stock, expiring, cost, hospital..." className="ai-input" disabled={loading} />
              <button type="submit" className="ai-send" disabled={loading || !input.trim()}>
                {loading ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
              </button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
