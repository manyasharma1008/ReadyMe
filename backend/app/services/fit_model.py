"""
Fit Model - TensorFlow/Keras Model for Learning from User Fit Feedback

TensorFlow is optional. If it is not installed, the API will still run
but ML-based predictions will return default values.
"""

import os
import json
import numpy as np
from typing import Optional, TYPE_CHECKING, Any
from datetime import datetime

# -----------------------------
# TensorFlow imports (optional)
# -----------------------------
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers, models
    TENSORFLOW_AVAILABLE = True
except Exception:
    tf = None
    keras = None
    layers = None
    models = None
    TENSORFLOW_AVAILABLE = False


# -----------------------------
# Type handling (safe for runtime)
# -----------------------------
if TYPE_CHECKING:
    from tensorflow.keras import Model
    FitModel = Model
else:
    FitModel = Any 


# -----------------------------
# Model configuration
# -----------------------------
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "weights")
MODEL_PATH = os.path.join(MODEL_DIR, "fit_model.keras")
TRAINING_DATA_PATH = os.path.join(MODEL_DIR, "training_data.json")

# Category encoding
CATEGORY_ENCODING = {
    "shirts": 0,
    "pants": 1,
    "dresses": 2,
    "jackets": 3
}

CATEGORY_DECODING = {v: k for k, v in CATEGORY_ENCODING.items()}

# Fit score encoding: -1 = too tight, 0 = perfect, 1 = too loose
FIT_ENCODING = {
    "too_tight": 0.0,
    "tight": 0.25,
    "perfect": 0.5,
    "loose": 0.75,
    "too_loose": 1.0
}


def ensure_model_dir():
    """Ensure the model directory exists."""
    os.makedirs(MODEL_DIR, exist_ok=True)


def normalize_measurements(measurements: dict) -> np.ndarray:
    """
    Normalize body measurements to [0, 1] range based on typical ranges.
    """
    # Typical ranges for normalization
    ranges = {
        "height": (140, 220),
        "chest": (60, 150),
        "waist": (50, 140),
        "hips": (60, 150),
        "shoulder_width": (30, 70)
    }

    normalized = []
    for key in ["height", "chest", "waist", "hips", "shoulder_width"]:
        min_val, max_val = ranges[key]
        value = measurements.get(key, 0)
        normalized_value = (value - min_val) / (max_val - min_val)
        normalized.append(max(0, min(1, normalized_value)))

    return np.array(normalized)


def create_fit_model() -> Optional[FitModel]:
    """
    Create a neural network model for fit prediction.
    Input: 5 body measurements + 1 category encoding
    Output: Fit score (0-1 scale)
    """
    if not TENSORFLOW_AVAILABLE:
        return None

    model = models.Sequential([
        layers.Dense(64, activation='relu', input_shape=(6,)),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        layers.Dense(32, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.2),
        layers.Dense(16, activation='relu'),
        layers.Dense(1, activation='sigmoid')  # Output: 0-1 fit score
    ])

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='mse',
        metrics=['mae']
    )

    return model

def load_model() -> Optional[FitModel]:
    """Load the trained model from disk."""
    if not TENSORFLOW_AVAILABLE:
        return None

    ensure_model_dir()

    if os.path.exists(MODEL_PATH):
        try:
            return keras.models.load_model(MODEL_PATH)
        except Exception as e:
            print(f"Error loading model: {e}")
            return create_fit_model()

    return create_fit_model()


def save_model(model: FitModel) -> bool:
    """Save the trained model to disk."""
    if not TENSORFLOW_AVAILABLE:
        return False

    ensure_model_dir()
    try:
        model.save(MODEL_PATH)
        return True
    except Exception as e:
        print(f"Error saving model: {e}")
        return False


def load_training_data() -> list:
    """Load training data from disk."""
    ensure_model_dir()

    if os.path.exists(TRAINING_DATA_PATH):
        try:
            with open(TRAINING_DATA_PATH, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading training data: {e}")

    return []


def save_training_data(data: list) -> bool:
    """Save training data to disk."""
    ensure_model_dir()

    try:
        with open(TRAINING_DATA_PATH, 'w') as f:
            json.dump(data, f)
        return True
    except Exception as e:
        print(f"Error saving training data: {e}")
        return False


def add_feedback(
    measurements: dict,
    category: str,
    size: str,
    fit_rating: str
) -> bool:
    """
    Add user feedback to the training dataset.

    Args:
        measurements: Body measurements dict
        category: Garment category
        size: Size worn
        fit_rating: Fit rating (too_tight, tight, perfect, loose, too_loose)

    Returns:
        bool: Success status
    """
    if not TENSORFLOW_AVAILABLE:
        print("TensorFlow not available, feedback will not be used for model training")
        return False

    ensure_model_dir()

    # Load existing data
    data = load_training_data()

    # Add new feedback entry
    entry = {
        "timestamp": datetime.now().isoformat(),
        "measurements": measurements,
        "category": category,
        "size": size,
        "fit_rating": fit_rating,
        "fit_score": FIT_ENCODING.get(fit_rating, 0.5)
    }

    data.append(entry)
    return save_training_data(data)


def train_model(epochs: int = 50, batch_size: int = 16) -> dict:
    """
    Train the fit model on accumulated feedback data.

    Args:
        epochs: Number of training epochs
        batch_size: Batch size for training

    Returns:
        dict: Training results
    """
    if not TENSORFLOW_AVAILABLE:
        return {"success": False, "message": "TensorFlow not available"}

    data = load_training_data()

    if len(data) < 10:
        return {
            "success": False,
            "message": f"Insufficient training data. Need at least 10 samples, got {len(data)}"
        }

    # Prepare training data
    X = []
    y = []

    for entry in data:
        # Normalize measurements
        normalized = normalize_measurements(entry["measurements"])
        category_encoded = CATEGORY_ENCODING.get(entry["category"], 0)

        # Combine measurements with category
        features = np.append(normalized, category_encoded / len(CATEGORY_ENCODING))
        X.append(features)
        y.append(entry["fit_score"])

    X = np.array(X)
    y = np.array(y)

    # Create and train model
    model = create_fit_model()

    # Split data for validation
    val_split = min(0.2, len(X) // 5)
    if val_split > 0:
        X_train, X_val = X[:-val_split], X[-val_split:]
        y_train, y_val = y[:-val_split], y[-val_split:]
    else:
        X_train, y_train = X, y
        X_val, y_val = X, y

    # Train
    history = model.fit(
        X_train, y_train,
        epochs=epochs,
        batch_size=batch_size,
        validation_data=(X_val, y_val),
        verbose=0
    )

    # Save model
    save_model(model)

    return {
        "success": True,
        "message": f"Model trained on {len(data)} samples",
        "final_loss": float(history.history['loss'][-1]),
        "final_val_loss": float(history.history['val_loss'][-1]) if val_split > 0 else None,
        "samples_trained": len(data)
    }


def predict_fit(
    measurements: dict,
    category: str,
    size: str
) -> dict:
    """
    Predict the fit score for a given body measurement, category, and size.

    Args:
        measurements: Body measurements dict
        category: Garment category
        size: Size to predict fit for

    Returns:
        dict: Prediction results with fit score and interpretation
    """
    if not TENSORFLOW_AVAILABLE:
        return {
            "success": False,
            "message": "TensorFlow not available",
            "fit_score": None,
            "interpretation": None
        }

    model = load_model()

    if model is None:
        # Return default prediction if no model exists
        return {
            "success": True,
            "message": "No trained model available, using default",
            "fit_score": 0.5,
            "interpretation": "perfect",
            "confidence": "low"
        }

    # Prepare input
    normalized = normalize_measurements(measurements)
    category_encoded = CATEGORY_ENCODING.get(category.lower(), 0) / len(CATEGORY_ENCODING)
    features = np.append(normalized, category_encoded).reshape(1, -1)

    # Predict
    prediction = model.predict(features, verbose=0)[0][0]

    # Interpret
    if prediction < 0.2:
        interpretation = "too_tight"
    elif prediction < 0.4:
        interpretation = "tight"
    elif prediction < 0.6:
        interpretation = "perfect"
    elif prediction < 0.8:
        interpretation = "loose"
    else:
        interpretation = "too_loose"

    # Calculate confidence based on prediction distance from 0.5
    confidence = "high" if abs(prediction - 0.5) > 0.3 else "medium" if abs(prediction - 0.5) > 0.15 else "low"

    return {
        "success": True,
        "fit_score": float(prediction),
        "interpretation": interpretation,
        "confidence": confidence,
        "size": size,
        "category": category
    }


def get_training_stats() -> dict:
    """Get statistics about the training data."""
    data = load_training_data()

    if not data:
        return {
            "total_samples": 0,
            "categories": {},
            "fit_ratings": {}
        }

    categories = {}
    fit_ratings = {}

    for entry in data:
        cat = entry.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1

        fit = entry.get("fit_rating", "unknown")
        fit_ratings[fit] = fit_ratings.get(fit, 0) + 1

    return {
        "total_samples": len(data),
        "categories": categories,
        "fit_ratings": fit_ratings,
        "model_exists": os.path.exists(MODEL_PATH)
    }


def initialize_default_model() -> bool:
    """
    Initialize a default pre-trained model with basic patterns.
    This provides reasonable predictions even without user feedback.
    """
    if not TENSORFLOW_AVAILABLE:
        return False

    ensure_model_dir()

    # Check if model already exists
    if os.path.exists(MODEL_PATH):
        return True

    # Create a basic model
    model = create_fit_model()

    # Generate synthetic training data based on size chart patterns
    # This creates a model that understands basic size relationships
    X = []
    y = []

    # Generate training data based on typical size relationships
    # Small sizes should fit smaller bodies, large sizes larger bodies
    for height in np.linspace(150, 200, 10):
        for chest in np.linspace(70, 130, 10):
            for waist in np.linspace(55, 110, 10):
                for hips in np.linspace(75, 130, 10):
                    for shoulder in np.linspace(35, 55, 5):
                        # Size based on chest measurement (simplified)
                        if chest < 85:
                            size_idx = 0  # XS/S
                            fit_score = 0.5 if chest > 80 else 0.3
                        elif chest < 95:
                            size_idx = 1  # M
                            fit_score = 0.5 if 88 < chest < 93 else 0.4
                        elif chest < 105:
                            size_idx = 2  # L
                            fit_score = 0.5 if 98 < chest < 103 else 0.6
                        else:
                            size_idx = 3  # XL
                            fit_score = 0.5 if chest > 108 else 0.4

                        measurements = {
                            "height": height,
                            "chest": chest,
                            "waist": waist,
                            "hips": hips,
                            "shoulder_width": shoulder
                        }
                        normalized = normalize_measurements(measurements)
                        features = np.append(normalized, size_idx / 4)
                        X.append(features)
                        y.append(fit_score)

    X = np.array(X)
    y = np.array(y)

    # Train the model briefly
    model.fit(X, y, epochs=20, batch_size=32, verbose=0)

    # Save the model
    save_model(model)

    return True


# Initialize default model on module load
if TENSORFLOW_AVAILABLE:
    initialize_default_model()