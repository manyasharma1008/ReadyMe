import base64
import io
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from PIL import Image
import numpy as np

from app.models.schemas import ScanMeasureResponse, BodyMeasurements
from app.services.preprocessing import preprocess_image
from app.services.mediapipe_extractor import extract_body_landmarks
from app.services.measurement import calculate_measurements

router = APIRouter()

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