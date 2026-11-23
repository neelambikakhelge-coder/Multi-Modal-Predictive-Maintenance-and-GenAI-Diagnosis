from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import os
import sqlite3
from datetime import datetime

import joblib
import pandas as pd
import numpy as np
import tensorflow as tf
import shap

from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from groq import Groq
from rag import retriever



load_dotenv()

GROQ_API_KEYS = [
    os.environ.get("GROQ_API_KEY_1", "").strip(),
    os.environ.get("GROQ_API_KEY_2", "").strip(),
    os.environ.get("GROQ_API_KEY_3", "").strip(),
]

GROQ_API_KEYS = [
    key for key in GROQ_API_KEYS if key
]

def get_groq_response(messages):
    if not GROQ_API_KEYS:
        raise RuntimeError(
            "No GROQ API keys are configured."
        )

    last_error = None

    for index, api_key in enumerate(GROQ_API_KEYS, start=1):

        try:
            print(
                f"Trying Groq API key {index}..."
            )

            client = Groq(
                api_key=api_key
            )

            response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=messages,
    temperature=0.6,
    max_completion_tokens=512,
    include_reasoning=False,
    stream=False,
)

            print(
                f"Groq API key {index} succeeded."
            )

            return response

        except Exception as exc:

            last_error = exc

            print(
                f"Groq API key {index} failed: {exc}"
            )

            continue

    raise RuntimeError(
        "All configured Groq API keys failed."
    ) from last_error

# ============================================================
# FastAPI application
# ============================================================

app = FastAPI(
    title="Multi-Modal Predictive Maintenance API",
    description="ML-based industrial machine health prediction API",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# Configuration
# ============================================================

MODEL_DIR = "models"
DATABASE_FILE = "maintenance.db"
DATA_FILE = "train_processed.csv"


# ============================================================
# Load ML models
# ============================================================

print("Loading ML models...")

random_forest = joblib.load(
    os.path.join(MODEL_DIR, "random_forest.pkl")
)

isolation_forest = joblib.load(
    os.path.join(MODEL_DIR, "isolation_forest.pkl")
)

scaler = joblib.load(
    os.path.join(MODEL_DIR, "scaler.pkl")
)

sensor_columns = joblib.load(
    os.path.join(MODEL_DIR, "sensor_columns.pkl")
)

lstm_model = tf.keras.models.load_model(
    os.path.join(MODEL_DIR, "lstm_rul_model.keras")
)

lstm_scaler = joblib.load(
    os.path.join(MODEL_DIR, "lstm_scaler.pkl")
)


# ============================================================
# SHAP
# ============================================================

print("Creating SHAP explainer...")

shap_explainer = shap.TreeExplainer(
    random_forest
)

print("SHAP explainer ready.")
print("All ML models loaded successfully.")
print("Number of sensors:", len(sensor_columns))


# ============================================================
# SQLite database
# ============================================================

def init_database():

    connection = sqlite3.connect(
        DATABASE_FILE
    )

    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            machine TEXT NOT NULL,
            health TEXT NOT NULL,
            anomaly INTEGER NOT NULL,
            confidence REAL NOT NULL,
            rul REAL NOT NULL
        )
    """)

    connection.commit()
    connection.close()

    print("SQLite database initialized.")


init_database()


# ============================================================
# Save prediction
# ============================================================

def save_prediction(
    machine,
    health,
    anomaly,
    confidence,
    rul
):

    connection = sqlite3.connect(
        DATABASE_FILE
    )

    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO predictions
        (
            timestamp,
            machine,
            health,
            anomaly,
            confidence,
            rul
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            datetime.now().isoformat(
                timespec="seconds"
            ),
            machine,
            health,
            int(anomaly),
            float(confidence),
            float(rul)
        )
    )

    connection.commit()
    connection.close()


# ============================================================
# Request model
# ============================================================

class SensorInput(BaseModel):

    sensor_values: List[float]


# ============================================================
# Root
# ============================================================

@app.get("/")
def root():

    return {
        "message": "Multi-Modal Predictive Maintenance API",
        "status": "running"
    }


# ------------------------------------------------------------------
# /chat  (RAG + Groq LLM diagnostic assistant)
# ------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    engine_id: int | None = None
    cycle: int | None = None


@app.post("/chat")
def chat(payload: ChatRequest):
    # --------------------------------------------------------------
    # Live prediction context
    # --------------------------------------------------------------

    live_context = ""

    if (
        payload.engine_id is not None
        and payload.cycle is not None
    ):
        try:
            snapshot = replay_data(
                payload.engine_id,
                payload.cycle,
            )

            if "prediction" in snapshot:
                prediction = snapshot["prediction"]

                live_context = (
                    f"Live sensor snapshot for Engine "
                    f"{payload.engine_id} at cycle "
                    f"{payload.cycle}: "
                    f"predicted RUL = "
                    f"{prediction.get('predicted_rul')} cycles, "
                    f"health state = "
                    f"{prediction.get('health')}, "
                    f"anomaly detected = "
                    f"{prediction.get('anomaly')}, "
                    f"model confidence = "
                    f"{prediction.get('confidence')}.\n\n"
                )

        except Exception as exc:
            print(
                f"Could not load live prediction context: {exc}"
            )

    # --------------------------------------------------------------
    # Retrieve relevant maintenance-manual sections
    # --------------------------------------------------------------

    try:
        retrieved_chunks = retriever.retrieve(
            payload.message,
            k=5,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"RAG retrieval failed: {exc}",
        )

    manual_context = "\n\n".join(
        retrieved_chunks
    )

    # --------------------------------------------------------------
    # System prompt
    # --------------------------------------------------------------

    system_prompt = (
        "You are AURA, an industrial predictive-maintenance "
        "diagnostic assistant. "
        "Answer using ONLY the live sensor context and "
        "maintenance manual excerpts provided below. "
        "Be concise, specific, and give a clear recommended action. "
        "If the maintenance manual excerpts do not cover the question, "
        "say so honestly rather than guessing.\n\n"
        f"{live_context}"
        "Relevant maintenance manual excerpts:\n"
        f"{manual_context}"
    )

    # --------------------------------------------------------------
    # Groq LLM call with automatic 3-key fallback
    # --------------------------------------------------------------

    messages = [
        {
            "role": "system",
            "content": system_prompt,
        },
        {
            "role": "user",
            "content": payload.message,
        },
    ]

    try:
        completion = get_groq_response(messages)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"All Groq API keys failed: {exc}",
        )

    answer = completion.choices[0].message.content or ""

    # --------------------------------------------------------------
    # Normalize common mojibake artifacts for clean UI output
    # --------------------------------------------------------------

    answer = (
        answer
        .replace("â€”", "—")
        .replace("â€“", "–")
        .replace("â€˜", "‘")
        .replace("â€™", "’")
        .replace("â€œ", "“")
        .replace("â€�", "”")
        .replace("â¯", " ")
        .replace("â€", "")
    )

    return {
        "answer": answer,
        "sources": retrieved_chunks,
    }


# ============================================================
# Health check
# ============================================================

@app.get("/health")
def health_check():

    return {
        "status": "ok",
        "message": "Predictive Maintenance API is running"
    }


# ============================================================
# Health state
# ============================================================

@app.get("/health-state")
def health_state():

    df = pd.read_csv(
        DATA_FILE
    )

    latest_data = df[
        sensor_columns
    ].iloc[-1:].copy()

    # Random Forest
    latest_scaled = scaler.transform(
        latest_data
    )

    health_prediction = random_forest.predict(
        latest_scaled
    )[0]

    health = str(
        health_prediction
    )

    # Confidence
    probabilities = random_forest.predict_proba(
        latest_scaled
    )[0]

    confidence = float(
        max(probabilities)
    )

    # Isolation Forest
    anomaly_prediction = isolation_forest.predict(
        latest_scaled
    )[0]

    anomaly = bool(
        anomaly_prediction == -1
    )

    # LSTM
    recent_data = df[
        sensor_columns
    ].tail(30).copy()

    recent_scaled = lstm_scaler.transform(
        recent_data
    )

    lstm_input = np.expand_dims(
        recent_scaled,
        axis=0
    )

    rul_prediction = lstm_model.predict(
        lstm_input,
        verbose=0
    )[0][0]

    rul_prediction = float(
        np.clip(
            rul_prediction,
            0,
            125
        )
    )

    # Save
    save_prediction(
        machine="Engine-01",
        health=health,
        anomaly=anomaly,
        confidence=confidence,
        rul=rul_prediction
    )

    return {
        "machine": "Engine-01",
        "health": health,
        "anomaly": anomaly,
        "confidence": round(
            confidence,
            4
        ),
        "rul": round(
            rul_prediction,
            2
        )
    }


# ============================================================
# Manual prediction
# ============================================================

@app.post("/predict")
def predict(
    sensor_input: SensorInput
):

    expected_sensors = len(
        sensor_columns
    )

    received_sensors = len(
        sensor_input.sensor_values
    )

    if received_sensors != expected_sensors:

        return {
            "error": (
                f"Expected {expected_sensors} "
                f"sensor values but received "
                f"{received_sensors}"
            )
        }

    input_df = pd.DataFrame(
        [
            sensor_input.sensor_values
        ],
        columns=sensor_columns
    )

    input_scaled = scaler.transform(
        input_df
    )

    # Random Forest
    health_prediction = random_forest.predict(
        input_scaled
    )[0]

    health = str(
        health_prediction
    )

    # Confidence
    probabilities = random_forest.predict_proba(
        input_scaled
    )[0]

    confidence = float(
        max(probabilities)
    )

    # Isolation Forest
    anomaly_prediction = isolation_forest.predict(
        input_scaled
    )[0]

    anomaly = bool(
        anomaly_prediction == -1
    )

    # Save
    save_prediction(
        machine="API-Input",
        health=health,
        anomaly=anomaly,
        confidence=confidence,
        rul=0.0
    )

    return {
        "health": health,
        "anomaly": anomaly,
        "confidence": round(
            confidence,
            4
        )
    }


# ============================================================
# SHAP explanation
# ============================================================

@app.post("/explain")
def explain(sensor_input: SensorInput):

    # ============================================================
    # Validate number of sensors
    # ============================================================

    expected_sensors = len(sensor_columns)
    received_sensors = len(sensor_input.sensor_values)

    if received_sensors != expected_sensors:
        return {
            "error": (
                f"Expected {expected_sensors} sensor values "
                f"but received {received_sensors}"
            )
        }

    # ============================================================
    # Create DataFrame using the EXACT training feature order
    # ============================================================

    input_df = pd.DataFrame(
        [sensor_input.sensor_values],
        columns=sensor_columns
    )

    # ============================================================
    # Scale input
    # ============================================================

    input_scaled = scaler.transform(input_df)

    # ============================================================
    # SHAP explanation
    # ============================================================

    shap_values = shap_explainer(input_scaled)

    values = shap_values.values

    # SHAP can return:
    #   (samples, features)
    # or
    #   (samples, features, classes)
    #
    # For classification, select the relevant class if needed.

    if values.ndim == 3:
        # Use the class predicted by Random Forest
        predicted_class = random_forest.predict(input_scaled)[0]

        try:
            class_index = list(
                random_forest.classes_
            ).index(predicted_class)
        except ValueError:
            class_index = 0

        feature_values = values[0, :, class_index]

    elif values.ndim == 2:
        feature_values = values[0]

    else:
        feature_values = values.reshape(-1)

    # ============================================================
    # Make everything JSON serializable
    # ============================================================

    feature_values = [
        float(value)
        for value in feature_values
    ]

    sensor_values = [
        float(value)
        for value in sensor_input.sensor_values
    ]

    # ============================================================
    # Build feature explanations
    # ============================================================

    explanations = []

    for sensor, sensor_value, shap_value in zip(
        sensor_columns,
        sensor_values,
        feature_values
    ):
        explanations.append(
            {
                "feature": str(sensor),
                "sensor": str(sensor),
                "value": float(sensor_value),
                "shap_value": float(shap_value),
                "contribution": (
                    "positive"
                    if shap_value >= 0
                    else "negative"
                ),
            }
        )

    # Strongest contributors first
    explanations.sort(
        key=lambda item: abs(item["shap_value"]),
        reverse=True
    )

    # ============================================================
    # Current prediction
    # ============================================================

    prediction = random_forest.predict(input_scaled)[0]

    prediction = str(prediction)

    # ============================================================
    # Return JSON-safe response
    # ============================================================

    return {
        "prediction": prediction,

        "features": explanations,

        "positive_contributions": [
            item
            for item in explanations
            if item["shap_value"] > 0
        ],

        "negative_contributions": [
            item
            for item in explanations
            if item["shap_value"] < 0
        ],

        "sensor_values": sensor_values,

        "feature_names": [
            str(sensor)
            for sensor in sensor_columns
        ],
    }

# ============================================================
# Prediction history
# ============================================================

@app.get("/predictions")
def get_predictions():

    connection = sqlite3.connect(
        DATABASE_FILE
    )

    connection.row_factory = sqlite3.Row

    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT
            id,
            timestamp,
            machine,
            health,
            anomaly,
            confidence,
            rul
        FROM predictions
        ORDER BY id DESC
        LIMIT 50
        """
    )

    rows = cursor.fetchall()

    connection.close()

    predictions = []

    for row in rows:

        predictions.append({
            "id": row["id"],
            "timestamp": row["timestamp"],
            "machine": row["machine"],
            "health": row["health"],
            "anomaly": bool(
                row["anomaly"]
            ),
            "confidence": row["confidence"],
            "rul": row["rul"]
        })

    return {
        "count": len(predictions),
        "predictions": predictions
    }


# ============================================================
# Single historical replay + ML prediction
# ============================================================

@app.get("/replay/{engine_id}/{cycle}")
def replay_data(
    engine_id: int,
    cycle: int
):

    df = pd.read_csv(
        DATA_FILE
    )

    selected = df[
        (df["unit"] == engine_id)
        &
        (df["cycle"] == cycle)
    ]

    if selected.empty:

        return {
            "error": (
                f"Engine {engine_id}, "
                f"cycle {cycle} not found"
            )
        }

    row = selected.iloc[0]

    # Sensor values
    sensor_values = {}

    for sensor in sensor_columns:

        sensor_values[sensor] = float(
            row[sensor]
        )

    # Random Forest + Isolation Forest
    input_df = pd.DataFrame(
        [
            [
                row[sensor]
                for sensor in sensor_columns
            ]
        ],
        columns=sensor_columns
    )

    input_scaled = scaler.transform(
        input_df
    )

    health_prediction = random_forest.predict(
        input_scaled
    )[0]

    predicted_health = str(
        health_prediction
    )

    probabilities = random_forest.predict_proba(
        input_scaled
    )[0]

    confidence = float(
        max(probabilities)
    )

    anomaly_prediction = isolation_forest.predict(
        input_scaled
    )[0]

    anomaly = bool(
        anomaly_prediction == -1
    )

    # LSTM
    sequence_data = df[
        (df["unit"] == engine_id)
        &
        (df["cycle"] <= cycle)
    ].tail(30)

    predicted_rul = None

    if len(sequence_data) == 30:

        sequence_sensors = sequence_data[
            sensor_columns
        ].copy()

        sequence_scaled = lstm_scaler.transform(
            sequence_sensors
        )

        lstm_input = np.expand_dims(
            sequence_scaled,
            axis=0
        )

        predicted_rul = lstm_model.predict(
            lstm_input,
            verbose=0
        )[0][0]

        predicted_rul = float(
            np.clip(
                predicted_rul,
                0,
                125
            )
        )

    # Ground truth
    actual_rul = float(
        row["RUL"]
    )

    actual_health = str(
        row["health"]
    )

    # Save prediction
    save_prediction(
        machine=f"Engine-{engine_id}",
        health=predicted_health,
        anomaly=anomaly,
        confidence=confidence,
        rul=(
            predicted_rul
            if predicted_rul is not None
            else 0.0
        )
    )

    return {
        "engine": int(engine_id),
        "cycle": int(cycle),

        "sensor_values": sensor_values,

        "prediction": {
            "health": predicted_health,
            "anomaly": anomaly,
            "confidence": round(
                confidence,
                4
            ),
            "predicted_rul": (
                round(
                    predicted_rul,
                    2
                )
                if predicted_rul is not None
                else None
            )
        },

        "ground_truth": {
            "health": actual_health,
            "rul": actual_rul
        }
    }


# ============================================================
# Automatic engine replay
# ============================================================

@app.get("/replay-engine/{engine_id}")
def replay_engine(
    engine_id: int
):

    df = pd.read_csv(
        DATA_FILE
    )

    # Get all cycles for selected engine
    engine_data = df[
        df["unit"] == engine_id
    ].copy()

    if engine_data.empty:

        return {
            "error": f"Engine {engine_id} not found"
        }

    # Sort by cycle
    engine_data = engine_data.sort_values(
        "cycle"
    )

    # Return basic replay information
    return {
        "engine": int(engine_id),
        "total_cycles": int(
            len(engine_data)
        ),
        "first_cycle": int(
            engine_data["cycle"].min()
        ),
        "last_cycle": int(
            engine_data["cycle"].max()
        ),
        "message": (
            "Engine replay data is ready"
        )
    }