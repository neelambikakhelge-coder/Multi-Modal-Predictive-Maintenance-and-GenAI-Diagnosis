import pandas as pd
import numpy as np
import joblib

from sklearn.preprocessing import StandardScaler


# --------------------------------------------------
# Configuration
# --------------------------------------------------

WINDOW_SIZE = 30

DATA_FILE = "train_processed.csv"


# --------------------------------------------------
# 1. Load processed training data
# --------------------------------------------------

df = pd.read_csv(DATA_FILE)

print("Dataset loaded.")
print("Shape:", df.shape)


# --------------------------------------------------
# 2. Get sensor columns
# --------------------------------------------------

sensor_columns = joblib.load(
    "models/sensor_columns.pkl"
)

print("\nSensors:")
print(sensor_columns)

print("Number of sensors:", len(sensor_columns))


# --------------------------------------------------
# 3. Prepare sensor data
# --------------------------------------------------

X = df[sensor_columns].values
y = df["RUL"].values


# --------------------------------------------------
# 4. Scale sensor data
# --------------------------------------------------

scaler = StandardScaler()

X_scaled = scaler.fit_transform(X)

joblib.dump(
    scaler,
    "models/lstm_scaler.pkl"
)

print("\nSensor scaling completed.")


# --------------------------------------------------
# 5. Create sliding-window sequences
# --------------------------------------------------

X_sequences = []
y_sequences = []

print("\nCreating sequences...")

for unit_id in df["unit"].unique():

    # Get one engine's complete history
    unit_data = df[df["unit"] == unit_id]

    unit_X = X_scaled[unit_data.index]
    unit_y = y[unit_data.index]

    # Create windows
    for i in range(len(unit_X) - WINDOW_SIZE + 1):

        X_sequences.append(
            unit_X[i:i + WINDOW_SIZE]
        )

        # RUL at the end of the window
        y_sequences.append(
            unit_y[i + WINDOW_SIZE - 1]
        )


# Convert to NumPy arrays
X_sequences = np.array(X_sequences)
y_sequences = np.array(y_sequences)


# --------------------------------------------------
# 6. Print results
# --------------------------------------------------

print("\n========== LSTM DATA ==========")

print("X shape:", X_sequences.shape)
print("y shape:", y_sequences.shape)

print("Window size:", WINDOW_SIZE)
print("Number of sequences:", len(X_sequences))

print("\nRUL range:")
print(
    y_sequences.min(),
    "to",
    y_sequences.max()
)


# --------------------------------------------------
# 7. Save sequences
# --------------------------------------------------

np.save(
    "X_lstm.npy",
    X_sequences
)

np.save(
    "y_lstm.npy",
    y_sequences
)

print("\nSaved:")
print("X_lstm.npy")
print("y_lstm.npy")

print("\nLSTM sequence preparation completed!")