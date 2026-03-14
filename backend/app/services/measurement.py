import numpy as np
import math


# Average human proportions for scaling (in cm)
# These ratios are used to convert pixel measurements to cm
AVERAGE_HUMAN_RATIOS = {
    'height_to_shoulder_ratio': 4.5,  # Total height is ~4.5x shoulder width
    'chest_to_shoulder_ratio': 1.1,   # Chest width is ~1.1x shoulder width
    'waist_to_shoulder_ratio': 0.85,   # Waist width is ~0.85x shoulder width
    'hips_to_shoulder_ratio': 1.05,    # Hips width is ~1.05x shoulder width
}


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
    # This will be refined once we have more context
    height_cm = height_pixels * 0.5  # Approximate conversion

    # Clamp to reasonable human height range
    return max(120, min(220, height_cm))


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
    left_shoulder = landmarks[11]
    right_shoulder = landmarks[12]

    # Calculate distance in normalized coordinates
    distance = euclidean_distance_2d(left_shoulder, right_shoulder)

    # Convert to pixels
    shoulder_pixels = distance * image_shape[1]

    # Convert to cm using average proportions
    # Shoulder width typically ~38-45cm for adults
    shoulder_cm = shoulder_pixels * 0.4

    return max(25, min(60, shoulder_cm))


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
    left_hip = landmarks[23]
    right_hip = landmarks[24]

    # Calculate hip width
    distance = euclidean_distance_2d(left_hip, right_hip)
    hips_pixels = distance * image_shape[1]

    # Convert to cm using ratio
    hips_ratio = AVERAGE_HUMAN_RATIOS['hips_to_shoulder_ratio']
    hips_cm = shoulder_width * hips_ratio

    return max(60, min(150, hips_cm))


def calculate_measurements(landmarks_data: dict, image_shape: tuple) -> dict:
    """
    Calculate all body measurements from landmarks.

    Args:
        landmarks_data: Dictionary containing landmarks and image shape
        image_shape: Shape of the original image

    Returns:
        Dictionary with all body measurements
    """
    landmarks = landmarks_data['landmarks']

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