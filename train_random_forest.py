import pandas as pd
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


# --------------------------------------------------
# 1. Load processed dataset
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

X = df[sensor_columns]
y = df["health"]


print("\nNumber of sensor features:", len(sensor_columns))

print("\nHealth class distribution:")
print(y.value_counts())


# --------------------------------------------------
# 3. Train Random Forest
# --------------------------------------------------

print("\nTraining Random Forest...")

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=15,
    random_state=42,
    n_jobs=-1,
    class_weight="balanced"
)

model.fit(X, y)

print("Random Forest training completed.")


# --------------------------------------------------
# 4. Training predictions
# --------------------------------------------------

predictions = model.predict(X)

accuracy = accuracy_score(y, predictions)

print("\n========== RANDOM FOREST RESULTS ==========")
print("Training accuracy:", round(accuracy * 100, 2), "%")


print("\nClassification report:")

print(
    classification_report(
        y,
        predictions,
        target_names=[
            "Healthy",
            "Warning",
            "Critical"
        ]
    )
)


# --------------------------------------------------
# 5. Confusion matrix
# --------------------------------------------------

print("\nConfusion matrix:")

print(
    confusion_matrix(
        y,
        predictions
    )
)


# --------------------------------------------------
# 6. Save model
# --------------------------------------------------

joblib.dump(
    model,
    "models/random_forest.pkl"
)

print("\nSaved:")
print("models/random_forest.pkl")


# --------------------------------------------------
# 7. Save feature names
# --------------------------------------------------

joblib.dump(
    sensor_columns,
    "models/random_forest_features.pkl"
)

print("models/random_forest_features.pkl")

print("\nRandom Forest step completed successfully!")