import { useEngineData } from "../context/EngineDataContext";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AccountRecovery from "./AccountRecovery";

export default function SettingsModal() {
  const [datasetMessage, setDatasetMessage] = useState("");
  const {
    theme,
    setTheme,
    setSettingsOpen,
    datasetLabel,
    uploadDataset,
    resetDataset,
    datasetBusy,
    datasetError,
    engines,
  } = useEngineData();

  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") setSettingsOpen(false);
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled):not([hidden]), a[href], select:not(:disabled), [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [setSettingsOpen]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setDatasetMessage("");
    const response = await uploadDataset(file);
    if (response.ok) setDatasetMessage(`Dataset activated: ${response.result.rows} rows across ${response.result.engines} engines.`);
  };

  return createPortal(
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
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aura-settings-title"
      >
        <div className="settings-modal-head">
          <div>
            <span className="settings-kicker">SYSTEM CONFIGURATION</span>
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
          <AccountRecovery />
          <div className="settings-item">
            <span>Theme</span>
            <strong>{theme === "dark" ? "Dark mode" : "Light mode"}</strong>
            <button
              type="button"
              className="settings-action"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
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

          <div className="settings-item dataset-item dataset-upload-item">
            <span>Active dataset</span>
            <strong>{datasetLabel}</strong>
            <small>{engines.length} engines available</small>
            <p className="dataset-hint">Uploading replaces the active dataset. Only engines contained in your file appear in the engine selector. Select an engine in the top bar to view its predictions.</p>

            <div className="dataset-actions">
              <label className="settings-action upload-btn">
                {datasetBusy ? "Working…" : "Upload dataset"}
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  disabled={datasetBusy}
                  hidden
                />
              </label>
              <button
                type="button"
                className="settings-action ghost"
                onClick={async () => {
                  setDatasetMessage("");
                  const response = await resetDataset();
                  if (response.ok) setDatasetMessage("Default dataset restored.");
                }}
                disabled={datasetBusy}
              >
                Reset to default
              </button>
            </div>

            {datasetError && <p className="dataset-error">{datasetError}</p>}
            {datasetMessage && <p role="status">{datasetMessage}</p>}

            <p className="dataset-hint">
              Accepts a NASA C-MAPSS-format file: either the raw
              whitespace-delimited file (unit, cycle, 3 settings, 21
              sensors — no header), or a CSV with those same columns. Other
              datasets must include this dashboard's trained sensor columns
              to produce valid predictions, since the ML models were not
              retrained on them.
            </p>
          </div>
        </div>
      </div>
    </div>, document.body
  );
}
