/**
 * API Client
 * Base fetch wrapper with error handling, timeout support, and FormData handling
 */

import { API_BASE_URL, API_TIMEOUT } from './config'

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, statusCode, details = null) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.details = details
  }

  /**
   * Get user-friendly error message based on status code
   */
  getUserFriendlyMessage() {
    switch (this.statusCode) {
      case 0:
        return 'Network error. Please check your connection.'
      case 400:
      case 422:
        return this.details || 'Invalid request. Please check your input.'
      case 408:
        return 'Request timed out. Please try again.'
      case 404:
        return 'Resource not found.'
      case 500:
        return 'Server error. Please try again later.'
      case 503:
        return 'Service unavailable. Please try again later.'
      default:
        return this.message || 'An unexpected error occurred.'
    }
  }
}

/**
 * Make an API request with timeout and error handling
 *
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options
 * @param {Object} customConfig - Custom configuration
 * @returns {Promise<any>} - Response data
 */
export async function apiClient(endpoint, options = {}, customConfig = {}) {
  const {
    timeout = API_TIMEOUT,
    ...fetchOptions
  } = customConfig

  const url = `${API_BASE_URL}${endpoint}`

  // Create AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      ...options,
      mode: 'cors',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Parse response
    let data
    const contentType = response.headers.get('content-type')

    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    // Handle non-OK responses
    if (!response.ok) {
      const errorMessage = data?.detail || data?.message || `HTTP Error: ${response.status}`
      throw new ApiError(errorMessage, response.status, data?.detail)
    }

    return data

  } catch (error) {
    clearTimeout(timeoutId)

    // Handle AbortError (timeout)
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out', 408)
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network error - unable to connect', 0)
    }

    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error
    }

    // Wrap other errors
    throw new ApiError(error.message || 'Unknown error', 0)
  }
}

/**
 * GET request helper
 */
export async function apiGet(endpoint, params = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value)
    }
  })

  const queryString = searchParams.toString()
  const url = queryString ? `${endpoint}?${queryString}` : endpoint

  return apiClient(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  })
}

/**
 * POST JSON request helper
 */
export async function apiPost(endpoint, data) {
  return apiClient(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

/**
 * POST FormData request helper
 */
export async function apiPostFormData(endpoint, formData) {
  return apiClient(endpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
    },
    body: formData,
  })
}

/**
 * POST plain text request helper (for base64)
 */
export async function apiPostText(endpoint, text) {
  return apiClient(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Accept': 'application/json',
    },
    body: text,
  })
}