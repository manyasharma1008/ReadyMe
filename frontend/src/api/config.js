/**
 * API Configuration
 * Centralized configuration for API endpoints and settings
 */

// Base URL from environment variable - remove trailing slashes for consistency
const getApiBaseUrl = () => {
  const url = (import.meta.env.VITE_API_BASE_URL || '').trim()
  // Remove trailing slashes to ensure consistent URL construction
  return url.replace(/\/+$/, '')
}

export const API_BASE_URL = getApiBaseUrl()

// Validate API_BASE_URL is set in production
if (!API_BASE_URL && import.meta.env.PROD) {
  console.error('ERROR: VITE_API_BASE_URL is not set for production!')
}

// Request timeout - increased to 60s for Render cold starts
export const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '60000', 10)

// Number of retries for failed requests
export const API_RETRIES = parseInt(import.meta.env.VITE_API_RETRIES || '2', 10)

// API Endpoints
export const ENDPOINTS = {
  // Scan endpoints
  SCAN_MEASURE: '/scan/measure',
  SCAN_MEASURE_BASE64: '/scan/measure-base64',
  SCAN_MEASURE_ENHANCED: '/scan/measure-enhanced',

  // Calibrated measurement endpoints (new)
  SCAN_CALIBRATE: '/scan/calibrate',
  SCAN_MEASURE_CALIBRATED: '/scan/measure-calibrated',
  SCAN_MEASURE_MULTIPLE: '/scan/measure-multiple',
  SCAN_VISUALIZE: '/scan/visualize',
  SCAN_CALIBRATE_STATUS: '/scan/calibrate/status',
  SCAN_FRAMING_CHECK: '/scan/framing/check',

  // Size prediction endpoints
  SIZE_PREDICT: '/size/predict',
  SIZE_VALIDATE: '/size/validate',
  SIZE_STANDARD_CHARTS: '/size/standard-charts',
  SIZE_CHART: '/size/chart',
  SIZE_FEEDBACK: '/size/feedback',

  // Profile endpoints
  PROFILE_SAVE: '/profile/save',
  PROFILE_GET: '/profile/get',
  PROFILE_UPDATE: '/profile/update',

  // Product endpoints
  PRODUCT_EXTRACT: '/product/extract',
}

// Default headers for JSON requests
export const DEFAULT_HEADERS = {
  'Accept': 'application/json',
}

// Configuration object
export const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  endpoints: ENDPOINTS,
}
