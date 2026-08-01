import { useState, useRef, useEffect, useMemo } from "react";
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
  Zap,
  Database,
  Shield,
} from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { aiService } from "../services/aiService";
import "./AIAssistant.css";

const SAMPLE_PROMPTS = [
  "What does Paracetamol do?",
  "Show medicines expiring this month",
  "Do we have Insulin available?",
  "What are side effects of Ibuprofen?",
  "Which hospital has Ceftriaxone?",
  "Explain hypertension",
  "Show my exchange requests",
  "What's running low in inventory?",
];

function MarkdownText({ text }) {
  // Simple markdown rendering without extra dependency
  // Supports **bold**, *italic, lists, code blocks, headings
  const renderInline = (str) => {
    // Escape html? For simplicity we keep raw but handle bold/italic
    let out = str;
    // **bold**
    out = out.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // *italic* or _italic_
    out = out.replace(/\*(.*?)\*/g, "<em>$1</em>");
    out = out.replace(/_(.*?)_/g, "<em>$1</em>");
    // `code`
    out = out.replace(/`(.*?)`/g, "<code style='background:var(--canvas);padding:2px 4px;border-radius:4px;font-size:0.85em'>$1</code>");
    return out;
  };

  const lines = text.split("\n");
  return (
    <div className="ai-md">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 8 }} />;
        if (trimmed.startsWith("### ")) {
          return <h4 key={i} className="ai-md-h4" dangerouslySetInnerHTML={{ __html: renderInline(trimmed.slice(4)) }} />;
        }
        if (trimmed.startsWith("## ")) {
          return <h3 key={i} className="ai-md-h3" dangerouslySetInnerHTML={{ __html: renderInline(trimmed.slice(3)) }} />;
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return <li key={i} className="ai-md-li" dangerouslySetInnerHTML={{ __html: renderInline(trimmed.slice(2)) }} />;
        }
        if (trimmed.startsWith("1. ")) {
          return <li key={i} className="ai-md-li ordered" dangerouslySetInnerHTML={{ __html: renderInline(trimmed.slice(3)) }} />;
        }
        return <p key={i} className="ai-md-p" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />;
      })}
    </div>
  );
}

function TypingIndicator() {
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
      text: "Hi, I'm **MedBridge AI** — your intelligent healthcare inventory assistant.\n\nI can help with:\n- **Medical info**: medicines, side effects, interactions, diseases, first aid\n- **Live inventory**: expiring meds, low stock, exchange requests, hospital search\n- **Conversation memory**: I remember previous messages, so you can ask follow-ups like \"Can I take it with Ibuprofen?\"\n\n**Safety:** I provide general information only, not diagnosis or prescriptions. Always consult a qualified professional for personal medical decisions.\n\nWhat would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [providerInfo, setProviderInfo] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState("");

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    aiService.getProviderInfo().then(setProviderInfo).catch(() => {});
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, streaming]);

  const send = async (text, options = {}) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;

    setError("");
    const userMsg = {
      id: `u_${Date.now()}`,
      role: "user",
      text: question,
      timestamp: new Date(),
    };

    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setStreaming(false);

    const shouldStream = options.stream !== false;

    if (shouldStream) {
      // Try streaming first
      setStreaming(true);
      let assistantId = `a_${Date.now()}`;
      let accumulated = "";

      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: "assistant",
          text: "",
          timestamp: new Date(),
          streaming: true,
        },
      ]);

      await aiService.askAssistantStream(
        question,
        conversationId,
        (chunk, full) => {
          accumulated = full;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, text: full, streaming: true } : msg
            )
          );
        },
        (full, convId) => {
          if (convId) setConversationId(convId);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, text: full, streaming: false, timestamp: new Date() } : msg
            )
          );
          setLoading(false);
          setStreaming(false);
        },
        (err) => {
          // Fallback to non-streaming on error
          console.warn("Streaming failed, fallback", err);
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
          fallbackNonStreaming(question);
        }
      );
    } else {
      fallbackNonStreaming(question);
    }
  };

  const fallbackNonStreaming = async (question) => {
    try {
      const res = await aiService.askAssistant(question, conversationId);
      if (res.conversationId) setConversationId(res.conversationId);

      if (!res.available) {
        setError(res.message);
        setMessages((m) => [
          ...m,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            text: res.message,
            timestamp: new Date(),
            isError: true,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            text: res.message,
            timestamp: new Date(),
            model: res.model,
            provider: res.provider,
            contextUsed: res.contextUsed,
          },
        ]);
      }
    } catch (err) {
      setError(err.message || "Failed to get response");
      setMessages((m) => [
        ...m,
        {
          id: `e_${Date.now()}`,
          role: "assistant",
          text: `Sorry, I encountered an error: ${err.message}. Please try again.`,
          isError: true,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleRegenerate = async (userMessageId) => {
    // Find the user message before the last assistant message
    const idx = messages.findIndex((m) => m.id === userMessageId);
    if (idx === -1) return;
    const userMsg = messages[idx];
    // Remove all after it
    setMessages((prev) => prev.slice(0, idx + 1));
    await send(userMsg.text, { stream: false });
  };

  const handleClear = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        text: "Conversation cleared. How can I help you today?",
        timestamp: new Date(),
      },
    ]);
    setConversationId(null);
    setError("");
  };

  const lastUserMessage = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === "user");
  }, [messages]);

  return (
    <div className="ai-page">
      <PageHeader
        title="AI Assistant"
        subtitle="MedBridge intelligent healthcare assistant with live inventory RAG & conversation memory"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {providerInfo && (
              <Badge tone="teal" style={{ fontSize: 11 }}>
                {providerInfo.provider} · {providerInfo.model}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 size={14} /> Clear
            </Button>
          </div>
        }
      />

      <div className="ai-layout">
        <Card className="ai-chat-card">
          <div className="ai-chat-head">
            <div className="ai-chat-head-icon">
              <Sparkles size={16} color="#8DD3CA" />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ai-chat-head-name">MedBridge AI</div>
              <div className="ai-chat-head-status">
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Loader2 size={12} className="spin" /> {streaming ? "Streaming..." : "Thinking..."}
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <Shield size={12} /> Safe & Responsible
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <Database size={12} /> Live Inventory RAG
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <Zap size={12} /> Memory Enabled
                    </span>
                  </span>
                )}
              </div>
            </div>
            {conversationId && (
              <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>ID: {conversationId.slice(0, 8)}…</span>
            )}
          </div>

          <div className="ai-chat-messages" ref={messagesContainerRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "ai-chat-row",
                  m.role === "user" ? "ai-chat-row-user" : "ai-chat-row-assistant"
                )}
              >
                <div className="ai-chat-avatar">
                  {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div
                  className={clsx(
                    "ai-chat-bubble",
                    m.role === "user" ? "ai-chat-bubble-user" : "ai-chat-bubble-assistant",
                    m.isError && "ai-chat-bubble-error"
                  )}
                >
                  {m.role === "assistant" && m.text === "" && m.streaming ? (
                    <TypingIndicator />
                  ) : (
                    <>
                      {m.role === "user" ? (
                        <div className="ai-chat-text">{m.text}</div>
                      ) : (
                        <MarkdownText text={m.text} />
                      )}
                      <div className="ai-chat-meta">
                        <span className="ai-chat-time">
                          {m.timestamp?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {m.model && (
                          <span className="ai-chat-model">
                            {m.provider} {m.model?.slice(0, 20)}
                          </span>
                        )}
                        {m.contextUsed && m.contextUsed.length > 0 && (
                          <span className="ai-chat-context">
                            <Database size={10} /> RAG: {m.contextUsed.join(", ")}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {m.role === "assistant" && !m.streaming && m.text && (
                    <div className="ai-chat-actions">
                      <button
                        className="ai-chat-action-btn"
                        onClick={() => handleCopy(m.id, m.text)}
                        title="Copy"
                      >
                        {copiedId === m.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      <button
                        className="ai-chat-action-btn"
                        onClick={() => handleRegenerate(messages[messages.findIndex((mm) => mm.id === m.id) - 1]?.id)}
                        title="Regenerate"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && !streaming && (
              <div className="ai-chat-row ai-chat-row-assistant">
                <div className="ai-chat-avatar">
                  <Bot size={14} />
                </div>
                <div className="ai-chat-bubble ai-chat-bubble-assistant">
                  <TypingIndicator />
                </div>
              </div>
            )}
            {error && (
              <div className="ai-error">
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-chat-footer">
            <div className="ai-chat-prompts">
              {SAMPLE_PROMPTS.map((p) => (
                <button key={p} onClick={() => send(p)} className="ai-chat-prompt-btn" disabled={loading}>
                  {p}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="ai-chat-form"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about medicines, expiry, low stock, or general health — e.g., 'What does Paracetamol do?'"
                className="ai-chat-input"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button type="submit" className="ai-chat-send-btn" disabled={loading || !input.trim()}>
                {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              </button>
            </form>
            <div style={{ fontSize: 10, color: "var(--ink-faint)", marginTop: 6, textAlign: "center" }}>
              MedBridge AI provides general information only, not diagnosis. Always consult a qualified healthcare professional. Conversations are remembered for context.
            </div>
          </div>
        </Card>

        <div className="ai-side">
          <Card className="ai-side-card">
            <h4 className="ai-side-title">Tested Scenarios</h4>
            <div className="ai-side-section">
              <div className="ai-side-subtitle">Medical Knowledge</div>
              <ul className="ai-side-list">
                <li>✓ What does Paracetamol do?</li>
                <li>✓ Side effects of Ibuprofen?</li>
                <li>✓ Can Paracetamol + Ibuprofen be taken together?</li>
                <li>✓ Explain hypertension / diabetes</li>
                <li>✓ What is an antibiotic?</li>
              </ul>
            </div>
            <div className="ai-side-section">
              <div className="ai-side-subtitle">Hospital System (RAG)</div>
              <ul className="ai-side-list">
                <li>✓ Show available medicines</li>
                <li>✓ Which medicines expire this month?</li>
                <li>✓ Show my exchange requests</li>
                <li>✓ Which hospital has Insulin?</li>
                <li>✓ What inventory is low?</li>
              </ul>
            </div>
            <div className="ai-side-section">
              <div className="ai-side-subtitle">Conversation</div>
              <ul className="ai-side-list">
                <li>✓ Follow-ups maintain context</li>
                <li>✓ "it" refers to previous medicine</li>
                <li>✓ Safety guidance always applied</li>
              </ul>
            </div>
          </Card>

          <Card className="ai-side-card">
            <h4 className="ai-side-title">How it Works</h4>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
              <p>
                <strong>1. Routing:</strong> Detects if question needs live inventory (keywords like "show", "have", "expir", "hospital")
              </p>
              <p>
                <strong>2. RAG:</strong> Queries DB (Medicine, ExchangeRequest, Hospital) and injects into LLM prompt
              </p>
              <p>
                <strong>3. Memory:</strong> Stores conversation in DB (or memory fallback) and injects last 20 messages
              </p>
              <p>
                <strong>4. Provider:</strong> Abstraction supports OpenAI, Gemini, Claude, Groq, DeepSeek, OpenRouter, Mock
              </p>
              <p>
                <strong>5. Safety:</strong> System prompt enforces no diagnosis, no prescription, disclaimer, emergency advice
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
