import { useEngineData } from "../context/EngineDataContext";

export default function EngineSelector() {
  const { engines, selectedEngine, selectEngine, datasetLabel } =
    useEngineData();

  return (
    <div className="selector engine-selector" title={datasetLabel}>
      <span>ENGINE</span>
      <select
        value={selectedEngine ?? ""}
        onChange={(event) => selectEngine(Number(event.target.value))}
        aria-label="Select engine"
      >
        {engines.map((id) => (
          <option key={id} value={id}>
            Engine-{String(id).padStart(2, "0")}
          </option>
        ))}
      </select>
      <small className="engine-count">{engines.length} available</small>
    </div>
  );
}
