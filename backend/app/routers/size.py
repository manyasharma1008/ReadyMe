"""
Size Prediction Router - API endpoints for size prediction and validation
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    SizePredictionRequest,
    SizePredictionResponse,
    SizeValidationRequest,
    SizeValidationResponse
)
from app.services import chart_matcher, fit_model

router = APIRouter()


@router.post("/predict", response_model=SizePredictionResponse)
async def predict_size(request: SizePredictionRequest):
    """
    Predict the best size based on body measurements and size chart.

    - **measurements**: Body measurements (height, chest, waist, hips, shoulder_width)
    - **size_chart**: Optional brand-specific size chart
    - **use_standard_chart**: Use standard size chart if no brand chart provided
    """
    try:
        category = (
            request.size_chart.category
            if request.size_chart and request.size_chart.category
            else (request.category or "shirts")
        )
        gender = (
            request.size_chart.gender
            if request.size_chart and request.size_chart.gender
            else (request.gender or "men")
        )

        result = chart_matcher.predict_size(
            measurements=request.measurements,
            size_chart=request.size_chart,
            use_standard_chart=request.use_standard_chart,
            category=category,
            gender=gender,
            measurement_confidence=request.confidence
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@router.post("/validate", response_model=SizeValidationResponse)
async def validate_size(request: SizeValidationRequest):
    """
    Validate if user's current size matches their body measurements.

    - **measurements**: User's body measurements
    - **current_size**: Size user currently wears
    - **size_chart**: Size chart to validate against
    """
    try:
        result = chart_matcher.validate_size(request)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation error: {str(e)}")


@router.get("/standard-charts")
async def get_standard_charts():
    """Get list of available standard size charts."""
    return {
        "categories": list(chart_matcher.STANDARD_CHARTS.keys()),
        "genders": ["men", "women"],
        "charts": {
            "shirts": {
                "men": len(chart_matcher.STANDARD_CHARTS["shirts"]["men"]),
                "women": len(chart_matcher.STANDARD_CHARTS["shirts"]["women"])
            },
            "pants": {
                "men": len(chart_matcher.STANDARD_CHARTS["pants"]["men"]),
                "women": len(chart_matcher.STANDARD_CHARTS["pants"]["women"])
            },
            "dresses": {
                "women": len(chart_matcher.STANDARD_CHARTS["dresses"]["women"])
            },
            "jackets": {
                "men": len(chart_matcher.STANDARD_CHARTS["jackets"]["men"]),
                "women": len(chart_matcher.STANDARD_CHARTS["jackets"]["women"])
            }
        }
    }


@router.get("/chart/{category}")
async def get_size_chart(category: str, gender: str = "men"):
    """Get a specific standard size chart."""
    chart = chart_matcher.get_standard_chart(category, gender)

    if not chart:
        raise HTTPException(
            status_code=404,
            detail=f"No standard chart found for category '{category}' and gender '{gender}'"
        )

    return chart


@router.post("/feedback")
async def add_fit_feedback(
    measurements: dict,
    category: str,
    size: str,
    fit_rating: str
):
    """
    Submit fit feedback to improve recommendations.

    - **measurements**: Body measurements
    - **category**: Garment category
    - **size**: Size worn
    - **fit_rating**: Fit rating (too_tight, tight, perfect, loose, too_loose)
    """
    valid_ratings = ["too_tight", "tight", "perfect", "loose", "too_loose"]

    if fit_rating not in valid_ratings:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fit_rating. Must be one of: {valid_ratings}"
        )

    success = fit_model.add_feedback(measurements, category, size, fit_rating)

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to save feedback"
        )

    return {
        "success": True,
        "message": "Feedback saved. Will be used to improve future recommendations."
    }


@router.post("/model/train")
async def train_fit_model(epochs: int = 50, batch_size: int = 16):
    """Train the fit prediction model on accumulated feedback."""
    result = fit_model.train_model(epochs=epochs, batch_size=batch_size)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@router.get("/model/stats")
async def get_model_stats():
    """Get training data statistics and model info."""
    return fit_model.get_training_stats()


@router.post("/predict-fit")
async def predict_fit_score(measurements: dict, category: str, size: str):
    """
    Predict fit score for a specific size using the ML model.

    - **measurements**: Body measurements
    - **category**: Garment category
    - **size**: Size to predict fit for
    """
    result = fit_model.predict_fit(measurements, category, size)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])

    return result
