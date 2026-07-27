import { useState } from "react";
import clsx from "clsx";
import { Sparkles, Send } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import { aiService } from "../services/aiService";
import "./AIAssistant.css";

const SAMPLE_PROMPTS = [
  "Which medicines expire in the next 2 weeks?",
  "Suggest a hospital to request insulin from",
  "Summarize this month's exchange activity",
];

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi, I'm the MedBridge Assistant. Ask me about expiring medicines, demand forecasts (XGBoost), low stock, or which hospital to request supplies from.",
    },
  ]);
  const [input, setInput] = useState("");

  const send = async (text) => {
    const question = text ?? input;
    if (!question.trim()) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    const res = await aiService.askAssistant(question);
    setMessages((m) => [...m, { role: "assistant", text: res.message }]);
  };

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle="Ask questions about inventory, exchanges, and forecasts in plain language."
      />

      <Card className="ai-chat-card">
        <div className="ai-chat-head">
          <div className="ai-chat-head-icon">
            <Sparkles size={16} color="#8DD3CA" />
          </div>
          <div>
            <div className="ai-chat-head-name">MedBridge Assistant</div>
            <div className="ai-chat-head-status">Connected · inventory + XGBoost + exchange match</div>
          </div>
        </div>

        <div className="ai-chat-messages">
          {messages.map((m, i) => (
            <div
              key={i}
              className={clsx(
                "ai-chat-row",
                m.role === "user" ? "ai-chat-row-user" : "ai-chat-row-assistant"
              )}
            >
              <div
                className={clsx(
                  "ai-chat-bubble",
                  m.role === "user" ? "ai-chat-bubble-user" : "ai-chat-bubble-assistant"
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="ai-chat-footer">
          <div className="ai-chat-prompts">
            {SAMPLE_PROMPTS.map((p) => (
              <button key={p} onClick={() => send(p)} className="ai-chat-prompt-btn">
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
              placeholder="Ask about medicines, exchanges, or forecasts…"
              className="ai-chat-input"
            />
            <button type="submit" className="ai-chat-send-btn">
              <Send size={16} />
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
