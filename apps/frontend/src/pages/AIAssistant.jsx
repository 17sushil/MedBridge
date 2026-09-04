import { useRef, useEffect, useState } from "react";
import { Sparkles, Send, Trash2, Bot, User, Loader2, Package, Clock, DollarSign, Truck, AlertTriangle, BarChart3 } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { useAIChat } from "../context/AIChatContext";
import "./AIAssistant.css";

const STAFF_QUESTIONS = [
  { icon: Package, text: "Low stock medicines?", color: "#DC2626" },
  { icon: Clock, text: "Expiring in 7 days?", color: "#D97706" },
  { icon: DollarSign, text: "Total inventory value?", color: "#0E8C82" },
  { icon: Truck, text: "Hospitals with Insulin?", color: "#2563EB" },
  { icon: BarChart3, text: "Shortage risk next month?", color: "#7C3AED" },
  { icon: AlertTriangle, text: "Critical medicines?", color: "#DC2626" },
];

function ChatMessage({ msg, onCopy, copied }) {
  if (msg.role === "user") {
    return (
      <div className="staff-msg user">
        <div className="staff-bubble user">{msg.text}</div>
        <div className="staff-avatar user"><User size={14} /></div>
      </div>
    );
  }

  const lines = msg.text.split("\n").filter(l => l.trim());
  return (
    <div className="staff-msg assistant">
      <div className="staff-avatar assistant"><Bot size={14} /></div>
      <div className="staff-bubble assistant">
        {lines.map((line, i) => {
          if (line.startsWith("**") && line.endsWith("**")) {
            return <div key={i} className="staff-header">{line.slice(2, -2)}</div>;
          }
          if (line.startsWith("- ") || line.startsWith("• ")) {
            return <div key={i} className="staff-line">• {line.slice(2)}</div>;
          }
          if (line.includes("|")) {
            const parts = line.split("|").map(p => p.trim()).filter(Boolean);
            if (parts.length >= 3) {
              return <div key={i} className="staff-table-row">{parts.map((p, pi) => <span key={pi}>{p}</span>)}</div>;
            }
          }
          return <div key={i} className="staff-text">{line}</div>;
        })}
        <div className="staff-meta">
          <span>{msg.timestamp?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <button onClick={() => onCopy(msg.id, msg.text)} className="staff-copy">{copied === msg.id ? "Copied" : "Copy"}</button>
        </div>
      </div>
    </div>
  );
}

export default function AIAssistant() {
  const { messages, input, setInput, loading, sendMessage, handleClear } = useAIChat();
  const [copiedId, setCopiedId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const handleCopy = async (id, text) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); } catch {}
  };

  return (
    <div className="staff-ai-page">
      <PageHeader title="AI Assistant" subtitle="Hospital staff - quick inventory help" actions={<Button variant="outline" size="sm" onClick={handleClear}><Trash2 size={14} /> Clear</Button>} />

      <div className="staff-ai-container">
        <Card className="staff-questions-card">
          <div className="staff-questions-header">
            <Sparkles size={16} color="#0E8C82" />
            <span>Ask for your hospital</span>
          </div>
          <div className="staff-questions-list">
            {STAFF_QUESTIONS.map((q, i) => (
              <button key={i} onClick={() => sendMessage(q.text)} disabled={loading} className="staff-question-btn">
                <div className="staff-q-icon" style={{ background: `${q.color}15`, color: q.color }}><q.icon size={16} /></div>
                <span>{q.text}</span>
              </button>
            ))}
          </div>
          <div className="staff-info">
            <div className="staff-info-title">What I show:</div>
            <div>• Exact stock, batch, expiry, price for your hospital only</div>
            <div>• Partner hospitals: High/Medium/Low only (privacy-safe)</div>
            <div>• Short answers, no long essays</div>
          </div>
        </Card>

        <Card className="staff-chat-card">
          <div className="staff-chat-header">
            <div className="staff-chat-icon"><Bot size={16} /></div>
            <div>
              <div className="staff-chat-name">MedBridge AI</div>
              <div className="staff-chat-sub">{loading ? "Checking inventory..." : "Ready • Live data"}</div>
            </div>
            {loading && <Loader2 size={14} className="spin" />}
          </div>

          <div className="staff-chat-messages">
            {messages.map((m) => <ChatMessage key={m.id} msg={m} onCopy={handleCopy} copied={copiedId} />)}
            {loading && <div className="staff-msg assistant"><div className="staff-avatar assistant"><Bot size={14} /></div><div className="staff-bubble assistant"><div className="typing"><span /><span /><span /></div></div></div>}
            <div ref={endRef} />
          </div>

          <div className="staff-chat-input-area">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="staff-input-form">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask: low stock, expiring, cost..." className="staff-input" disabled={loading} />
              <button type="submit" disabled={loading || !input.trim()} className="staff-send"><Send size={16} /></button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
