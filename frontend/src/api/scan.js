import { ENDPOINTS } from "./config";
import { apiPost, apiPostFormData } from "./client";

/**
 * Convert a File to base64 string
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Scan image using FormData (file upload)
 */
export async function scanMeasureImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  return apiPostFormData(ENDPOINTS.SCAN_MEASURE, formData);
}

/**
 * Scan image using base64 string
 */
export async function scanMeasureBase64(base64String) {
  return apiPost(ENDPOINTS.SCAN_MEASURE_BASE64, {
    image_data: base64String,
  });
}

/**
 * Scan image - auto-detects source type (File or base64 string)
 */
export async function scanImage(source) {
  if (source instanceof File) {
    return scanMeasureImage(source);
  }

  if (typeof source === "string") {
    const base64 = source.includes(",") ? source.split(",")[1] : source;
    return scanMeasureBase64(base64);
  }

  throw new Error("Invalid source: must be File or base64 string");
}

/**
 * Scan image with calibration (using user's known height)
 * This provides more accurate measurements
 */
export async function scanMeasureCalibrated(base64String, userHeightCm) {
  const base64 = base64String.includes(",") ? base64String.split(",")[1] : base64String;
  return apiPost(ENDPOINTS.SCAN_MEASURE_CALIBRATED, {
    image_data: base64,
    user_height_cm: userHeightCm,
  });
}

/**
 * Scan multiple images (front, back, left, right) at once
 * Returns array of images with their landmarks
 */
export async function scanMeasureMultiple(images, userHeightCm = null) {
  // images should be an object with keys: front, back, left, right
  const imagesData = {};
  for (const [key, value] of Object.entries(images)) {
    if (value) {
      imagesData[key] = value.includes(",") ? value.split(",")[1] : value;
    }
  }

  return apiPost(ENDPOINTS.SCAN_MEASURE_MULTIPLE, {
    images: imagesData,
    user_height_cm: userHeightCm,
  });
}

/**
 * Generate visualization of body landmarks
 */
export async function visualizeLandmarks(base64String, userHeightCm = null, showOutline = true, showInfo = true) {
  const base64 = base64String.includes(",") ? base64String.split(",")[1] : base64String;
  return apiPost(ENDPOINTS.SCAN_VISUALIZE, {
    image_data: base64,
    user_height_cm: userHeightCm,
    show_outline: showOutline,
    show_info: showInfo,
  });
}

/**
 * Get calibration status
 */
export async function getCalibrationStatus() {
  return apiPost(ENDPOINTS.SCAN_CALIBRATE_STATUS, {});
}

/**
 * Validate image file type
 */
export function isValidImageFile(file) {
  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  return file && validTypes.includes(file.type);
}

/**
 * Get supported image MIME types
 */
export function getSupportedImageTypes() {
  return ["image/jpeg", "image/png", "image/webp", "image/jpg"];
}
