import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const API_URL = "http://127.0.0.1:8000";

function getAuthHeaders() {
  const token = localStorage.getItem("access_token");

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

const REPLAY_INTERVAL = 2200;
const CHART_SAMPLE_COUNT = 10;

export const SENSOR_COLUMNS = [
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

export const SENSOR_TABS = [
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

const EngineDataContext = createContext(null);

function sampleCycles(first, last, count) {
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return [first ?? 0];
  }
  const span = last - first;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push(Math.round(first + (span * i) / (count - 1)));
  }
  return Array.from(new Set(points));
}

export function EngineDataProvider({ children }) {
  const [engines, setEngines] = useState([]);
  const [selectedEngine, setSelectedEngine] = useState(null);
  const [datasetLabel, setDatasetLabel] = useState(
    "NASA C-MAPSS FD001 (default)",
  );
  const [cycleRange, setCycleRange] = useState({ first: 1, last: 1 });
  const [cycle, setCycle] = useState(1);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [shapData, setShapData] = useState(null);
  const [shapLoading, setShapLoading] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState("sensor_2");
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [datasetError, setDatasetError] = useState("");
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("aura-theme") || "dark",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const timerRef = useRef(null);
  const bootedEngineRef = useRef(null);
  const shapRequestIdRef = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("aura-theme", theme);
  }, [theme]);

  const normalizeEntry = useCallback(
    (result) => ({
      cycle: Number(result.cycle),
      predictedRul: result.prediction?.predicted_rul ?? null,
      actualRul: result.ground_truth?.rul ?? null,
      anomaly: Boolean(result.prediction?.anomaly),
      health: result.prediction?.health ?? "Unknown",
      confidence: Number(result.prediction?.confidence ?? 0),
      sensors: result.sensor_values ?? {},
    }),
    [],
  );

  const loadShapExplanation = useCallback(async (sensorValues) => {
    if (!sensorValues) return;

    // Tag this call so a slower, older request can't clobber a newer
    // one's result if the user switches engines quickly (this was the
    // cause of SHAP appearing "stuck" on a previous engine's values).
    const requestId = ++shapRequestIdRef.current;

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
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
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

      // A newer request has already started (or finished) — discard
      // this stale response instead of overwriting fresher data.
      if (requestId !== shapRequestIdRef.current) return;

      setShapData(result);
    } catch (err) {
      if (requestId !== shapRequestIdRef.current) return;
      console.error("SHAP error:", err);
      setShapData(null);
    } finally {
      if (requestId === shapRequestIdRef.current) {
        setShapLoading(false);
      }
    }
  }, []);

  const loadPrediction = useCallback(
    async (engineId, requestedCycle, { addHistory = true } = {}) => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/replay/${engineId}/${requestedCycle}`,
          {
            headers: getAuthHeaders(),
          },
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
    },
    [normalizeEntry, loadShapExplanation],
  );

  const preloadChart = useCallback(
    async (engineId, first, last) => {
      try {
        const cycles = sampleCycles(first, last, CHART_SAMPLE_COUNT);
        const results = await Promise.all(
          cycles.map(async (sampleCycle) => {
            const response = await fetch(
              `${API_URL}/replay/${engineId}/${sampleCycle}`,
              {
                headers: getAuthHeaders(),
              },
            );
            if (!response.ok) return null;
            const result = await response.json();
            return result.error ? null : normalizeEntry(result);
          }),
        );

        const entries = results
          .filter(Boolean)
          .sort((a, b) => a.cycle - b.cycle);

        if (entries.length) {
          setHistory(entries);
        }
      } catch (err) {
        console.warn("Chart preload failed:", err);
      }
    },
    [normalizeEntry],
  );

  const fetchEngineRange = useCallback(async (engineId) => {
    try {
      const response = await fetch(`${API_URL}/replay-engine/${engineId}`, {
        headers: getAuthHeaders(),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      const first = Number(result.first_cycle);
      const last = Number(result.last_cycle);
      setCycleRange({ first, last });
      return { first, last };
    } catch (err) {
      console.error("Failed to load engine range:", err);
      setError("Unable to load this engine's cycle range.");
      return null;
    }
  }, []);

  const bootEngine = useCallback(
    async (engineId) => {
      setPlaying(false);
      setHistory([]);
      setData(null);

      const range = await fetchEngineRange(engineId);
      if (!range) return;

      const result = await loadPrediction(engineId, range.first, {
        addHistory: true,
      });

      await preloadChart(engineId, range.first, range.last);

      if (result) {
        await loadShapExplanation(result.sensor_values);
      }
    },
    [fetchEngineRange, loadPrediction, preloadChart, loadShapExplanation],
  );

  const fetchEngines = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/engines`, {
        headers: getAuthHeaders(),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      const list = Array.isArray(result.engines) ? result.engines : [];
      setEngines(list);
      setDatasetLabel(result.dataset || "Active dataset");
      return list;
    } catch (err) {
      console.error("Failed to load engine list:", err);
      setError("Unable to load the list of engines from the backend.");
      return [];
    }
  }, []);

  // Initial boot: load the engine list, then pick a default engine.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const list = await fetchEngines();
      if (cancelled) return;
      const initialEngine = list.includes(1) ? 1 : list[0];
      if (initialEngine === undefined) return;
      setSelectedEngine(initialEngine);
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the selected engine changes, (re)load everything for it.
  useEffect(() => {
    if (selectedEngine == null) return;
    if (bootedEngineRef.current === selectedEngine) return;
    bootedEngineRef.current = selectedEngine;
    bootEngine(selectedEngine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEngine, datasetRevision]);

  // Autoplay stepping through cycles.
  useEffect(() => {
    if (!playing || selectedEngine == null) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (cycle >= cycleRange.last) {
      setPlaying(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      loadPrediction(selectedEngine, cycle + 1);
    }, REPLAY_INTERVAL);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, cycle, selectedEngine, cycleRange.last]);

  const selectEngine = useCallback((engineId) => {
    setSelectedEngine(engineId);
  }, []);

  const nextCycle = useCallback(() => {
    if (selectedEngine == null) return;
    if (cycle < cycleRange.last && !loading) {
      loadPrediction(selectedEngine, cycle + 1);
    }
  }, [selectedEngine, cycle, cycleRange.last, loading, loadPrediction]);

  const restartReplay = useCallback(() => {
    if (selectedEngine == null) return;
    setPlaying(false);
    setHistory([]);
    loadPrediction(selectedEngine, cycleRange.first);
  }, [selectedEngine, cycleRange.first, loadPrediction]);

  const uploadDataset = useCallback(
    async (file) => {
      setPlaying(false);
      setDatasetBusy(true);
      setDatasetError("");
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${API_URL}/upload-dataset`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.detail || "Upload failed.");
        }

        bootedEngineRef.current = null;
        const list = await fetchEngines();
        const first = list[0];
        if (first !== undefined) {
          setSelectedEngine(first);
        }
        setDatasetRevision((revision) => revision + 1);
        return { ok: true, result };
      } catch (err) {
        setDatasetError(err.message || "Upload failed.");
        return { ok: false, error: err.message };
      } finally {
        setDatasetBusy(false);
      }
    },
    [fetchEngines],
  );

  const resetDataset = useCallback(async () => {
    setPlaying(false);
    setDatasetBusy(true);
    setDatasetError("");
    try {
      const response = await fetch(`${API_URL}/reset-dataset`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result?.detail || "Reset failed.");

      bootedEngineRef.current = null;
      const list = await fetchEngines();
      const first = list.includes(1) ? 1 : list[0];
      if (first !== undefined) {
        setSelectedEngine(first);
      }
      setDatasetRevision((revision) => revision + 1);
      return { ok: true, result };
    } catch (err) {
      setDatasetError(err.message || "Reset failed.");
      return { ok: false, error: err.message };
    } finally {
      setDatasetBusy(false);
    }
  }, [fetchEngines]);

  const sampledHistory = useMemo(
    () => history.filter((item) => Number.isFinite(item.predictedRul)),
    [history],
  );

  // The LSTM needs 30 prior cycles of history before it can produce a RUL
  // estimate — the backend returns `predicted_rul: null` until then. That
  // must stay distinct from an actual 0 ("about to fail"), so we keep it
  // as null here rather than defaulting to 0.
  const rawPredictedRul = data?.prediction?.predicted_rul;
  const predictedRul =
    rawPredictedRul === null || rawPredictedRul === undefined
      ? null
      : Number(rawPredictedRul);
  const hasRul = predictedRul !== null;

  const actualRul = Number(data?.ground_truth?.rul ?? 0);
  const confidence = Number(data?.prediction?.confidence ?? 0);
  const anomaly = Boolean(data?.prediction?.anomaly);
  const health = data?.prediction?.health ?? "Loading";
  const engineName =
    selectedEngine != null
      ? `Engine-${String(selectedEngine).padStart(2, "0")}`
      : "—";
  const replayProgress =
    cycleRange.last > cycleRange.first
      ? ((cycle - cycleRange.first) / (cycleRange.last - cycleRange.first)) *
        100
      : 0;
  const anomalyCount = history.filter((item) => item.anomaly).length;

  const engineStatus = anomaly
    ? "Attention"
    : !hasRul
      ? "Warming Up"
      : predictedRul <= 15
        ? "Critical"
        : predictedRul <= 30
          ? "Warning"
          : "Healthy";

  const statusClass = engineStatus.toLowerCase();

  const aiMessage = anomaly
    ? `Anomaly detected at cycle ${cycle}. Isolation Forest indicates unusual machine behavior on ${engineName}.${
        hasRul
          ? ` Current predicted RUL is ${predictedRul.toFixed(1)} cycles.`
          : " RUL prediction needs more cycle history before it's available."
      }`
    : !hasRul
      ? `${engineName} doesn't have enough cycle history yet for an LSTM RUL estimate (it needs at least 30 prior cycles) — health and anomaly checks are already active from cycle 1.`
      : predictedRul <= 20
        ? `${engineName} is approaching the end of its predicted useful life. LSTM estimate is ${predictedRul.toFixed(1)} cycles.`
        : `${engineName} is currently operating normally. LSTM estimates approximately ${predictedRul.toFixed(1)} cycles of remaining useful life.`;

  const value = {
    engines,
    selectedEngine,
    selectEngine,
    datasetLabel,
    cycleRange,
    cycle,
    data,
    history,
    sampledHistory,
    shapData,
    shapLoading,
    selectedSensor,
    setSelectedSensor,
    loading,
    playing,
    setPlaying,
    error,
    datasetError,
    datasetBusy,
    theme,
    setTheme,
    settingsOpen,
    setSettingsOpen,
    nextCycle,
    restartReplay,
    uploadDataset,
    resetDataset,
    predictedRul,
    hasRul,
    actualRul,
    confidence,
    anomaly,
    health,
    engineName,
    replayProgress,
    anomalyCount,
    engineStatus,
    statusClass,
    aiMessage,
  };

  return (
    <EngineDataContext.Provider value={value}>
      {children}
    </EngineDataContext.Provider>
  );
}

export function useEngineData() {
  const ctx = useContext(EngineDataContext);
  if (!ctx) {
    throw new Error("useEngineData must be used within an EngineDataProvider");
  }
  return ctx;
}
