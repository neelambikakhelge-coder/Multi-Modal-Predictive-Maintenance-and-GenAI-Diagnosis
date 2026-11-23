import { useState } from "react";
import { useEngineData } from "../context/EngineDataContext";
import { sensorDisplayName } from "../sensors";

export default function Dashboard() {
  const {
    health,
    anomaly,
    predictedRul,
    hasRul,
    anomalyCount,
    history,
    confidence,
    engineName,
    cycle,
    engineStatus,
    statusClass,
    selectedSensor,
    data,
  } = useEngineData();

  const [showAnomalyDetails, setShowAnomalyDetails] = useState(false);

  const anomalyCycles = history
    .filter((item) => item.anomaly)
    .slice()
    .reverse();

  return (
    <>
      <section className="kpis">
        <div className="kpi health">
          <div className="kpi-icon">✓</div>
          <div>
            <span>OVERALL HEALTH</span>
            <strong>{health}</strong>
            <small>
              {anomaly ? "Attention required" : "No active anomaly detected"}
            </small>
          </div>
        </div>

        <div className="kpi rul">
          <div className="kpi-icon">◷</div>
          <div>
            <span>PREDICTED RUL</span>
            <strong>
              {hasRul ? predictedRul.toFixed(1) : "—"} <em>cycles</em>
            </strong>
            <small>
              {hasRul
                ? "LSTM remaining useful life"
                : "Needs 30+ cycles of history"}
            </small>
          </div>
        </div>

        <div
          className={`kpi anomalies clickable ${showAnomalyDetails ? "open" : ""}`}
          role="button"
          tabIndex={0}
          aria-expanded={showAnomalyDetails}
          onClick={() => setShowAnomalyDetails((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setShowAnomalyDetails((current) => !current);
            }
          }}
        >
          <div className="kpi-icon">△</div>
          <div>
            <span>
              ANOMALIES (LOADED CYCLES)
              <i className={`kpi-caret ${showAnomalyDetails ? "up" : ""}`}>
                ▾
              </i>
            </span>
            <strong>{anomalyCount}</strong>
            <small>
              {anomalyCount === 0
                ? "No anomalies across loaded cycles"
                : `${anomalyCount} of ${history.length} loaded cycles flagged — current cycle: ${
                    anomaly ? "flagged" : "not flagged"
                  } — click for details`}
            </small>
          </div>
        </div>

        <div className="kpi confidence">
          <div className="kpi-icon">⌁</div>
          <div className="confidence-main">
            <span>MODEL CONFIDENCE</span>
            <strong>
              {(confidence * 100).toFixed(1)}
              <em>%</em>
            </strong>
            <small>Random Forest confidence</small>
            <div className="confidence-line">
              <i
                style={{
                  width: `${Math.max(0, Math.min(100, confidence * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="engine-card">
          <div className="engine-card-top">
            <span>ENGINE STATUS</span>
            <b className={`status-pill ${statusClass}`}>{engineStatus}</b>
          </div>
          <div className="engine-overview">
            <div className="engine-art">◉</div>
            <div>
              <strong>{engineName}</strong>
              <span>Cycle {cycle}</span>
            </div>
          </div>
          <div className="mini-status">
            <div>
              <span>Machine Health</span>
              <b>{health}</b>
            </div>
            <div>
              <span>Selected Sensor</span>
              <b title={selectedSensor}>{sensorDisplayName(selectedSensor)}</b>
            </div>
            <div>
              <span>Anomaly (this cycle)</span>
              <b>{anomaly ? "Detected" : "Normal"}</b>
            </div>
          </div>
        </div>
      </section>

      {showAnomalyDetails && (
        <section className="panel anomaly-detail-panel">
          <div className="panel-head">
            <div>
              <h2>Anomaly Details — {engineName}</h2>
              <p>Cycles flagged by Isolation Forest, from what's currently loaded</p>
            </div>
            <span className="tag">{anomalyCycles.length} flagged</span>
          </div>

          {anomalyCycles.length ? (
            <div className="table">
              <div className="table-row head">
                <span>Cycle</span>
                <span>Health</span>
                <span>Predicted RUL</span>
                <span>Actual RUL</span>
                <span>Confidence</span>
                <span>Status</span>
              </div>
              {anomalyCycles.map((item) => (
                <div className="table-row" key={item.cycle}>
                  <span>{item.cycle}</span>
                  <span>{item.health}</span>
                  <span>
                    {item.predictedRul == null
                      ? "—"
                      : item.predictedRul.toFixed(1)}
                  </span>
                  <span>
                    {item.actualRul == null ? "—" : item.actualRul.toFixed(1)}
                  </span>
                  <span>{(item.confidence * 100).toFixed(1)}%</span>
                  <span>
                    <b className="table-status warning">ANOMALY</b>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No anomalies in the cycles loaded for {engineName} yet — keep
              replaying or switch engines to see more.
            </div>
          )}
        </section>
      )}

      <section className="panel live-panel">
        <div className="panel-head">
          <div>
            <h2>Live Sensor Readings</h2>
            <p>17 monitored sensor channels — {engineName}</p>
          </div>
          <span className="tag">17 Sensors</span>
        </div>

        <div className="live-grid">
          {data &&
            Object.entries(data.sensor_values).map(([sensor, value]) => (
              <div key={sensor} className="live-card">
                <span title={sensor}>{sensorDisplayName(sensor)}</span>
                <small className="sensor-id">{sensor}</small>
                <strong>{Number(value).toFixed(3)}</strong>
              </div>
            ))}
        </div>
      </section>
    </>
  );
}
