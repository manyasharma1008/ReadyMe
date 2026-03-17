/**
 * Scan API
 * Functions for body scanning and measurement endpoints
 */

import { ENDPOINTS } from './config'
import { apiPostFormData, apiPostText } from './client'

/**
 * Convert a File to base64 string
 * @param {File} file - The file to convert
 * @returns {Promise<string>} - Base64 encoded string
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Scan body image using FormData upload
 * Preferred method for file uploads
 *
 * @param {File} file - Image file to scan
 * @returns {Promise<Object>} - Scan response with measurements
 */
export async function scanMeasureImage(file) {
  const formData = new FormData()
  formData.append('image', file)

  return apiPostFormData(ENDPOINTS.SCAN_MEASURE, formData)
}

/**
 * Scan body image using base64 string
 * Alternative method for camera captures or base64 data
 *
 * @param {string} base64String - Base64 encoded image data
 * @returns {Promise<Object>} - Scan response with measurements
 */
export async function scanMeasureBase64(base64String) {
  return apiPostText(ENDPOINTS.SCAN_MEASURE_BASE64, base64String)
}

/**
 * Scan an image from various sources
 * Automatically selects the best method based on input type
 *
 * @param {File|string} source - File object or base64 string
 * @returns {Promise<Object>} - Scan response with measurements
 */
export async function scanImage(source) {
  if (source instanceof File) {
    return scanMeasureImage(source)
  }

  if (typeof source === 'string') {
    // Check if it's a data URL and extract base64
    const base64 = source.includes(',') ? source.split(',')[1] : source
    return scanMeasureBase64(base64)
  }

  throw new Error('Invalid source: must be File or base64 string')
}

/**
 * Validate if a file is a valid image for scanning
 * @param {File} file - File to validate
 * @returns {boolean} - Whether the file is a valid image
 */
export function isValidImageFile(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  return file && validTypes.includes(file.type)
}

/**
 * Get supported image types for scanning
 * @returns {string[]} - Array of supported MIME types
 */
export function getSupportedImageTypes() {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
}