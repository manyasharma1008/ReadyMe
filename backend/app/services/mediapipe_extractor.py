import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import os


# Get the absolute path to the assets directory
SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(SERVICE_DIR)
BACKEND_DIR = os.path.dirname(APP_DIR)
ASSETS_DIR = os.path.join(BACKEND_DIR, 'app', 'assets')
MODEL_PATH = os.path.join(ASSETS_DIR, 'pose_landmarker.task')


class BodyLandmarkExtractor:
    """MediaPipe body landmark extraction service."""

    def __init__(self):
        """Initialize MediaPipe Pose solution."""
        try:
            # Create PoseLandmarker from MediaPipe Tasks API
            base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
            options = vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,
                num_poses=1,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            self.pose = vision.PoseLandmarker.create_from_options(options)
            self._initialized = True
        except Exception as e:
            print(f"Failed to initialize MediaPipe: {e}")
            self.pose = None
            self._initialized = False

    def extract_landmarks(self, image: np.ndarray):
        """
        Extract body pose landmarks from an image.

        Args:
            image: Input image as numpy array (RGB)

        Returns:
            Landmark data if body detected, None otherwise
        """
        if self.pose is None:
            return None

        if image is None or image.size == 0:
            return None

        try:
            # Convert to RGB if needed
            if len(image.shape) == 2:
                image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            elif len(image.shape) == 3 and image.shape[2] == 4:
                image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
            elif len(image.shape) != 3 or image.shape[2] != 3:
                return None

            # Create MediaPipe Image from numpy array
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image)

            # Process image with MediaPipe
            results = self.pose.detect(mp_image)

            # Check if any pose was detected
            if not results or not results.pose_landmarks or len(results.pose_landmarks) == 0:
                return None

            # Extract landmark coordinates
            landmarks = []
            for landmark in results.pose_landmarks[0]:
                landmarks.append({
                    'x': landmark.x,
                    'y': landmark.y,
                    'z': landmark.z,
                    'visibility': landmark.visibility
                })

            if len(landmarks) == 0:
                return None

            return {
                'landmarks': landmarks,
                'image_shape': image.shape
            }

        except Exception as e:
            print(f"Landmark extraction error: {e}")
            return None

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
        """
        if not landmarks_data or 'landmarks' not in landmarks_data:
            return None

        landmarks = landmarks_data['landmarks']

        # Check if required landmarks exist
        required_indices = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
        if len(landmarks) < 29:
            return None

        try:
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
        except (IndexError, KeyError):
            return None


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
    extractor = get_extractor()
    return extractor.extract_landmarks(image)