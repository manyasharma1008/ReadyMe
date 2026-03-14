from pydantic import BaseModel, Field
from typing import Optional


class BodyMeasurements(BaseModel):
    """Body measurement data model."""
    height: float = Field(..., description="Body height in cm")
    chest: float = Field(..., description="Chest circumference in cm")
    waist: float = Field(..., description="Waist circumference in cm")
    hips: float = Field(..., description="Hip circumference in cm")
    shoulder_width: float = Field(..., description="Shoulder width in cm")


class ScanMeasureRequest(BaseModel):
    """Request model for body scan measurement."""
    image_data: str = Field(..., description="Base64 encoded image data")
    user_id: Optional[str] = Field(None, description="Optional user ID for saving")


class ScanMeasureResponse(BaseModel):
    """Response model for body scan measurement."""
    success: bool = Field(..., description="Whether the scan was successful")
    measurements: BodyMeasurements = Field(..., description="Extracted body measurements")
    message: Optional[str] = Field(None, description="Optional message")


class ProfileSaveRequest(BaseModel):
    """Request model for saving body profile."""
    user_id: str = Field(..., description="User ID")
    measurements: BodyMeasurements = Field(..., description="Body measurements")
    name: Optional[str] = Field(None, description="Profile name")


class ProfileResponse(BaseModel):
    """Response model for body profile."""
    id: str
    user_id: str
    measurements: BodyMeasurements
    name: Optional[str]
    created_at: str
    updated_at: str