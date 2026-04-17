"""
Chart Matcher Service - Body-to-Size Chart Matching Algorithm
Matches user body measurements against brand-specific size charts
"""

from typing import Optional
from app.models.schemas import (
    BodyMeasurements,
    SizeChart,
    SizeChartEntry,
    SizeRecommendation,
    SizePredictionResponse,
    SizeValidationRequest,
    SizeValidationResponse
)


# Clothing ease constants (cm)
CLOTHING_EASE_CHEST = 6        # Added to measured chest for recommendation
CLOTHING_EASE_WAIST = 4        # Added to measured waist
CLOTHING_EASE_HIPS = 4         # Added to measured hips

# Low confidence bias
LOW_CONFIDENCE_BIAS = 1.05     # 5% toward larger size when confidence < 0.7
MIN_CONFIDENCE_FOR_ACCURATE = 0.70


# Standard size charts for different garment categories (in cm)
STANDARD_CHARTS = {
    "shirts": {
        "men": [
            {"size": "XS", "height_min": 160, "height_max": 165, "chest_min": 86, "chest_max": 91, "waist_min": 71, "waist_max": 76},
            {"size": "S", "height_min": 165, "height_max": 170, "chest_min": 91, "chest_max": 96, "waist_min": 76, "waist_max": 81},
            {"size": "M", "height_min": 170, "height_max": 175, "chest_min": 96, "chest_max": 101, "waist_min": 81, "waist_max": 86},
            {"size": "L", "height_min": 175, "height_max": 180, "chest_min": 101, "chest_max": 106, "waist_min": 86, "waist_max": 91},
            {"size": "XL", "height_min": 180, "height_max": 185, "chest_min": 106, "chest_max": 111, "waist_min": 91, "waist_max": 96},
            {"size": "XXL", "height_min": 185, "height_max": 190, "chest_min": 111, "chest_max": 116, "waist_min": 96, "waist_max": 101},
        ],
        "women": [
            {"size": "XS", "height_min": 155, "height_max": 160, "chest_min": 76, "chest_max": 81, "waist_min": 56, "waist_max": 61},
            {"size": "S", "height_min": 160, "height_max": 165, "chest_min": 81, "chest_max": 86, "waist_min": 61, "waist_max": 66},
            {"size": "M", "height_min": 165, "height_max": 170, "chest_min": 86, "chest_max": 91, "waist_min": 66, "waist_max": 71},
            {"size": "L", "height_min": 170, "height_max": 175, "chest_min": 91, "chest_max": 96, "waist_min": 71, "waist_max": 76},
            {"size": "XL", "height_min": 175, "height_max": 180, "chest_min": 96, "chest_max": 101, "waist_min": 76, "waist_max": 81},
        ]
    },
    "pants": {
        "men": [
            {"size": "28", "height_min": 165, "height_max": 170, "waist_min": 71, "waist_max": 76, "hips_min": 86, "hips_max": 91},
            {"size": "30", "height_min": 170, "height_max": 175, "waist_min": 76, "waist_max": 81, "hips_min": 91, "hips_max": 96},
            {"size": "32", "height_min": 175, "height_max": 180, "waist_min": 81, "waist_max": 86, "hips_min": 96, "hips_max": 101},
            {"size": "34", "height_min": 180, "height_max": 185, "waist_min": 86, "waist_max": 91, "hips_min": 101, "hips_max": 106},
            {"size": "36", "height_min": 185, "height_max": 190, "waist_min": 91, "waist_max": 96, "hips_min": 106, "hips_max": 111},
            {"size": "38", "height_min": 190, "height_max": 195, "waist_min": 96, "waist_max": 101, "hips_min": 111, "hips_max": 116},
        ],
        "women": [
            {"size": "24", "height_min": 155, "height_max": 160, "waist_min": 56, "waist_max": 61, "hips_min": 81, "hips_max": 86},
            {"size": "26", "height_min": 160, "height_max": 165, "waist_min": 61, "waist_max": 66, "hips_min": 86, "hips_max": 91},
            {"size": "28", "height_min": 165, "height_max": 170, "waist_min": 66, "waist_max": 71, "hips_min": 91, "hips_max": 96},
            {"size": "30", "height_min": 170, "height_max": 175, "waist_min": 71, "waist_max": 76, "hips_min": 96, "hips_max": 101},
            {"size": "32", "height_min": 175, "height_max": 180, "waist_min": 76, "waist_max": 81, "hips_min": 101, "hips_max": 106},
        ]
    },
    "dresses": {
        "women": [
            {"size": "XS", "height_min": 155, "height_max": 160, "chest_min": 76, "chest_max": 81, "waist_min": 56, "waist_max": 61, "hips_min": 81, "hips_max": 86},
            {"size": "S", "height_min": 160, "height_max": 165, "chest_min": 81, "chest_max": 86, "waist_min": 61, "waist_max": 66, "hips_min": 86, "hips_max": 91},
            {"size": "M", "height_min": 165, "height_max": 170, "chest_min": 86, "chest_max": 91, "waist_min": 66, "waist_max": 71, "hips_min": 91, "hips_max": 96},
            {"size": "L", "height_min": 170, "height_max": 175, "chest_min": 91, "chest_max": 96, "waist_min": 71, "waist_max": 76, "hips_min": 96, "hips_max": 101},
            {"size": "XL", "height_min": 175, "height_max": 180, "chest_min": 96, "chest_max": 101, "waist_min": 76, "waist_max": 81, "hips_min": 101, "hips_max": 106},
        ]
    },
    "jackets": {
        "men": [
            {"size": "S", "height_min": 165, "height_max": 170, "chest_min": 91, "chest_max": 96, "shoulder_min": 43, "shoulder_max": 45},
            {"size": "M", "height_min": 170, "height_max": 175, "chest_min": 96, "chest_max": 101, "shoulder_min": 45, "shoulder_max": 47},
            {"size": "L", "height_min": 175, "height_max": 180, "chest_min": 101, "chest_max": 106, "shoulder_min": 47, "shoulder_max": 49},
            {"size": "XL", "height_min": 180, "height_max": 185, "chest_min": 106, "chest_max": 111, "shoulder_min": 49, "shoulder_max": 51},
            {"size": "XXL", "height_min": 185, "height_max": 190, "chest_min": 111, "chest_max": 116, "shoulder_min": 51, "shoulder_max": 53},
        ],
        "women": [
            {"size": "XS", "height_min": 155, "height_max": 160, "chest_min": 76, "chest_max": 81, "shoulder_min": 36, "shoulder_max": 38},
            {"size": "S", "height_min": 160, "height_max": 165, "chest_min": 81, "chest_max": 86, "shoulder_min": 38, "shoulder_max": 40},
            {"size": "M", "height_min": 165, "height_max": 170, "chest_min": 86, "chest_max": 91, "shoulder_min": 40, "shoulder_max": 42},
            {"size": "L", "height_min": 170, "height_max": 175, "chest_min": 91, "chest_max": 96, "shoulder_min": 42, "shoulder_max": 44},
            {"size": "XL", "height_min": 175, "height_max": 180, "chest_min": 96, "chest_max": 101, "shoulder_min": 44, "shoulder_max": 46},
        ]
    }
}


# Measurement weights by garment category
MEASUREMENT_WEIGHTS = {
    "shirts": {"height": 0.2, "chest": 0.4, "waist": 0.3, "shoulder": 0.1, "hips": 0.0},
    "pants": {"height": 0.15, "waist": 0.4, "hips": 0.35, "chest": 0.0, "shoulder": 0.1},
    "dresses": {"height": 0.15, "chest": 0.25, "waist": 0.3, "hips": 0.25, "shoulder": 0.05},
    "jackets": {"height": 0.15, "chest": 0.35, "shoulder": 0.25, "waist": 0.15, "hips": 0.1}
}

PRIMARY_MEASUREMENTS_BY_CATEGORY = {
    "shirts": ["chest", "waist", "height"],
    "pants": ["waist", "hips", "height"],
    "dresses": ["chest", "waist", "hips", "height"],
    "jackets": ["chest", "shoulder_width", "height"],
}


def get_standard_chart(category: str, gender: str = "men") -> Optional[SizeChart]:
    """Get standard size chart for category and gender."""
    category = category.lower()
    gender = gender.lower() if gender else "men"

    if category not in STANDARD_CHARTS:
        return None

    gender_data = STANDARD_CHARTS[category].get(gender, STANDARD_CHARTS[category].get("men", []))
    if not gender_data:
        return None

    sizes = [SizeChartEntry(**entry) for entry in gender_data]
    return SizeChart(
        brand="Standard",
        category=category,
        sizes=sizes,
        gender=gender
    )


def calculate_body_proportions(measurements: BodyMeasurements) -> dict:
    """Calculate useful body ratios for analysis."""
    return {
        "waist_to_height": measurements.waist / measurements.height if measurements.height > 0 else 0,
        "chest_to_height": measurements.chest / measurements.height if measurements.height > 0 else 0,
        "hips_to_height": measurements.hips / measurements.height if measurements.height > 0 else 0,
        "chest_to_waist": measurements.chest / measurements.waist if measurements.waist > 0 else 0,
        "hips_to_waist": measurements.hips / measurements.waist if measurements.waist > 0 else 0,
        "shoulder_to_height": measurements.shoulder_width / measurements.height if measurements.height > 0 else 0
    }


def get_measurement_weights(category: str) -> dict:
    """Get measurement weights for a specific category."""
    return MEASUREMENT_WEIGHTS.get(category.lower(), MEASUREMENT_WEIGHTS["shirts"])


def has_usable_measurement(value: float) -> bool:
    """Treat only positive measurements as usable for recommendation."""
    return isinstance(value, (int, float)) and value > 0


def get_chart_measurement_bounds(size_chart: SizeChart) -> dict[str, tuple[float, float]]:
    """Get overall min/max bounds for each measurement present in a size chart."""
    measurement_fields = {
        "height": ("height_min", "height_max"),
        "chest": ("chest_min", "chest_max"),
        "waist": ("waist_min", "waist_max"),
        "hips": ("hips_min", "hips_max"),
        "shoulder_width": ("shoulder_min", "shoulder_max"),
    }
    bounds = {}

    for measurement_name, (min_field, max_field) in measurement_fields.items():
        min_values = [
            getattr(entry, min_field)
            for entry in size_chart.sizes
            if getattr(entry, min_field) is not None
        ]
        max_values = [
            getattr(entry, max_field)
            for entry in size_chart.sizes
            if getattr(entry, max_field) is not None
        ]

        if min_values and max_values:
            bounds[measurement_name] = (min(min_values), max(max_values))

    return bounds


def detect_implausible_measurements(
    measurements: BodyMeasurements,
    size_chart: SizeChart
) -> tuple[list[str], list[str]]:
    """
    Detect scan outputs that are far outside the selected chart range.
    This helps avoid returning XS/24 simply because the scan under-measured the torso.
    """
    bounds = get_chart_measurement_bounds(size_chart)
    category = size_chart.category.lower()
    primary_measurements = PRIMARY_MEASUREMENTS_BY_CATEGORY.get(category, ["chest", "waist", "height"])

    severe_issues = []
    warning_issues = []

    for measurement_name in primary_measurements:
        value = getattr(measurements, measurement_name, 0)
        if not has_usable_measurement(value):
            continue

        if measurement_name not in bounds:
            continue

        min_value, max_value = bounds[measurement_name]
        if value < min_value * 0.75:
            severe_issues.append(
                f"{measurement_name.replace('_', ' ')} ({value:.1f} cm) is far below the selected chart range"
            )
        elif value > max_value * 1.25:
            severe_issues.append(
                f"{measurement_name.replace('_', ' ')} ({value:.1f} cm) is far above the selected chart range"
            )
        elif value < min_value * 0.9 or value > max_value * 1.1:
            warning_issues.append(
                f"{measurement_name.replace('_', ' ')} ({value:.1f} cm) is near the edge of the selected chart range"
            )

    return severe_issues, warning_issues


def calculate_size_distance(measurements: BodyMeasurements, entry: SizeChartEntry) -> tuple[float, list[str]]:
    """
    Calculate distance between user measurements and size entry thresholds.
    Returns (distance, list of measurements used).
    """
    total_distance = 0.0
    measurements_used = []
    weights = {"height": 1.0, "chest": 1.0, "waist": 1.0, "hips": 1.0, "shoulder": 1.0}

    # Height
    if entry.height_min is not None and entry.height_max is not None and has_usable_measurement(measurements.height):
        ideal_height = (entry.height_min + entry.height_max) / 2
        height_range = entry.height_max - entry.height_min
        if height_range > 0:
            dist = abs(measurements.height - ideal_height) / height_range
            total_distance += dist * weights["height"]
            measurements_used.append("height")

    # Chest
    if entry.chest_min is not None and entry.chest_max is not None and has_usable_measurement(measurements.chest):
        ideal_chest = (entry.chest_min + entry.chest_max) / 2
        chest_range = entry.chest_max - entry.chest_min
        if chest_range > 0:
            dist = abs(measurements.chest - ideal_chest) / chest_range
            total_distance += dist * weights["chest"]
            measurements_used.append("chest")

    # Waist
    if entry.waist_min is not None and entry.waist_max is not None and has_usable_measurement(measurements.waist):
        ideal_waist = (entry.waist_min + entry.waist_max) / 2
        waist_range = entry.waist_max - entry.waist_min
        if waist_range > 0:
            dist = abs(measurements.waist - ideal_waist) / waist_range
            total_distance += dist * weights["waist"]
            measurements_used.append("waist")

    # Hips
    if entry.hips_min is not None and entry.hips_max is not None and has_usable_measurement(measurements.hips):
        ideal_hips = (entry.hips_min + entry.hips_max) / 2
        hips_range = entry.hips_max - entry.hips_min
        if hips_range > 0:
            dist = abs(measurements.hips - ideal_hips) / hips_range
            total_distance += dist * weights["hips"]
            measurements_used.append("hips")

    # Shoulder
    if entry.shoulder_min is not None and entry.shoulder_max is not None and has_usable_measurement(measurements.shoulder_width):
        ideal_shoulder = (entry.shoulder_min + entry.shoulder_max) / 2
        shoulder_range = entry.shoulder_max - entry.shoulder_min
        if shoulder_range > 0:
            dist = abs(measurements.shoulder_width - ideal_shoulder) / shoulder_range
            total_distance += dist * weights["shoulder"]
            measurements_used.append("shoulder")

    return total_distance, measurements_used


def calculate_weighted_distance(measurements: BodyMeasurements, entry: SizeChartEntry, category: str, focus_attributes: Optional[list[str]] = None) -> tuple[float, list[str]]:
    """
    Calculate weighted distance between user measurements and size entry.
    Uses category-specific weights for different body measurements.

    Args:
        focus_attributes: If provided, only calculate distance for these attributes.
            E.g., ["chest"] to find best size for chest measurement only.
    """
    weights = get_measurement_weights(category)
    total_weighted_distance = 0.0
    total_weight = 0.0
    measurements_used = []

    # Helper to check if attribute should be included
    def should_include(attr: str) -> bool:
        if focus_attributes is None:
            return True
        return attr in focus_attributes

    # Height
    if should_include("height") and entry.height_min is not None and entry.height_max is not None and has_usable_measurement(measurements.height):
        ideal_height = (entry.height_min + entry.height_max) / 2
        height_range = entry.height_max - entry.height_min
        if height_range > 0:
            dist = abs(measurements.height - ideal_height) / height_range
            weight = weights.get("height", 0.2)
            total_weighted_distance += dist * weight
            total_weight += weight
            measurements_used.append("height")

    # Chest
    if should_include("chest") and entry.chest_min is not None and entry.chest_max is not None and has_usable_measurement(measurements.chest):
        ideal_chest = (entry.chest_min + entry.chest_max) / 2
        chest_range = entry.chest_max - entry.chest_min
        if chest_range > 0:
            dist = abs(measurements.chest - ideal_chest) / chest_range
            weight = weights.get("chest", 0.4)
            total_weighted_distance += dist * weight
            total_weight += weight
            measurements_used.append("chest")

    # Waist
    if should_include("waist") and entry.waist_min is not None and entry.waist_max is not None and has_usable_measurement(measurements.waist):
        ideal_waist = (entry.waist_min + entry.waist_max) / 2
        waist_range = entry.waist_max - entry.waist_min
        if waist_range > 0:
            dist = abs(measurements.waist - ideal_waist) / waist_range
            weight = weights.get("waist", 0.3)
            total_weighted_distance += dist * weight
            total_weight += weight
            measurements_used.append("waist")

    # Hips
    if should_include("hips") and entry.hips_min is not None and entry.hips_max is not None and has_usable_measurement(measurements.hips):
        ideal_hips = (entry.hips_min + entry.hips_max) / 2
        hips_range = entry.hips_max - entry.hips_min
        if hips_range > 0:
            dist = abs(measurements.hips - ideal_hips) / hips_range
            weight = weights.get("hips", 0.1)
            total_weighted_distance += dist * weight
            total_weight += weight
            measurements_used.append("hips")

    # Shoulder
    if should_include("shoulder") and entry.shoulder_min is not None and entry.shoulder_max is not None and has_usable_measurement(measurements.shoulder_width):
        ideal_shoulder = (entry.shoulder_min + entry.shoulder_max) / 2
        shoulder_range = entry.shoulder_max - entry.shoulder_min
        if shoulder_range > 0:
            dist = abs(measurements.shoulder_width - ideal_shoulder) / shoulder_range
            weight = weights.get("shoulder", 0.1)
            total_weighted_distance += dist * weight
            total_weight += weight
            measurements_used.append("shoulder")

    if total_weight > 0:
        return total_weighted_distance / total_weight, measurements_used
    return 1.0, measurements_used


def calculate_confidence(distance: float, measurements_in_range: int, total_measurements: int) -> float:
    """
    Calculate confidence score based on distance and measurement coverage.
    - 90-100%: User measurement within exact size range
    - 70-89%: User measurement close to size boundary
    - 50-69%: Between two sizes (recommend both)
    - Below 50%: Limited chart data or unusual proportions
    """
    # Convert distance to confidence (lower distance = higher confidence)
    base_confidence = max(0, 100 - (distance * 100))

    # Bonus for measurements in range
    if total_measurements > 0:
        coverage_ratio = measurements_in_range / total_measurements
        coverage_bonus = coverage_ratio * 20
    else:
        coverage_bonus = 0

    confidence = base_confidence + coverage_bonus
    return min(100, max(0, confidence))


def check_measurements_in_range(measurements: BodyMeasurements, entry: SizeChartEntry) -> list[str]:
    """Check which measurements fall within the size entry range."""
    in_range = []

    if entry.height_min is not None and entry.height_max is not None and has_usable_measurement(measurements.height):
        if entry.height_min <= measurements.height <= entry.height_max:
            in_range.append("height")

    if entry.chest_min is not None and entry.chest_max is not None and has_usable_measurement(measurements.chest):
        if entry.chest_min <= measurements.chest <= entry.chest_max:
            in_range.append("chest")

    if entry.waist_min is not None and entry.waist_max is not None and has_usable_measurement(measurements.waist):
        if entry.waist_min <= measurements.waist <= entry.waist_max:
            in_range.append("waist")

    if entry.hips_min is not None and entry.hips_max is not None and has_usable_measurement(measurements.hips):
        if entry.hips_min <= measurements.hips <= entry.hips_max:
            in_range.append("hips")

    if entry.shoulder_min is not None and entry.shoulder_max is not None and has_usable_measurement(measurements.shoulder_width):
        if entry.shoulder_min <= measurements.shoulder_width <= entry.shoulder_max:
            in_range.append("shoulder")

    return in_range


def determine_fit_type(measurements: BodyMeasurements, entry: SizeChartEntry, distance: float) -> str:
    """Determine the fit type based on measurements and distance."""
    measurements_in_range = check_measurements_in_range(measurements, entry)
    total_measurements = len(measurements_in_range)

    # Count available measurements in chart
    available = 0
    for attr in ["height", "chest", "waist", "hips", "shoulder"]:
        chart_attr = f"{attr}_min"
        if getattr(entry, chart_attr) is not None:
            available += 1

    in_range_ratio = total_measurements / available if available > 0 else 0

    if distance < 0.3 and in_range_ratio > 0.7:
        return "perfect"
    elif distance < 0.5:
        return "tight" if measurements.chest > (entry.chest_max or 0) or measurements.waist > (entry.waist_max or 0) else "loose"
    else:
        return "between_sizes"


def get_size_recommendation(
    measurements: BodyMeasurements,
    size_chart: SizeChart
) -> list[SizeRecommendation]:
    """
    Main function to get size recommendations from body measurements and size chart.
    """
    recommendations = []
    category = size_chart.category.lower()
    gender = size_chart.gender.lower() if size_chart.gender else "men"

    # Sort sizes by their minimum values to handle ordering
    sorted_sizes = sorted(size_chart.sizes, key=lambda x: (
        x.height_min or 0,
        x.chest_min or 0,
        x.waist_min or 0
    ))

    # Calculate distances for all sizes
    size_distances = []
    for entry in sorted_sizes:
        distance, measurements_used = calculate_weighted_distance(measurements, entry, category)
        measurements_in_range = len(check_measurements_in_range(measurements, entry))
        size_distances.append({
            "entry": entry,
            "distance": distance,
            "measurements_used": measurements_used,
            "measurements_in_range": measurements_in_range
        })

    # Find best matching sizes
    size_distances.sort(key=lambda x: x["distance"])

    # Check if chest and waist each match different sizes (for shirts category)
    # This helps detect when user is between sizes
    chest_best_size = None
    waist_best_size = None
    if category == "shirts" and has_usable_measurement(measurements.chest) and has_usable_measurement(measurements.waist):
        # Find best size for chest
        chest_distances = [
            (e.size, calculate_weighted_distance(measurements, e, category, focus_attributes=["chest"])[0])
            for e in sorted_sizes
        ]
        chest_distances.sort(key=lambda x: x[1])
        if chest_distances:
            chest_best_size = chest_distances[0][0]

        # Find best size for waist
        waist_distances = [
            (e.size, calculate_weighted_distance(measurements, e, category, focus_attributes=["waist"])[0])
            for e in sorted_sizes
        ]
        waist_distances.sort(key=lambda x: x[1])
        if waist_distances:
            waist_best_size = waist_distances[0][0]

    # Get best match
    if size_distances:
        best = size_distances[0]
        best_entry = best["entry"]
        best_distance = best["distance"]

        # Calculate confidence
        total_measurements = len([e for e in sorted_sizes[0].__dict__.keys() if e.endswith("_min")])
        confidence = calculate_confidence(
            best_distance,
            best["measurements_in_range"],
            total_measurements
        )

        # Determine fit type
        fit_type = determine_fit_type(measurements, best_entry, best_distance)

        # Override fit_type to "between_sizes" if chest and waist point to different sizes
        if chest_best_size and waist_best_size and chest_best_size != waist_best_size:
            fit_type = "between_sizes"
            explanation += " Note: Your chest and waist suggest different sizes - consider between sizes."

        # Generate explanation
        in_range_parts = check_measurements_in_range(measurements, best_entry)
        explanation = f"Best match for {category}: Your measurements "
        if in_range_parts:
            explanation += f"fall within the {best_entry.size} range for {', '.join(in_range_parts)}. "
        else:
            explanation += f"are closest to {best_entry.size}. "

        if fit_type == "perfect":
            explanation += "This size should fit well."
        elif fit_type == "tight":
            explanation += "You may find this slightly tight."
        elif fit_type == "loose":
            explanation += "You may find this slightly loose."
        else:
            explanation += "Consider sizing up or down based on fit preference."

        # Check if between sizes
        alternative_size = None
        # First check if chest and waist disagree on size
        if chest_best_size and waist_best_size and chest_best_size != waist_best_size:
            # Set alternative to the other size (the one chest or waist points to that's different from best)
            if best_entry.size == chest_best_size:
                alternative_size = waist_best_size
            elif best_entry.size == waist_best_size:
                alternative_size = chest_best_size
            else:
                # Best is neither chest nor waist best, pick the closer one
                alternative_size = chest_best_size
        elif len(size_distances) > 1:
            second_best = size_distances[1]
            if abs(second_best["distance"] - best_distance) < 0.2:
                alternative_size = second_best["entry"].size
                explanation += f" Alternative: {alternative_size} may also work."

        recommendations.append(SizeRecommendation(
            size=best_entry.size,
            confidence=round(confidence, 1),
            fit_type=fit_type,
            explanation=explanation,
            alternative_size=alternative_size
        ))

    return recommendations


def parse_standard_size_chart(chart_type: str, gender: str = "men") -> Optional[SizeChart]:
    """
    Parse common size chart formats (US, EU, UK).
    Returns standard size chart for the given type.
    """
    # For now, map common category names to our standard charts
    category_mapping = {
        "shirt": "shirts",
        "shirts": "shirts",
        "t-shirt": "shirts",
        "tshirt": "shirts",
        "pant": "pants",
        "pants": "pants",
        "trousers": "pants",
        "jeans": "pants",
        "dress": "dresses",
        "dresses": "dresses",
        "jacket": "jackets",
        "jackets": "jackets",
        "coat": "jackets",
        "blazer": "jackets"
    }

    category = category_mapping.get(chart_type.lower(), chart_type.lower())
    return get_standard_chart(category, gender)


def predict_size(
    measurements: BodyMeasurements,
    size_chart: Optional[SizeChart] = None,
    use_standard_chart: bool = True,
    category: str = "shirts",
    gender: str = "men",
    measurement_confidence: Optional[dict[str, float]] = None
) -> SizePredictionResponse:
    """
    Main prediction function - matches body measurements against size chart.

    Args:
        measurement_confidence: Optional dict with per-measurement confidence scores (0-1).
            If provided, low-confidence measurements will be downweighted or flagged.
    """
    warnings = []
    measurements_used = [
        name for name, value in {
            "height": measurements.height,
            "chest": measurements.chest,
            "waist": measurements.waist,
            "hips": measurements.hips,
            "shoulder_width": measurements.shoulder_width,
        }.items()
        if has_usable_measurement(value)
    ]

    # Track low-confidence measurements that should be flagged
    low_confidence_measurements = []
    if measurement_confidence:
        for name in measurements_used:
            conf = measurement_confidence.get(name, 1.0)
            if conf < 0.5:
                low_confidence_measurements.append(name)

    # Add warning for low-confidence measurements
    if low_confidence_measurements:
        warnings.append(f"Low confidence for: {', '.join(low_confidence_measurements)}. Results may be less accurate.")

    # Calculate average confidence for bias application
    avg_confidence = 1.0
    if measurement_confidence:
        conf_values = [measurement_confidence.get(name, 1.0) for name in measurements_used]
        if conf_values:
            avg_confidence = sum(conf_values) / len(conf_values)

    # Fail-safe warning when confidence is low
    if avg_confidence < 0.50:
        warnings.append("Please stand straight facing the camera for accurate measurement")

    # Apply clothing ease to create adjusted measurements
    adjusted_measurements = BodyMeasurements(
        height=measurements.height,
        chest=measurements.chest + CLOTHING_EASE_CHEST if measurements.chest else 0,
        waist=measurements.waist + CLOTHING_EASE_WAIST if measurements.waist else 0,
        hips=measurements.hips + CLOTHING_EASE_HIPS if measurements.hips else 0,
        shoulder_width=measurements.shoulder_width
    )

    # Apply low confidence bias: shift toward larger size when confidence is low
    if avg_confidence < MIN_CONFIDENCE_FOR_ACCURATE:
        adjusted_measurements.chest = adjusted_measurements.chest * LOW_CONFIDENCE_BIAS if adjusted_measurements.chest else 0
        adjusted_measurements.waist = adjusted_measurements.waist * LOW_CONFIDENCE_BIAS if adjusted_measurements.waist else 0
        adjusted_measurements.hips = adjusted_measurements.hips * LOW_CONFIDENCE_BIAS if adjusted_measurements.hips else 0

    if len(measurements_used) < 2:
        return SizePredictionResponse(
            success=False,
            recommendations=[],
            measurements_used=measurements_used,
            warnings=["At least two reliable measurements are required for size recommendation"]
        )

    # Get size chart
    chart = size_chart
    if not chart and use_standard_chart:
        chart = get_standard_chart(category, gender)
        if chart:
            warnings.append(f"Using standard {gender} {category} size chart")

    if not chart:
        return SizePredictionResponse(
            success=False,
            recommendations=[],
            measurements_used=[],
            warnings=["No size chart available for the specified category"]
        )

    severe_issues, warning_issues = detect_implausible_measurements(adjusted_measurements, chart)
    warnings.extend(warning_issues)

    if len(severe_issues) >= 2:
        return SizePredictionResponse(
            success=False,
            recommendations=[],
            measurements_used=measurements_used,
            warnings=severe_issues + [
                "Scan measurements appear inconsistent with the selected size chart. Try editing the measurements manually or rescanning."
            ]
        )

    # Get recommendations using adjusted measurements (with clothing ease and bias)
    recommendations = get_size_recommendation(adjusted_measurements, chart)

    # Check for warnings
    if recommendations:
        # Check for extreme measurements
        proportions = calculate_body_proportions(adjusted_measurements)
        if proportions["waist_to_height"] > 0.6:
            warnings.append("Your waist-to-height ratio is unusual. Consider alterations.")
        if proportions["chest_to_waist"] > 1.5:
            warnings.append("Your chest-to-waist ratio is unusual. Fit may vary.")

    return SizePredictionResponse(
        success=True,
        recommendations=recommendations,
        measurements_used=measurements_used,
        warnings=warnings if warnings else None
    )


def validate_size(request: SizeValidationRequest) -> SizeValidationResponse:
    """
    Validate if user's current size matches their body measurements.
    """
    usable_measurements = [
        value for value in [
            request.measurements.height,
            request.measurements.chest,
            request.measurements.waist,
            request.measurements.hips,
            request.measurements.shoulder_width,
        ]
        if has_usable_measurement(value)
    ]
    if len(usable_measurements) < 2:
        return SizeValidationResponse(
            success=False,
            is_match=False,
            recommended_size=None,
            fit_score=0,
            explanation="At least two reliable measurements are required to validate size."
        )

    size_chart = request.size_chart

    # Find the entry for the current size
    current_entry = None
    for entry in size_chart.sizes:
        if entry.size.lower() == request.current_size.lower():
            current_entry = entry
            break

    if not current_entry:
        return SizeValidationResponse(
            success=False,
            is_match=False,
            recommended_size=None,
            fit_score=0,
            explanation=f"Size '{request.current_size}' not found in the size chart"
        )

    # Calculate how well the measurements match this size
    distance, _ = calculate_weighted_distance(request.measurements, current_entry, size_chart.category)
    measurements_in_range = check_measurements_in_range(request.measurements, current_entry)

    # Calculate fit score (inverse of distance)
    fit_score = max(0, min(100, (1 - distance) * 100))

    # Check if it's a match (within acceptable range)
    is_match = distance < 0.3 and len(measurements_in_range) >= 2

    # Get recommended size if not a match
    recommended_size = None
    if not is_match:
        recommendations = get_size_recommendation(request.measurements, size_chart)
        if recommendations:
            recommended_size = recommendations[0].size

    explanation = f"Your measurements show {len(measurements_in_range)} of {len([e for e in current_entry.__dict__.keys() if e.endswith('_min')])} measurements in the {request.current_size} range. "
    explanation += "Good fit" if is_match else f"Recommended size: {recommended_size}"

    return SizeValidationResponse(
        success=True,
        is_match=is_match,
        recommended_size=recommended_size,
        fit_score=round(fit_score, 1),
        explanation=explanation
    )
