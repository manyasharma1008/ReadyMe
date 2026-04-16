/**
 * App Context
 * Global state management for ReadyMe application
 */

import { createContext, useContext, useReducer, useCallback } from 'react'

// Initial statekmd
const initialState = {
  // Body measurements from scan
  measurements: null,
  // Size recommendations
  recommendations: null,
  // User preferences
  preferences: {
    gender: 'men',
    category: 'shirts',
  },
  // Scan history (for future use)
  scanHistory: [],
  // Loading states
  isLoading: false,
  // Error states
  error: null,
  // Enhanced scan data
  confidenceScores: null,
  warnings: [],
  scanClassification: null,
}

// Action types
const ActionTypes = {
  SET_MEASUREMENTS: 'SET_MEASUREMENTS',
  SET_RECOMMENDATIONS: 'SET_RECOMMENDATIONS',
  SET_PREFERENCES: 'SET_PREFERENCES',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_MEASUREMENTS: 'CLEAR_MEASUREMENTS',
  CLEAR_RECOMMENDATIONS: 'CLEAR_RECOMMENDATIONS',
  CLEAR_ERROR: 'CLEAR_ERROR',
  RESET_STATE: 'RESET_STATE',
  ADD_TO_HISTORY: 'ADD_TO_HISTORY',
  SET_CONFIDENCE_SCORES: 'SET_CONFIDENCE_SCORES',
  SET_WARNINGS: 'SET_WARNINGS',
  SET_SCAN_CLASSIFICATION: 'SET_SCAN_CLASSIFICATION',
}

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_MEASUREMENTS:
      return {
        ...state,
        measurements: action.payload,
        error: null,
      }

    case ActionTypes.SET_RECOMMENDATIONS:
      return {
        ...state,
        recommendations: action.payload,
        error: null,
      }

    case ActionTypes.SET_PREFERENCES:
      return {
        ...state,
        preferences: {
          ...state.preferences,
          ...action.payload,
        },
      }

    case ActionTypes.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      }

    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      }

    case ActionTypes.CLEAR_MEASUREMENTS:
      return {
        ...state,
        measurements: null,
      }

    case ActionTypes.CLEAR_RECOMMENDATIONS:
      return {
        ...state,
        recommendations: null,
      }

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      }

    case ActionTypes.RESET_STATE:
      return {
        ...initialState,
        preferences: state.preferences, // Preserve preferences
      }

    case ActionTypes.ADD_TO_HISTORY:
      return {
        ...state,
        scanHistory: [
          ...state.scanHistory,
          {
            ...action.payload,
            timestamp: new Date().toISOString(),
          },
        ],
      }

    case ActionTypes.SET_CONFIDENCE_SCORES:
      return {
        ...state,
        confidenceScores: action.payload,
      }

    case ActionTypes.SET_WARNINGS:
      return {
        ...state,
        warnings: action.payload,
      }

    case ActionTypes.SET_SCAN_CLASSIFICATION:
      return {
        ...state,
        scanClassification: action.payload,
      }

    default:
      return state
  }
}

// Create context
const AppContext = createContext(null)

// Provider component
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  // Actions
  const setMeasurements = useCallback((measurements) => {
    dispatch({ type: ActionTypes.SET_MEASUREMENTS, payload: measurements })
  }, [])

  const setRecommendations = useCallback((recommendations) => {
    dispatch({ type: ActionTypes.SET_RECOMMENDATIONS, payload: recommendations })
  }, [])

  const setPreferences = useCallback((preferences) => {
    dispatch({ type: ActionTypes.SET_PREFERENCES, payload: preferences })
  }, [])

  const setLoading = useCallback((isLoading) => {
    dispatch({ type: ActionTypes.SET_LOADING, payload: isLoading })
  }, [])

  const setError = useCallback((error) => {
    dispatch({ type: ActionTypes.SET_ERROR, payload: error })
  }, [])

  const clearMeasurements = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_MEASUREMENTS })
  }, [])

  const clearRecommendations = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_RECOMMENDATIONS })
  }, [])

  const clearError = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_ERROR })
  }, [])

  const resetState = useCallback(() => {
    dispatch({ type: ActionTypes.RESET_STATE })
  }, [])

  const addToHistory = useCallback((scanData) => {
    dispatch({ type: ActionTypes.ADD_TO_HISTORY, payload: scanData })
  }, [])

  const setConfidenceScores = useCallback((scores) => {
    dispatch({ type: ActionTypes.SET_CONFIDENCE_SCORES, payload: scores })
  }, [])

  const setWarnings = useCallback((warnings) => {
    dispatch({ type: ActionTypes.SET_WARNINGS, payload: warnings })
  }, [])

  const setScanClassification = useCallback((classification) => {
    dispatch({ type: ActionTypes.SET_SCAN_CLASSIFICATION, payload: classification })
  }, [])

  // Computed values
  const hasMeasurements = state.measurements !== null
  const hasRecommendations = state.recommendations !== null

  const value = {
    // State
    ...state,
    hasMeasurements,
    hasRecommendations,

    // Actions
    setMeasurements,
    setRecommendations,
    setPreferences,
    setLoading,
    setError,
    clearMeasurements,
    clearRecommendations,
    clearError,
    resetState,
    addToHistory,
    setConfidenceScores,
    setWarnings,
    setScanClassification,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// Custom hook to use the context
export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }

  return context
}

// Convenience hooks for specific state slices
export function useMeasurements() {
  const { measurements, hasMeasurements, setMeasurements, clearMeasurements } = useApp()
  return { measurements, hasMeasurements, setMeasurements, clearMeasurements }
}

export function useRecommendations() {
  const { recommendations, hasRecommendations, setRecommendations, clearRecommendations } = useApp()
  return { recommendations, hasRecommendations, setRecommendations, clearRecommendations }
}

export function usePreferences() {
  const { preferences, setPreferences } = useApp()
  return { preferences, setPreferences }
}

export default AppContext