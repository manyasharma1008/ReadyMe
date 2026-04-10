/**
 * Size API
 * Functions for size prediction and size chart endpoints
 */

import { ENDPOINTS } from './config'
import { apiPost, apiGet } from './client'

/**
 * Predict size based on body measurements
 *
 * @param {Object} measurements - Body measurements
 * @param {number} measurements.height - Height in cm
 * @param {number} measurements.chest - Chest circumference in cm
 * @param {number} measurements.waist - Waist circumference in cm
 * @param {number} measurements.hips - Hip circumference in cm
 * @param {number} measurements.shoulder_width - Shoulder width in cm
 * @param {Object} options - Additional options
 * @param {Object} options.sizeChart - Optional brand-specific size chart
 * @param {boolean} options.useStandardChart - Use standard chart (default: true)
 * @returns {Promise<Object>} - Size prediction response
 */
export async function predictSize(measurements, options = {}) {
  const {
    sizeChart = null,
    useStandardChart = true,
    category = 'shirts',
    gender = 'men'
  } = options

  // Validate measurements - ensure no null/undefined values
  const validMeasurements = {
    height: Number(measurements.height) || 0,
    chest: Number(measurements.chest) || 0,
    waist: Number(measurements.waist) || 0,
    hips: Number(measurements.hips) || 0,
    shoulder_width: Number(measurements.shoulder_width) || 0
  }

  console.log("Predict payload - measurements:", validMeasurements)
  console.log("Predict payload - options:", { category, gender, sizeChart, useStandardChart })

  // Only include category/gender if not using a custom size chart
  const requestBody = {
    measurements: validMeasurements,
    size_chart: sizeChart,
    use_standard_chart: useStandardChart,
    ...(sizeChart ? {} : { category, gender })
  }

  console.log("Predict request body:", JSON.stringify(requestBody))

  return apiPost(ENDPOINTS.SIZE_PREDICT, requestBody)
}

/**
 * Get available standard size charts
 * @returns {Promise<Object>} - Available charts information
 */
export async function getStandardCharts() {
  return apiGet(ENDPOINTS.SIZE_STANDARD_CHARTS)
}

/**
 * Get a specific size chart
 *
 * @param {string} category - Category (shirts, pants, dresses, jackets)
 * @param {string} gender - Gender (men, women)
 * @returns {Promise<Object>} - Size chart data
 */
export async function getSizeChart(category, gender = 'men') {
  const params = new URLSearchParams({ gender })
  return apiGet(`${ENDPOINTS.SIZE_CHART}/${category}?${params.toString()}`)
}

/**
 * Validate if current size matches body measurements
 *
 * @param {Object} measurements - Body measurements
 * @param {string} currentSize - User's current size
 * @param {Object} sizeChart - Size chart to validate against
 * @returns {Promise<Object>} - Validation response
 */
export async function validateSize(measurements, currentSize, sizeChart) {
  return apiPost(ENDPOINTS.SIZE_VALIDATE, {
    measurements,
    current_size: currentSize,
    size_chart: sizeChart,
  })
}

/**
 * Submit fit feedback for model improvement
 *
 * @param {Object} measurements - Body measurements
 * @param {string} category - Garment category
 * @param {string} size - Size worn
 * @param {string} fitRating - Fit rating (too_tight, tight, perfect, loose, too_loose)
 * @returns {Promise<Object>} - Feedback response
 */
export async function submitFitFeedback(measurements, category, size, fitRating) {
  const validRatings = ['too_tight', 'tight', 'perfect', 'loose', 'too_loose']

  if (!validRatings.includes(fitRating)) {
    throw new Error(`Invalid fit rating. Must be one of: ${validRatings.join(', ')}`)
  }

  return apiPost('/size/feedback', {
    measurements,
    category,
    size,
    fit_rating: fitRating,
  })
}
