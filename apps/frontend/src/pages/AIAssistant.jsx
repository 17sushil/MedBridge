import { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  Sparkles,
  Send,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Bot,
  User,
  AlertTriangle,
  Loader2,
  Database,
  Shield,
} from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { aiService } from "../services/aiService";
import "./AIAssistant.css";

const SAMPLE_PROMPTS = [
  "What does Paracetamol do?",
  "How much does Paracetamol cost?",
  "Show medicines expiring this month",
  "Do we have Insulin available?",
  "What are side effects of Ibuprofen?",
  "Which hospital has Ceftriaxone?",
];

function SimpleMarkdown({ text }) {
  if (!text) return null;
  // Very safe rendering: split by paragraphs, handle bold manually without dangerouslySetInnerHTML risks
  const parts = text.split("\n").map((line, idx) => {
    if (!line.trim()) return <div key={idx} style={{ height: 8 }} />;
    // Handle bold **text**
    const boldSplit = line.split(/(\*\*.*?\*\*)/g);
    return (
      <p key={idx} style={{ margin: "4px 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {boldSplit.map((chunk, j) => {
          if (chunk.startsWith("**") && chunk.endsWith("**")) {
            return <strong key={j}>{chunk.slice(2, -2)}</strong>;
          }
          // Handle `code`
          if (chunk.includes("`")) {
            const codeSplit = chunk.split(/(`.*?`)/g);
            return codeSplit.map((c, k) => {
              if (c.startsWith("`") && c.endsWith("`")) {
                return <code key={k} style={{ background: "var(--canvas)", padding: "2px 6px", borderRadius: 4, fontSize: "0.85em" }}>{c.slice(1, -1)}</code>;
              }
              return <span key={k}>{c}</span>;
            });
          }
          return <span key={j}>{chunk}</span>;
        })}
      </p>
    );
  });
  return <div>{parts}</div>;
}

function TypingDots() {
  return (
    <div className="ai-typing">
      <span className="ai-typing-dot" />
      <span className="ai-typing-dot" />
      <span className="ai-typing-dot" />
    </div>
  );
}

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi, I'm MedBridge AI — your intelligent healthcare inventory assistant.\n\nI can help with:\n- Medical info: medicines, side effects, interactions, diseases, first aid\n- Live inventory: expiring meds, low stock, costs, exchange requests, hospital search\n- Conversation memory: ask follow-ups like 'Can I take it with Ibuprofen?'\n- Costs: ask 'How much does Paracetamol cost?' for live pricing\n\nSafety: I provide general info only, not diagnosis or prescriptions.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [providerInfo, setProviderInfo] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState("");

  const endRef = useRef(null);

  useEffect(() => {
    try {
      if (aiService.getProviderInfo && typeof aiService.getProviderInfo === "function") {
        aiService.getProviderInfo().then(setProviderInfo).catch(() => setProviderInfo({ provider: "mock", model: "mock-llm" }));
      } else {
        setProviderInfo({ provider: "mock", model: "mock-llm" });
      }
    } catch {
      setProviderInfo({ provider: "mock", model: "mock-llm" });
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;

    setError("");
    const userMsg = { id: `u_${Date.now()}`, role: "user", text: question, timestamp: new Date() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    // Show streaming placeholder if stream method exists
    const canStream = aiService.askAssistantStream && typeof aiService.askAssistantStream === "function";
    const assistantId = `a_${Date.now()}`;
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "", timestamp: new Date(), streaming: canStream }]);

    let streamed = false;
    if (canStream) {
      try {
        await aiService.askAssistantStream(
          question,
          conversationId,
          (chunk, full) => {
            streamed = true;
            setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, text: full, streaming: true } : msg));
          },
          (full, convId) => {
            if (convId) setConversationId(convId);
            setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, text: full, streaming: false, timestamp: new Date() } : msg));
            setLoading(false);
          },
          () => {
            if (!streamed) {
              setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
              fallback(question);
            }
          }
        );
        return; // stream handled
      } catch {
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
        // fall through to fallback
      }
    } else {
      // No streaming support in old service, remove placeholder and fallback directly
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
    }

    await fallback(question);
  };

  const fallback = async (question) => {
    try {
      const res = await aiService.askAssistant(question, conversationId);
      if (res.conversationId) setConversationId(res.conversationId);
      setMessages((m) => m.filter((msg) => !msg.streaming).concat([
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: res.message || "No response",
          timestamp: new Date(),
          model: res.model,
          provider: res.provider,
          contextUsed: res.contextUsed,
          isError: !res.available,
        },
      ]));
      if (!res.available) setError(res.message);
    } catch (err) {
      setError(err.message || "Failed");
      setMessages((m) => m.filter((msg) => !msg.streaming).concat([
        { id: `e_${Date.now()}`, role: "assistant", text: `Error: ${err.message}`, isError: true, timestamp: new Date() },
      ]));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleClear = () => {
    setMessages([
      { id: "welcome", role: "assistant", text: "Conversation cleared. How can I help?", timestamp: new Date() },
    ]);
    setConversationId(null);
    setError("");
  };

  return (
    <div className="ai-page ai-page-full">
      <PageHeader
        title="AI Assistant"
        subtitle="MedBridge AI - Full screen, live inventory, pricing, medical knowledge"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {providerInfo && (
              <span style={{ fontSize: 11, background: "var(--teal-50)", color: "var(--teal-700)", padding: "4px 8px", borderRadius: 999, border: "1px solid var(--teal-100)" }}>
                {providerInfo.provider} · {providerInfo.model || "mock"}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 size={14} /> Clear
            </Button>
          </div>
        }
      />

      <Card className="ai-chat-card ai-chat-card-full">
        <div className="ai-chat-head">
          <div className="ai-chat-head-icon"><Sparkles size={16} color="#8DD3CA" /></div>
          <div style={{ flex: 1 }}>
            <div className="ai-chat-head-name">MedBridge AI</div>
            <div className="ai-chat-head-status">
              {loading ? (
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}><Loader2 size={12} className="spin" /> Thinking...</span>
              ) : (
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ display: "flex", gap: 3, alignItems: "center" }}><Shield size={12} /> Safe</span>
                  <span style={{ display: "flex", gap: 3, alignItems: "center" }}><Database size={12} /> Live RAG</span>
                </span>
              )}
            </div>
          </div>
          {conversationId && <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>{conversationId.slice(0, 8)}…</span>}
        </div>

        <div className="ai-chat-messages">
          {messages.map((m) => (
            <div key={m.id} className={clsx("ai-chat-row", m.role === "user" ? "ai-chat-row-user" : "ai-chat-row-assistant")}>
              <div className="ai-chat-avatar">{m.role === "user" ? <User size={14} /> : <Bot size={14} />}</div>
              <div className={clsx("ai-chat-bubble", m.role === "user" ? "ai-chat-bubble-user" : "ai-chat-bubble-assistant", m.isError && "ai-chat-bubble-error")}>
                {m.role === "assistant" && m.text === "" && m.streaming ? <TypingDots /> : (
                  <>
                    {m.role === "user" ? <div className="ai-chat-text">{m.text}</div> : <SimpleMarkdown text={m.text} />}
                    <div className="ai-chat-meta">
                      <span>{m.timestamp?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {m.model && <span>{m.provider} {m.model?.slice(0, 18)}</span>}
                      {m.contextUsed?.length > 0 && <span>RAG: {m.contextUsed.join(", ")}</span>}
                    </div>
                  </>
                )}
                {m.role === "assistant" && !m.streaming && m.text && (
                  <div className="ai-chat-actions">
                    <button className="ai-chat-action-btn" onClick={() => handleCopy(m.id, m.text)} title="Copy">
                      {copiedId === m.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <button className="ai-chat-action-btn" onClick={() => {
                      const idx = messages.findIndex(mm => mm.id === m.id);
                      const userMsg = idx > 0 ? messages[idx-1] : null;
                      if (userMsg) sendMessage(userMsg.text);
                    }} title="Regenerate">
                      <RotateCcw size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="ai-chat-row ai-chat-row-assistant"><div className="ai-chat-avatar"><Bot size={14} /></div><div className="ai-chat-bubble ai-chat-bubble-assistant"><TypingDots /></div></div>}
          {error && <div className="ai-error"><AlertTriangle size={14} /> {error}</div>}
          <div ref={endRef} />
        </div>

        <div className="ai-chat-footer">
          <div className="ai-chat-prompts">
            {SAMPLE_PROMPTS.map((p) => (
              <button key={p} onClick={() => sendMessage(p)} className="ai-chat-prompt-btn" disabled={loading}>{p}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="ai-chat-form">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about cost, expiry, medicines..." className="ai-chat-input" disabled={loading} />
            <button type="submit" className="ai-chat-send-btn" disabled={loading || !input.trim()}>
              {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
