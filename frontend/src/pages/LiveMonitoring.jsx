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
import { useEngineData, SENSOR_TABS } from "../context/EngineDataContext";
import { sensorDisplayName } from "../sensors";

function rollingAverage(values, window) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / slice.length;
  });
}

export default function LiveMonitoring() {
  const { history, selectedSensor, setSelectedSensor, data, engineName } =
    useEngineData();

  const chartData = useMemo(() => {
    const points = history
      .map((item) => ({
        cycle: item.cycle,
        value: Number(item.sensors?.[selectedSensor]),
      }))
      .filter((point) => Number.isFinite(point.value));

    const values = points.map((point) => point.value);
    const averaged = rollingAverage(values, 3);

    return points.map((point, index) => ({
      ...point,
      trend: Number(averaged[index]?.toFixed(4)),
    }));
  }, [history, selectedSensor]);

  return (
    <section className="panel sensor-panel">
      <div className="panel-head">
        <div>
          <h2>Sensor Trends</h2>
          <p>Historical telemetry — {engineName}</p>
        </div>
        <div className="current-reading">
          <span title={selectedSensor}>{sensorDisplayName(selectedSensor)}</span>
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
            title={sensor}
            className={selectedSensor === sensor ? "active" : ""}
            onClick={() => setSelectedSensor(sensor)}
          >
            {sensorDisplayName(sensor)}
          </button>
        ))}
      </div>

      <div className="chart-large recharts-shell">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis dataKey="cycle" stroke="var(--muted)" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="var(--muted)"
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
            />
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
              dataKey="value"
              name="Raw value"
              stroke="var(--cyan)"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="trend"
              name="3-cycle trend"
              stroke="var(--purple)"
              dot={false}
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
