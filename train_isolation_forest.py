import pandas as pd
import joblib

from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest


# --------------------------------------------------
# 1. Load processed data
# --------------------------------------------------

df = pd.read_csv("train_processed.csv")

print("Processed dataset loaded.")
print("Shape:", df.shape)


# --------------------------------------------------
# 2. Select sensor features
# --------------------------------------------------

sensor_columns = [
    column
    for column in df.columns
    if column.startswith("sensor_")
]

print("\nSensor features:")
print(sensor_columns)

print("\nNumber of sensors:", len(sensor_columns))


# --------------------------------------------------
# 3. Prepare sensor data
# --------------------------------------------------

X = df[sensor_columns].copy()

# Replace infinite values if any
X = X.replace([float("inf"), float("-inf")], float("nan"))

# Fill missing values using median
X = X.fillna(X.median())


# --------------------------------------------------
# 4. Scale sensor values
# --------------------------------------------------

scaler = StandardScaler()

X_scaled = scaler.fit_transform(X)

print("\nScaling completed.")
print("Scaled data shape:", X_scaled.shape)


# --------------------------------------------------
# 5. Train Isolation Forest
# --------------------------------------------------

print("\nTraining Isolation Forest...")

model = IsolationForest(
    n_estimators=200,
    contamination=0.05,
    random_state=42,
    n_jobs=-1
)

model.fit(X_scaled)

print("Isolation Forest training completed.")


# --------------------------------------------------
# 6. Predict anomalies
# --------------------------------------------------

predictions = model.predict(X_scaled)

normal_count = (predictions == 1).sum()
anomaly_count = (predictions == -1).sum()

print("\n========== ANOMALY RESULTS ==========")
print("Normal samples :", normal_count)
print("Anomaly samples:", anomaly_count)
print(
    "Anomaly percentage:",
    round(anomaly_count / len(predictions) * 100, 2),
    "%"
)


# --------------------------------------------------
# 7. Save model and scaler
# --------------------------------------------------

joblib.dump(
    model,
    "models/isolation_forest.pkl"
)

joblib.dump(
    scaler,
    "models/scaler.pkl"
)

joblib.dump(
    sensor_columns,
    "models/sensor_columns.pkl"
)

print("\nSaved files:")
print("models/isolation_forest.pkl")
print("models/scaler.pkl")
print("models/sensor_columns.pkl")

print("\nIsolation Forest step completed successfully!")