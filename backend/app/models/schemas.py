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
    measurements: Optional[BodyMeasurements] = Field(None, description="Extracted body measurements")
    message: Optional[str] = Field(None, description="Optional message")
    landmarks: Optional[list] = Field(default_factory=list, description="Body landmarks for visualization")


class MeasurementConfidence(BaseModel):
    """Confidence scores for each measurement (0-1)."""
    height: float = Field(0.0, description="Confidence for height measurement")
    chest: float = Field(0.0, description="Confidence for chest measurement")
    waist: float = Field(0.0, description="Confidence for waist measurement")
    hips: float = Field(0.0, description="Confidence for hips measurement")
    shoulder_width: float = Field(0.0, description="Confidence for shoulder width measurement")


class MeasurementDebug(BaseModel):
    """Debug information for measurements."""
    detected_landmark_count: int = Field(0, description="Number of landmarks with visibility > 0.6")
    required_keypoint_visibilities: dict = Field(default_factory=dict, description="Visibility scores for key landmarks")
    classified_view: str = Field("unknown", description="Detected view angle")
    front_back_width_px: Optional[float] = Field(None, description="Width in pixels from front/back view")
    side_depth_px: Optional[float] = Field(None, description="Depth in pixels from side view")
    measurement_sources: dict = Field(default_factory=dict, description="Source of each measurement")


class MeasurementConfidenceLevel(BaseModel):
    """Confidence levels for each measurement (high/medium/low)."""
    height: str = Field("low", description="Confidence level: high, medium, or low")
    chest: str = Field("low", description="Confidence level: high, medium, or low")
    waist: str = Field("low", description="Confidence level: high, medium, or low")
    hips: str = Field("low", description="Confidence level: high, medium, or low")
    shoulders: str = Field("low", description="Confidence level: high, medium, or low")


class ScanClassificationResult(BaseModel):
    """Result of scan type classification."""
    scan_type: str = Field(..., description="Scan type: full_body, upper_body, or invalid")
    missing_landmarks: list[str] = Field(default_factory=list, description="List of missing landmark names")
    visibility_scores: dict[str, float] = Field(default_factory=dict, description="Visibility scores for each landmark")


class ScanMeasureResponseV2(BaseModel):
    """Enhanced response model for body scan with validation and confidence."""
    success: bool = Field(..., description="Whether the scan was successful")
    scan_type: str = Field(..., description="Scan type: full_body, upper_body, or invalid")
    measurements: Optional[BodyMeasurements] = Field(None, description="Extracted body measurements")
    confidence: Optional[MeasurementConfidence] = Field(None, description="Confidence scores for each measurement")
    warnings: list[str] = Field(default_factory=list, description="Warnings about scan quality")
    missing_landmarks: list[str] = Field(default_factory=list, description="List of missing landmark names")
    message: Optional[str] = Field(None, description="Optional message")
    landmarks: Optional[list] = Field(default_factory=list, description="Body landmarks for visualization")
    debug: Optional[MeasurementDebug] = Field(None, description="Debug information for measurements")


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


# Size Chart Schemas

class SizeChartEntry(BaseModel):
    """Single size row with measurement thresholds."""
    size: str = Field(..., description="Size identifier (e.g., S, M, L, 32, 34)")
    height_min: Optional[float] = Field(None, description="Minimum height in cm")
    height_max: Optional[float] = Field(None, description="Maximum height in cm")
    chest_min: Optional[float] = Field(None, description="Minimum chest circumference in cm")
    chest_max: Optional[float] = Field(None, description="Maximum chest circumference in cm")
    waist_min: Optional[float] = Field(None, description="Minimum waist circumference in cm")
    waist_max: Optional[float] = Field(None, description="Maximum waist circumference in cm")
    hips_min: Optional[float] = Field(None, description="Minimum hips circumference in cm")
    hips_max: Optional[float] = Field(None, description="Maximum hips circumference in cm")
    shoulder_min: Optional[float] = Field(None, description="Minimum shoulder width in cm")
    shoulder_max: Optional[float] = Field(None, description="Maximum shoulder width in cm")


class SizeChart(BaseModel):
    """Complete size chart for a brand/category."""
    brand: str = Field(..., description="Brand name")
    category: str = Field(..., description="Garment category (shirts, pants, dresses, etc.)")
    sizes: list[SizeChartEntry] = Field(..., description="List of size entries")
    gender: Optional[str] = Field(None, description="Gender target (men, women, unisex)")


class SizePredictionRequest(BaseModel):
    """Request for size prediction."""
    measurements: BodyMeasurements = Field(..., description="Body measurements")
    size_chart: Optional[SizeChart] = Field(None, description="Brand-specific size chart")
    use_standard_chart: bool = Field(True, description="Use standard size chart if no brand chart provided")
    category: Optional[str] = Field("shirts", description="Garment category for standard chart lookup")
    gender: Optional[str] = Field("men", description="Target gender for standard chart lookup")
    confidence: Optional[dict[str, float]] = Field(None, description="Per-measurement confidence scores from scan")


class SizeRecommendation(BaseModel):
    """Individual size recommendation."""
    size: str = Field(..., description="Recommended size")
    confidence: float = Field(..., description="Confidence score 0-100")
    fit_type: str = Field(..., description="Fit type: tight, perfect, loose, between_sizes")
    explanation: str = Field(..., description="Human-readable explanation")
    alternative_size: Optional[str] = Field(None, description="Alternative size recommendation")


class SizePredictionResponse(BaseModel):
    """Response for size prediction."""
    success: bool = Field(..., description="Whether prediction was successful")
    recommendations: list[SizeRecommendation] = Field(..., description="List of recommendations")
    measurements_used: list[str] = Field(..., description="List of measurements used for matching")
    warnings: Optional[list[str]] = Field(None, description="Warnings about incomplete data")


class SizeValidationRequest(BaseModel):
    """Request for validating user size against body measurements."""
    measurements: BodyMeasurements = Field(..., description="Body measurements")
    current_size: str = Field(..., description="User's current size")
    size_chart: SizeChart = Field(..., description="Size chart to validate against")


class SizeValidationResponse(BaseModel):
    """Response for size validation."""
    success: bool
    is_match: bool = Field(..., description="Whether current size matches body measurements")
    recommended_size: Optional[str] = Field(None, description="Correct size recommendation")
    fit_score: float = Field(..., description="Fit score 0-100")
    explanation: str


# Product Size Chart Extraction Schemas

class ProductExtractRequest(BaseModel):
    """Request for extracting size chart from product URL."""
    url: str = Field(..., description="Product page URL (Amazon, Myntra, Flipkart)")
    category: Optional[str] = Field(None, description="Expected garment category")
    use_standard_chart: bool = Field(
        True,
        description="Fallback to a standard chart if no brand-specific chart can be extracted"
    )


class ProductInfo(BaseModel):
    """Product information extracted from page."""
    name: str = Field(..., description="Product name")
    brand: Optional[str] = Field(None, description="Brand name")
    category: str = Field(..., description="Garment category")
    gender: Optional[str] = Field(None, description="Target gender")
    url: str = Field(..., description="Original product URL")


class ProductExtractResponse(BaseModel):
    """Response for product size chart extraction."""
    success: bool = Field(..., description="Whether extraction was successful")
    product: Optional[ProductInfo] = Field(None, description="Product information")
    size_chart: Optional[SizeChart] = Field(None, description="Extracted size chart")
    message: Optional[str] = Field(None, description="Status message")
    warnings: Optional[list[str]] = Field(None, description="Extraction warnings")


class ProductPageContext(BaseModel):
    """Product context captured by the browser extension."""
    url: str = Field(..., description="Product page URL")
    title: Optional[str] = Field(None, description="Product title")
    image: Optional[str] = Field(None, description="Primary product image URL")
    price: Optional[str] = Field(None, description="Displayed price")
    product_id: Optional[str] = Field(None, description="Site-specific product identifier")
    brand: Optional[str] = Field(None, description="Detected brand")
    category: Optional[str] = Field(None, description="Detected category")
    gender: Optional[str] = Field(None, description="Detected target gender")
    site_name: Optional[str] = Field(None, description="Website hostname")


class ExtractedSizeChartRow(BaseModel):
    """Flexible size row extracted from DOM before backend normalization."""
    label: str = Field(..., description="Size label such as S, M, L, 32")
    measurements: dict[str, float] = Field(
        default_factory=dict,
        description="Measurement name to numeric value mapping"
    )


class ExtractedSizeChart(BaseModel):
    """Generic size chart payload sent from the browser extension."""
    sizes: list[ExtractedSizeChartRow] = Field(..., description="Extracted size rows")
    unit: Optional[str] = Field("cm", description="Original measurement unit, e.g. cm or inches")
    source_type: Optional[str] = Field(None, description="DOM structure used, e.g. table or modal")
    source_selector: Optional[str] = Field(None, description="Best-effort selector for the extracted node")
    confidence: Optional[float] = Field(None, description="Extractor confidence 0-1")
    warnings: list[str] = Field(default_factory=list, description="Extraction warnings")


class ProductChartIngestRequest(BaseModel):
    """Payload posted by the extension after DOM extraction."""
    product: ProductPageContext = Field(..., description="Product page context")
    size_chart: ExtractedSizeChart = Field(..., description="Extracted generic size chart")
    measurements: Optional[BodyMeasurements] = Field(
        None,
        description="Optional body measurements for immediate recommendation"
    )


class ProductChartIngestResponse(BaseModel):
    """Normalized extension chart payload and optional recommendation."""
    success: bool = Field(..., description="Whether ingest and normalization succeeded")
    product: ProductInfo = Field(..., description="Normalized product information")
    size_chart: SizeChart = Field(..., description="Normalized size chart in backend format")
    recommendation: Optional[SizePredictionResponse] = Field(
        None,
        description="Optional size recommendation generated from supplied measurements"
    )
    warnings: list[str] = Field(default_factory=list, description="Ingest and normalization warnings")
