import base64
import io
import cv2
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from PIL import Image
import numpy as np
from pydantic import BaseModel, Field

from app.models.schemas import ScanMeasureResponse, BodyMeasurements
from app.services.preprocessing import preprocess_image
from app.services.mediapipe_extractor import extract_body_landmarks
from app.services.measurement import (
    calculate_measurements,
    calibrate_with_user_height,
    calibrate_with_reference,
    get_calibration_factor,
    reset_calibration,
    calculate_measurements_calibrated,
    get_calibration_system
)
from app.services.visualization import create_visualization

router = APIRouter()


# ========== New Schema Models ==========

class CalibrationRequest(BaseModel):
    """Request model for calibration."""
    image_data: str = Field(..., description="Base64 encoded image data")
    user_height_cm: float = Field(..., description="User's known height in centimeters")


class CalibrationResponse(BaseModel):
    """Response model for calibration."""
    success: bool
    calibration_factor: float = Field(..., description="Pixels per cm")
    message: str


class ReferenceCalibrationRequest(BaseModel):
    """Request model for reference-based calibration."""
    reference_pixel_width: float = Field(..., description="Width of reference object in pixels")
    reference_actual_width: float = Field(..., description="Known width of reference in cm")
    reference_type: str = Field(None, description="Type of reference (credit_card, a4_paper, smartphone)")


class MeasureWithCalibrationRequest(BaseModel):
    """Request model for calibrated measurements."""
    image_data: str = Field(..., description="Base64 encoded image data")
    user_height_cm: float = Field(..., description="User's known height in cm (used for calibration)")


class VisualizationResponse(BaseModel):
    """Response model for landmark visualization."""
    success: bool
    image_data: str = Field(..., description="Base64 encoded visualization image")
    calibration_factor: float = Field(None, description="Calibration factor used")


class CalibrationStatusResponse(BaseModel):
    """Response model for calibration status."""
    is_calibrated: bool
    calibration_factor: float = None
    user_height_cm: float = None

@router.post("/measure", response_model=ScanMeasureResponse)
async def measure_body(
    image: UploadFile = File(...)
):
    """
    Analyze a body image and extract measurements.

    Accepts an image file upload and returns body measurements including:
    - height, chest, waist, hips, shoulder_width
    """
    try:
        # Read and validate image
        contents = await image.read()
        image_pil = Image.open(io.BytesIO(contents))

        # Convert to numpy array
        image_array = np.array(image_pil)

        # Preprocess the image
        preprocessed = preprocess_image(image_array)

        # Extract body landmarks using MediaPipe
        landmarks = extract_body_landmarks(preprocessed)

        if landmarks is None:
            raise HTTPException(
                status_code=400,
                detail="Could not detect body in image. Please ensure the image shows a full body clearly."
            )

        # Calculate measurements from landmarks
        measurements = calculate_measurements(landmarks, image_array.shape)

        return ScanMeasureResponse(
            success=True,
            measurements=BodyMeasurements(**measurements)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@router.post("/measure-base64", response_model=ScanMeasureResponse)
async def measure_body_base64(payload: dict):
    """
    Analyze a body image from base64 string and extract measurements.
    Expects JSON body: {"image_data": "base64_string"}
    """
    try:
        image_data = payload.get("image_data")
        if not image_data:
            raise HTTPException(status_code=422, detail="Missing 'image_data' in request body")

        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        image_pil = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image_pil)

        # Preprocess the image
        preprocessed = preprocess_image(image_array)

        # Extract body landmarks using MediaPipe
        landmarks = extract_body_landmarks(preprocessed)

        if landmarks is None:
            raise HTTPException(
                status_code=400,
                detail="Could not detect body in image. Please ensure the image shows a full body clearly."
            )

        # Calculate measurements from landmarks
        measurements = calculate_measurements(landmarks, image_array.shape)

        return ScanMeasureResponse(
            success=True,
            measurements=BodyMeasurements(**measurements)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


# ========== Calibration Endpoints ==========

@router.post("/calibrate", response_model=CalibrationResponse)
async def calibrate_with_height(payload: CalibrationRequest):
    """
    Calibrate the measurement system using user's known height.
    This is the most accurate method - user provides their actual height.

    The calibration factor will be stored globally and used for subsequent measurements.
    """
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(payload.image_data)
        image_pil = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image_pil)

        # Preprocess the image
        preprocessed = preprocess_image(image_array)

        # Extract body landmarks
        landmarks_data = extract_body_landmarks(preprocessed)

        if landmarks_data is None:
            raise HTTPException(
                status_code=400,
                detail="Could not detect body in image. Please ensure the image shows a full body clearly."
            )

        # Perform calibration using user's known height
        calibration_factor = calibrate_with_user_height(
            landmarks_data['landmarks'],
            image_array.shape,
            payload.user_height_cm
        )

        return CalibrationResponse(
            success=True,
            calibration_factor=calibration_factor,
            message=f"Calibrated successfully using height {payload.user_height_cm}cm"
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calibrating: {str(e)}")


@router.post("/calibrate/reference", response_model=CalibrationResponse)
async def calibrate_with_reference_object(payload: ReferenceCalibrationRequest):
    """
    Calibrate using a known reference object in the frame.

    Common references:
    - Credit card: 8.56cm width
    - A4 paper: 21cm width
    - Smartphone: 7-8cm width
    """
    try:
        # Reference object sizes in cm
        reference_sizes = {
            'credit_card': 8.56,
            'a4_paper': 21.0,
            'smartphone': 7.5,
        }

        # Determine actual width
        if payload.reference_type and payload.reference_type.lower() in reference_sizes:
            known_width = reference_sizes[payload.reference_type.lower()]
        else:
            known_width = payload.reference_actual_width

        # Perform calibration
        calibration_factor = calibrate_with_reference(
            payload.reference_pixel_width,
            known_width
        )

        return CalibrationResponse(
            success=True,
            calibration_factor=calibration_factor,
            message=f"Calibrated successfully using reference object ({known_width}cm)"
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calibrating: {str(e)}")


@router.get("/calibrate/status", response_model=CalibrationStatusResponse)
async def get_calibration_status():
    """Get the current calibration status."""
    calib = get_calibration_system()
    return CalibrationStatusResponse(
        is_calibrated=calib.is_calibrated(),
        calibration_factor=calib.calibration_factor,
        user_height_cm=calib.user_height_cm
    )


@router.post("/calibrate/reset")
async def reset_calibration_endpoint():
    """Reset the calibration system."""
    reset_calibration()
    return {"success": True, "message": "Calibration reset successfully"}


# ========== Calibrated Measurement Endpoint ==========

@router.post("/measure-calibrated", response_model=ScanMeasureResponse)
async def measure_with_calibration(payload: MeasureWithCalibrationRequest):
    """
    Measure body with calibration applied.
    Uses the user's provided height to calibrate, then calculates measurements.

    This provides more accurate measurements than the standard /measure endpoint
    because it accounts for camera distance and perspective.
    """
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(payload.image_data)
        image_pil = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image_pil)

        # Preprocess the image
        preprocessed = preprocess_image(image_array)

        # Extract body landmarks
        landmarks_data = extract_body_landmarks(preprocessed)

        if landmarks_data is None:
            raise HTTPException(
                status_code=400,
                detail="Could not detect body in image. Please ensure the image shows a full body clearly."
            )

        # Calibrate using user's height
        calibration_factor = calibrate_with_user_height(
            landmarks_data['landmarks'],
            image_array.shape,
            payload.user_height_cm
        )

        # Calculate calibrated measurements
        measurements = calculate_measurements_calibrated(
            landmarks_data,
            image_array.shape,
            calibration_factor
        )

        return ScanMeasureResponse(
            success=True,
            measurements=BodyMeasurements(**measurements),
            message=f"Calibrated with height {payload.user_height_cm}cm"
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


# ========== Visualization Endpoint ==========

@router.post("/visualize", response_model=VisualizationResponse)
async def visualize_landmarks(payload: dict):
    """
    Generate visualization of body landmarks.

    Returns an image with:
    - Colored landmark markers at key body points
    - Measurement lines between landmarks
    - Body outline
    - Calibration info (if provided in request)
    """
    try:
        # Get optional parameters
        image_data = payload.get("image_data")
        user_height_cm = payload.get("user_height_cm")
        show_outline = payload.get("show_outline", True)
        show_info = payload.get("show_info", True)

        if not image_data:
            raise HTTPException(status_code=422, detail="Missing 'image_data' in request body")

        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        image_pil = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image_pil)

        # Preprocess the image
        preprocessed = preprocess_image(image_array)

        # Extract body landmarks
        landmarks_data = extract_body_landmarks(preprocessed)

        if landmarks_data is None:
            raise HTTPException(
                status_code=400,
                detail="Could not detect body in image. Please ensure the image shows a full body clearly."
            )

        # Get calibration factor if available
        calib = get_calibration_system()
        calibration_factor = calib.calibration_factor if calib.is_calibrated() else None

        # If user provides height, we can use it for info display
        display_height = user_height_cm or calib.user_height_cm

        # Create visualization
        vis_image = create_visualization(
            image_array,
            landmarks_data['landmarks'],
            calibration_factor=calibration_factor,
            user_height=display_height,
            show_outline=show_outline,
            show_info=show_info
        )

        # Encode visualization back to base64
        _, buffer = cv2.imencode('.png', vis_image)
        vis_base64 = base64.b64encode(buffer).decode('utf-8')

        return VisualizationResponse(
            success=True,
            image_data=vis_base64,
            calibration_factor=calibration_factor
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating visualization: {str(e)}")