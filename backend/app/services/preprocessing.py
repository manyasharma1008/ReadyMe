import cv2
import numpy as np


def load_image(image_array: np.ndarray) -> np.ndarray:
    """
    Load and validate an image from numpy array.

    Args:
        image_array: Input image as numpy array

    Returns:
        Validated image array, or None if invalid
    """
    if image_array is None or image_array.size == 0:
        return None

    try:
        # Ensure RGB format
        if len(image_array.shape) == 2:
            # Grayscale to RGB
            return cv2.cvtColor(image_array, cv2.COLOR_GRAY2RGB)
        elif len(image_array.shape) == 3:
            if image_array.shape[2] == 4:
                # RGBA to RGB
                return cv2.cvtColor(image_array, cv2.COLOR_RGBA2RGB)
            elif image_array.shape[2] == 3:
                return image_array
        return None
    except Exception:
        return None


def resize_image(image: np.ndarray, target_size: tuple = (640, 480)) -> np.ndarray:
    """
    Resize image to a consistent size for processing.
    """
    if image is None:
        return None
    try:
        return cv2.resize(image, target_size, interpolation=cv2.INTER_LINEAR)
    except Exception:
        return None


def normalize_image(image: np.ndarray) -> np.ndarray:
    """
    Normalize image brightness and contrast.
    """
    if image is None:
        return None
    try:
        # Convert to LAB color space for better normalization
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l_channel, a, b = cv2.split(lab)

        # Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_channel = clahe.apply(l_channel)

        # Merge channels back
        lab = cv2.merge([l_channel, a, b])
        normalized = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

        return normalized
    except Exception:
        return image


def denoise_image(image: np.ndarray) -> np.ndarray:
    """
    Apply noise reduction to the image.
    """
    if image is None:
        return None
    try:
        return cv2.fastNlMeansDenoisingColored(image, None, 10, 10, 7, 21)
    except Exception:
        return image


def enhance_contrast(image: np.ndarray) -> np.ndarray:
    """
    Enhance image contrast using adaptive histogram equalization.
    """
    if image is None:
        return None
    try:
        # Convert to YCrCb
        ycrcb = cv2.cvtColor(image, cv2.COLOR_RGB2YCrCb)
        y, cr, cb = cv2.split(ycrcb)

        # Equalize Y channel
        y = cv2.equalizeHist(y)

        # Merge and convert back
        ycrcb = cv2.merge([y, cr, cb])
        return cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2RGB)
    except Exception:
        return image


def preprocess_for_mediapipe(image: np.ndarray) -> np.ndarray:
    """
    Prepare image for MediaPipe body tracking.
    """
    if image is None:
        return None

    # Resize to optimal size for MediaPipe
    processed = resize_image(image, (640, 480))
    if processed is None:
        return None

    # Normalize brightness
    processed = normalize_image(processed)

    # Denoise
    processed = denoise_image(processed)

    return processed


def preprocess_image(image_array: np.ndarray) -> np.ndarray:
    """
    Full preprocessing pipeline for body measurement images.

    Args:
        image_array: Raw input image

    Returns:
        Fully preprocessed image, or None if processing fails
    """
    # Load and validate
    image = load_image(image_array)
    if image is None:
        return None

    # Apply preprocessing pipeline
    processed = preprocess_for_mediapipe(image)

    return processed