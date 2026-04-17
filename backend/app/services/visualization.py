"""
Landmark visualization service for body measurements.
Draws landmark markers on the body for visual verification.
"""

import cv2
import numpy as np


def draw_landmark_markers(image: np.ndarray, landmarks: list) -> np.ndarray:
    """
    Draw landmark dots on the body for visual verification.

    Key landmarks to highlight:
    - Nose (0) - RED
    - Shoulders (11, 12) - GREEN
    - Hips (23, 24) - MAGENTA
    - Ankles (27, 28) - YELLOW
    - Knees (25, 26) - CYAN

    Args:
        image: Input image as numpy array
        landmarks: List of body landmarks with x, y, z, visibility

    Returns:
        Image with landmark markers overlaid
    """
    # Validate inputs
    if image is None or image.size == 0:
        return np.zeros((480, 640, 3), dtype=np.uint8)

    if not landmarks or len(landmarks) == 0:
        return image.copy()

    try:
        output = image.copy()
        h, w = image.shape[:2]
    except Exception:
        return np.zeros((480, 640, 3), dtype=np.uint8)

    # Define landmark groups with colors
    # Format: (indices, color in BGR)
    landmark_groups = [
        ([0], (255, 0, 0)),           # Nose - Red
        ([11, 12], (0, 255, 0)),      # Shoulders - Green
        ([23, 24], (255, 0, 255)),    # Hips - Magenta
        ([27, 28], (0, 255, 255)),    # Ankles - Yellow
        ([25, 26], (255, 255, 0)),    # Knees - Cyan
        ([13, 14], (128, 0, 128)),    # Elbows - Purple
        ([15, 16], (0, 128, 128)),    # Wrists - Teal
    ]

    for indices, color in landmark_groups:
        for idx in indices:
            if idx < len(landmarks):
                lm = landmarks[idx]
                # Skip if visibility is too low
                visibility = lm.get('visibility', 1.0)
                if visibility < 0.6:
                    continue
                x, y = int(lm['x'] * w), int(lm['y'] * h)
                # Draw filled circle
                cv2.circle(output, (x, y), 8, color, -1)
                # Draw outer ring
                cv2.circle(output, (x, y), 12, color, 2)

    # Draw measurement lines (with bounds + visibility check)
    def get_landmark(idx):
        if idx >= len(landmarks):
            return None
        lm = landmarks[idx]
        if lm.get('visibility', 1.0) < 0.6:
            return None
        return lm

    # Shoulder line (GREEN)
    left_shoulder = get_landmark(11)
    right_shoulder = get_landmark(12)
    if left_shoulder and right_shoulder:
        cv2.line(output,
                 (int(left_shoulder['x'] * w), int(left_shoulder['y'] * h)),
                 (int(right_shoulder['x'] * w), int(right_shoulder['y'] * h)),
                 (0, 255, 0), 3)

    # Hip line (MAGENTA)
    left_hip = get_landmark(23)
    right_hip = get_landmark(24)
    if left_hip and right_hip:
        cv2.line(output,
                 (int(left_hip['x'] * w), int(left_hip['y'] * h)),
                 (int(right_hip['x'] * w), int(right_hip['y'] * h)),
                 (255, 0, 255), 3)

    # Vertical center line (WHITE) - from nose to between ankles
    nose = get_landmark(0)
    left_ankle = get_landmark(27)
    right_ankle = get_landmark(28)
    if nose and left_ankle and right_ankle:
        center_x = int((left_ankle['x'] + right_ankle['x']) / 2 * w)
        cv2.line(output,
                 (int(nose['x'] * w), int(nose['y'] * h)),
                 (center_x, int((left_ankle['y'] + right_ankle['y']) / 2 * h)),
                 (255, 255, 255), 1)

    return output


def draw_body_outline(image: np.ndarray, landmarks: list) -> np.ndarray:
    """
    Draw a simplified body outline connecting key landmarks.

    Args:
        image: Input image as numpy array
        landmarks: List of body landmarks

    Returns:
        Image with body outline
    """
    # Validate inputs
    if image is None or image.size == 0:
        return np.zeros((480, 640, 3), dtype=np.uint8)

    if not landmarks or len(landmarks) == 0:
        return image.copy()

    try:
        output = image.copy()
        h, w = image.shape[:2]
    except Exception:
        return image.copy()

    # Define connections for body outline
    connections = [
        # Torso
        (11, 12),   # Shoulder to shoulder
        (23, 24),   # Hip to hip
        (11, 23),   # Left shoulder to left hip
        (12, 24),   # Right shoulder to right hip
        # Left arm
        (11, 13),   # Shoulder to elbow
        (13, 15),   # Elbow to wrist
        # Right arm
        (12, 14),   # Shoulder to elbow
        (14, 16),   # Elbow to wrist
        # Left leg
        (23, 25),   # Hip to knee
        (25, 27),   # Knee to ankle
        # Right leg
        (24, 26),   # Hip to knee
        (26, 28),   # Knee to ankle
    ]

    for start_idx, end_idx in connections:
        if start_idx < len(landmarks) and end_idx < len(landmarks):
            start_lm = landmarks[start_idx]
            end_lm = landmarks[end_idx]
            # Skip if either landmark has low visibility
            if start_lm.get('visibility', 1.0) < 0.6 or end_lm.get('visibility', 1.0) < 0.6:
                continue
            cv2.line(output,
                     (int(start_lm['x'] * w), int(start_lm['y'] * h)),
                     (int(end_lm['x'] * w), int(end_lm['y'] * h)),
                     (0, 255, 255), 2)

    return output


def draw_calibration_info(image: np.ndarray, calibration_factor: float = None, user_height: float = None) -> np.ndarray:
    """
    Draw calibration information on the image.

    Args:
        image: Input image as numpy array
        calibration_factor: Current calibration factor (pixels per cm)
        user_height: User's input height in cm

    Returns:
        Image with calibration info overlaid
    """
    output = image.copy()

    # Background for text
    h, w = image.shape[:2]
    cv2.rectangle(output, (10, 10), (350, 80), (0, 0, 0), -1)

    # Text settings
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.5
    color = (255, 255, 255)
    thickness = 1

    # Draw calibration info
    y_offset = 30
    if calibration_factor is not None:
        cv2.putText(output, f"Calibration: {calibration_factor:.2f} px/cm",
                    (20, y_offset), font, font_scale, color, thickness)
    else:
        cv2.putText(output, "Calibration: Not set",
                    (20, y_offset), font, font_scale, (255, 100, 100), thickness)

    y_offset = 55
    if user_height is not None:
        cv2.putText(output, f"User Height: {user_height} cm",
                    (20, y_offset), font, font_scale, color, thickness)
    else:
        cv2.putText(output, "User Height: Not provided",
                    (20, y_offset), font, font_scale, (255, 100, 100), thickness)

    return output


def create_visualization(image: np.ndarray, landmarks: list,
                          calibration_factor: float = None,
                          user_height: float = None,
                          show_outline: bool = True,
                          show_info: bool = True) -> np.ndarray:
    """
    Create a complete visualization with landmarks, body outline, and calibration info.

    Args:
        image: Input image as numpy array
        landmarks: List of body landmarks
        calibration_factor: Current calibration factor
        user_height: User's input height in cm
        show_outline: Whether to draw body outline
        show_info: Whether to show calibration info

    Returns:
        Fully annotated image
    """
    # Validate inputs - return original image if invalid
    if image is None or image.size == 0:
        return np.zeros((480, 640, 3), dtype=np.uint8)

    if not landmarks or len(landmarks) == 0:
        return image.copy()

    try:
        output = image.copy()

        # Draw landmark markers
        output = draw_landmark_markers(output, landmarks)

        # Draw body outline
        if show_outline:
            output = draw_body_outline(output, landmarks)

        # Draw calibration info
        if show_info:
            output = draw_calibration_info(output, calibration_factor, user_height)

        return output
    except Exception:
        # Return original image on any error
        return image.copy()