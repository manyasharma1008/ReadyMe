import base64
import io
import cv2
from fastapi import APIRouter, UploadFile, File, HTTPException
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


class MeasureBase64Request(BaseModel):
    """Request model for base64 image measurement."""
    image_data: str = Field(..., description="Base64 encoded image data")


class VisualizationResponse(BaseModel):
    """Response model for landmark visualization."""
    success: bool
    image_data: str = Field(..., description="Base64 encoded visualization image")
    calibration_factor: float | None = Field(None, description="Calibration factor used")


class CalibrationStatusResponse(BaseModel):
    """Response model for calibration status."""
    is_calibrated: bool
    calibration_factor: float | None = None
    user_height_cm: float | None = None


def _safe_decode_image(image_data: str) -> np.ndarray:
    """
    Safely decode base64 image to numpy array.
    Returns None if decoding fails.
    """
    try:
        image_bytes = base64.b64decode(image_data)
        image_pil = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image_pil)
        return image_array
    except Exception as e:
        print(f"Image decode error: {e}")
        return None


def _safe_extract_landmarks(image_array: np.ndarray) -> dict:
    """
    Safely extract landmarks and convert to JSON format.
    The extract_body_landmarks function returns a dict with 'landmarks' key, not a MediaPipe results object.
    """
    try:
        preprocessed = preprocess_image(image_array)
        result = extract_body_landmarks(preprocessed)

        # The result is a dict with 'landmarks' key, not a MediaPipe results object
        if result is None or 'landmarks' not in result:
            return {"landmarks": []}

        landmarks_list = result.get('landmarks', [])

        if not landmarks_list:
            return {"landmarks": []}

        # Convert to list of dicts if needed (ensure JSON serializable)
        landmarks_json = []
        for lm in landmarks_list:
            if hasattr(lm, 'x'):  # MediaPipe landmark object
                landmarks_json.append({
                    "x": float(lm.x),
                    "y": float(lm.y),
                    "z": float(lm.z),
                    "visibility": float(lm.visibility)
                })
            else:  # Already a dict
                landmarks_json.append({
                    "x": float(lm.get('x', 0)),
                    "y": float(lm.get('y', 0)),
                    "z": float(lm.get('z', 0)),
                    "visibility": float(lm.get('visibility', 0))
                })

        return {"landmarks": landmarks_json}

    except Exception as e:
        print(f"Landmark extraction error: {e}")
        return {"landmarks": []}


@router.post("/measure", response_model=ScanMeasureResponse)
async def measure_body(
    image: UploadFile = File(...)
):
    """
    Analyze a body image and extract measurements.
    """
    try:
        # Read and validate image
        contents = await image.read()
        image_pil = Image.open(io.BytesIO(contents))
        image_array = np.array(image_pil)

        if image_array.size == 0:
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Invalid image: empty or corrupted",
                landmarks=[]
            )

        # Extract body landmarks using MediaPipe
        landmarks = _safe_extract_landmarks(image_array)

        if landmarks is None or not landmarks.get('landmarks'):
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Could not detect body in image. Please ensure the image shows a full body clearly.",
                landmarks=[]
            )

        # Calculate measurements from landmarks
        measurements = calculate_measurements(landmarks, image_array.shape)

        return ScanMeasureResponse(
            success=True,
            measurements=BodyMeasurements(**measurements),
            message="Measurements extracted successfully",
            landmarks=landmarks.get('landmarks', [])
        )

    except Exception as e:
        print(f"Measure endpoint error: {e}")
        return ScanMeasureResponse(
            success=False,
            measurements=None,
            message=f"Error processing image: {str(e)}",
            landmarks=[]
        )


@router.post("/measure-base64", response_model=ScanMeasureResponse)
async def measure_body_base64(payload: MeasureBase64Request):
    """
    Analyze a body image from base64 string and extract measurements.
    """
    try:
        image_data = payload.image_data
        if not image_data:
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Missing 'image_data' in request body",
                landmarks=[]
            )

        # Decode base64 image
        image_array = _safe_decode_image(image_data)

        if image_array is None:
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Invalid base64 image data. Please provide a valid image.",
                landmarks=[]
            )

        if image_array.size == 0:
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Invalid image: empty or corrupted",
                landmarks=[]
            )

        # Extract body landmarks using MediaPipe
        landmarks = _safe_extract_landmarks(image_array)

        if landmarks is None or not landmarks.get('landmarks'):
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Could not detect body in image. Please ensure the image shows a full body clearly.",
                landmarks=[]
            )

        # Calculate measurements from landmarks
        measurements = calculate_measurements(landmarks, image_array.shape)

        return ScanMeasureResponse(
            success=True,
            measurements=BodyMeasurements(**measurements),
            message="Measurements extracted successfully",
            landmarks=landmarks.get('landmarks', [])
        )

    except Exception as e:
        print(f"Measure-base64 endpoint error: {e}")
        return ScanMeasureResponse(
            success=False,
            measurements=None,
            message=f"Error processing image: {str(e)}",
            landmarks=[]
        )


# ========== Calibration Endpoints ==========

@router.post("/calibrate", response_model=CalibrationResponse)
async def calibrate_with_height(payload: CalibrationRequest):
    """
    Calibrate the measurement system using user's known height.
    """
    try:
        # Decode base64 image
        image_array = _safe_decode_image(payload.image_data)

        if image_array is None:
            return CalibrationResponse(
                success=False,
                calibration_factor=0.0,
                message="Invalid base64 image data"
            )

        # Extract body landmarks
        landmarks_data = _safe_extract_landmarks(image_array)

        if landmarks_data is None or not landmarks_data.get('landmarks'):
            return CalibrationResponse(
                success=False,
                calibration_factor=0.0,
                message="Could not detect body in image"
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
        return CalibrationResponse(
            success=False,
            calibration_factor=0.0,
            message=str(e)
        )
    except Exception as e:
        return CalibrationResponse(
            success=False,
            calibration_factor=0.0,
            message=f"Error calibrating: {str(e)}"
        )


@router.post("/calibrate/reference", response_model=CalibrationResponse)
async def calibrate_with_reference_object(payload: ReferenceCalibrationRequest):
    """
    Calibrate using a known reference object in the frame.
    """
    try:
        reference_sizes = {
            'credit_card': 8.56,
            'a4_paper': 21.0,
            'smartphone': 7.5,
        }

        if payload.reference_type and payload.reference_type.lower() in reference_sizes:
            known_width = reference_sizes[payload.reference_type.lower()]
        else:
            known_width = payload.reference_actual_width

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
        return CalibrationResponse(
            success=False,
            calibration_factor=0.0,
            message=str(e)
        )
    except Exception as e:
        return CalibrationResponse(
            success=False,
            calibration_factor=0.0,
            message=f"Error calibrating: {str(e)}"
        )


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
    """
    try:
        # Decode base64 image
        image_array = _safe_decode_image(payload.image_data)

        if image_array is None:
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Invalid base64 image data",
                landmarks=[]
            )

        # Extract body landmarks
        landmarks_data = _safe_extract_landmarks(image_array)

        if landmarks_data is None or not landmarks_data.get('landmarks'):
            return ScanMeasureResponse(
                success=False,
                measurements=None,
                message="Could not detect body in image. Please ensure the image shows a full body clearly.",
                landmarks=[]
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
            message=f"Calibrated with height {payload.user_height_cm}cm",
            landmarks=landmarks_data.get('landmarks', [])
        )

    except ValueError as e:
        return ScanMeasureResponse(
            success=False,
            measurements=None,
            message=str(e),
            landmarks=[]
        )
    except Exception as e:
        return ScanMeasureResponse(
            success=False,
            measurements=None,
            message=f"Error processing image: {str(e)}",
            landmarks=[]
        )


# ========== Visualization Endpoint ==========

@router.post("/visualize")
async def visualize_landmarks(payload: dict):
    """
    Generate visualization of body landmarks.
    """
    try:
        image_data = payload.get("image_data")
        user_height_cm = payload.get("user_height_cm")
        show_outline = payload.get("show_outline", True)
        show_info = payload.get("show_info", True)

        if not image_data:
            return {
                "success": False,
                "error": "Missing 'image_data' in request body",
                "image_data": None,
                "calibration_factor": None
            }

        # Decode base64 image
        image_array = _safe_decode_image(image_data)

        if image_array is None:
            return {
                "success": False,
                "error": "Invalid base64 image data",
                "image_data": None,
                "calibration_factor": None
            }

        # Extract body landmarks
        landmarks_data = _safe_extract_landmarks(image_array)

        if landmarks_data is None or not landmarks_data.get('landmarks'):
            return {
                "success": False,
                "error": "Could not detect body in image",
                "image_data": None,
                "calibration_factor": None
            }

        # Get calibration factor if available
        calib = get_calibration_system()
        calibration_factor = calib.calibration_factor if calib.is_calibrated() else None
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

        return {
            "success": True,
            "image_data": vis_base64,
            "calibration_factor": calibration_factor,
            "error": None
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Error creating visualization: {str(e)}",
            "image_data": None,
            "calibration_factor": None
        }


# ========== Measure Multiple Endpoint ==========

class MeasureMultipleRequest(BaseModel):
    """Request model for measuring multiple images at once."""
    images: dict = Field(..., description="Dictionary with keys: front, back, left, right")
    user_height_cm: float | None = Field(None, description="User's known height in cm for calibration")


class ImageResult(BaseModel):
    """Result for a single image."""
    image_type: str
    image_data: str = Field(..., description="Base64 encoded image")
    landmarks: list = Field(default_factory=list, description="Detected body landmarks")
    success: bool = True
    message: str = ""


class MeasureMultipleResponse(BaseModel):
    """Response model for measure-multiple endpoint."""
    success: bool
    measurements: BodyMeasurements | None = None
    images: list[ImageResult] = Field(default_factory=list)
    message: str


@router.post("/measure-multiple", response_model=MeasureMultipleResponse)
async def measure_multiple_images(payload: MeasureMultipleRequest):
    """
    Analyze multiple body images (front, back, left, right) at once.
    Returns landmarks for each image and combined measurements.
    """
    try:
        image_types = ['front', 'back', 'left', 'right']
        all_landmarks = {}
        all_measurements = {}
        image_results = []

        for img_type in image_types:
            image_data = payload.images.get(img_type)

            if not image_data:
                image_results.append(ImageResult(
                    image_type=img_type,
                    image_data="",
                    landmarks=[],
                    success=False,
                    message="No image provided"
                ))
                continue

            # Decode base64 image
            image_array = _safe_decode_image(image_data)

            if image_array is None:
                image_results.append(ImageResult(
                    image_type=img_type,
                    image_data=image_data,
                    landmarks=[],
                    success=False,
                    message="Invalid base64 image data"
                ))
                continue

            # Extract landmarks
            landmarks_data = _safe_extract_landmarks(image_array)
            landmarks = landmarks_data.get('landmarks', [])

            if not landmarks:
                image_results.append(ImageResult(
                    image_type=img_type,
                    image_data=image_data,
                    landmarks=[],
                    success=False,
                    message="Could not detect body in image"
                ))
                continue

            # Calculate measurements for this image
            measurements = calculate_measurements(landmarks, image_array.shape)

            # Store for aggregation
            all_landmarks[img_type] = landmarks
            all_measurements[img_type] = measurements

            image_results.append(ImageResult(
                image_type=img_type,
                image_data=image_data,
                landmarks=landmarks,
                success=True,
                message="Processed successfully"
            ))

        # Calculate combined measurements (use front image as primary)
        combined_measurements = all_measurements.get('front', {
            'height': 0,
            'chest': 0,
            'waist': 0,
            'hips': 0,
            'shoulder_width': 0
        })

        # If we have valid front measurements, return them
        if combined_measurements.get('height', 0) > 0:
            return MeasureMultipleResponse(
                success=True,
                measurements=BodyMeasurements(**combined_measurements),
                images=image_results,
                message="All images processed successfully"
            )
        else:
            return MeasureMultipleResponse(
                success=False,
                measurements=None,
                images=image_results,
                message="Could not extract valid measurements from images"
            )

    except Exception as e:
        print(f"Measure-multiple endpoint error: {e}")
        return MeasureMultipleResponse(
            success=False,
            measurements=None,
            images=[],
            message=f"Error processing images: {str(e)}"
        )