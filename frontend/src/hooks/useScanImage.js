/**
 * useScanImage Hook
 * Hook for body scanning with automatic method selection
 */

import { useState, useCallback } from 'react'
import { scanImage, isValidImageFile, ApiError } from '../api'

/**
 * Hook for scanning body images
 *
 * @returns {Object} - Scan hook state and functions
 */
export function useScanImage() {
  const [measurements, setMeasurements] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Scan an image for body measurements
   * Accepts File or base64 string, automatically selects appropriate API
   *
   * @param {File|string} source - Image File or base64 string
   * @returns {Promise<Object|null>} - Measurements or null on error
   */
  const scan = useCallback(async (source) => {
    setLoading(true)
    setError(null)
    setMeasurements(null)

    try {
      // Validate file if it's a File object
      if (source instanceof File && !isValidImageFile(source)) {
        throw new ApiError(
          'Invalid image format. Please use JPEG, PNG, or WebP.',
          400
        )
      }

      const response = await scanImage(source)

      if (response.success && response.measurements) {
        setMeasurements(response.measurements)
        return response.measurements
      }

      throw new ApiError('Scan completed but no measurements returned', 500)

    } catch (err) {
      const apiError = err instanceof ApiError
        ? err
        : new ApiError(err.message || 'Scan failed', 0)

      setError(apiError)
      return null

    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Clear measurements and error state
   */
  const clearMeasurements = useCallback(() => {
    setMeasurements(null)
    setError(null)
  }, [])

  /**
   * Clear only the error
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Computed states
  const isScanning = loading
  const hasMeasurements = measurements !== null
  const hasError = error !== null

  return {
    // State
    measurements,
    loading,
    error,
    isScanning,
    hasMeasurements,
    hasError,

    // Actions
    scan,
    clearMeasurements,
    clearError,
  }
}

export default useScanImage