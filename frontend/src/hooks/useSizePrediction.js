/**
 * useSizePrediction Hook
 * Hook for size prediction based on body measurements
 */

import { useState, useCallback, useEffect } from 'react'
import { predictSize, getSizeChart, getStandardCharts, ApiError } from '../api'

/**
 * Hook for size prediction
 *
 * @param {Object} options - Hook options
 * @param {string} options.defaultCategory - Default category (default: 'shirts')
 * @param {string} options.defaultGender - Default gender (default: 'men')
 * @returns {Object} - Prediction hook state and functions
 */
export function useSizePrediction(options = {}) {
  const {
    defaultCategory = 'shirts',
    defaultGender = 'men',
  } = options

  const [recommendations, setRecommendations] = useState(null)
  const [sizeChart, setSizeChart] = useState(null)
  const [availableCharts, setAvailableCharts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Predict size from measurements
   *
   * @param {Object} measurements - Body measurements
   * @param {Object} predictOptions - Prediction options
   * @returns {Promise<Object|null>} - Recommendations or null on error
   */
  const predict = useCallback(async (measurements, predictOptions = {}) => {
    setLoading(true)
    setError(null)
    setRecommendations(null)

    try {
      const {
        category = defaultCategory,
        gender = defaultGender,
        sizeChart = null,
        useStandardChart = true,
      } = predictOptions

      const response = await predictSize(measurements, {
        category,
        gender,
        sizeChart,
        useStandardChart,
      })

      if (response.success && response.recommendations) {
        setRecommendations(response)
        return response
      }

      const warningMessage = Array.isArray(response?.warnings) && response.warnings.length > 0
        ? response.warnings.join(' ')
        : 'Prediction failed - no recommendations returned'

      throw new ApiError(warningMessage, 400, response)

    } catch (err) {
      const apiError = err instanceof ApiError
        ? err
        : new ApiError(err.message || 'Size prediction failed', 0)

      setError(apiError)
      return null

    } finally {
      setLoading(false)
    }
  }, [defaultCategory, defaultGender])

  /**
   * Load a size chart for a category/gender
   *
   * @param {string} category - Category (shirts, pants, etc.)
   * @param {string} gender - Gender (men, women)
   * @returns {Promise<Object|null>} - Size chart or null on error
   */
  const loadChart = useCallback(async (category = defaultCategory, gender = defaultGender) => {
    setLoading(true)
    setError(null)

    try {
      const chart = await getSizeChart(category, gender)
      setSizeChart(chart)
      return chart

    } catch (err) {
      const apiError = err instanceof ApiError
        ? err
        : new ApiError(err.message || 'Failed to load size chart', 0)

      setError(apiError)
      return null

    } finally {
      setLoading(false)
    }
  }, [defaultCategory, defaultGender])

  /**
   * Load available standard charts
   *
   * @returns {Promise<Object|null>} - Available charts or null on error
   */
  const loadAvailableCharts = useCallback(async () => {
    try {
      const charts = await getStandardCharts()
      setAvailableCharts(charts)
      return charts

    } catch (err) {
      console.error('Failed to load available charts:', err)
      return null
    }
  }, [])

  /**
   * Clear all state
   */
  const clear = useCallback(() => {
    setRecommendations(null)
    setError(null)
  }, [])

  /**
   * Clear only the error
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Computed states
  const isPredicting = loading
  const hasRecommendations = recommendations !== null
  const hasError = error !== null

  return {
    // State
    recommendations,
    sizeChart,
    availableCharts,
    loading,
    error,
    isPredicting,
    hasRecommendations,
    hasError,

    // Actions
    predict,
    loadChart,
    loadAvailableCharts,
    clear,
    clearError,
  }
}

export default useSizePrediction
