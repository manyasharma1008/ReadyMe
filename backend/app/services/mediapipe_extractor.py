import mediapipe as mp
import numpy as np


class BodyLandmarkExtractor:
    """MediaPipe body landmark extraction service."""

    def __init__(self):
        """Initialize MediaPipe Pose solution."""
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=True,
            model_complexity=2,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.mp_drawing = mp.solutions.drawing_utils

    def extract_landmarks(self, image: np.ndarray):
        """
        Extract body pose landmarks from an image.

        Args:
            image: Input image as numpy array (RGB)

        Returns:
            Landmark data if body detected, None otherwise
        """
        # Convert to RGB if needed
        if len(image.shape) == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
        elif image.shape[2] == 4:
            image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)

        # Process image with MediaPipe
        results = self.pose.process(image)

        if not results.pose_landmarks:
            return None

        # Extract landmark coordinates
        landmarks = []
        for landmark in results.pose_landmarks.landmark:
            landmarks.append({
                'x': landmark.x,
                'y': landmark.y,
                'z': landmark.z,
                'visibility': landmark.visibility
            })

        return {
            'landmarks': landmarks,
            'image_shape': image.shape
        }

    def get_specific_landmarks(self, landmarks_data: dict):
        """
        Extract specific key landmarks needed for measurements.

        Key landmarks:
        - Nose: 0
        - Left shoulder: 11, Right shoulder: 12
        - Left elbow: 13, Right elbow: 14
        - Left wrist: 15, Right wrist: 16
        - Left hip: 23, Right hip: 24
        - Left knee: 25, Right knee: 26
        - Left ankle: 27, Right ankle: 28

        Returns:
            Dictionary of specific landmark coordinates
        """
        landmarks = landmarks_data['landmarks']

        return {
            'nose': landmarks[0],
            'left_shoulder': landmarks[11],
            'right_shoulder': landmarks[12],
            'left_elbow': landmarks[13],
            'right_elbow': landmarks[14],
            'left_wrist': landmarks[15],
            'right_wrist': landmarks[16],
            'left_hip': landmarks[23],
            'right_hip': landmarks[24],
            'left_knee': landmarks[25],
            'right_knee': landmarks[26],
            'left_ankle': landmarks[27],
            'right_ankle': landmarks[28]
        }


# Global extractor instance
_extractor = None


def get_extractor() -> BodyLandmarkExtractor:
    """Get or create the global extractor instance."""
    global _extractor
    if _extractor is None:
        _extractor = BodyLandmarkExtractor()
    return _extractor


def extract_body_landmarks(image: np.ndarray):
    """
    Extract body landmarks from an image.

    Args:
        image: Input image as numpy array

    Returns:
        Landmark data if body detected, None otherwise
    """
    import cv2

    extractor = get_extractor()
    return extractor.extract_landmarks(image)


# Import cv2 for color conversion
import cv2