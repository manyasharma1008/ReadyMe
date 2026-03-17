/**
 * useApi Hook
 * Generic hook for API calls with loading, error, and data state
 */

import { useState, useCallback } from 'react'

/**
 * Generic API hook for managing async operations
 *
 * @param {Function} apiFunction - The API function to call
 * @param {Object} options - Hook options
 * @returns {Object} - { loading, error, data, execute, reset }
 */
export function useApi(apiFunction, options = {}) {
  const { initialData = null, onSuccess = null, onError = null } = options

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(initialData)

  /**
   * Execute the API call
   * @param {...any} args - Arguments to pass to the API function
   * @returns {Promise<any>} - The API response
   */
  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)

    try {
      const result = await apiFunction(...args)
      setData(result)

      if (onSuccess) {
        onSuccess(result)
      }

      return result
    } catch (err) {
      setError(err)

      if (onError) {
        onError(err)
      }

      throw err
    } finally {
      setLoading(false)
    }
  }, [apiFunction, onSuccess, onError])

  /**
   * Reset the hook state
   */
  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setData(initialData)
  }, [initialData])

  return {
    loading,
    error,
    data,
    execute,
    reset,
  }
}

export default useApi