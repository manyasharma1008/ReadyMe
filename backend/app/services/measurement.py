import numpy as np
import math


# Average human proportions for scaling (in cm)
# These ratios are used to convert pixel measurements to cm
AVERAGE_HUMAN_RATIOS = {
    'height_to_shoulder_ratio': 4.5,  # Total height is ~4.5x shoulder width
    'chest_to_shoulder_ratio': 1.1,  # Chest width is ~1.1x shoulder width
    'waist_to_shoulder_ratio': 0.85,  # Waist width is ~0.85x shoulder width
    'hips_to_shoulder_ratio': 1.05,   # Hips width is ~1.05x shoulder width
}


# Landmark index mappings for MediaPipe Pose
LANDMARK_NAMES = {
    0: "nose",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle"
}

# Required landmark indices for different scan types
FULL_BODY_LANDMARKS = [0, 11, 12, 23, 24, 25, 26, 27, 28]  # nose, shoulders, hips, knees, ankles
UPPER_BODY_LANDMARKS = [0, 11, 12, 23, 24]  # nose, shoulders, hips
VISIBILITY_THRESHOLD = 0.5  # Minimum visibility to consider landmark valid
TORSO_VISIBILITY_THRESHOLD = 0.25
LOWER_BODY_VISIBILITY_THRESHOLD = 0.15

# Ratio-based normalization settings
DEFAULT_USER_HEIGHT_CM = 170.0  # Default height when not provided
LANDMARK_CONFIDENCE_THRESHOLD = 0.6  # Minimum confidence for valid measurements

# Multi-angle fusion settings
MIN_ANGLES_FOR_AVG = 2  # Minimum angles needed for fusion
OUTLIER_THRESHOLD_PCT = 0.20  # ±20% from median for outlier filtering

# Height calculation settings
TRIM_PERCENT = 0.05  # Remove top/bottom 5% of Y values for height calculation

# Consistency check settings
CONSISTENCY_THRESHOLD = 0.25  # Mark as low confidence if variation > 25%
MEASUREMENT_CONFIDENCE_THRESHOLD = 0.5
HEAD_LANDMARK_INDICES = list(range(11))
FOOT_LANDMARK_INDICES = [27, 28, 29, 30, 31, 32]
RELIABLE_MEASUREMENT_KEYS = ["chest", "waist", "hips", "shoulder_width"]
CHEST_LINE_RATIO = 0.2
WAIST_LINE_RATIO = 0.55
CHEST_CIRCUMFERENCE_FACTOR = 2.15
WAIST_CIRCUMFERENCE_FACTOR = 2.0
HIP_CIRCUMFERENCE_FACTOR = 2.2
HEAD_TO_HIP_HEIGHT_RATIO = 0.52
MIN_ESTIMATED_HEIGHT_MULTIPLIER = 0.45
MAX_ESTIMATED_HEIGHT_MULTIPLIER = 1.15
TORSO_HEIGHT_CONFIDENCE = 0.55


def validate_landmarks(landmarks: list, visibility_threshold: float = VISIBILITY_THRESHOLD) -> dict:
    """
    Validate landmarks exist AND have visibility above threshold.

    Args:
        landmarks: List of body landmarks with x, y, z, visibility
        visibility_threshold: Minimum visibility score (default 0.5)

    Returns:
        Dictionary with:
            - is_valid: bool indicating if minimum landmarks are visible
            - missing_landmarks: list of missing landmark indices
            - missing_names: list of missing landmark names
            - visibility_scores: dict mapping landmark name to visibility
            - valid_count: number of valid landmarks
    """
    if not landmarks or len(landmarks) < 29:
        return {
            'is_valid': False,
            'missing_landmarks': list(range(29)),
            'missing_names': ["insufficient_landmarks"],
            'visibility_scores': {},
            'valid_count': 0
        }

    missing_landmarks = []
    visibility_scores = {}
    valid_count = 0

    for idx, name in LANDMARK_NAMES.items():
        if idx >= len(landmarks):
            missing_landmarks.append(idx)
            continue

        landmark = landmarks[idx]
        visibility = landmark.get('visibility', 0.0)

        if visibility >= visibility_threshold:
            visibility_scores[name] = visibility
            valid_count += 1
        else:
            missing_landmarks.append(idx)

    return {
        'is_valid': len(missing_landmarks) < len(LANDMARK_NAMES),
        'missing_landmarks': missing_landmarks,
        'missing_names': [LANDMARK_NAMES.get(i, str(i)) for i in missing_landmarks],
        'visibility_scores': visibility_scores,
        'valid_count': valid_count
    }


def classify_scan_type(landmarks: list, visibility_threshold: float = VISIBILITY_THRESHOLD) -> dict:
    """
    Classify the scan type based on visible landmarks.

    Args:
        landmarks: List of body landmarks
        visibility_threshold: Minimum visibility for valid landmarks

    Returns:
        Dictionary with:
            - scan_type: "full_body", "upper_body", or "invalid"
            - missing_landmarks: list of missing landmark names
            - validation: full validation result from validate_landmarks
    """
    validation = validate_landmarks(landmarks, visibility_threshold)
    missing_set = set(validation['missing_landmarks'])

    def is_visible(idx: int, threshold: float) -> bool:
        return idx < len(landmarks) and landmarks[idx].get('visibility', 0.0) >= threshold

    has_head = is_visible(0, visibility_threshold)
    has_shoulders = is_visible(11, visibility_threshold) and is_visible(12, visibility_threshold)
    has_hips_relaxed = is_visible(23, TORSO_VISIBILITY_THRESHOLD) and is_visible(24, TORSO_VISIBILITY_THRESHOLD)
    has_knees_relaxed = is_visible(25, LOWER_BODY_VISIBILITY_THRESHOLD) and is_visible(26, LOWER_BODY_VISIBILITY_THRESHOLD)
    has_ankles_relaxed = is_visible(27, LOWER_BODY_VISIBILITY_THRESHOLD) and is_visible(28, LOWER_BODY_VISIBILITY_THRESHOLD)

    if has_head and has_shoulders and has_hips_relaxed and (has_knees_relaxed or has_ankles_relaxed):
        return {
            'scan_type': 'full_body',
            'missing_landmarks': [],
            'validation': validation
        }

    if has_head and has_shoulders:
        return {
            'scan_type': 'upper_body',
            'missing_landmarks': validation['missing_names'],
            'validation': validation
        }

    return {
        'scan_type': 'invalid',
        'missing_landmarks': validation['missing_names'],
        'validation': validation
    }


def compute_confidence(landmarks: list, scan_type: str, has_calibration: bool = False,
                       visibility_threshold: float = VISIBILITY_THRESHOLD) -> dict:
    """
    Compute confidence scores for each measurement.

    Args:
        landmarks: List of body landmarks
        scan_type: "full_body", "upper_body", or "invalid"
        has_calibration: Whether calibration is available
        visibility_threshold: Minimum visibility for valid landmarks

    Returns:
        Dictionary with confidence scores (0-1) for each measurement
    """
    confidence = {
        'height': 0.0,
        'chest': 0.0,
        'waist': 0.0,
        'hips': 0.0,
        'shoulder_width': 0.0
    }

    if scan_type == 'invalid' or not landmarks:
        return confidence

    def average_visibility(indices: list[int]) -> float:
        values = []
        for idx in indices:
            if idx < len(landmarks):
                visibility = landmarks[idx].get('visibility', 0.0)
                if visibility > 0:
                    values.append(visibility)
        return sum(values) / len(values) if values else 0.0

    # Symmetry bonus - check left/right consistency
    symmetry_bonus = 0.0
    symmetric_pairs = [
        (11, 12),  # shoulders
        (23, 24),  # hips
        (25, 26),  # knees
        (27, 28)   # ankles
    ]

    for left_idx, right_idx in symmetric_pairs:
        if left_idx < len(landmarks) and right_idx < len(landmarks):
            left_vis = landmarks[left_idx].get('visibility', 0.0)
            right_vis = landmarks[right_idx].get('visibility', 0.0)
            if left_vis > 0 and right_vis > 0:
                symmetry = 1 - abs(left_vis - right_vis)
                symmetry_bonus += symmetry

    symmetry_bonus = symmetry_bonus / len(symmetric_pairs) if symmetric_pairs else 0.0

    # Calibration bonus
    calibration_bonus = 0.1 if has_calibration else 0.0

    # Apply confidence based on scan type and available landmarks
    if scan_type == 'full_body':
        confidence['height'] = min(1.0, average_visibility([0, 27, 28]) + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['chest'] = min(1.0, average_visibility([11, 12]) + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['waist'] = min(1.0, average_visibility([11, 12, 23, 24]) + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['hips'] = min(1.0, average_visibility([23, 24]) + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['shoulder_width'] = min(1.0, average_visibility([11, 12]) + symmetry_bonus * 0.2 + calibration_bonus)
    elif scan_type == 'upper_body':
        confidence['height'] = min(0.75, average_visibility([0, 23, 24]) + symmetry_bonus * 0.1 + calibration_bonus)
        confidence['chest'] = min(1.0, average_visibility([11, 12]) + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['waist'] = min(0.8, average_visibility([11, 12, 23, 24]) + symmetry_bonus * 0.15 + calibration_bonus)
        confidence['hips'] = min(0.75, average_visibility([23, 24]) + symmetry_bonus * 0.1 + calibration_bonus)
        confidence['shoulder_width'] = min(1.0, average_visibility([11, 12]) + symmetry_bonus * 0.2 + calibration_bonus)

    return confidence


def get_confidence_level(consistency: str, visibility: float) -> str:
    """
    Convert numeric confidence to level string.

    Args:
        consistency: 'high' or 'low' from consistency check
        visibility: Average visibility score (0-1)

    Returns:
        'high', 'medium', or 'low'
    """
    if consistency == 'low':
        return 'low'
    elif visibility > 0.8:
        return 'high'
    else:
        return 'medium'


def check_framing(landmarks: list, image_shape: tuple) -> dict:
    """
    Check if the subject is properly framed in the image.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the image (height, width, channels)

    Returns:
        Dictionary with:
            - is_properly_framed: bool
            - warnings: list of warning messages
            - person_height_pixels: estimated pixel height of person
            - fill_ratio: percentage of image height filled by person
    """
    warnings = []
    fill_ratio = 0.0

    if not landmarks or len(landmarks) < 29:
        return {
            'is_properly_framed': False,
            'warnings': ['Cannot assess framing - insufficient landmarks'],
            'person_height_pixels': 0,
            'fill_ratio': 0.0
        }

    try:
        image_height = image_shape[0]

        # Find bounding box of visible landmarks
        x_coords = []
        y_coords = []

        for landmark in landmarks[:29]:  # First 29 are pose landmarks
            if landmark.get('visibility', 0) >= VISIBILITY_THRESHOLD:
                x_coords.append(landmark['x'] * image_shape[1])
                y_coords.append(landmark['y'] * image_height)

        if not x_coords or not y_coords:
            return {
                'is_properly_framed': False,
                'warnings': ['Cannot assess framing - no valid landmarks'],
                'person_height_pixels': 0,
                'fill_ratio': 0.0
            }

        min_y = min(y_coords)
        max_y = max(y_coords)
        person_height = max_y - min_y

        fill_ratio = person_height / image_height if image_height > 0 else 0.0

        # Thresholds
        MIN_FILL_RATIO = 0.30  # 30% of image
        MAX_FILL_RATIO = 0.90  # 90% of image

        if fill_ratio < MIN_FILL_RATIO:
            warnings.append("You are too far from the camera. Step closer for accurate measurements.")
        elif fill_ratio > MAX_FILL_RATIO:
            warnings.append("Body is not fully visible. Step back to capture entire body.")

        return {
            'is_properly_framed': MIN_FILL_RATIO <= fill_ratio <= MAX_FILL_RATIO,
            'warnings': warnings,
            'person_height_pixels': person_height,
            'fill_ratio': fill_ratio
        }
    except Exception:
        return {
            'is_properly_framed': True,
            'warnings': [],
            'person_height_pixels': 0,
            'fill_ratio': 0.0
        }


def validate_calibration_prerequisites(landmarks: list, visibility_threshold: float = VISIBILITY_THRESHOLD) -> dict:
    """
    Validate that landmarks required for calibration are present.

    Args:
        landmarks: List of body landmarks
        visibility_threshold: Minimum visibility for valid landmarks

    Returns:
        Dictionary with:
            - can_calibrate: bool
            - warning: warning message if calibration not possible
            - has_height_landmarks: bool (nose + ankles)
    """
    if not landmarks or len(landmarks) < 29:
        return {
            'can_calibrate': False,
            'warning': 'Height calibration not applied due to incomplete body visibility',
            'has_height_landmarks': False
        }

    # Check for nose (0) and ankles (27, 28)
    has_nose = (len(landmarks) > 0 and landmarks[0].get('visibility', 0) >= visibility_threshold)
    has_left_ankle = (len(landmarks) > 27 and landmarks[27].get('visibility', 0) >= visibility_threshold)
    has_right_ankle = (len(landmarks) > 28 and landmarks[28].get('visibility', 0) >= visibility_threshold)

    has_height_landmarks = has_nose and (has_left_ankle or has_right_ankle)

    if not has_height_landmarks:
        return {
            'can_calibrate': False,
            'warning': 'Height calibration not applied due to incomplete body visibility',
            'has_height_landmarks': False
        }

    return {
        'can_calibrate': True,
        'warning': None,
        'has_height_landmarks': True
    }


class CalibrationSystem:
    """
    Handles pixel-to-real-world conversion for accurate body measurements.
    Uses calibration to convert normalized MediaPipe coordinates to real centimeters.
    """

    def __init__(self):
        self.calibration_factor = None  # pixels per cm
        self.user_height_cm = None  # User's known height for calibration

    def calibrate_from_height(self, landmarks: list, image_shape: tuple, actual_height_cm: float) -> float:
        """
        Calibrate using user's known height.
        MediaPipe landmark 0 (nose) to landmarks 27/28 (ankles) = full body height.

        Args:
            landmarks: List of body landmarks
            image_shape: Shape of the original image (height, width, channels)
            actual_height_cm: User's actual height in centimeters

        Returns:
            Calibration factor (pixels per cm)
        """
        nose = landmarks[0]
        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        # Use vertical distance (Y-axis) for height (most reliable)
        # MediaPipe Y increases downward, so subtract
        ankle_y = max(left_ankle['y'], right_ankle['y'])  # Bottom of body
        pixel_height = (ankle_y - nose['y']) * image_shape[0]

        if pixel_height <= 0:
            raise ValueError("Invalid landmarks: pixel height must be positive")

        # calibration_factor = pixels / cm
        self.calibration_factor = pixel_height / actual_height_cm
        self.user_height_cm = actual_height_cm
        return self.calibration_factor

    def calibrate_from_reference(self, ref_pixels: float, ref_cm: float) -> float:
        """
        Calibrate using a known reference object in frame.

        Common references:
        - Credit card: 8.56cm × 5.398cm
        - A4 paper width: 21cm
        - Smartphone: ~7-8cm width

        Args:
            ref_pixels: Width of reference object in pixels
            ref_cm: Known width of reference object in cm

        Returns:
            Calibration factor (pixels per cm)
        """
        if ref_pixels <= 0 or ref_cm <= 0:
            raise ValueError("Reference dimensions must be positive")

        self.calibration_factor = ref_pixels / ref_cm
        return self.calibration_factor

    def pixels_to_cm(self, pixel_distance: float) -> float:
        """Convert pixel distance to centimeters."""
        if self.calibration_factor is None:
            raise ValueError("System not calibrated. Call calibrate_from_height() or calibrate_from_reference() first.")
        return pixel_distance / self.calibration_factor

    def cm_to_pixels(self, cm_distance: float) -> float:
        """Convert centimeters to pixel distance."""
        if self.calibration_factor is None:
            raise ValueError("System not calibrated. Call calibrate_from_height() or calibrate_from_reference() first.")
        return cm_distance * self.calibration_factor

    def is_calibrated(self) -> bool:
        """Check if the system has been calibrated."""
        return self.calibration_factor is not None


# Global calibration system instance
_calibration_system = CalibrationSystem()


def get_calibration_system() -> CalibrationSystem:
    """Get or create the global calibration system instance."""
    global _calibration_system
    return _calibration_system


def calibrate_with_user_height(landmarks: list, image_shape: tuple, user_height_cm: float) -> float:
    """
    Calibrate measurement system using user's known height.
    Most accurate method - user provides their known height.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)
        user_height_cm: User's actual height in centimeters

    Returns:
        Calibration factor (pixels per cm)
    """
    calib = get_calibration_system()
    return calib.calibrate_from_height(landmarks, image_shape, user_height_cm)


def calibrate_with_reference(pixel_width: float, known_width_cm: float) -> float:
    """
    Use a known reference object (e.g., credit card = 8.56cm) to calibrate.

    Args:
        pixel_width: Width of reference object in pixels
        known_width_cm: Known width of reference in centimeters

    Returns:
        Calibration factor (pixels per cm)
    """
    calib = get_calibration_system()
    return calib.calibrate_from_reference(pixel_width, known_width_cm)


def get_calibration_factor() -> float:
    """Get the current calibration factor."""
    calib = get_calibration_system()
    if not calib.is_calibrated():
        raise ValueError("System not calibrated")
    return calib.calibration_factor


def reset_calibration():
    """Reset the calibration system to uncalibrated state."""
    global _calibration_system
    _calibration_system = CalibrationSystem()


def euclidean_distance_3d(p1: dict, p2: dict) -> float:
    """Calculate 3D Euclidean distance between two landmarks."""
    return math.sqrt(
        (p1['x'] - p2['x'])**2 +
        (p1['y'] - p2['y'])**2 +
        (p1['z'] - p2['z'])**2
    )


def euclidean_distance_2d(p1: dict, p2: dict) -> float:
    """Calculate 2D Euclidean distance between two landmarks."""
    return math.sqrt(
        (p1['x'] - p2['x'])**2 +
        (p1['y'] - p2['y'])**2
    )


def euclidean_distance_px(p1: dict, p2: dict, image_shape: tuple) -> float:
    """Calculate Euclidean distance between landmarks in image pixels."""
    dx_px = (p1['x'] - p2['x']) * image_shape[1]
    dy_px = (p1['y'] - p2['y']) * image_shape[0]
    return math.sqrt(dx_px**2 + dy_px**2)


def horizontal_distance_px(p1: dict, p2: dict, image_shape: tuple) -> float:
    """Calculate horizontal body width between two landmarks in pixels."""
    return abs(p1['x'] - p2['x']) * image_shape[1]


def get_visible_landmarks(landmarks: list, indices: list[int],
                          threshold: float = LANDMARK_CONFIDENCE_THRESHOLD) -> list[tuple[int, dict]]:
    """Return landmarks whose visibility is above threshold."""
    visible = []
    for idx in indices:
        if idx < len(landmarks):
            landmark = landmarks[idx]
            if landmark.get('visibility', 0.0) >= threshold:
                visible.append((idx, landmark))
    return visible


def estimate_torso_pixel_height(landmarks: list, image_shape: tuple) -> float:
    """
    Estimate full-body height from head-to-hip distance when feet are not visible.
    """
    if not landmarks or len(landmarks) < 25:
        return 0.0

    visible_head = get_visible_landmarks(landmarks, HEAD_LANDMARK_INDICES, threshold=VISIBILITY_THRESHOLD)
    visible_hips = get_visible_landmarks(landmarks, [23, 24], threshold=TORSO_VISIBILITY_THRESHOLD)

    if not visible_head or not visible_hips:
        return 0.0

    head_y = min(landmark["y"] for _, landmark in visible_head)
    hip_y = max(landmark["y"] for _, landmark in visible_hips)
    head_to_hip_px = (hip_y - head_y) * image_shape[0]

    if head_to_hip_px <= 0:
        return 0.0

    estimated_height = head_to_hip_px / HEAD_TO_HIP_HEIGHT_RATIO
    min_height = image_shape[0] * MIN_ESTIMATED_HEIGHT_MULTIPLIER
    max_height = image_shape[0] * MAX_ESTIMATED_HEIGHT_MULTIPLIER
    return max(min_height, min(max_height, estimated_height))


def interpolate_landmark(p1: dict, p2: dict, ratio: float) -> dict:
    """Interpolate a virtual landmark between two visible keypoints."""
    return {
        "x": p1["x"] + (p2["x"] - p1["x"]) * ratio,
        "y": p1["y"] + (p2["y"] - p1["y"]) * ratio,
        "z": p1["z"] + (p2["z"] - p1["z"]) * ratio,
        "visibility": min(p1.get("visibility", 0.0), p2.get("visibility", 0.0)),
    }


def get_body_width_points(landmarks: list, upper_idx_left: int, upper_idx_right: int,
                          lower_idx_left: int, lower_idx_right: int,
                          ratio: float,
                          threshold: float = TORSO_VISIBILITY_THRESHOLD) -> tuple[dict | None, dict | None]:
    """Estimate a torso cross-section by interpolating between upper and lower landmarks."""
    try:
        left_upper = landmarks[upper_idx_left]
        right_upper = landmarks[upper_idx_right]
        left_lower = landmarks[lower_idx_left]
        right_lower = landmarks[lower_idx_right]

        required = [left_upper, right_upper, left_lower, right_lower]
        if any(p.get('visibility', 0.0) < threshold for p in required):
            return None, None

        left_point = interpolate_landmark(left_upper, left_lower, ratio)
        right_point = interpolate_landmark(right_upper, right_lower, ratio)
        return left_point, right_point
    except Exception:
        return None, None


def calculate_scale_cm_per_pixel(pixel_height: float, user_height_cm: float) -> float:
    """Convert a user height and body height in pixels into cm-per-pixel scale."""
    if pixel_height <= 0 or user_height_cm <= 0:
        return 0.0
    return user_height_cm / pixel_height


def apply_measurement_confidence_filter(measurements: dict, confidence: dict,
                                        warnings: list[str]) -> tuple[dict, list[str]]:
    """Zero-out measurements that do not meet the minimum confidence threshold."""
    filtered = dict(measurements)
    excluded = []
    for key in filtered.keys():
        score = confidence.get(key, 0.0)
        if score < MEASUREMENT_CONFIDENCE_THRESHOLD:
            if filtered.get(key, 0.0) > 0:
                warnings.append(f"{key.replace('_', ' ')} excluded due to low confidence")
            filtered[key] = 0.0
            excluded.append(key)
    return filtered, excluded


def log_measurement_debug(debug_info: dict) -> None:
    """Emit structured debug information for measurement runs."""
    print("[measurement_pipeline]", debug_info)


def calculate_pixel_height(landmarks: list, image_shape: tuple) -> float:
    """
    Calculate body height in pixels from visible head-to-foot landmarks.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)

    Returns:
        Height in pixels
    """
    if not landmarks or len(landmarks) < 29:
        return 0.0

    try:
        visible_head = get_visible_landmarks(landmarks, HEAD_LANDMARK_INDICES)
        visible_feet = get_visible_landmarks(landmarks, FOOT_LANDMARK_INDICES)

        if not visible_head or not visible_feet:
            return estimate_torso_pixel_height(landmarks, image_shape)

        head_y = min(landmark["y"] for _, landmark in visible_head)
        foot_y = max(landmark["y"] for _, landmark in visible_feet)
        pixel_height = (foot_y - head_y) * image_shape[0]

        return max(0.0, pixel_height) if pixel_height > 0 else estimate_torso_pixel_height(landmarks, image_shape)
    except Exception:
        return estimate_torso_pixel_height(landmarks, image_shape)


def measure_from_ratio(pixel_distance: float, pixel_height: float,
                       user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Convert pixel measurement to cm using ratio normalization.

    measurement_cm = (body_part_px / height_px) * user_height_cm

    This makes measurements independent of distance.

    Args:
        pixel_distance: Measurement in pixels
        pixel_height: Total body height in pixels
        user_height_cm: User's actual height in cm

    Returns:
        Measurement in cm
    """
    if pixel_height <= 0:
        return 0.0

    ratio = pixel_distance / pixel_height
    return ratio * user_height_cm


def calculate_height(landmarks: list, image_shape: tuple) -> float:
    """
    Calculate body height from pose landmarks.

    Uses min/max Y from ALL visible landmarks (robust to pose/tilt).

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image

    Returns:
        Estimated height in cm
    """
    if not landmarks or len(landmarks) < 29:
        return DEFAULT_USER_HEIGHT_CM

    try:
        # Collect all landmarks with visibility > 0.5
        visible_y_values = []
        for landmark in landmarks:
            if landmark.get('visibility', 0) > 0.5:
                visible_y_values.append(landmark['y'])

        if not visible_y_values:
            return DEFAULT_USER_HEIGHT_CM

        min_y = min(visible_y_values)
        max_y = max(visible_y_values)
        pixel_height = (max_y - min_y) * image_shape[0]

        return max(0, pixel_height)
    except Exception:
        return DEFAULT_USER_HEIGHT_CM


def validate_shoulders(landmarks: list, image_shape: tuple = None) -> tuple[bool, str]:
    """
    Validate shoulders for measurement quality.

    Requirements:
    - Both shoulders visibility > 0.6
    - Horizontal distance > 0.05 (normalized)

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (unused, kept for API consistency)

    Returns:
        Tuple of (is_valid, reason)
    """
    if not landmarks or len(landmarks) < 13:
        return False, "insufficient_landmarks"

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        # Check visibility
        left_visibility = left_shoulder.get('visibility', 0)
        right_visibility = right_shoulder.get('visibility', 0)

        if left_visibility <= LANDMARK_CONFIDENCE_THRESHOLD:
            return False, "left_shoulder_low_visibility"
        if right_visibility <= LANDMARK_CONFIDENCE_THRESHOLD:
            return False, "right_shoulder_low_visibility"

        # Check horizontal distance
        delta_x = abs(right_shoulder['x'] - left_shoulder['x'])
        if delta_x <= 0.05:
            return False, "shoulders_too_close"

        return True, "valid"
    except Exception:
        return False, "validation_error"


def calculate_shoulder_width(landmarks: list, image_shape: tuple,
                              pixel_height: float, user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> tuple[float, bool]:
    """
    Calculate shoulder width from pose landmarks.

    Uses Euclidean distance between left and right shoulders,
    converts using ratio-based normalization.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        pixel_height: Body height in pixels (from calculate_height)
        user_height_cm: User's actual height in cm

    Returns:
        Tuple of (shoulder_width_cm, is_valid)
    """
    if not landmarks or len(landmarks) < 13:
        return 0.0, False

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        # Check confidence
        if left_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD or \
           right_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD:
            return 0.0, False

        scale_cm_per_pixel = calculate_scale_cm_per_pixel(pixel_height, user_height_cm)
        if scale_cm_per_pixel <= 0:
            return 0.0, False

        shoulder_px = horizontal_distance_px(left_shoulder, right_shoulder, image_shape)
        shoulder_cm = shoulder_px * scale_cm_per_pixel

        return shoulder_cm if shoulder_cm > 0 else 0.0, shoulder_cm > 0
    except Exception:
        return 0.0, False


def calculate_chest(landmarks: list, image_shape: tuple, pixel_height: float,
                    user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> tuple[float, bool]:
    """
    Calculate chest circumference from pose landmarks.

    Uses shoulder width with empirical circumference conversion.
    chest_px ≈ shoulder_px (same or slightly larger)

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        pixel_height: Body height in pixels
        user_height_cm: User's actual height in cm

    Returns:
        Tuple of (chest_cm, is_valid)
    """
    if not landmarks or len(landmarks) < 13 or pixel_height <= 0:
        return 0.0, False

    try:
        scale_cm_per_pixel = calculate_scale_cm_per_pixel(pixel_height, user_height_cm)
        if scale_cm_per_pixel <= 0:
            return 0.0, False

        left_chest, right_chest = get_body_width_points(
            landmarks, 11, 12, 23, 24, CHEST_LINE_RATIO, threshold=TORSO_VISIBILITY_THRESHOLD
        )
        if left_chest and right_chest:
            chest_px = horizontal_distance_px(left_chest, right_chest, image_shape)
        else:
            left_shoulder = landmarks[11]
            right_shoulder = landmarks[12]
            if left_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD or \
               right_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD:
                return 0.0, False
            shoulder_px = horizontal_distance_px(left_shoulder, right_shoulder, image_shape)
            chest_px = shoulder_px * AVERAGE_HUMAN_RATIOS['chest_to_shoulder_ratio']

        chest_width_cm = chest_px * scale_cm_per_pixel
        chest_cm = chest_width_cm * CHEST_CIRCUMFERENCE_FACTOR

        return chest_cm if chest_cm > 0 else 0.0, chest_cm > 0
    except Exception:
        return 0.0, False


def calculate_waist(landmarks: list, image_shape: tuple, pixel_height: float,
                    user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> tuple[float, bool]:
    """
    Calculate waist measurement from pose landmarks using shoulder-hip interpolation.

    Waist is estimated as the average of shoulder and hip width, multiplied by 0.9.
    This reduces shoulder dependency and provides more accurate estimation.

    Uses hip visibility for visibility check (NOT distance).

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        pixel_height: Body height in pixels
        user_height_cm: User's actual height in cm

    Returns:
        Tuple of (waist_cm, is_visible)
    """
    if not landmarks or len(landmarks) < 25 or pixel_height <= 0:
        return 0.0, False

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        if left_hip.get('visibility', 0) < TORSO_VISIBILITY_THRESHOLD or \
           right_hip.get('visibility', 0) < TORSO_VISIBILITY_THRESHOLD:
            return 0.0, False

        if left_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD or \
           right_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD:
            return 0.0, False

        scale_cm_per_pixel = calculate_scale_cm_per_pixel(pixel_height, user_height_cm)
        if scale_cm_per_pixel <= 0:
            return 0.0, False

        left_waist = interpolate_landmark(left_shoulder, left_hip, WAIST_LINE_RATIO)
        right_waist = interpolate_landmark(right_shoulder, right_hip, WAIST_LINE_RATIO)
        waist_px = horizontal_distance_px(left_waist, right_waist, image_shape)
        waist_width_cm = waist_px * scale_cm_per_pixel
        waist_cm = waist_width_cm * WAIST_CIRCUMFERENCE_FACTOR

        return waist_cm if waist_cm > 0 else 0.0, waist_cm > 0
    except Exception:
        return 0.0, False


def calculate_hips(landmarks: list, image_shape: tuple, pixel_height: float,
                   user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> tuple[float, bool]:
    """
    Calculate hips measurement from pose landmarks.

    Uses hip landmarks with empirical circumference conversion.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        pixel_height: Body height in pixels
        user_height_cm: User's actual height in cm

    Returns:
        Tuple of (hips_cm, is_valid)
    """
    if not landmarks or len(landmarks) < 25 or pixel_height <= 0:
        return 0.0, False

    try:
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        # Check visibility
        if left_hip.get('visibility', 0) < TORSO_VISIBILITY_THRESHOLD or \
           right_hip.get('visibility', 0) < TORSO_VISIBILITY_THRESHOLD:
            return 0.0, False

        scale_cm_per_pixel = calculate_scale_cm_per_pixel(pixel_height, user_height_cm)
        if scale_cm_per_pixel <= 0:
            return 0.0, False

        hips_px = horizontal_distance_px(left_hip, right_hip, image_shape)
        hips_width_cm = hips_px * scale_cm_per_pixel
        hips_cm = hips_width_cm * HIP_CIRCUMFERENCE_FACTOR

        return hips_cm if hips_cm > 0 else 0.0, hips_cm > 0
    except Exception:
        return 0.0, False


def is_front_view(landmarks: list) -> bool:
    """
    STEP 6: Front view validation.

    Validates front view using x/y ratio instead of z (which is noisy in MediaPipe).

    Requirements:
    - Horizontal shoulder distance > 0.15 (normalized)
    - Vertical shoulder distance < 0.1 (normalized)

    This ensures we're looking at a front view, not a side view.

    Args:
        landmarks: List of body landmarks

    Returns:
        True if front view, False if side view
    """
    if not landmarks or len(landmarks) < 13:
        return False

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        delta_x = abs(right_shoulder['x'] - left_shoulder['x'])
        delta_y = abs(right_shoulder['y'] - left_shoulder['y'])

        return delta_x > 0.15 and delta_y < 0.1
    except Exception:
        return False


def fuse_measurements(measurements_by_angle: dict) -> tuple[dict, dict]:
    """
    STEP 7: Multi-angle fusion.

    Collects values from all valid images, removes outliers outside ±20% of median,
    returns median of filtered values.

    Args:
        measurements_by_angle: {
            'front': {'height': 170, 'chest': 100, 'waist': 80, 'shoulder_width': 45, 'hips': 95},
            'left': {...},
            'right': {...},
            'back': {...}
        }

    Returns:
        Tuple of (fused_measurements, debug_info)
    """
    fused = {}
    debug = {
        'valid_angles_used': 0,
        'rejected_angles': [],
        'angles_per_measurement': {}
    }

    measurement_keys = ['height', 'chest', 'waist', 'hips', 'shoulder_width']
    valid_angles = []

    for angle, measurements in measurements_by_angle.items():
        if measurements and any(measurements.get(k, 0) > 0 for k in measurement_keys):
            valid_angles.append(angle)

    debug['valid_angles_used'] = len(valid_angles)

    for measurement in measurement_keys:
        values = []
        angles_used = []

        for angle in valid_angles:
            measurements = measurements_by_angle.get(angle, {})
            value = measurements.get(measurement, 0)
            if value > 0:
                values.append(value)
                angles_used.append(angle)

        if len(values) >= MIN_ANGLES_FOR_AVG:
            # STEP 7: Remove outliers outside ±20% of median
            sorted_values = sorted(values)
            median = sorted_values[len(sorted_values) // 2]

            # Filter values within ±20% of median
            filtered = [v for v in values
                      if abs(v - median) / median <= OUTLIER_THRESHOLD_PCT]

            if filtered:
                fused[measurement] = round(sum(filtered) / len(filtered), 1)
            else:
                fused[measurement] = round(median, 1)

            debug['angles_per_measurement'][measurement] = angles_used
        elif values:
            fused[measurement] = round(values[0], 1)
            debug['angles_per_measurement'][measurement] = angles_used
        else:
            fused[measurement] = 0.0

    # Track rejected angles
    all_angles = set(measurements_by_angle.keys())
    debug['rejected_angles'] = list(all_angles - set(valid_angles))

    # Consistency check: if variation > 25%, mark confidence as low
    consistency = {}
    for measurement in measurement_keys:
        values = []
        for angle, measurements in measurements_by_angle.items():
            value = measurements.get(measurement, 0)
            if value > 0:
                values.append(value)

        if len(values) >= 2:
            mean_val = sum(values) / len(values)
            max_dev = max(abs(v - mean_val) / mean_val for v in values)
            consistency[measurement] = 'low' if max_dev > CONSISTENCY_THRESHOLD else 'high'
        else:
            consistency[measurement] = 'medium'

    debug['consistency'] = consistency

    return fused, debug


def calculate_hips_old(landmarks: list, image_shape: tuple, shoulder_width: float) -> float:
    """
    Calculate hip measurement from pose landmarks.

    Uses hip landmarks and average proportions.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        shoulder_width: Calculated shoulder width in cm

    Returns:
        Hip measurement in cm
    """
    if not landmarks or len(landmarks) < 25:
        return 0.0

    try:
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        # Calculate hip width
        distance = euclidean_distance_2d(left_hip, right_hip)
        hips_pixels = distance * image_shape[1]

        # Convert to cm using ratio
        hips_ratio = AVERAGE_HUMAN_RATIOS['hips_to_shoulder_ratio']
        hips_cm = shoulder_width * hips_ratio

        return hips_cm if hips_cm > 0 else 0.0
    except Exception:
        return 0.0


def calculate_measurements(landmarks_data: dict, image_shape: tuple) -> dict:
    """
    Calculate all body measurements from landmarks.

    Args:
        landmarks_data: Dictionary containing landmarks and image shape
        image_shape: Shape of the original image

    Returns:
        Dictionary with all body measurements
    """
    zero_measurements = {
        'height': 0.0,
        'chest': 0.0,
        'waist': 0.0,
        'hips': 0.0,
        'shoulder_width': 0.0
    }
    result = calculate_measurements_enhanced(landmarks_data, image_shape)
    return result.get('measurements', zero_measurements) if result.get('success') else zero_measurements


# ========== Calibration-based Measurement Functions ==========

def calculate_height_calibrated(landmarks: list, image_shape: tuple, calibration_factor: float) -> float:
    """
    Calculate body height from pose landmarks using calibration.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Pixels per cm (from calibration)

    Returns:
        Real height in cm
    """
    if not landmarks or len(landmarks) < 29 or calibration_factor <= 0:
        return 0.0

    try:
        pixel_height = calculate_pixel_height(landmarks, image_shape)
        height_cm = pixel_height / calibration_factor if calibration_factor > 0 else 0.0
        return height_cm if height_cm > 0 else 0.0
    except Exception:
        return 0.0


def calculate_shoulder_width_calibrated(landmarks: list, image_shape: tuple, calibration_factor: float) -> float:
    """
    Calculate shoulder width from pose landmarks using calibration.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Pixels per cm (from calibration)

    Returns:
        Real shoulder width in cm
    """
    if not landmarks or len(landmarks) < 13 or calibration_factor <= 0:
        return 0.0

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        shoulder_pixels = horizontal_distance_px(left_shoulder, right_shoulder, image_shape)
        shoulder_cm = shoulder_pixels / calibration_factor
        return shoulder_cm if shoulder_cm > 0 else 0.0
    except Exception:
        return 0.0


def calculate_chest_calibrated(landmarks: list, image_shape: tuple, calibration_factor: float) -> float:
    """
    Calculate chest measurement using calibration.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Pixels per cm (from calibration)

    Returns:
        Real chest measurement in cm
    """
    if not landmarks or len(landmarks) < 13 or calibration_factor <= 0:
        return 0.0

    try:
        left_chest, right_chest = get_body_width_points(
            landmarks, 11, 12, 23, 24, CHEST_LINE_RATIO, threshold=TORSO_VISIBILITY_THRESHOLD
        )
        if not left_chest or not right_chest:
            return 0.0

        chest_pixels = horizontal_distance_px(left_chest, right_chest, image_shape)
        chest_cm = (chest_pixels / calibration_factor) * CHEST_CIRCUMFERENCE_FACTOR

        return chest_cm if chest_cm > 0 else 0.0
    except Exception:
        return 0.0


def calculate_waist_calibrated(landmarks: list, image_shape: tuple, calibration_factor: float) -> float:
    """
    Calculate waist measurement using calibration.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Pixels per cm (from calibration)

    Returns:
        Real waist measurement in cm
    """
    if not landmarks or len(landmarks) < 25 or calibration_factor <= 0:
        return 0.0

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        left_waist = interpolate_landmark(left_shoulder, left_hip, WAIST_LINE_RATIO)
        right_waist = interpolate_landmark(right_shoulder, right_hip, WAIST_LINE_RATIO)
        waist_pixels = horizontal_distance_px(left_waist, right_waist, image_shape)
        waist_cm = (waist_pixels / calibration_factor) * WAIST_CIRCUMFERENCE_FACTOR
        return waist_cm if waist_cm > 0 else 0.0
    except Exception:
        return 0.0


def calculate_hips_calibrated(landmarks: list, image_shape: tuple, calibration_factor: float) -> float:
    """
    Calculate hip measurement using calibration.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Pixels per cm (from calibration)

    Returns:
        Real hip measurement in cm
    """
    if not landmarks or len(landmarks) < 25 or calibration_factor <= 0:
        return 0.0

    try:
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        hips_pixels = horizontal_distance_px(left_hip, right_hip, image_shape)
        hips_cm = (hips_pixels / calibration_factor) * HIP_CIRCUMFERENCE_FACTOR
        return hips_cm if hips_cm > 0 else 0.0
    except Exception:
        return 0.0


def calculate_measurements_calibrated(landmarks_data: dict, image_shape: tuple, calibration_factor: float) -> dict:
    """
    Calculate all body measurements from landmarks using calibration.

    Args:
        landmarks_data: Dictionary containing landmarks and image shape
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Pixels per cm (from calibration)

    Returns:
        Dictionary with all body measurements
    """
    zero_measurements = {
        'height': 0.0,
        'chest': 0.0,
        'waist': 0.0,
        'hips': 0.0,
        'shoulder_width': 0.0
    }
    result = calculate_measurements_enhanced(
        landmarks_data,
        image_shape,
        calibration_factor=calibration_factor
    )
    return result.get('measurements', zero_measurements) if result.get('success') else zero_measurements


# ========== Enhanced Measurement Pipeline ==========

def calculate_measurements_enhanced(landmarks_data: dict, image_shape: tuple,
                                     calibration_factor: float = None,
                                     user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> dict:
    """
    Enhanced measurement pipeline with validation, scan classification, and confidence scoring.

    This is the main entry point for robust body measurements.

    Uses ratio-based normalization for distance-independent measurements.

    Args:
        landmarks_data: Dictionary containing 'landmarks' key with landmark list
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Optional calibration factor for accurate measurements
        user_height_cm: User's actual height in cm for ratio-based normalization (default: 170cm)

    Returns:
        Dictionary with:
            - success: bool
            - scan_type: "full_body", "upper_body", or "invalid"
            - measurements: dict with measurements (may be partial for upper_body)
            - confidence: dict with confidence scores
            - warnings: list of warning messages
            - missing_landmarks: list of missing landmark names
            - can_calibrate: bool indicating if calibration was applied
    """
    warnings = []
    empty_confidence = {'height': 0.0, 'chest': 0.0, 'waist': 0.0, 'hips': 0.0, 'shoulder_width': 0.0}

    # Validate input
    if not landmarks_data or 'landmarks' not in landmarks_data:
        return {
            'success': False,
            'scan_type': 'invalid',
            'measurements': {},
            'confidence': empty_confidence,
            'warnings': ['Could not detect body in image'],
            'missing_landmarks': ['insufficient_landmarks'],
            'can_calibrate': False
        }

    landmarks = landmarks_data['landmarks']

    if not landmarks or len(landmarks) < 29:
        return {
            'success': False,
            'scan_type': 'invalid',
            'measurements': {},
            'confidence': empty_confidence,
            'warnings': ['Could not detect body in image. Please ensure the image shows a full body clearly.'],
            'missing_landmarks': ['insufficient_landmarks'],
            'can_calibrate': False
        }

    # Check framing
    framing = check_framing(landmarks, image_shape)
    warnings.extend(framing['warnings'])

    # Classify scan type
    classification = classify_scan_type(landmarks)
    scan_type = classification['scan_type']
    missing_landmarks = classification['missing_landmarks']

    # Handle invalid scan
    if scan_type == 'invalid':
        return {
            'success': False,
            'scan_type': 'invalid',
            'measurements': {},
            'confidence': empty_confidence,
            'warnings': warnings + ['Full body not detected. Please step back and show entire body.'],
            'missing_landmarks': missing_landmarks,
            'can_calibrate': False
        }

    # Check calibration prerequisites
    calib_check = validate_calibration_prerequisites(landmarks)
    can_calibrate = calib_check['can_calibrate']
    if calib_check['warning']:
        warnings.append(calib_check['warning'])

    # Determine if we should use calibration
    use_calibration = calibration_factor is not None and calibration_factor > 0 and can_calibrate

    # Calculate measurements based on scan type
    measurements = {
        'height': 0.0,
        'chest': 0.0,
        'waist': 0.0,
        'hips': 0.0,
        'shoulder_width': 0.0
    }
    pixel_height = 0.0
    scale_cm_per_px = 0.0
    rejected_reasons = []
    debug_keypoints = {}
    debug_keypoint_positions = {}
    debug_pixel_distances = {}
    height_estimation_mode = 'full_body'

    try:
        # Scale is derived directly from visible head-to-foot keypoints.
        has_visible_feet = bool(get_visible_landmarks(landmarks, FOOT_LANDMARK_INDICES))
        pixel_height = calculate_pixel_height(landmarks, image_shape)
        if pixel_height <= 0:
            return {
                'success': False,
                'scan_type': 'invalid',
                'measurements': {},
                'confidence': empty_confidence,
                'warnings': warnings + ['Could not compute body height from head-to-foot landmarks.'],
                'missing_landmarks': missing_landmarks,
                'can_calibrate': False
            }
        if not has_visible_feet:
            height_estimation_mode = 'torso_fallback'
            warnings.append('Using torso-based height estimate because feet were not fully visible.')

        scale_cm_per_px = calculate_scale_cm_per_pixel(pixel_height, user_height_cm)
        if scale_cm_per_px <= 0:
            return {
                'success': False,
                'scan_type': 'invalid',
                'measurements': {},
                'confidence': empty_confidence,
                'warnings': warnings + ['A valid user height is required to scale measurements.'],
                'missing_landmarks': missing_landmarks,
                'can_calibrate': False
            }

        shoulders_valid, shoulder_reason = validate_shoulders(landmarks, image_shape)
        if not shoulders_valid:
            rejected_reasons.append({'angle': 'current', 'reason': shoulder_reason})

        is_front = is_front_view(landmarks)
        if not is_front:
            rejected_reasons.append({'angle': 'current', 'reason': 'not_front_view'})

        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        debug_keypoints = {
            'head': [idx for idx, _ in get_visible_landmarks(landmarks, HEAD_LANDMARK_INDICES)],
            'feet': [idx for idx, _ in get_visible_landmarks(landmarks, FOOT_LANDMARK_INDICES)],
            'shoulders': [11, 12],
            'hips': [23, 24],
        }
        debug_keypoint_positions = {
            'left_shoulder': {'x': round(left_shoulder['x'], 4), 'y': round(left_shoulder['y'], 4)},
            'right_shoulder': {'x': round(right_shoulder['x'], 4), 'y': round(right_shoulder['y'], 4)},
            'left_hip': {'x': round(left_hip['x'], 4), 'y': round(left_hip['y'], 4)},
            'right_hip': {'x': round(right_hip['x'], 4), 'y': round(right_hip['y'], 4)},
        }

        if left_shoulder.get('visibility', 0) >= LANDMARK_CONFIDENCE_THRESHOLD and \
           right_shoulder.get('visibility', 0) >= LANDMARK_CONFIDENCE_THRESHOLD:
            debug_pixel_distances['shoulder_width'] = round(
                horizontal_distance_px(left_shoulder, right_shoulder, image_shape), 2
            )

        if left_hip.get('visibility', 0) >= TORSO_VISIBILITY_THRESHOLD and \
           right_hip.get('visibility', 0) >= TORSO_VISIBILITY_THRESHOLD:
            debug_pixel_distances['hips_width'] = round(
                horizontal_distance_px(left_hip, right_hip, image_shape), 2
            )

        left_chest = right_chest = None

        if all(
            landmark.get('visibility', 0) >= TORSO_VISIBILITY_THRESHOLD
            for landmark in (left_shoulder, right_shoulder, left_hip, right_hip)
        ):
            left_chest = interpolate_landmark(left_shoulder, left_hip, CHEST_LINE_RATIO)
            right_chest = interpolate_landmark(right_shoulder, right_hip, CHEST_LINE_RATIO)
            debug_keypoints['chest'] = ['left_shoulder->left_hip@0.2', 'right_shoulder->right_hip@0.2']
            debug_pixel_distances['chest_width'] = round(
                horizontal_distance_px(left_chest, right_chest, image_shape), 2
            )

            left_waist = interpolate_landmark(left_shoulder, left_hip, WAIST_LINE_RATIO)
            right_waist = interpolate_landmark(right_shoulder, right_hip, WAIST_LINE_RATIO)
            debug_keypoints['waist'] = ['left_shoulder->left_hip@0.55', 'right_shoulder->right_hip@0.55']
            debug_pixel_distances['waist_width'] = round(
                horizontal_distance_px(left_waist, right_waist, image_shape), 2
            )
            debug_keypoint_positions['left_chest'] = {'x': round(left_chest['x'], 4), 'y': round(left_chest['y'], 4)}
            debug_keypoint_positions['right_chest'] = {'x': round(right_chest['x'], 4), 'y': round(right_chest['y'], 4)}
            debug_keypoint_positions['left_waist'] = {'x': round(left_waist['x'], 4), 'y': round(left_waist['y'], 4)}
            debug_keypoint_positions['right_waist'] = {'x': round(right_waist['x'], 4), 'y': round(right_waist['y'], 4)}

        if use_calibration:
            shoulder_width = calculate_shoulder_width_calibrated(landmarks, image_shape, calibration_factor)
            chest = calculate_chest_calibrated(landmarks, image_shape, calibration_factor)
            measurements['shoulder_width'] = round(shoulder_width, 1) if shoulder_width > 0 else 0.0
            measurements['chest'] = round(chest, 1) if chest > 0 else 0.0

            if scan_type == 'full_body':
                calibrated_height = calculate_height_calibrated(landmarks, image_shape, calibration_factor)
                waist = calculate_waist_calibrated(landmarks, image_shape, calibration_factor)
                hips = calculate_hips_calibrated(landmarks, image_shape, calibration_factor)
                measurements['height'] = round(calibrated_height, 1) if calibrated_height > 0 else 0.0
                measurements['waist'] = round(waist, 1) if waist > 0 else 0.0
                measurements['hips'] = round(hips, 1) if hips > 0 else 0.0
        else:
            width_valid = shoulders_valid

            if width_valid:
                shoulder_width, _ = calculate_shoulder_width(
                    landmarks, image_shape, pixel_height, user_height_cm
                )
                measurements['shoulder_width'] = round(shoulder_width, 1) if shoulder_width > 0 else 0.0
            else:
                rejected_reasons.append({'angle': 'current', 'reason': 'width_measurement_invalid'})

            if width_valid:
                chest_cm, _ = calculate_chest(
                    landmarks, image_shape, pixel_height, user_height_cm
                )
                measurements['chest'] = round(chest_cm, 1) if chest_cm > 0 else 0.0

            hips_cm, hips_valid = calculate_hips(
                landmarks, image_shape, pixel_height, user_height_cm
            )
            measurements['hips'] = round(hips_cm, 1) if hips_valid and hips_cm > 0 else 0.0

            if width_valid and hips_valid:
                waist_cm, waist_valid = calculate_waist(
                    landmarks, image_shape, pixel_height, user_height_cm
                )
                measurements['waist'] = round(waist_cm, 1) if waist_valid and waist_cm > 0 else 0.0
            else:
                if not hips_valid:
                    rejected_reasons.append({'angle': 'current', 'reason': 'hips_not_visible'})

            measurements['height'] = round(user_height_cm, 1)

            if not width_valid:
                warnings.append('Width measurements may be unreliable: shoulder validation failed')
            elif not is_front:
                warnings.append('Using non-front torso width estimate; accuracy may be reduced')

    except Exception as e:
        warnings.append(f'Measurement calculation warning: {str(e)}')
        measurements = {}

    confidence = compute_confidence(landmarks, scan_type, use_calibration)
    if measurements.get('shoulder_width', 0) <= 0:
        confidence['shoulder_width'] = 0.0
    if measurements.get('chest', 0) <= 0:
        confidence['chest'] = 0.0
    if measurements.get('waist', 0) <= 0:
        confidence['waist'] = 0.0
    if measurements.get('hips', 0) <= 0:
        confidence['hips'] = 0.0
    if measurements.get('height', 0) > 0 and scan_type == 'upper_body':
        confidence['height'] = max(confidence.get('height', 0.0), TORSO_HEIGHT_CONFIDENCE)

    measurements, excluded_measurements = apply_measurement_confidence_filter(measurements, confidence, warnings)
    reliable_measurements = [
        key for key in RELIABLE_MEASUREMENT_KEYS
        if measurements.get(key, 0) > 0 and confidence.get(key, 0) >= MEASUREMENT_CONFIDENCE_THRESHOLD
    ]

    if len(reliable_measurements) < 2:
        debug_info = {
            'height_px': round(pixel_height, 2),
            'scale_cm_per_px': round(scale_cm_per_px, 4),
            'height_estimation_mode': height_estimation_mode,
            'keypoints_used': debug_keypoints,
            'raw_keypoints': debug_keypoint_positions,
            'pixel_distances': debug_pixel_distances,
            'final_measurements': measurements,
            'reliable_measurements': reliable_measurements,
            'excluded_measurements': excluded_measurements,
            'rejected_angles': rejected_reasons,
        }
        log_measurement_debug(debug_info)
        return {
            'success': False,
            'scan_type': 'invalid',
            'measurements': {},
            'visibility': {
                'waist': False,
                'chest': False,
                'hips': False,
                'shoulders': False
            },
            'confidence': confidence,
            'warnings': warnings + ['Fewer than two reliable measurements were detected. Please retake the scan.'],
            'missing_landmarks': missing_landmarks,
            'can_calibrate': use_calibration,
            'debug': debug_info
        }

    visibility = {
        'waist': measurements.get('waist', 0) > 0,
        'chest': measurements.get('chest', 0) > 0,
        'hips': measurements.get('hips', 0) > 0,
        'shoulders': measurements.get('shoulder_width', 0) > 0
    }

    debug_info = {
        'height_px': round(pixel_height, 2),
        'user_height_cm': user_height_cm,
        'scale_cm_per_px': round(scale_cm_per_px, 4),
        'height_estimation_mode': height_estimation_mode,
        'keypoints_used': debug_keypoints,
        'raw_keypoints': debug_keypoint_positions,
        'pixel_distances': debug_pixel_distances,
        'final_measurements': measurements,
        'reliable_measurements': reliable_measurements,
        'excluded_measurements': excluded_measurements,
        'valid_angles_used': 1 if not rejected_reasons else 0,
        'rejected_angles': rejected_reasons
    }
    log_measurement_debug(debug_info)

    return {
        'success': True if reliable_measurements else False,
        'scan_type': scan_type,
        'measurements': measurements,
        'visibility': visibility,
        'confidence': confidence,
        'warnings': warnings,
        'missing_landmarks': missing_landmarks,
        'can_calibrate': use_calibration,
        'debug': debug_info
    }
