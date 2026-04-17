/**
 * API Module Index
 * Export all API functions and utilities
 */

// Configuration
export { API_BASE_URL, API_TIMEOUT, ENDPOINTS, API_CONFIG } from './config';

// Client
export {
  ApiError,
  apiClient,
  apiGet,
  apiPost,
  apiPostFormData,
  apiPostText,
} from './client';

// Scan API
export {
  scanImage,
  scanMeasureImage,
  scanMeasureBase64,
  scanMeasureCalibrated,
  scanMeasureMultiple,
  scanMeasureEnhanced,
  visualizeLandmarks,
  getCalibrationStatus,
  checkFraming,
  fileToBase64,
  isValidImageFile,
  getSupportedImageTypes,
} from './scan';

// Preview API
export {
  PREVIEW_VIEWS,
  generateTryOnImages,
  normalizePreviewProduct,
  resolveFitLabel,
  buildPreviewFitContext,
} from './preview';

// Profile API
export {
  saveProfile,
  getProfile,
  updateProfile,
} from './profile';

// Size API
export {
  predictSize,
  getSizeChart,
  getStandardCharts,
  validateSize,
  submitFitFeedback,
} from './size';
