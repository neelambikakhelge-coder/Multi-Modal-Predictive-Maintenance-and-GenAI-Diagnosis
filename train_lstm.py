import numpy as np
import tensorflow as tf

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint


# --------------------------------------------------
# 1. Configuration
# --------------------------------------------------

EPOCHS = 30
BATCH_SIZE = 64
VALIDATION_SPLIT = 0.2


# --------------------------------------------------
# 2. Load prepared sequences
# --------------------------------------------------

print("Loading LSTM training data...")

X = np.load("X_lstm.npy")
y = np.load("y_lstm.npy")

print("X shape:", X.shape)
print("y shape:", y.shape)


# --------------------------------------------------
# 3. Build LSTM model
# --------------------------------------------------

print("\nBuilding LSTM model...")

model = Sequential([
    LSTM(
        64,
        return_sequences=True,
        input_shape=(X.shape[1], X.shape[2])
    ),

    Dropout(0.2),

    LSTM(32),

    Dropout(0.2),

    Dense(16, activation="relu"),

    Dense(1)
])


# --------------------------------------------------
# 4. Compile
# --------------------------------------------------

model.compile(
    optimizer="adam",
    loss="mse",
    metrics=["mae"]
)


print("\nModel summary:")
model.summary()


# --------------------------------------------------
# 5. Callbacks
# --------------------------------------------------

early_stopping = EarlyStopping(
    monitor="val_loss",
    patience=5,
    restore_best_weights=True
)

checkpoint = ModelCheckpoint(
    "models/lstm_rul_model.keras",
    monitor="val_loss",
    save_best_only=True
)


# --------------------------------------------------
# 6. Train
# --------------------------------------------------

print("\nStarting LSTM training...")

history = model.fit(
    X,
    y,
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    validation_split=VALIDATION_SPLIT,
    callbacks=[
        early_stopping,
        checkpoint
    ],
    verbose=1
)


# --------------------------------------------------
# 7. Save final model
# --------------------------------------------------

model.save(
    "models/lstm_rul_model.keras"
)


# --------------------------------------------------
# 8. Training complete
# --------------------------------------------------

print("\n========================================")
print("LSTM TRAINING COMPLETE")
print("========================================")

print("Model saved:")
print("models/lstm_rul_model.keras")

print("\nEpochs completed:", len(history.history["loss"]))

print("\nFinal training loss:",
      history.history["loss"][-1])

print("Final validation loss:",
      history.history["val_loss"][-1])