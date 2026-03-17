/**
 * API Configuration
 * Centralized configuration for API endpoints and settings
 */

// Base URL from environment variable, fallback to localhost
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Request timeout in milliseconds
export const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000', 10)

// API Endpoints
export const ENDPOINTS = {
  // Scan endpoints
  SCAN_MEASURE: '/scan/measure',
  SCAN_MEASURE_BASE64: '/scan/measure-base64',

  // Size prediction endpoints
  SIZE_PREDICT: '/size/predict',
  SIZE_VALIDATE: '/size/validate',
  SIZE_STANDARD_CHARTS: '/size/standard-charts',
  SIZE_CHART: '/size/chart',

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