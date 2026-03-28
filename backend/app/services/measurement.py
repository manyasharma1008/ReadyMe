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

    # Check full body landmarks
    full_body_set = set(FULL_BODY_LANDMARKS)
    upper_body_set = set(UPPER_BODY_LANDMARKS)

    # Determine scan type based on which landmarks are available
    # Full body requires all FULL_BODY_LANDMARKS
    # Upper body requires only UPPER_BODY_LANDMARKS

    if not full_body_set - missing_set:
        # All full body landmarks missing - check if at least upper body is available
        if not upper_body_set - missing_set:
            return {
                'scan_type': 'invalid',
                'missing_landmarks': validation['missing_names'],
                'validation': validation
            }
        else:
            return {
                'scan_type': 'upper_body',
                'missing_landmarks': validation['missing_names'],
                'validation': validation
            }
    elif not upper_body_set - missing_set:
        # Upper body landmarks are missing
        return {
            'scan_type': 'invalid',
            'missing_landmarks': validation['missing_names'],
            'validation': validation
        }
    else:
        # Upper body available, check if full body is available
        if missing_set - upper_body_set:
            # Has upper body but missing some lower body landmarks
            return {
                'scan_type': 'upper_body',
                'missing_landmarks': validation['missing_names'],
                'validation': validation
            }
        else:
            # All required landmarks present
            return {
                'scan_type': 'full_body',
                'missing_landmarks': [],
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

    validation = validate_landmarks(landmarks, visibility_threshold)
    visibility_scores = validation['visibility_scores']

    if not visibility_scores:
        return confidence

    # Base confidence from average visibility of required landmarks
    if scan_type == 'full_body':
        required = FULL_BODY_LANDMARKS
    else:
        required = UPPER_BODY_LANDMARKS

    vis_values = []
    for idx in required:
        name = LANDMARK_NAMES.get(idx)
        if name and name in visibility_scores:
            vis_values.append(visibility_scores[name])

    base_confidence = sum(vis_values) / len(vis_values) if vis_values else 0.0

    # Symmetry bonus - check left/right consistency
    symmetry_bonus = 0.0
    symmetric_pairs = [
        (11, 12),  # shoulders
        (23, 24),  # hips
        (25, 26),  # knees
        (27, 28)   # ankles
    ]

    for left_idx, right_idx in symmetric_pairs:
        if (left_idx in visibility_scores and right_idx in visibility_scores):
            left_vis = visibility_scores.get(LANDMARK_NAMES.get(left_idx), 0)
            right_vis = visibility_scores.get(LANDMARK_NAMES.get(right_idx), 0)
            symmetry = 1 - abs(left_vis - right_vis)
            symmetry_bonus += symmetry

    symmetry_bonus = symmetry_bonus / len(symmetric_pairs) if symmetric_pairs else 0.0

    # Calibration bonus
    calibration_bonus = 0.1 if has_calibration else 0.0

    # Apply confidence based on scan type and available landmarks
    if scan_type == 'full_body':
        confidence['height'] = min(1.0, base_confidence + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['chest'] = min(1.0, base_confidence + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['waist'] = min(1.0, base_confidence + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['hips'] = min(1.0, base_confidence + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['shoulder_width'] = min(1.0, base_confidence + symmetry_bonus * 0.2 + calibration_bonus)
    elif scan_type == 'upper_body':
        # Only upper body measurements available
        confidence['chest'] = min(1.0, base_confidence + symmetry_bonus * 0.2 + calibration_bonus)
        confidence['shoulder_width'] = min(1.0, base_confidence + symmetry_bonus * 0.2 + calibration_bonus)
        # Height, waist, hips are not available - keep at 0.0

    return confidence


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


def calculate_height(landmarks: list, image_shape: tuple) -> float:
    """
    Calculate body height from pose landmarks.

    Uses the distance between nose and average ankle position.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image

    Returns:
        Estimated height in cm
    """
    # Validate landmarks
    if not landmarks or len(landmarks) < 29:
        return 170.0  # Default fallback height

    try:
        nose = landmarks[0]
        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        # Use ankle average for more accurate bottom reference
        avg_ankle_x = (left_ankle['x'] + right_ankle['x']) / 2
        avg_ankle_y = (left_ankle['y'] + right_ankle['y']) / 2

        # Calculate height in pixels
        height_pixels = math.sqrt(
            (nose['x'] - avg_ankle_x)**2 +
            (nose['y'] - avg_ankle_y)**2
        ) * max(image_shape[0], image_shape[1])

        # Convert to cm using estimated average
        # Assuming average height of 170cm for scaling
        height_cm = height_pixels * 0.5  # Approximate conversion

        # Clamp to reasonable human height range
        return max(120, min(220, height_cm))
    except Exception:
        return 170.0  # Default fallback


def calculate_shoulder_width(landmarks: list, image_shape: tuple) -> float:
    """
    Calculate shoulder width from pose landmarks.

    Uses the distance between left and right shoulders.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image

    Returns:
        Shoulder width in cm
    """
    # Validate landmarks
    if not landmarks or len(landmarks) < 13:
        return 40.0  # Default fallback

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        # Calculate distance in normalized coordinates
        distance = euclidean_distance_2d(left_shoulder, right_shoulder)

        # Convert to pixels
        shoulder_pixels = distance * image_shape[1]

        # Convert to cm using average proportions
        shoulder_cm = shoulder_pixels * 0.4

        return max(25, min(60, shoulder_cm))
    except Exception:
        return 40.0  # Default fallback


def calculate_chest(landmarks: list, image_shape: tuple, shoulder_width: float) -> float:
    """
    Calculate chest circumference from pose landmarks.

    Uses shoulder width ratio and estimated depth.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        shoulder_width: Calculated shoulder width in cm

    Returns:
        Chest measurement in cm
    """
    # Chest is approximately 1.1x shoulder width for average build
    chest_ratio = AVERAGE_HUMAN_RATIOS['chest_to_shoulder_ratio']

    # We estimate based on shoulder width since MediaPipe doesn't give
    # depth information directly
    chest_cm = shoulder_width * chest_ratio

    return max(70, min(140, chest_cm))


def calculate_waist(landmarks: list, image_shape: tuple, shoulder_width: float) -> float:
    """
    Calculate waist measurement from pose landmarks.

    Uses hip landmarks and shoulder width ratio.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        shoulder_width: Calculated shoulder width in cm

    Returns:
        Waist measurement in cm
    """
    # Validate landmarks
    if not landmarks or len(landmarks) < 25:
        return 80.0  # Default fallback

    try:
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        # Calculate waist width from hip landmarks
        distance = euclidean_distance_2d(left_hip, right_hip)
        waist_pixels = distance * image_shape[1]

        # Convert to cm
        waist_cm = waist_pixels * 0.4

        # Apply ratio correction
        waist_ratio = AVERAGE_HUMAN_RATIOS['waist_to_shoulder_ratio']
        waist_cm = shoulder_width * waist_ratio

        return max(50, min(130, waist_cm))
    except Exception:
        return 80.0  # Default fallback


def calculate_hips(landmarks: list, image_shape: tuple, shoulder_width: float) -> float:
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
    # Validate landmarks
    if not landmarks or len(landmarks) < 25:
        return 95.0  # Default fallback

    try:
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        # Calculate hip width
        distance = euclidean_distance_2d(left_hip, right_hip)
        hips_pixels = distance * image_shape[1]

        # Convert to cm using ratio
        hips_ratio = AVERAGE_HUMAN_RATIOS['hips_to_shoulder_ratio']
        hips_cm = shoulder_width * hips_ratio

        return max(60, min(150, hips_cm))
    except Exception:
        return 95.0  # Default fallback


def calculate_measurements(landmarks_data: dict, image_shape: tuple) -> dict:
    """
    Calculate all body measurements from landmarks.

    Args:
        landmarks_data: Dictionary containing landmarks and image shape
        image_shape: Shape of the original image

    Returns:
        Dictionary with all body measurements
    """
    # Validate input
    if not landmarks_data or 'landmarks' not in landmarks_data:
        return {
            'height': 170.0,
            'chest': 95.0,
            'waist': 80.0,
            'hips': 95.0,
            'shoulder_width': 40.0
        }

    landmarks = landmarks_data['landmarks']

    if not landmarks or len(landmarks) < 29:
        return {
            'height': 170.0,
            'chest': 95.0,
            'waist': 80.0,
            'hips': 95.0,
            'shoulder_width': 40.0
        }

    try:
        # Calculate shoulder width first (base measurement)
        shoulder_width = calculate_shoulder_width(landmarks, image_shape)

        # Calculate height
        height = calculate_height(landmarks, image_shape)

        # Calculate other measurements using shoulder width as base
        chest = calculate_chest(landmarks, image_shape, shoulder_width)
        waist = calculate_waist(landmarks, image_shape, shoulder_width)
        hips = calculate_hips(landmarks, image_shape, shoulder_width)

        return {
            'height': round(height, 1),
            'chest': round(chest, 1),
            'waist': round(waist, 1),
            'hips': round(hips, 1),
            'shoulder_width': round(shoulder_width, 1)
        }
    except Exception:
        return {
            'height': 170.0,
            'chest': 95.0,
            'waist': 80.0,
            'hips': 95.0,
            'shoulder_width': 40.0
        }


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
    # Validate landmarks
    if not landmarks or len(landmarks) < 29 or calibration_factor <= 0:
        return 170.0  # Default fallback

    try:
        nose = landmarks[0]
        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        # Use vertical distance (Y-axis) for height (most reliable)
        ankle_y = max(left_ankle['y'], right_ankle['y'])
        pixel_height = (ankle_y - nose['y']) * image_shape[0]

        # Convert to cm using calibration factor
        height_cm = pixel_height / calibration_factor

        # Clamp to reasonable human height range
        return max(120, min(220, height_cm))
    except Exception:
        return 170.0  # Default fallback


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
    # Validate landmarks
    if not landmarks or len(landmarks) < 13 or calibration_factor <= 0:
        return 40.0  # Default fallback

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        # 2D Euclidean distance in normalized coordinates
        distance = euclidean_distance_2d(left_shoulder, right_shoulder)

        # Convert to pixels using image width
        shoulder_pixels = distance * image_shape[1]

        # Convert to cm using calibration factor
        shoulder_cm = shoulder_pixels / calibration_factor

        return max(25, min(60, shoulder_cm))
    except Exception:
        return 40.0  # Default fallback


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
    # Validate input
    if not landmarks or len(landmarks) < 13 or calibration_factor <= 0:
        return 95.0  # Default fallback

    try:
        # Estimate chest as 1.1x shoulder width (for front-facing pose)
        shoulder_width = calculate_shoulder_width_calibrated(landmarks, image_shape, calibration_factor)
        chest_ratio = AVERAGE_HUMAN_RATIOS['chest_to_shoulder_ratio']
        chest_cm = shoulder_width * chest_ratio

        return max(70, min(140, chest_cm))
    except Exception:
        return 95.0  # Default fallback


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
    # Validate landmarks
    if not landmarks or len(landmarks) < 25 or calibration_factor <= 0:
        return 80.0  # Default fallback

    try:
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        # Calculate waist width from hip landmarks
        distance = euclidean_distance_2d(left_hip, right_hip)
        waist_pixels = distance * image_shape[1]

        # Convert to cm using calibration factor
        waist_cm = waist_pixels / calibration_factor

        return max(50, min(130, waist_cm))
    except Exception:
        return 80.0  # Default fallback


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
    # Validate landmarks
    if not landmarks or len(landmarks) < 25 or calibration_factor <= 0:
        return 95.0  # Default fallback

    try:
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        # Calculate hip width
        distance = euclidean_distance_2d(left_hip, right_hip)
        hips_pixels = distance * image_shape[1]

        # Convert to cm using calibration factor
        hips_cm = hips_pixels / calibration_factor

        return max(60, min(150, hips_cm))
    except Exception:
        return 95.0  # Default fallback


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
    # Validate input
    if not landmarks_data or 'landmarks' not in landmarks_data:
        return {
            'height': 170.0,
            'chest': 95.0,
            'waist': 80.0,
            'hips': 95.0,
            'shoulder_width': 40.0
        }

    landmarks = landmarks_data['landmarks']

    if not landmarks or len(landmarks) < 29 or calibration_factor <= 0:
        return {
            'height': 170.0,
            'chest': 95.0,
            'waist': 80.0,
            'hips': 95.0,
            'shoulder_width': 40.0
        }

    try:
        # Calculate all measurements using calibration
        height = calculate_height_calibrated(landmarks, image_shape, calibration_factor)
        shoulder_width = calculate_shoulder_width_calibrated(landmarks, image_shape, calibration_factor)
        chest = calculate_chest_calibrated(landmarks, image_shape, calibration_factor)
        waist = calculate_waist_calibrated(landmarks, image_shape, calibration_factor)
        hips = calculate_hips_calibrated(landmarks, image_shape, calibration_factor)

        return {
            'height': round(height, 1),
            'chest': round(chest, 1),
            'waist': round(waist, 1),
            'hips': round(hips, 1),
            'shoulder_width': round(shoulder_width, 1)
        }
    except Exception:
        return {
            'height': 170.0,
            'chest': 95.0,
            'waist': 80.0,
            'hips': 95.0,
            'shoulder_width': 40.0
        }


# ========== Enhanced Measurement Pipeline ==========

def calculate_measurements_enhanced(landmarks_data: dict, image_shape: tuple,
                                     calibration_factor: float = None) -> dict:
    """
    Enhanced measurement pipeline with validation, scan classification, and confidence scoring.

    This is the main entry point for robust body measurements.

    Args:
        landmarks_data: Dictionary containing 'landmarks' key with landmark list
        image_shape: Shape of the original image (height, width, channels)
        calibration_factor: Optional calibration factor for accurate measurements

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
    default_measurements = {
        'height': 170.0,
        'chest': 95.0,
        'waist': 80.0,
        'hips': 95.0,
        'shoulder_width': 40.0
    }

    # Validate input
    if not landmarks_data or 'landmarks' not in landmarks_data:
        return {
            'success': False,
            'scan_type': 'invalid',
            'measurements': default_measurements,
            'confidence': {'height': 0.0, 'chest': 0.0, 'waist': 0.0, 'hips': 0.0, 'shoulder_width': 0.0},
            'warnings': ['Could not detect body in image'],
            'missing_landmarks': ['insufficient_landmarks'],
            'can_calibrate': False
        }

    landmarks = landmarks_data['landmarks']

    if not landmarks or len(landmarks) < 29:
        return {
            'success': False,
            'scan_type': 'invalid',
            'measurements': default_measurements,
            'confidence': {'height': 0.0, 'chest': 0.0, 'waist': 0.0, 'hips': 0.0, 'shoulder_width': 0.0},
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
            'measurements': default_measurements,
            'confidence': {'height': 0.0, 'chest': 0.0, 'waist': 0.0, 'hips': 0.0, 'shoulder_width': 0.0},
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
    measurements = {}

    try:
        if use_calibration:
            # Use calibrated measurements
            shoulder_width = calculate_shoulder_width_calibrated(landmarks, image_shape, calibration_factor)
            measurements['shoulder_width'] = round(shoulder_width, 1)
            measurements['chest'] = round(calculate_chest_calibrated(landmarks, image_shape, calibration_factor), 1)

            if scan_type == 'full_body':
                measurements['height'] = round(calculate_height_calibrated(landmarks, image_shape, calibration_factor), 1)
                measurements['waist'] = round(calculate_waist_calibrated(landmarks, image_shape, calibration_factor), 1)
                measurements['hips'] = round(calculate_hips_calibrated(landmarks, image_shape, calibration_factor), 1)
            else:
                # Upper body only - use fallback for lower body
                measurements['height'] = default_measurements['height']
                measurements['waist'] = default_measurements['waist']
                measurements['hips'] = default_measurements['hips']
                warnings.append('Lower body not visible - height/waist/hips use estimated values')
        else:
            # Use uncalibrated measurements with ratios
            shoulder_width = calculate_shoulder_width(landmarks, image_shape)
            measurements['shoulder_width'] = round(shoulder_width, 1)
            measurements['chest'] = round(calculate_chest(landmarks, image_shape, shoulder_width), 1)

            if scan_type == 'full_body':
                measurements['height'] = round(calculate_height(landmarks, image_shape), 1)
                measurements['waist'] = round(calculate_waist(landmarks, image_shape, shoulder_width), 1)
                measurements['hips'] = round(calculate_hips(landmarks, image_shape, shoulder_width), 1)
            else:
                # Upper body only
                measurements['height'] = default_measurements['height']
                measurements['waist'] = default_measurements['waist']
                measurements['hips'] = default_measurements['hips']
                warnings.append('Lower body not visible - height/waist/hips use estimated values')
    except Exception as e:
        warnings.append(f'Measurement calculation warning: {str(e)}')
        measurements = default_measurements.copy()

    # Compute confidence
    confidence = compute_confidence(landmarks, scan_type, use_calibration)

    return {
        'success': True,
        'scan_type': scan_type,
        'measurements': measurements,
        'confidence': confidence,
        'warnings': warnings,
        'missing_landmarks': missing_landmarks,
        'can_calibrate': use_calibration
    }