import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useEngineData } from "../context/EngineDataContext";

export default function Predictions() {
  const { sampledHistory, predictedRul, hasRul, engineName } =
    useEngineData();

  const chartData = useMemo(
    () =>
      sampledHistory.map((item) => ({
        cycle: item.cycle,
        predicted: item.predictedRul,
        actual: item.actualRul,
      })),
    [sampledHistory],
  );

  return (
    <section className="panel rul-panel">
      <div className="panel-head">
        <div>
          <h2>RUL Prediction</h2>
          <p>LSTM vs Ground Truth — {engineName}</p>
        </div>
        <div className="big-metric">
          {hasRul ? predictedRul.toFixed(1) : "—"} <small>cycles</small>
        </div>
      </div>

      {!hasRul && (
        <p className="rul-warmup-note">
          Not enough cycle history yet — the LSTM needs at least 30 prior
          cycles for this engine before it can estimate RUL. Health and
          anomaly checks are already active.
        </p>
      )}

      <div className="chart-large recharts-shell">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis dataKey="cycle" stroke="var(--muted)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                color: "var(--text)",
              }}
              labelFormatter={(value) => `Cycle ${value}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="actual"
              name="Ground Truth RUL"
              stroke="var(--soft)"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name="Predicted RUL"
              stroke="var(--cyan)"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
