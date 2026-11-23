import { useEngineData } from "../context/EngineDataContext";
import { sensorDisplayName } from "../sensors";

export default function Explainability() {
  const { shapData, shapLoading } = useEngineData();
  const shapFeatures = shapData?.features ?? shapData?.top_features ?? [];
  const topShap = shapFeatures.slice(0, 7);
  const narrative = shapData?.narrative ?? shapData?.explanation_text ?? "";

  const sensorLabel = (feature) =>
    feature.sensor_name ??
    shapData?.sensor_display_names?.[feature.sensor] ??
    sensorDisplayName(feature.sensor ?? feature.feature);

  return (
    <section className="panel shap-panel">
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
        <>
          <div className="shap-bars">
            {topShap.map((feature, index) => {
              const value = Number(feature.shap_value) || 0;
              const width = Math.min(100, (Math.abs(value) / 0.18) * 100);
              return (
                <div
                  className="shap-row"
                  key={`${feature.sensor ?? feature.feature}-${index}`}
                >
                  <span title={feature.sensor ?? feature.feature}>
                    {sensorLabel(feature)}
                  </span>
                  <div className="shap-track">
                    <i
                      className={value >= 0 ? "positive" : "negative"}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <b
                    className={value >= 0 ? "positive-text" : "negative-text"}
                  >
                    {value >= 0 ? "+" : ""}
                    {value.toFixed(3)}
                  </b>
                </div>
              );
            })}
          </div>

          {narrative ? (
            <p className="shap-narrative">{narrative}</p>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          SHAP explanation is not available for this cycle.
        </div>
      )}
    </section>
  );
}
