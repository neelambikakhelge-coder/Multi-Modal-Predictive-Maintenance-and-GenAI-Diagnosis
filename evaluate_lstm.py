import numpy as np
import pandas as pd
import joblib
import tensorflow as tf
import matplotlib.pyplot as plt

from sklearn.metrics import mean_squared_error


# --------------------------------------------------
# Configuration
# --------------------------------------------------

WINDOW_SIZE = 30

TEST_FILE = "C-MAPSS/test_FD001.txt"
RUL_FILE = "C-MAPSS/RUL_FD001.txt"

MODEL_FILE = "models/lstm_rul_model.keras"
SCALER_FILE = "models/lstm_scaler.pkl"
SENSOR_FILE = "models/sensor_columns.pkl"


# --------------------------------------------------
# 1. Load model, scaler and sensor list
# --------------------------------------------------

print("Loading LSTM model...")

model = tf.keras.models.load_model(MODEL_FILE)

scaler = joblib.load(SCALER_FILE)

sensor_columns = joblib.load(SENSOR_FILE)

print("Model loaded.")
print("Number of sensors:", len(sensor_columns))


# --------------------------------------------------
# 2. Load test data
# --------------------------------------------------

print("\nLoading test data...")

columns = [
    "unit",
    "cycle",
    "setting_1",
    "setting_2",
    "setting_3",
] + [f"sensor_{i}" for i in range(1, 22)]


test_df = pd.read_csv(
    TEST_FILE,
    sep=r"\s+",
    header=None,
    names=columns
)

print("Test shape:", test_df.shape)


# --------------------------------------------------
# 3. Load true RUL values
# --------------------------------------------------

true_rul = pd.read_csv(
    RUL_FILE,
    header=None,
    names=["RUL"]
)["RUL"].values

# Match the training RUL cap
true_rul = np.clip(true_rul, 0, 125)

print("True RUL values:", len(true_rul))


# --------------------------------------------------
# 4. Prepare test sensor data
# --------------------------------------------------

test_sensor_data = test_df[sensor_columns].copy()

test_sensor_data = test_sensor_data.replace(
    [np.inf, -np.inf],
    np.nan
)

test_sensor_data = test_sensor_data.fillna(
    test_sensor_data.median()
)


# --------------------------------------------------
# 5. IMPORTANT:
#    Use the SAME scaler from training
# --------------------------------------------------

test_scaled = scaler.transform(
    test_sensor_data
)

print("\nTest sensor scaling completed.")


# --------------------------------------------------
# 6. Create one sequence per test engine
# --------------------------------------------------

X_test = []

engine_ids = sorted(
    test_df["unit"].unique()
)

print("\nCreating test sequences...")

for unit_id in engine_ids:

    unit_indices = test_df.index[
        test_df["unit"] == unit_id
    ].tolist()

    unit_data = test_scaled[unit_indices]

    # We need the final 30 cycles because
    # RUL_FD001 gives the RUL at the end of
    # each test engine's observed history.

    if len(unit_data) >= WINDOW_SIZE:

        sequence = unit_data[-WINDOW_SIZE:]

    else:
        # Safety fallback for engines with
        # fewer than 30 cycles.
        padding = np.repeat(
            unit_data[0:1],
            WINDOW_SIZE - len(unit_data),
            axis=0
        )

        sequence = np.vstack(
            [padding, unit_data]
        )

    X_test.append(sequence)


X_test = np.array(X_test)

print("X_test shape:", X_test.shape)


# --------------------------------------------------
# 7. Predict RUL
# --------------------------------------------------

print("\nPredicting RUL...")

predicted_rul = model.predict(
    X_test,
    verbose=0
).flatten()


# Keep predictions in valid range
predicted_rul = np.clip(
    predicted_rul,
    0,
    125
)


# --------------------------------------------------
# 8. Calculate RMSE
# --------------------------------------------------

rmse = np.sqrt(
    mean_squared_error(
        true_rul,
        predicted_rul
    )
)


mae = np.mean(
    np.abs(
        true_rul - predicted_rul
    )
)


print("\n========================================")
print("LSTM EVALUATION RESULTS")
print("========================================")

print("Number of test engines:", len(true_rul))

print(
    "RMSE:",
    round(rmse, 4)
)

print(
    "MAE:",
    round(mae, 4)
)


# --------------------------------------------------
# 9. Show sample predictions
# --------------------------------------------------

results = pd.DataFrame({
    "Engine": engine_ids,
    "Actual_RUL": true_rul,
    "Predicted_RUL": predicted_rul
})

print("\nFirst 10 predictions:")
print(
    results.head(10).to_string(
        index=False
    )
)


# --------------------------------------------------
# 10. Save results
# --------------------------------------------------

results.to_csv(
    "lstm_predictions.csv",
    index=False
)

print("\nSaved: lstm_predictions.csv")


# --------------------------------------------------
# 11. Predicted vs Actual plot
# --------------------------------------------------

plt.figure(figsize=(12, 6))

plt.plot(
    true_rul,
    label="Actual RUL",
    marker="o",
    markersize=3
)

plt.plot(
    predicted_rul,
    label="Predicted RUL",
    marker="x",
    markersize=3
)

plt.xlabel("Test Engine")
plt.ylabel("Remaining Useful Life")

plt.title(
    f"LSTM RUL Prediction vs Actual\nRMSE = {rmse:.2f}"
)

plt.legend()
plt.grid(True)

plt.tight_layout()

plt.savefig(
    "lstm_predicted_vs_actual.png",
    dpi=150
)

plt.show()

print(
    "\nSaved: lstm_predicted_vs_actual.png"
)

print("\nLSTM evaluation completed successfully!")