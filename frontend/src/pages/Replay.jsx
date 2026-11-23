import { useEngineData } from "../context/EngineDataContext";

export default function Replay() {
  const {
    engineName,
    cycle,
    cycleRange,
    replayProgress,
    playing,
    setPlaying,
    loading,
    nextCycle,
    restartReplay,
    datasetLabel,
    health,
    anomaly,
    predictedRul,
    hasRul,
    confidence,
    engineStatus,
    statusClass,
  } = useEngineData();

  return (
    <>
      <section className="replay-strip">
        <div className="replay-info">
          <div className="replay-icon">◈</div>
          <div>
            <strong>{engineName}</strong>
            <span>{datasetLabel} historical replay</span>
          </div>
        </div>
        <div className="replay-track-wrap">
          <div className="replay-labels">
            <span>Replay Progress</span>
            <b>
              Cycle {cycle} / {cycleRange.last}
            </b>
          </div>
          <div className="replay-track">
            <i
              style={{
                width: `${Math.max(0, Math.min(100, replayProgress))}%`,
              }}
            />
          </div>
        </div>
        <div className="replay-buttons">
          {!playing ? (
            <button
              className="primary-btn"
              onClick={() => setPlaying(true)}
              disabled={loading || cycle >= cycleRange.last}
            >
              ▶ Start
            </button>
          ) : (
            <button className="warning-btn" onClick={() => setPlaying(false)}>
              ❚❚ Pause
            </button>
          )}
          <button
            className="ghost-btn"
            onClick={nextCycle}
            disabled={loading || cycle >= cycleRange.last}
          >
            Next →
          </button>
          <button className="square-btn" onClick={restartReplay}>
            ↺
          </button>
        </div>
      </section>

      <section className="panel replay-live-panel">
        <div className="panel-head">
          <div>
            <h2>{playing ? "Live Replay Feed" : "Current Cycle Snapshot"}</h2>
            <p>
              {engineName} · updates every cycle
              {playing ? " while replay is running" : ""}
            </p>
          </div>
          <b className={`status-pill ${statusClass}`}>{engineStatus}</b>
        </div>

        <div className="kpis replay-live-grid">
          <div className="kpi rul">
            <div className="kpi-icon">◷</div>
            <div>
              <span>CYCLE</span>
              <strong>
                {cycle} <em>/ {cycleRange.last}</em>
              </strong>
              <small>{loading ? "Loading next cycle…" : "Up to date"}</small>
            </div>
          </div>

          <div className="kpi health">
            <div className="kpi-icon">✓</div>
            <div>
              <span>HEALTH</span>
              <strong>{health}</strong>
              <small>Random Forest classification</small>
            </div>
          </div>

          <div className="kpi anomalies">
            <div className="kpi-icon">△</div>
            <div>
              <span>ANOMALY (THIS CYCLE)</span>
              <strong>{anomaly ? "Detected" : "Normal"}</strong>
              <small>Isolation Forest</small>
            </div>
          </div>

          <div className="kpi confidence">
            <div className="kpi-icon">⌁</div>
            <div className="confidence-main">
              <span>PREDICTED RUL</span>
              <strong>
                {hasRul ? predictedRul.toFixed(1) : "—"} <em>cycles</em>
              </strong>
              <small>
                {hasRul
                  ? `${(confidence * 100).toFixed(1)}% model confidence`
                  : "Needs 30+ cycles of history"}
              </small>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
