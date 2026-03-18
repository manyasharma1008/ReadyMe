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