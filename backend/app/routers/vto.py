from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.schemas import BodyMeasurements
from app.services.vto_service import VTOProviderNotConfigured, generate_virtual_try_on


router = APIRouter()


class VTOGenerateRequest(BaseModel):
    person_image: str = Field(..., description="Base64 user/person image from the body scan")
    garment_image: str = Field(..., description="Garment/product image URL or base64 image")
    measurements: BodyMeasurements = Field(..., description="User body measurements in cm")
    product: Optional[dict[str, Any]] = Field(None, description="Optional product metadata")
    size_recommendation: Optional[dict[str, Any]] = Field(None, description="Optional size recommendation")


class VTOGenerateResponse(BaseModel):
    success: bool
    preview_image: Optional[str] = Field(None, description="Generated try-on image as base64 or hosted URL")
    provider: str = Field("placeholder", description="VTO provider used")
    message: str
    warnings: list[str] = Field(default_factory=list)
    debug: dict[str, Any] = Field(default_factory=dict)


@router.post("/generate", response_model=VTOGenerateResponse)
async def generate_vto_preview(request: VTOGenerateRequest):
    try:
        result = await generate_virtual_try_on(
            person_image=request.person_image,
            garment_image=request.garment_image,
            measurements=request.measurements.model_dump(),
            product=request.product,
            size_recommendation=request.size_recommendation,
        )

        return VTOGenerateResponse(
            success=True,
            preview_image=result.get("preview_image"),
            provider=result.get("provider", "placeholder"),
            message=result.get("message", "Virtual try-on preview generated."),
            warnings=result.get("warnings", []),
            debug=result.get("debug", {}),
        )
    except VTOProviderNotConfigured as error:
        return VTOGenerateResponse(
            success=False,
            preview_image=None,
            provider="google",
            message=str(error),
            warnings=["VTO provider is selected but not configured."],
            debug={},
        )
    except Exception as error:
        return VTOGenerateResponse(
            success=False,
            preview_image=None,
            provider="unknown",
            message=f"Virtual try-on failed: {str(error)}",
            warnings=["Unexpected VTO generation error."],
            debug={},
        )
