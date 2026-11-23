from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import os
import io
import re
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
UPLOAD_DIR = "uploaded_datasets"

# Mutable app state so a dataset upload can swap the active data file
# at runtime without restarting the server.
STATE = {
    "data_file": DATA_FILE,
    "dataset_label": "NASA C-MAPSS FD001 (default)",
}


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
# Human-readable sensor names (NASA C-MAPSS sensor glossary)
# ============================================================

SENSOR_NAMES = {
    "sensor_1": "Fan Inlet Temperature (T2)",
    "sensor_2": "LPC Outlet Temperature (T24)",
    "sensor_3": "HPC Outlet Temperature (T30)",
    "sensor_4": "LPT Outlet Temperature (T50)",
    "sensor_5": "Fan Inlet Pressure (P2)",
    "sensor_6": "Bypass-Duct Pressure (P15)",
    "sensor_7": "HPC Outlet Pressure (P30)",
    "sensor_8": "Physical Fan Speed (Nf)",
    "sensor_9": "Physical Core Speed (Nc)",
    "sensor_10": "Engine Pressure Ratio (EPR)",
    "sensor_11": "HPC Outlet Static Pressure (Ps30)",
    "sensor_12": "Fuel Flow Ratio (phi)",
    "sensor_13": "Corrected Fan Speed (NRf)",
    "sensor_14": "Corrected Core Speed (NRc)",
    "sensor_15": "Bypass Ratio (BPR)",
    "sensor_16": "Burner Fuel-Air Ratio (farB)",
    "sensor_17": "Bleed Enthalpy (htBleed)",
    "sensor_18": "Demanded Fan Speed (Nf_dmd)",
    "sensor_19": "Demanded Corrected Fan Speed (PCNfR_dmd)",
    "sensor_20": "HPT Coolant Bleed (W31)",
    "sensor_21": "LPT Coolant Bleed (W32)",
}


def sensor_display_name(sensor_key: str) -> str:
    """Return a human-readable name for a raw sensor_N column key."""
    return SENSOR_NAMES.get(sensor_key, sensor_key.replace("_", " ").title())


def build_shap_narrative(prediction: str, explanations: list) -> str:
    """
    Turn a list of {feature, sensor, value, shap_value, contribution}
    dicts into a short plain-English paragraph, so the explanation
    isn't only a bar chart.
    """

    if not explanations:
        return "No sensor contributions were strong enough to explain this prediction."

    positives = [item for item in explanations if item["shap_value"] > 0]
    negatives = [item for item in explanations if item["shap_value"] < 0]

    positives = sorted(positives, key=lambda i: abs(i["shap_value"]), reverse=True)[:3]
    negatives = sorted(negatives, key=lambda i: abs(i["shap_value"]), reverse=True)[:3]

    def describe(item):
        name = sensor_display_name(item["sensor"])
        return f"{name} (reading: {item['value']:.2f})"

    sentences = []

    sentences.append(
        f"The model classified this engine's condition as '{prediction}'."
    )

    if positives:
        pushed_toward = ", ".join(describe(item) for item in positives)
        sentences.append(
            f"The strongest signals pushing the model toward this outcome were "
            f"{pushed_toward}."
        )

    if negatives:
        pushed_away = ", ".join(describe(item) for item in negatives)
        sentences.append(
            f"On the other hand, {pushed_away} worked against this classification, "
            f"pulling the prediction toward a different health category."
        )

    if positives:
        top = positives[0]
        sentences.append(
            f"Overall, {sensor_display_name(top['sensor'])} had the single biggest "
            f"influence on this specific prediction, contributing "
            f"{'an increase' if top['shap_value'] >= 0 else 'a decrease'} of "
            f"{abs(top['shap_value']):.3f} to the '{prediction}' score."
        )

    return " ".join(sentences)


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
    # Engine-wide anomaly scan, so range/list questions like
    # "which cycles show an anomaly between 1 and 10" can be
    # answered from real data instead of just the current cycle.
    # --------------------------------------------------------------

    if payload.engine_id is not None:
        try:
            df_full = pd.read_csv(STATE["data_file"])
            engine_df = df_full[
                df_full["unit"] == payload.engine_id
            ].sort_values("cycle")

            if not engine_df.empty:
                engine_scaled = scaler.transform(
                    engine_df[sensor_columns]
                )
                anomaly_flags = isolation_forest.predict(
                    engine_scaled
                )
                anomaly_cycles = engine_df.loc[
                    anomaly_flags == -1, "cycle"
                ].astype(int).tolist()

                cycle_min = int(engine_df["cycle"].min())
                cycle_max = int(engine_df["cycle"].max())

                if anomaly_cycles:
                    shown = anomaly_cycles[:40]
                    remaining = len(anomaly_cycles) - len(shown)
                    cycles_text = ", ".join(
                        str(item) for item in shown
                    )
                    if remaining > 0:
                        cycles_text += f", and {remaining} more"
                    live_context += (
                        f"Isolation Forest anomaly scan for Engine "
                        f"{payload.engine_id} across all recorded "
                        f"cycles ({cycle_min}-{cycle_max}): "
                        f"{len(anomaly_cycles)} cycle(s) flagged as "
                        f"anomalous -> {cycles_text}.\n\n"
                    )
                else:
                    live_context += (
                        f"Isolation Forest anomaly scan for Engine "
                        f"{payload.engine_id} across all recorded "
                        f"cycles ({cycle_min}-{cycle_max}): no cycles "
                        f"were flagged as anomalous.\n\n"
                    )

        except Exception as exc:
            print(
                f"Could not compute engine-wide anomaly scan: {exc}"
            )

    # --------------------------------------------------------------
    # Other-engine context: the assistant used to only ever know about
    # the currently selected engine. This adds:
    #   1) a fleet-wide health summary (so "how many engines are
    #      critical" or "which engines need attention" can be answered)
    #   2) a detailed snapshot for any OTHER engine number the user
    #      explicitly mentions in their message (so "what about engine
    #      37" works even though engine 37 isn't the one on screen)
    # --------------------------------------------------------------

    try:
        df_all = pd.read_csv(STATE["data_file"])

        # IMPORTANT: this is C-MAPSS "run to failure" training data, so
        # every engine's LAST recorded row is always Critical / RUL 0
        # by construction (that's simply where the recording stops).
        # Using the last row would make every single engine look
        # Critical all the time, which is meaningless. Instead we take
        # a shared "point in time" — the cycle currently being viewed
        # in the UI (falls back to 100 if none is selected yet) — and
        # for each engine use its row at that cycle, or its own last
        # cycle if it didn't run that long (i.e. it had already failed
        # by then).
        reference_cycle = payload.cycle if payload.cycle is not None else 100

        engine_max_cycle = df_all.groupby("unit")["cycle"].max()

        snapshot_cycle = engine_max_cycle.clip(upper=reference_cycle)

        lookup = df_all.set_index(["unit", "cycle"])

        latest_rows = (
            lookup.loc[
                list(
                    zip(
                        snapshot_cycle.index,
                        snapshot_cycle.values,
                    )
                )
            ]
            .reset_index()
            .sort_values("unit")
        )

        health_counts = latest_rows["health"].value_counts().to_dict()

        attention_rows = latest_rows[
            latest_rows["health"].isin(["Critical", "Warning"])
        ].sort_values("RUL")

        attention_lines = [
            f"Engine {int(r.unit)}: {r.health}, last recorded cycle "
            f"{int(r.cycle)}, RUL ~{float(r.RUL):.0f} cycles"
            for r in attention_rows.itertuples()
        ][:25]

        fleet_summary = (
            f"Fleet overview ({len(latest_rows)} engines total, at each "
            f"engine's most recently recorded cycle): "
            f"{health_counts.get('Healthy', 0)} Healthy, "
            f"{health_counts.get('Warning', 0)} Warning, "
            f"{health_counts.get('Critical', 0)} Critical." + chr(10)
        )

        if attention_lines:
            fleet_summary += (
                "Engines currently in Warning/Critical (sorted by "
                "lowest remaining life first):" + chr(10)
                + chr(10).join(attention_lines)
                + chr(10) + chr(10)
            )
        else:
            fleet_summary += (
                "No engines are currently flagged Warning or Critical."
                + chr(10) + chr(10)
            )

        live_context += fleet_summary

        # Detailed snapshot for any OTHER engine explicitly named in
        # the user's message (e.g. "what about engine 37?").
        mentioned_ids = {
            int(match)
            for match in re.findall(
                r"engine[\s_#-]*0*(\d+)", payload.message, flags=re.IGNORECASE
            )
        }
        mentioned_ids.discard(payload.engine_id)

        known_engine_ids = set(df_all["unit"].astype(int).tolist())

        for other_id in sorted(mentioned_ids)[:5]:
            if other_id not in known_engine_ids:
                continue
            try:
                other_reference_cycle = int(
                    min(
                        reference_cycle,
                        df_all.loc[df_all["unit"] == other_id, "cycle"].max(),
                    )
                )
                other_snapshot = replay_data(other_id, other_reference_cycle)

                if "prediction" in other_snapshot:
                    other_pred = other_snapshot["prediction"]
                    live_context += (
                        f"Live snapshot for Engine {other_id} at cycle "
                        f"{other_reference_cycle} (same point in time as "
                        f"the engine you're currently viewing): "
                        f"predicted RUL = {other_pred.get('predicted_rul')} "
                        f"cycles, health state = {other_pred.get('health')}, "
                        f"anomaly detected = {other_pred.get('anomaly')}, "
                        f"model confidence = {other_pred.get('confidence')}."
                        + chr(10) + chr(10)
                    )
            except Exception as exc:
                print(f"Could not load context for engine {other_id}: {exc}")

    except Exception as exc:
        print(f"Could not build fleet-wide chat context: {exc}")

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
def health_state(engine_id: Optional[int] = None):

    df = pd.read_csv(
        STATE["data_file"]
    )

    machine_label = "Engine-01"

    if engine_id is not None:

        engine_df = df[df["unit"] == engine_id]

        if engine_df.empty:
            return {"error": f"Engine {engine_id} not found"}

        df = engine_df.sort_values("cycle")
        machine_label = f"Engine-{engine_id:02d}"

    latest_data = df[
        sensor_columns
    ].iloc[-1:].copy()

    # Random Forest
    # NOTE: random_forest.pkl was trained on RAW (unscaled) sensor
    # readings, not the StandardScaler output — the scaler was only
    # ever fit for Isolation Forest / LSTM. Feeding it scaled values
    # pushed every input into the same tree leaves, which is why the
    # health prediction (and later, SHAP) looked identical for every
    # engine. Isolation Forest and LSTM still use the scaled version.
    latest_scaled = scaler.transform(
        latest_data
    )

    health_prediction = random_forest.predict(
        latest_data
    )[0]

    health = str(
        health_prediction
    )

    # Confidence
    probabilities = random_forest.predict_proba(
        latest_data
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
        machine=machine_label,
        health=health,
        anomaly=anomaly,
        confidence=confidence,
        rul=rul_prediction
    )

    return {
        "machine": machine_label,
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
    # (trained on raw sensor units — see note in /health-state)
    health_prediction = random_forest.predict(
        input_df
    )[0]

    health = str(
        health_prediction
    )

    # Confidence
    probabilities = random_forest.predict_proba(
        input_df
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

    # random_forest was trained on RAW sensor units, so it (and the
    # SHAP explainer wrapping it) must also be explained on raw input,
    # not the StandardScaler output used by Isolation Forest / LSTM.
    shap_values = shap_explainer(input_df)

    values = shap_values.values

    # SHAP can return:
    #   (samples, features)
    # or
    #   (samples, features, classes)
    #
    # For classification, select the relevant class if needed.

    if values.ndim == 3:
        # Use the class predicted by Random Forest
        predicted_class = random_forest.predict(input_df)[0]

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

    # ============================================================
    # Current prediction (computed first so the narrative can refer to it)
    # ============================================================

    prediction = random_forest.predict(input_df)[0]
    prediction = str(prediction)

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
                "sensor_name": sensor_display_name(str(sensor)),
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
    # Plain-English narrative (so the UI isn't limited to a bar chart)
    # ============================================================

    narrative = build_shap_narrative(prediction, explanations)

    # ============================================================
    # Return JSON-safe response
    # ============================================================

    return {
        "prediction": prediction,

        "narrative": narrative,
        "explanation_text": narrative,

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

        "sensor_display_names": {
            str(sensor): sensor_display_name(str(sensor))
            for sensor in sensor_columns
        },
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
        STATE["data_file"]
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
        input_df
    )[0]

    predicted_health = str(
        health_prediction
    )

    probabilities = random_forest.predict_proba(
        input_df
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
        STATE["data_file"]
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


# ============================================================
# Available engines for the active dataset
# ============================================================

@app.get("/engines")
def list_engines():

    df = pd.read_csv(
        STATE["data_file"]
    )

    engine_ids = sorted(
        int(unit) for unit in df["unit"].unique()
    )

    return {
        "dataset": STATE["dataset_label"],
        "count": len(engine_ids),
        "engines": engine_ids,
    }


# ============================================================
# Active dataset info
# ============================================================

@app.get("/dataset-info")
def dataset_info():

    df = pd.read_csv(
        STATE["data_file"]
    )

    return {
        "dataset": STATE["dataset_label"],
        "file": STATE["data_file"],
        "rows": int(len(df)),
        "engines": int(df["unit"].nunique()),
        "cycle_range": [
            int(df["cycle"].min()),
            int(df["cycle"].max()),
        ],
    }


# ============================================================
# Upload a new CMAPSS-format dataset
# ============================================================

REQUIRED_RAW_COLUMNS = (
    ["unit", "cycle", "setting_1", "setting_2", "setting_3"]
    + [f"sensor_{i}" for i in range(1, 22)]
)


def _label_health(rul_series):

    rul_capped = rul_series.clip(upper=125)

    def _bucket(rul):
        if rul > 50:
            return "Healthy"
        elif rul > 20:
            return "Warning"
        else:
            return "Critical"

    return rul_capped.apply(_bucket)


@app.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):

    raw_bytes = await file.read()

    try:
        text = raw_bytes.decode("utf-8", errors="ignore")
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file: {exc}",
        )

    stripped = text.strip()

    if not stripped:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    first_line = stripped.splitlines()[0]
    looks_headerless = bool(
        re.match(r"^[\s\d.\-]+$", first_line)
    )

    try:
        if looks_headerless:
            df = pd.read_csv(
                io.StringIO(text),
                sep=r"\s+",
                header=None,
            )

            if df.shape[1] < len(REQUIRED_RAW_COLUMNS):
                raise ValueError(
                    f"Expected at least {len(REQUIRED_RAW_COLUMNS)} "
                    "columns (unit, cycle, 3 settings, 21 sensors), "
                    f"got {df.shape[1]}"
                )

            df = df.iloc[:, : len(REQUIRED_RAW_COLUMNS)]
            df.columns = REQUIRED_RAW_COLUMNS
        else:
            df = pd.read_csv(io.StringIO(text))
            df.columns = [str(c).strip() for c in df.columns]
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not parse file as a CMAPSS-format dataset: "
                f"{exc}"
            ),
        )

    missing_required = [
        col
        for col in ["unit", "cycle"] + list(sensor_columns)
        if col not in df.columns
    ]

    if missing_required:
        raise HTTPException(
            status_code=400,
            detail=(
                "Uploaded dataset is missing columns the trained "
                f"models need: {missing_required}. This dashboard's "
                "models were trained on the NASA C-MAPSS sensor "
                "schema, so an upload must contain at least: unit, "
                f"cycle, and {list(sensor_columns)}."
            ),
        )

    if "RUL" not in df.columns:
        max_cycles = df.groupby("unit")["cycle"].max()
        df["RUL"] = df.apply(
            lambda row: max_cycles[row["unit"]] - row["cycle"],
            axis=1,
        )

    if "health" not in df.columns:
        df["health"] = _label_health(df["RUL"])

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_name = re.sub(
        r"[^A-Za-z0-9_.-]", "_", file.filename or "dataset"
    )
    saved_path = os.path.join(
        UPLOAD_DIR, f"{timestamp}_{safe_name}.csv"
    )

    df.to_csv(saved_path, index=False)

    STATE["data_file"] = saved_path
    STATE["dataset_label"] = file.filename or safe_name

    return {
        "message": "Dataset uploaded and activated",
        "dataset": STATE["dataset_label"],
        "rows": int(len(df)),
        "engines": int(df["unit"].nunique()),
        "cycle_range": [
            int(df["cycle"].min()),
            int(df["cycle"].max()),
        ],
    }


# ============================================================
# Revert to the original NASA C-MAPSS (FD001) dataset
# ============================================================

@app.post("/reset-dataset")
def reset_dataset():

    STATE["data_file"] = DATA_FILE
    STATE["dataset_label"] = "NASA C-MAPSS FD001 (default)"

    return {
        "message": "Reverted to default dataset",
        "dataset": STATE["dataset_label"],
    }
