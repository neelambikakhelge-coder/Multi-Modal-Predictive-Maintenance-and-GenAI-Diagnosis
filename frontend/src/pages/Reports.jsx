import { useEngineData } from "../context/EngineDataContext";

export default function Reports() {
  const { history, engineName, anomalyCount } = useEngineData();
  const recent = [...history].reverse().slice(0, 6);

  return (
    <section className="bottom-grid">
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
  );
}
