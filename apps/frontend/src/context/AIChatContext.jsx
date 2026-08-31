import { createContext, useContext, useEffect, useState } from "react";
import { aiService } from "../services/aiService";
import { useAuth } from "./AuthContext";

const AIChatContext = createContext(null);

const WELCOME = {
  id: "welcome",
  role: "assistant",
  text: "Hi! I'm MedBridge AI - fast and simple.\n\nAsk me:\n- Which medicines are critically low?\n- Show expiring in 7 days\n- How much does Insulin cost?\n- Which hospital has Amoxicillin?\n\nI use live inventory, no useless questions.",
  timestamp: new Date(),
};

export function AIChatProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      setMessages([WELCOME]);
      setInput("");
      setLoading(false);
      setConversationId(null);
      setError("");
    }
  }, [isAuthenticated]);

  const sendMessage = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;

    setError("");
    const userMsg = { id: `u_${Date.now()}`, role: "user", text: question, timestamp: new Date() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const assistantId = `a_${Date.now()}`;
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "", timestamp: new Date(), streaming: true }]);

    try {
      // Try streaming first
      if (aiService.askAssistantStream) {
        let full = "";
        let gotChunk = false;
        await aiService.askAssistantStream(
          question,
          conversationId,
          (chunk, fullText) => {
            gotChunk = true;
            full = fullText;
            setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, text: fullText, streaming: true } : msg));
          },
          (finalText, convId) => {
            if (convId) setConversationId(convId);
            setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, text: finalText, streaming: false, timestamp: new Date() } : msg));
            setLoading(false);
          },
          () => {
            if (!gotChunk) {
              setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
              fallback(question);
            }
          }
        );
        // If streaming handled it, return
        if (gotChunk) return;
      }
    } catch {
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
    }

    // Fallback non-stream
    await fallback(question, assistantId);
  };

  const fallback = async (question, existingId = null) => {
    try {
      const res = await aiService.askAssistant(question, conversationId);
      if (res.conversationId) setConversationId(res.conversationId);
      const newMsg = {
        id: existingId || `a_${Date.now()}`,
        role: "assistant",
        text: res.message || "No response",
        timestamp: new Date(),
        isError: !res.available,
      };
      setMessages((m) => {
        const filtered = m.filter((msg) => !msg.streaming);
        // Replace if existingId exists, else add
        if (existingId && filtered.find((x) => x.id === existingId)) {
          return filtered.map((x) => x.id === existingId ? newMsg : x);
        }
        return [...filtered, newMsg];
      });
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

  const handleClear = () => {
    setMessages([{ id: "welcome", role: "assistant", text: "Cleared. Ask: which low stock, expiring, cost, hospital...", timestamp: new Date() }]);
    setConversationId(null);
    setError("");
  };

  return (
    <AIChatContext.Provider value={{ messages, input, setInput, loading, conversationId, error, sendMessage, handleClear }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) throw new Error("useAIChat must be used within AIChatProvider");
  return ctx;
}
