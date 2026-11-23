import pandas as pd
import os

# Dataset location
DATA_DIR = "C-MAPSS"

TRAIN_FILE = os.path.join(DATA_DIR, "train_FD001.txt")

# NASA C-MAPSS column names
columns = [
    "unit",
    "cycle",
    "setting_1",
    "setting_2",
    "setting_3",
]

# Add sensor_1 through sensor_21
columns += [f"sensor_{i}" for i in range(1, 22)]


# Load training data
df = pd.read_csv(
    TRAIN_FILE,
    sep=r"\s+",
    header=None,
    names=columns
)

print("Dataset loaded successfully!")
print("Shape:", df.shape)

print("\nColumns:")
print(df.columns.tolist())

print("\nFirst 5 rows:")
print(df.head())


# Calculate maximum cycle for every engine
max_cycles = df.groupby("unit")["cycle"].max()

# Calculate RUL
df["RUL"] = df.apply(
    lambda row: max_cycles[row["unit"]] - row["cycle"],
    axis=1
)

print("\nRUL calculated successfully!")

print("\nRUL statistics:")
print(df["RUL"].describe())


# Find sensors with zero variance
sensor_columns = [
    col for col in df.columns
    if col.startswith("sensor_")
]

sensor_variance = df[sensor_columns].var()

flat_sensors = sensor_variance[
    sensor_variance == 0
].index.tolist()

print("\nFlat sensors:")
print(flat_sensors)

print("\nNumber of flat sensors:", len(flat_sensors))


# Remove flat sensors
df = df.drop(columns=flat_sensors)

print("\nShape after removing flat sensors:", df.shape)


# Save processed data
df.to_csv(
    "train_processed.csv",
    index=False
)

print("\nSaved: train_processed.csv")