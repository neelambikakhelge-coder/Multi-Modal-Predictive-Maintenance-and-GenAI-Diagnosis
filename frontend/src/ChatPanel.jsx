import { useEffect, useRef, useState } from "react";
import "./chat-panel.css";

const API_URL = "http://127.0.0.1:8000";

function formatSource(source = "") {
  const firstLine =
    source
      .split("\n")
      .find((line) => line.trim())
      ?.trim() || "Maintenance manual";
  return firstLine.length > 64 ? `${firstLine.slice(0, 64)}…` : firstLine;
}

export default function ChatPanel({ engineId, cycle }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello — I’m the AURA diagnostic assistant. Ask me about engine health, anomalies, sensor behavior, or recommended maintenance actions.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((previous) => [...previous, { role: "user", content: text }]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify({
          message: text,
          engine_id: engineId,
          cycle,
        }),
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error("The diagnostic server returned an invalid response.");
      }

      if (!response.ok) {
        const detail =
          typeof result?.detail === "string"
            ? result.detail
            : "Chat request failed.";
        throw new Error(detail);
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            result?.answer ||
            "The diagnostic assistant returned an empty response.",
          sources: Array.isArray(result?.sources) ? result.sources : [],
        },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setError(
        err?.message || "Unable to reach the AURA diagnostic assistant.",
      );
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <section className="aura-chat">
      <header className="aura-chat-header">
        <div className="aura-chat-title">
          <div className="aura-chat-orb">✦</div>
          <div>
            <h2>AURA GenAI Assistant</h2>
            <p>RAG-powered diagnostic assistant</p>
          </div>
        </div>

        <div className="aura-chat-status">
          <span className="aura-chat-status-dot" />
          RAG Powered
        </div>
      </header>

      <div className="aura-chat-context">
        <span>ENGINE</span>
        <strong>Engine-{String(engineId).padStart(2, "0")}</strong>
        <span>·</span>
        <span>CYCLE</span>
        <strong>{cycle}</strong>
      </div>

      <div className="aura-chat-body" ref={bodyRef}>
        {messages.map((message, index) => {
          const isUser = message.role === "user";

          return (
            <div
              className={`aura-chat-message ${isUser ? "user" : "assistant"}`}
              key={`${message.role}-${index}`}
            >
              {!isUser && <div className="aura-chat-avatar">✦</div>}

              <div className="aura-chat-message-column">
                <div className="aura-chat-role">{isUser ? "YOU" : "AURA"}</div>

                <div className="aura-chat-bubble">
                  {message.content}

                  {!isUser &&
                    Array.isArray(message.sources) &&
                    message.sources.length > 0 && (
                      <details className="aura-chat-sources">
                        <summary>
                          <span>Manual sources</span>
                          <b>{message.sources.length}</b>
                        </summary>

                        <div className="aura-chat-source-list">
                          {message.sources.map((source, sourceIndex) => (
                            <div
                              className="aura-chat-source"
                              key={`${sourceIndex}-${source.slice(0, 18)}`}
                            >
                              <span className="aura-chat-source-index">
                                {String(sourceIndex + 1).padStart(2, "0")}
                              </span>
                              <span>{formatSource(source)}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="aura-chat-message assistant">
            <div className="aura-chat-avatar">✦</div>
            <div className="aura-chat-message-column">
              <div className="aura-chat-role">AURA</div>
              <div className="aura-chat-bubble aura-chat-typing">
                <span />
                <span />
                <span />
                <em>Analyzing live engine data and manual context…</em>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="aura-chat-error">
          <span>!</span>
          <div>
            <strong>Assistant unavailable</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      <div className="aura-chat-input-wrap">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about engine health, anomalies, or maintenance..."
          disabled={loading}
          aria-label="Ask AURA diagnostic assistant"
        />

        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          title="Send message"
        >
          ➜
        </button>
      </div>

      <footer className="aura-chat-footer">
        <span>Live context enabled</span>
        <span>Groq · FAISS · TF-IDF</span>
      </footer>
    </section>
  );
}
