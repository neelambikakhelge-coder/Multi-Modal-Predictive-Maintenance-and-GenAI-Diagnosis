import { useEngineData } from "../context/EngineDataContext";
import ChatPanel from "../ChatPanel";

export default function GenAI() {
  const {
    health,
    anomaly,
    predictedRul,
    hasRul,
    aiMessage,
    cycle,
    selectedEngine,
  } = useEngineData();

  return (
    <>
      <section className="panel ai-panel">
        <div className="panel-head">
          <div>
            <h2>AURA GenAI Assistant</h2>
            <p>RAG-powered diagnostic assistant</p>
          </div>
          <span className="tag green">RAG Powered</span>
        </div>

        <div className="ai-summary">
          <div className="ai-orb">✦</div>
          <div>
            <strong>AURA Intelligence</strong>
            <span>RF + Isolation Forest + LSTM + RAG</span>
          </div>
        </div>

        <div className="ai-message">
          <span>✦</span>
          <p>{aiMessage}</p>
        </div>

        <div className="ai-mini-stats">
          <div>
            <span>Health</span>
            <strong>{health}</strong>
          </div>
          <div>
            <span>Anomaly (this cycle)</span>
            <strong>{anomaly ? "Detected" : "Normal"}</strong>
          </div>
          <div>
            <span>RUL</span>
            <strong>{hasRul ? predictedRul.toFixed(1) : "—"}</strong>
          </div>
        </div>

        <div className="ai-ready">
          <span>Cycle {cycle} analyzed</span>
          <b>● ML READY</b>
        </div>
      </section>

      <section className="chat-section">
        <ChatPanel engineId={selectedEngine} cycle={cycle} />
      </section>
    </>
  );
}
