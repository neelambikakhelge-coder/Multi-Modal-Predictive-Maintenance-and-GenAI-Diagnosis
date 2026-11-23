import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import ChatPanel from "./ChatPanel";

const API_URL = "http://127.0.0.1:8000";
const ENGINE_ID = 1;
const FIRST_CYCLE = 30;
const LAST_CYCLE = 192;
const REPLAY_INTERVAL = 2200;

// Sampled cycles give the initial charts a real trend instead of a single point.
const CHART_CYCLES = [30, 48, 66, 84, 102, 120, 138, 156, 174, 192];

const SENSOR_COLUMNS = [
  "sensor_2",
  "sensor_3",
  "sensor_4",
  "sensor_5",
  "sensor_6",
  "sensor_7",
  "sensor_8",
  "sensor_9",
  "sensor_11",
  "sensor_12",
  "sensor_13",
  "sensor_14",
  "sensor_15",
  "sensor_16",
  "sensor_17",
  "sensor_20",
  "sensor_21",
];

const SENSOR_TABS = [
  "sensor_2",
  "sensor_3",
  "sensor_4",
  "sensor_7",
  "sensor_9",
  "sensor_11",
  "sensor_12",
  "sensor_14",
  "sensor_15",
  "sensor_17",
  "sensor_20",
  "sensor_21",
];

const icon = {
  dashboard: "⌂",
  monitor: "◫",
  prediction: "⌁",
  explain: "✦",
  replay: "▷",
  chat: "◌",
  reports: "▤",
  settings: "⚙",
};

function App() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [shapData, setShapData] = useState(null);
  const [shapLoading, setShapLoading] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState("sensor_2");
  const [cycle, setCycle] = useState(FIRST_CYCLE);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("aura-theme") || "dark",
  );
  const [activeSection, setActiveSection] = useState("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const timerRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("aura-theme", theme);
  }, [theme]);

  const normalizeEntry = (result) => ({
    cycle: Number(result.cycle),
    predictedRul: result.prediction?.predicted_rul ?? null,
    actualRul: result.ground_truth?.rul ?? null,
    anomaly: Boolean(result.prediction?.anomaly),
    health: result.prediction?.health ?? "Unknown",
    confidence: Number(result.prediction?.confidence ?? 0),
    sensors: result.sensor_values ?? {},
  });

  const loadShapExplanation = async (sensorValues) => {
    if (!sensorValues) return;

    try {
      setShapLoading(true);

      const sensorArray = SENSOR_COLUMNS.map((sensor) => {
        const value = sensorValues[sensor];
        if (value === undefined || value === null) {
          throw new Error(`Missing value for ${sensor}`);
        }
        return Number(value);
      });

      const response = await fetch(`${API_URL}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensor_values: sensorArray }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(
          result?.detail
            ? JSON.stringify(result.detail)
            : result?.error || "SHAP request failed",
        );
      }

      setShapData(result);
    } catch (err) {
      console.error("SHAP error:", err);
      setShapData(null);
    } finally {
      setShapLoading(false);
    }
  };

  const loadPrediction = async (requestedCycle, { addHistory = true } = {}) => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/replay/${ENGINE_ID}/${requestedCycle}`,
      );

      if (!response.ok) throw new Error("Backend request failed");

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      setData(result);
      setCycle(requestedCycle);

      if (addHistory) {
        const newEntry = normalizeEntry(result);
        setHistory((previous) => {
          const deduped = previous.filter(
            (item) => item.cycle !== requestedCycle,
          );
          return [...deduped, newEntry]
            .sort((a, b) => a.cycle - b.cycle)
            .slice(-40);
        });
      }

      loadShapExplanation(result.sensor_values);
      return result;
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the predictive maintenance backend.");
      setPlaying(false);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const preloadChart = async () => {
    try {
      const results = await Promise.all(
        CHART_CYCLES.map(async (sampleCycle) => {
          const response = await fetch(
            `${API_URL}/replay/${ENGINE_ID}/${sampleCycle}`,
          );
          if (!response.ok) return null;
          const result = await response.json();
          return result.error ? null : normalizeEntry(result);
        }),
      );

      const entries = results.filter(Boolean).sort((a, b) => a.cycle - b.cycle);

      if (entries.length) {
        setHistory(entries);
        const current = entries.find((item) => item.cycle === FIRST_CYCLE);
        if (current && !data) {
          setData({
            engine: ENGINE_ID,
            cycle: current.cycle,
            sensor_values: current.sensors,
            prediction: {
              health: current.health,
              anomaly: current.anomaly,
              confidence: current.confidence,
              predicted_rul: current.predictedRul,
            },
            ground_truth: { rul: current.actualRul, health: current.health },
          });
          loadShapExplanation(current.sensors);
        }
      }
    } catch (err) {
      console.warn("Chart preload failed:", err);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const result = await loadPrediction(FIRST_CYCLE, { addHistory: true });
      if (!cancelled) {
        await preloadChart();
        if (result) {
          await loadShapExplanation(result.sensor_values);
        }
      }
    };

    boot();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (cycle >= LAST_CYCLE) {
      setPlaying(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      loadPrediction(cycle + 1);
    }, REPLAY_INTERVAL);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, cycle]);

  const predictedRul = Number(data?.prediction?.predicted_rul ?? 0);
  const actualRul = Number(data?.ground_truth?.rul ?? 0);
  const confidence = Number(data?.prediction?.confidence ?? 0);
  const anomaly = Boolean(data?.prediction?.anomaly);
  const health = data?.prediction?.health ?? "Loading";
  const engineName = `Engine-${String(ENGINE_ID).padStart(2, "0")}`;
  const replayProgress =
    ((cycle - FIRST_CYCLE) / (LAST_CYCLE - FIRST_CYCLE)) * 100;

  const anomalyCount = history.filter((item) => item.anomaly).length;

  const sampledHistory = useMemo(
    () => history.filter((item) => Number.isFinite(item.predictedRul)),
    [history],
  );

  const createPath = (values, width, height, minValue, maxValue) => {
    if (!values.length) return "";

    const range = maxValue - minValue || 1;
    return values
      .map((value, index) => {
        const x =
          values.length === 1
            ? width / 2
            : (index / (values.length - 1)) * width;
        const y = height - ((value - minValue) / range) * height;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  };

  const rulPredictions = sampledHistory.map((item) => item.predictedRul);
  const rulActual = sampledHistory
    .map((item) => item.actualRul)
    .filter((value) => Number.isFinite(value));
  const rulMax = Math.max(130, ...rulPredictions, ...rulActual);
  const rulPredPath = createPath(rulPredictions, 680, 230, 0, rulMax);
  const rulActualPath = createPath(rulActual, 680, 230, 0, rulMax);

  const selectedSensorHistory = sampledHistory
    .map((item) => Number(item.sensors?.[selectedSensor]))
    .filter(Number.isFinite);
  const sensorMin = selectedSensorHistory.length
    ? Math.min(...selectedSensorHistory)
    : 0;
  const sensorMax = selectedSensorHistory.length
    ? Math.max(...selectedSensorHistory)
    : 100;
  const sensorPadding = (sensorMax - sensorMin || 1) * 0.12;
  const sensorPath = createPath(
    selectedSensorHistory,
    1080,
    260,
    sensorMin - sensorPadding,
    sensorMax + sensorPadding,
  );

  const shapFeatures = shapData?.features ?? shapData?.top_features ?? [];
  const topShap = shapFeatures.slice(0, 7);

  const engineStatus = anomaly
    ? "Attention"
    : predictedRul <= 15
      ? "Critical"
      : predictedRul <= 30
        ? "Warning"
        : "Healthy";

  const statusClass = engineStatus.toLowerCase();

  const aiMessage = anomaly
    ? `Anomaly detected at cycle ${cycle}. Isolation Forest indicates unusual machine behavior. Current predicted RUL is ${predictedRul.toFixed(1)} cycles.`
    : predictedRul <= 20
      ? `Engine ${ENGINE_ID} is approaching the end of its predicted useful life. LSTM estimate is ${predictedRul.toFixed(1)} cycles.`
      : `Engine ${ENGINE_ID} is currently operating normally. LSTM estimates approximately ${predictedRul.toFixed(1)} cycles of remaining useful life.`;

  const nextCycle = () => {
    if (cycle < LAST_CYCLE && !loading) {
      loadPrediction(cycle + 1);
    }
  };

  const recent = [...history].reverse().slice(0, 6);

  const navigateTo = (sectionId) => {
    if (sectionId === "settings") {
      setSettingsOpen(true);
      return;
    }

    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
    }
  };

  return (
    <div className={`aura-app ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-title">AURA</div>
            <div className="brand-subtitle">
              AI-POWERED PREDICTIVE MAINTENANCE
            </div>
          </div>
        </div>

        <div className="nav-heading">MONITORING</div>
        <nav className="nav">
          {[
            ["Dashboard", icon.dashboard, "dashboard"],
            ["Live Monitoring", icon.monitor, "live-monitoring"],
            ["Predictions", icon.prediction, "predictions"],
            ["Explainability", icon.explain, "explainability"],
            ["Replay & Simulation", icon.replay, "replay"],
            ["GenAI Assistant", icon.chat, "genai"],
            ["Reports", icon.reports, "reports"],
          ].map(([label, symbol, sectionId]) => (
            <button
              type="button"
              className={`nav-link ${activeSection === sectionId ? "active" : ""}`}
              key={label}
              onClick={() => navigateTo(sectionId)}
            >
              <span>{symbol}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="nav-heading system-heading">SYSTEM</div>
        <button
          type="button"
          className="nav-link"
          onClick={() => navigateTo("settings")}
        >
          <span>{icon.settings}</span>
          Settings
        </button>

        <div className="sidebar-status">
          <div className="online-row">
            <span className="online-dot" />
            System Online
          </div>
          <div>Backend: Connected</div>
          <div>RAG: Ready</div>
          <div>Models: Loaded</div>
        </div>
        <div className="sidebar-version">AURA v1.0 · ML CORE</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Engine Health Overview</h1>
            <p>Real-time monitoring and AI-driven predictive insights</p>
          </div>

          <div className="topbar-right">
            <div className="selector">
              <span>ENGINE</span>
              <strong>{engineName}</strong>
            </div>
            <div className="selector">
              <span>CYCLE</span>
              <strong>
                {cycle} / {LAST_CYCLE}
              </strong>
            </div>
            <div className="connected">
              <span className="online-dot" />
              BACKEND CONNECTED
            </div>
            <button
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <span>{theme === "dark" ? "☀" : "☾"}</span>
              <b>{theme === "dark" ? "Light" : "Dark"}</b>
            </button>
            <div className="user-badge">AU</div>
          </div>
        </header>

        <div className="content" id="dashboard">
          {error && <div className="error-banner">{error}</div>}

          <section className="kpis">
            <div className="kpi health">
              <div className="kpi-icon">✓</div>
              <div>
                <span>OVERALL HEALTH</span>
                <strong>{health}</strong>
                <small>
                  {anomaly
                    ? "Attention required"
                    : "No active anomaly detected"}
                </small>
              </div>
            </div>

            <div className="kpi rul">
              <div className="kpi-icon">◷</div>
              <div>
                <span>PREDICTED RUL</span>
                <strong>
                  {predictedRul.toFixed(1)} <em>cycles</em>
                </strong>
                <small>LSTM remaining useful life</small>
              </div>
            </div>

            <div className="kpi anomalies">
              <div className="kpi-icon">△</div>
              <div>
                <span>ANOMALIES IN VIEW</span>
                <strong>{anomalyCount}</strong>
                <small>
                  {anomalyCount === 0
                    ? "No anomalies across loaded cycles"
                    : `${anomalyCount} of ${history.length} loaded cycles flagged`}
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
                  <span>Vibration / Sensor</span>
                  <b>{selectedSensor}</b>
                </div>
                <div>
                  <span>Anomaly</span>
                  <b>{anomaly ? "Detected" : "Normal"}</b>
                </div>
              </div>
            </div>
          </section>

          <section className="replay-strip" id="replay">
            <div className="replay-info">
              <div className="replay-icon">◈</div>
              <div>
                <strong>{engineName}</strong>
                <span>NASA C-MAPSS FD001 historical replay</span>
              </div>
            </div>
            <div className="replay-track-wrap">
              <div className="replay-labels">
                <span>Replay Progress</span>
                <b>
                  Cycle {cycle} / {LAST_CYCLE}
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
                  disabled={loading || cycle >= LAST_CYCLE}
                >
                  ▶ Start
                </button>
              ) : (
                <button
                  className="warning-btn"
                  onClick={() => setPlaying(false)}
                >
                  ❚❚ Pause
                </button>
              )}
              <button
                className="ghost-btn"
                onClick={nextCycle}
                disabled={loading || cycle >= LAST_CYCLE}
              >
                Next →
              </button>
              <button
                className="square-btn"
                onClick={() => {
                  setPlaying(false);
                  setHistory([]);
                  loadPrediction(FIRST_CYCLE);
                }}
              >
                ↺
              </button>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="panel sensor-panel" id="live-monitoring">
              <div className="panel-head">
                <div>
                  <h2>Sensor Trends</h2>
                  <p>Historical telemetry — {engineName}</p>
                </div>
                <div className="current-reading">
                  <span>{selectedSensor}</span>
                  <strong>
                    {data?.sensor_values?.[selectedSensor] !== undefined
                      ? Number(data.sensor_values[selectedSensor]).toFixed(3)
                      : "--"}
                  </strong>
                </div>
              </div>

              <div className="sensor-tabs">
                {SENSOR_TABS.map((sensor) => (
                  <button
                    key={sensor}
                    className={selectedSensor === sensor ? "active" : ""}
                    onClick={() => setSelectedSensor(sensor)}
                  >
                    {sensor}
                  </button>
                ))}
              </div>

              <div className="chart-large">
                <svg viewBox="0 0 1080 260" preserveAspectRatio="none">
                  {[0, 65, 130, 195, 260].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="1080"
                      y2={y}
                      className="grid-line"
                    />
                  ))}
                  {sensorPath && (
                    <path d={sensorPath} className="sensor-path" fill="none" />
                  )}
                </svg>
              </div>
              <div className="chart-axis">
                <span>Cycle {sampledHistory[0]?.cycle ?? cycle}</span>
                <span>Cycle {cycle}</span>
              </div>
            </div>

            <div className="panel rul-panel" id="predictions">
              <div className="panel-head">
                <div>
                  <h2>RUL Prediction</h2>
                  <p>LSTM vs Ground Truth</p>
                </div>
                <div className="big-metric">
                  {predictedRul.toFixed(1)} <small>cycles</small>
                </div>
              </div>
              <div className="legend">
                <span>
                  <i className="dot cyan" /> Predicted RUL
                </span>
                <span>
                  <i className="dot gray" /> Ground Truth
                </span>
              </div>
              <div className="rul-chart">
                <svg viewBox="0 0 680 230" preserveAspectRatio="none">
                  {[0, 57.5, 115, 172.5, 230].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="680"
                      y2={y}
                      className="grid-line"
                    />
                  ))}
                  {rulActualPath && (
                    <path
                      d={rulActualPath}
                      className="actual-path"
                      fill="none"
                    />
                  )}
                  {rulPredPath && (
                    <path d={rulPredPath} className="rul-path" fill="none" />
                  )}
                </svg>
              </div>
              <div className="chart-axis">
                <span>Cycle {sampledHistory[0]?.cycle ?? cycle}</span>
                <span>Cycle {cycle}</span>
              </div>
            </div>

            <div className="panel shap-panel" id="explainability">
              <div className="panel-head">
                <div>
                  <h2>SHAP Feature Importance</h2>
                  <p>Top contributing sensors</p>
                </div>
                <span className="tag">RF + SHAP</span>
              </div>

              {shapLoading ? (
                <div className="empty-state">
                  Calculating feature contributions…
                </div>
              ) : topShap.length ? (
                <div className="shap-bars">
                  {topShap.map((feature, index) => {
                    const value = Number(feature.shap_value) || 0;
                    const width = Math.min(100, (Math.abs(value) / 0.18) * 100);
                    return (
                      <div
                        className="shap-row"
                        key={`${feature.sensor ?? feature.feature}-${index}`}
                      >
                        <span>{feature.sensor ?? feature.feature}</span>
                        <div className="shap-track">
                          <i
                            className={value >= 0 ? "positive" : "negative"}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <b
                          className={
                            value >= 0 ? "positive-text" : "negative-text"
                          }
                        >
                          {value >= 0 ? "+" : ""}
                          {value.toFixed(3)}
                        </b>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  SHAP explanation is not available for this cycle.
                </div>
              )}
            </div>

            <div className="panel live-panel">
              <div className="panel-head">
                <div>
                  <h2>Live Sensor Readings</h2>
                  <p>17 monitored sensor channels</p>
                </div>
                <span className="tag">17 Sensors</span>
              </div>

              <div className="live-grid">
                {data &&
                  Object.entries(data.sensor_values).map(([sensor, value]) => (
                    <button
                      key={sensor}
                      className="live-card"
                      onClick={() => setSelectedSensor(sensor)}
                    >
                      <span>{sensor}</span>
                      <strong>{Number(value).toFixed(3)}</strong>
                    </button>
                  ))}
              </div>
            </div>

            <div className="panel ai-panel">
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
                  <span>Anomaly</span>
                  <strong>{anomaly ? "Detected" : "Normal"}</strong>
                </div>
                <div>
                  <span>RUL</span>
                  <strong>{predictedRul.toFixed(1)}</strong>
                </div>
              </div>

              <div className="ai-ready">
                <span>Cycle {cycle} analyzed</span>
                <b>● ML READY</b>
              </div>
            </div>
          </section>

          <section className="bottom-grid" id="reports">
            <div className="panel recent-panel">
              <div className="panel-head">
                <div>
                  <h2>Recent Predictions</h2>
                  <p>Latest predictions from the ML pipeline</p>
                </div>
                <span className="tag">{history.length} samples</span>
              </div>

              <div className="table">
                <div className="table-row head">
                  <span>Cycle</span>
                  <span>Health</span>
                  <span>Anomaly</span>
                  <span>RUL</span>
                  <span>Confidence</span>
                  <span>Status</span>
                </div>
                {recent.map((item) => (
                  <div className="table-row" key={item.cycle}>
                    <span>{item.cycle}</span>
                    <span>{item.health}</span>
                    <span>{item.anomaly ? "Detected" : "Normal"}</span>
                    <span>
                      {item.predictedRul == null
                        ? "—"
                        : item.predictedRul.toFixed(1)}
                    </span>
                    <span>{(item.confidence * 100).toFixed(1)}%</span>
                    <span>
                      <b
                        className={`table-status ${item.anomaly ? "warning" : "healthy"}`}
                      >
                        {item.anomaly ? "Review" : "Healthy"}
                      </b>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel anomaly-panel">
              <div className="panel-head">
                <div>
                  <h2>Anomaly Events</h2>
                  <p>Events detected by Isolation Forest</p>
                </div>
                <span className="tag">{anomalyCount} events</span>
              </div>

              {anomalyCount ? (
                <div className="table">
                  {history
                    .filter((item) => item.anomaly)
                    .slice()
                    .reverse()
                    .slice(0, 5)
                    .map((item) => (
                      <div className="anomaly-row" key={item.cycle}>
                        <span className="event-id">
                          ANOM-{String(item.cycle).padStart(3, "0")}
                        </span>
                        <span>{engineName}</span>
                        <span>Cycle {item.cycle}</span>
                        <span>Isolation Forest</span>
                        <span>
                          <b className="table-status warning">ACTIVE</b>
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="no-anomaly">
                  <div>✓</div>
                  <strong>No anomalies detected in replayed cycles</strong>
                  <span>
                    All monitored prediction services are operating normally.
                  </span>
                </div>
              )}
            </div>
          </section>

          <section className="chat-section" id="genai">
            <ChatPanel engineId={ENGINE_ID} cycle={cycle} />
          </section>

          {settingsOpen && (
            <div
              className="settings-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setSettingsOpen(false);
                }
              }}
            >
              <div
                className="settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="aura-settings-title"
              >
                <div className="settings-modal-head">
                  <div>
                    <span className="settings-kicker">
                      SYSTEM CONFIGURATION
                    </span>
                    <h2 id="aura-settings-title">AURA Settings</h2>
                    <p>Dashboard preferences and system status</p>
                  </div>
                  <button
                    type="button"
                    className="settings-close"
                    onClick={() => setSettingsOpen(false)}
                    aria-label="Close settings"
                  >
                    ×
                  </button>
                </div>

                <div className="settings-grid">
                  <div className="settings-item">
                    <span>Theme</span>
                    <strong>
                      {theme === "dark" ? "Dark mode" : "Light mode"}
                    </strong>
                    <button
                      type="button"
                      className="settings-action"
                      onClick={() =>
                        setTheme((current) =>
                          current === "dark" ? "light" : "dark",
                        )
                      }
                    >
                      Switch theme
                    </button>
                  </div>

                  <div className="settings-item">
                    <span>Backend</span>
                    <strong>Connected</strong>
                    <small>FastAPI · 127.0.0.1:8000</small>
                  </div>

                  <div className="settings-item">
                    <span>Machine Learning</span>
                    <strong>Models loaded</strong>
                    <small>RF · Isolation Forest · LSTM · SHAP</small>
                  </div>

                  <div className="settings-item">
                    <span>GenAI / RAG</span>
                    <strong>Ready</strong>
                    <small>Groq · FAISS · TF-IDF</small>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
