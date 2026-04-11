"use client";

import { useState } from "react";

const STARTER_QUESTIONS = [
  "What are the admission requirements?",
  "How do scholarships work at BYUH?",
  "What documents do international students need?",
];

export default function Chatbot() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const apiBase = (process.env.NEXT_PUBLIC_CHAT_API_BASE || "").replace(/\/$/, "");

  const postChatMessage = async (message) => {
    const endpoints = apiBase ? [`${apiBase}/chat`, "/api/chat"] : ["/api/chat"];
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Server error");
        }

        return data;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Unable to reach the chatbot API.");
  };

  const sendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage = { type: "user", text: trimmedInput };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const data = await postChatMessage(trimmedInput);

      const sources =
        Array.isArray(data.sources) && data.sources.length > 0
          ? `\n\nSources:\n${data.sources.join("\n")}`
          : "";
      const botMessage = { type: "bot", text: `${data.reply || ""}${sources}`.trim() };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const botMessage = {
        type: "bot",
        text: `Cannot connect to AI: ${error.message}`,
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setIsLoading(false);
    }

    setInput("");
  };

  return (
    <div className="chatbot-shell">
      <div className="chatbot-header">
        <div>
          <p className="chatbot-kicker">BYUH Admissions Chatbot</p>
          <h3>Ask about applying, scholarships, or requirements</h3>
        </div>
        <span className="status-pill">{isLoading ? "Thinking..." : "Ready"}</span>
      </div>

      <div className="starter-grid">
        {STARTER_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            className="starter-chip"
            onClick={() => setInput(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="chat-log">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No messages yet</p>
            <p>
              Try a question about admissions deadlines, tuition, scholarships,
              or international student requirements.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message-bubble ${msg.type}`}>
              <span className="message-label">
                {msg.type === "user" ? "You" : "Assistant"}
              </span>
              <p>{msg.text}</p>
            </div>
          ))
        )}
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
          placeholder="Ask a BYUH admissions question..."
          className="chat-input"
        />

        <button type="button" onClick={sendMessage} className="send-button">
          Send
        </button>
      </div>
    </div>
  );
}
