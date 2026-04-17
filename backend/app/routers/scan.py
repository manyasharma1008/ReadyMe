import base64
import io
import cv2
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from PIL import Image
import numpy as np
from pydantic import BaseModel, Field

from app.models.schemas import ScanMeasureResponse, BodyMeasurements, ScanMeasureResponseV2, MeasurementConfidence, MeasurementConfidenceLevel, MeasurementDebug
from app.services.preprocessing import preprocess_image
from app.services.mediapipe_extractor import extract_body_landmarks
from app.services.measurement import (
    calculate_measurements,
    calculate_measurements_enhanced,
    calibrate_with_user_height,
    calibrate_with_reference,
    get_calibration_factor,
    reset_calibration,
    calculate_measurements_calibrated,
    get_calibration_system,
    fuse_measurements,
    fuse_multiview_circumference,
    calculate_fill_ratio,
    classify_framing,
    DEFAULT_USER_HEIGHT_CM
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
    user_height: float | None = Field(None, description="User's actual height in cm")
    user_height_cm: float | None = Field(None, description="User's actual height in cm")


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


def _resolve_user_height_cm(payload: object | None) -> float:
    """Resolve user height from either `user_height_cm` or legacy `user_height` fields."""
    if payload is None:
        return DEFAULT_USER_HEIGHT_CM

    height_cm = getattr(payload, "user_height_cm", None)
    if isinstance(height_cm, (int, float)) and height_cm > 0:
        return float(height_cm)

    legacy_height = getattr(payload, "user_height", None)
    if isinstance(legacy_height, (int, float)) and legacy_height > 0:
        return float(legacy_height)

    return DEFAULT_USER_HEIGHT_CM


@router.post("/measure", response_model=ScanMeasureResponse)
async def measure_body(
    image: UploadFile = File(...),
    user_height: float = Query(DEFAULT_USER_HEIGHT_CM, description="User's actual height in cm")
):
    """
    Analyze a body image and extract measurements.

    Uses ratio-based normalization for distance-independent measurements.
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

        # Calculate measurements from landmarks using ratio-based normalization
        result = calculate_measurements_enhanced(
            landmarks,
            image_array.shape,
            user_height_cm=user_height
        )

        measurements = None
        if result.get('success') and result.get('measurements'):
            measurements = BodyMeasurements(**result.get('measurements', {}))

        return ScanMeasureResponse(
            success=result.get('success', False),
            measurements=measurements,
            message="Measurements extracted successfully" if result.get('success') else "Measurement failed",
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

    Uses ratio-based normalization for distance-independent measurements.
    """
    try:
        image_data = payload.image_data
        user_height = _resolve_user_height_cm(payload)

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

        # Calculate measurements from landmarks using ratio-based normalization
        result = calculate_measurements_enhanced(
            landmarks,
            image_array.shape,
            user_height_cm=user_height
        )

        measurements = None
        if result.get('success') and result.get('measurements'):
            measurements = BodyMeasurements(**result.get('measurements', {}))

        return ScanMeasureResponse(
            success=result.get('success', False),
            measurements=measurements,
            message="Measurements extracted successfully" if result.get('success') else "Measurement failed",
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


@router.post("/measure-enhanced", response_model=ScanMeasureResponseV2)
async def measure_body_enhanced(payload: MeasureBase64Request):
    """
    Enhanced body measurement with validation, scan classification, and confidence scoring.

    Returns detailed information about:
    - Scan type (full_body, upper_body, invalid)
    - Confidence scores for each measurement
    - Warnings about scan quality
    - Missing landmarks
    """
    try:
        # Decode base64 image
        image_array = _safe_decode_image(payload.image_data)

        if image_array is None:
            return ScanMeasureResponseV2(
                success=False,
                scan_type="invalid",
                measurements=None,
                confidence=None,
                warnings=["Invalid base64 image data"],
                missing_landmarks=["image"],
                message="Invalid image",
                landmarks=[]
            )

        if image_array.size == 0:
            return ScanMeasureResponseV2(
                success=False,
                scan_type="invalid",
                measurements=None,
                confidence=None,
                warnings=["Invalid image: empty or corrupted"],
                missing_landmarks=["image"],
                message="Invalid image",
                landmarks=[]
            )

        # Extract body landmarks using MediaPipe
        landmarks = _safe_extract_landmarks(image_array)

        if landmarks is None or not landmarks.get('landmarks'):
            return ScanMeasureResponseV2(
                success=False,
                scan_type="invalid",
                measurements=None,
                confidence=None,
                warnings=["Could not detect body in image. Please ensure the image shows a full body clearly."],
                missing_landmarks=["body_not_detected"],
                message="Could not detect body in image",
                landmarks=[]
            )

        # Calculate enhanced measurements with validation
        user_height = _resolve_user_height_cm(payload)
        result = calculate_measurements_enhanced(
            landmarks,
            image_array.shape,
            user_height_cm=user_height
        )

        # Build response
        measurements = None
        if result['success'] and result['measurements']:
            measurements = BodyMeasurements(**result['measurements'])

        confidence = None
        if result.get('confidence'):
            confidence = MeasurementConfidence(**result['confidence'])

        debug = None
        if result.get('debug'):
            debug = MeasurementDebug(**result['debug'])

        return ScanMeasureResponseV2(
            success=result['success'],
            scan_type=result['scan_type'],
            measurements=measurements,
            confidence=confidence,
            warnings=result.get('warnings', []),
            missing_landmarks=result.get('missing_landmarks', []),
            message="Measurements extracted successfully" if result['success'] else "Measurement failed",
            landmarks=landmarks.get('landmarks', []),
            debug=debug
        )

    except Exception as e:
        print(f"Measure-enhanced endpoint error: {e}")
        return ScanMeasureResponseV2(
            success=False,
            scan_type="invalid",
            measurements=None,
            confidence=None,
            warnings=[f"Error processing image: {str(e)}"],
            missing_landmarks=[],
            message="Error processing image",
            landmarks=[],
            debug=None
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
    # Enhanced fields
    scan_type: Optional[str] = Field("full_body", description="Scan type: full_body, upper_body, or invalid")
    confidence: Optional[dict] = Field(None, description="Confidence scores for each measurement")
    warnings: list[str] = Field(default_factory=list, description="Warnings about scan quality")
    debug: Optional[dict] = Field(None, description="Debug information for measurements")
    fusion_debug: Optional[dict] = Field(None, description="Fusion debug information including confidence")
    framing: Optional[dict] = Field(None, description="Framing status for position validation")


@router.post("/measure-multiple", response_model=MeasureMultipleResponse)
async def measure_multiple_images(payload: MeasureMultipleRequest):
    """
    Analyze multiple body images (front, back, left, right) at once.

    Uses multi-angle fusion (STEP 7) to combine measurements from all valid angles.
    Removes outliers outside ±20% of median, returns median of filtered values.
    """
    try:
        user_height = _resolve_user_height_cm(payload)

        image_types = ['front', 'back', 'left', 'right']
        all_landmarks = {}
        all_measurements = {}
        all_image_shapes = {}
        all_pixel_heights = {}
        all_enhanced_success = {}  # Track which views had successful enhanced results
        all_view_warnings = {}  # Track warnings from each view
        image_results = []
        front_enhanced = None

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

            # Calculate measurements for this image using enhanced method with ratio-based normalization
            enhanced_result = calculate_measurements_enhanced(
                landmarks_data,
                image_array.shape,
                user_height_cm=user_height
            )
            measurements = enhanced_result.get('measurements', {}) if enhanced_result.get('success') else {}
            enhanced_success = enhanced_result.get('success', False)
            enhanced_warnings = enhanced_result.get('warnings', [])

            # Store for aggregation
            all_landmarks[img_type] = landmarks
            all_image_shapes[img_type] = image_array.shape
            all_pixel_heights[img_type] = enhanced_result.get('debug', {}).get('height_px', 0)
            all_enhanced_success[img_type] = enhanced_success
            all_view_warnings[img_type] = enhanced_warnings
            if measurements:
                all_measurements[img_type] = measurements

            # Store enhanced data from front image for response
            if img_type == 'front':
                front_enhanced = enhanced_result

            image_results.append(ImageResult(
                image_type=img_type,
                image_data=image_data,
                landmarks=landmarks,
                success=enhanced_result.get('success', False),
                message="Processed successfully" if enhanced_result.get('success') else "; ".join(enhanced_result.get('warnings', [])) or "Measurement validation failed"
            ))

        # STEP 7: Multi-angle fusion - combine measurements from all valid angles
        fused_measurements, fusion_debug = fuse_measurements(all_measurements)

        # STEP 8: Use ellipse-based fusion for circumference measurements (chest/waist/hips)
        # This uses width from front/back + depth from left/right views
        # Only include views where enhanced measurement succeeded
        try:
            # Prepare views dict for fuse_multiview_circumference
            views_for_fusion = {}
            for angle in ['front', 'back', 'left', 'right']:
                # Only include views where enhanced measurement succeeded
                if not all_enhanced_success.get(angle, False):
                    continue
                if angle in all_landmarks and all_landmarks[angle]:
                    ph = all_pixel_heights.get(angle, 0)
                    ishape = all_image_shapes.get(angle, (640, 480, 3))
                    # pixel_height must be positive for ratio math to work
                    if ph <= 0:
                        continue
                    views_for_fusion[angle] = {
                        'landmarks': all_landmarks[angle],
                        'image_shape': ishape,
                        'pixel_height': ph,
                        'declared_view_type': angle,   # trust the label from the frontend
                    }

            # Use new ellipse-based fusion for circumference measurements
            if len(views_for_fusion) >= 2:
                ellipse_result = fuse_multiview_circumference(views_for_fusion, user_height)
                # Override chest/waist/hips with ellipse-based results
                if ellipse_result.get('chest', 0) > 0:
                    fused_measurements['chest'] = ellipse_result['chest']
                if ellipse_result.get('waist', 0) > 0:
                    fused_measurements['waist'] = ellipse_result['waist']
                if ellipse_result.get('hips', 0) > 0:
                    fused_measurements['hips'] = ellipse_result['hips']
                # Update confidence with ellipse result confidence
                if ellipse_result.get('confidence', 0) > 0:
                    fusion_debug['circumference_confidence'] = ellipse_result['confidence']
                # Track which views were used in ellipse fusion
                fusion_debug['ellipse_views_used'] = list(views_for_fusion.keys())
        except Exception as e:
            print(f"Ellipse fusion failed: {e}")

        # Use fused measurements as combined measurements
        combined_measurements = fused_measurements if fused_measurements else None
        primary_scan_type = 'full_body'
        primary_confidence = None
        primary_warnings = []

        # Collect all warnings from all views
        all_warnings = []
        for angle, warnings in all_view_warnings.items():
            if warnings:
                for w in warnings:
                    all_warnings.append(f"[{angle}] {w}")

        # Check for critical warnings that should lower confidence
        critical_warning_patterns = ['shoulder validation failed', 'low visibility', 'torso visibility too low']
        has_critical_warnings = any(
            any(pattern in w.lower() for pattern in critical_warning_patterns)
            for w in all_warnings
        )

        # Compute confidence levels
        # Use ellipse fusion confidence for circumference measurements if available
        consistency = fusion_debug.get('consistency', {})
        level_to_float = {'high': 0.9, 'medium': 0.6, 'low': 0.3}

        # Get ellipse confidence if available
        ellipse_confidence = fusion_debug.get('circumference_confidence', 0)

        # If there are critical warnings, reduce confidence
        confidence_multiplier = 0.5 if has_critical_warnings else 1.0

        confidence_level = {
            'height': level_to_float.get(consistency.get('height', 'medium'), 0.6) * confidence_multiplier,
            'chest': (ellipse_confidence if ellipse_confidence > 0 else level_to_float.get(consistency.get('chest', 'medium'), 0.6)) * confidence_multiplier,
            'waist': (ellipse_confidence if ellipse_confidence > 0 else level_to_float.get(consistency.get('waist', 'medium'), 0.6)) * confidence_multiplier,
            'hips': (ellipse_confidence if ellipse_confidence > 0 else level_to_float.get(consistency.get('hips', 'medium'), 0.6)) * confidence_multiplier,
            'shoulder_width': level_to_float.get(consistency.get('shoulder_width', 'medium'), 0.6) * confidence_multiplier
        }

        # Track if confidence was lowered due to warnings
        if has_critical_warnings:
            fusion_debug['confidence_reduced'] = True
            fusion_debug['confidence_reduction_reason'] = 'critical_warnings_in_views'

        if front_enhanced:
            primary_scan_type = front_enhanced.get('scan_type', 'full_body')
            # Use all warnings from all views, not just front
            primary_warnings = all_warnings if all_warnings else front_enhanced.get('warnings', [])

        # If no valid measurements from any image, return failure with details
        if not combined_measurements or combined_measurements.get('height', 0) == 0:
            failed_images = [r.image_type for r in image_results if not r.success]
            return MeasureMultipleResponse(
                success=False,
                measurements=None,
                images=image_results,
                message=f"Could not detect body in: {', '.join(failed_images)}. Please ensure full body is visible.",
                scan_type="invalid",
                confidence=None,
                warnings=["No valid measurements found - all images failed body detection"],
                debug=None,
                fusion_debug=None,
                framing=None
            )

        # Collect debug info from front_enhanced if available
        debug_info = None
        framing_info = None
        if front_enhanced and front_enhanced.get('debug'):
            debug_info = front_enhanced['debug']
        if front_enhanced and front_enhanced.get('framing'):
            framing_info = front_enhanced['framing']

        # Return measurements from the first successful image
        return MeasureMultipleResponse(
            success=True,
            measurements=BodyMeasurements(**combined_measurements),
            images=image_results,
            message=f"Successfully processed multiple images",
            scan_type=primary_scan_type,
            confidence=confidence_level,
            warnings=primary_warnings,
            debug=debug_info,
            fusion_debug=fusion_debug,
            framing=framing_info
        )

    except Exception as e:
        print(f"Measure-multiple endpoint error: {e}")
        return MeasureMultipleResponse(
            success=False,
            measurements=None,
            images=[],
            message=f"Error processing images: {str(e)}",
            scan_type="invalid",
            confidence=None,
            warnings=[f"Error processing images: {str(e)}"],
            debug=None,
            fusion_debug=None,
            framing=None
        )


# ========== Framing Guidance Endpoint ==========

@router.post("/framing/check")
async def check_framing(frame: UploadFile = File(...)):
    """
    Real-time framing check. Returns fill_ratio and a user-facing status.
    Designed for low-latency per-frame polling (~5 fps from client).
    """
    try:
        contents = await frame.read()
        arr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            raise HTTPException(400, "Invalid image")

        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        processed = preprocess_image(image)
        landmarks_data = extract_body_landmarks(processed)

        if not landmarks_data or 'landmarks' not in landmarks_data:
            return {
                'status': 'invalid',
                'message': 'No body detected — stand in full view',
                'fill_ratio': 0.0,
            }

        fill_info = calculate_fill_ratio(landmarks_data['landmarks'], processed.shape)
        return classify_framing(fill_info)

    except HTTPException:
        raise
    except Exception as e:
        print(f"Framing check error: {e}")
        return {
            'status': 'invalid',
            'message': f'Error processing frame: {str(e)}',
            'fill_ratio': 0.0,
        }
