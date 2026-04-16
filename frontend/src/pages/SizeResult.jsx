import { useEffect, useState, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useApp } from "../context/AppContext"
import { useSizePrediction } from "../hooks"
import { saveProfile } from "../api"
import LoadingSpinner from "../components/common/LoadingSpinner"
import ErrorMessage from "../components/common/ErrorMessage"

function SizeResult() {
//hellosd
  const navigate = useNavigate()
  const {
    measurements,
    setMeasurements,
    preferences,
    setPreferences,
    clearMeasurements,
    confidenceScores,
    warnings,
    scanClassification,
    clearRecommendations
  } = useApp()
  const { recommendations, predict, loading, error, clearError, clear: clearPrediction } = useSizePrediction()

  const [manualInput, setManualInput] = useState(false)
  const [manualMeasurements, setManualMeasurements] = useState({
    height: '',
    chest: '',
    waist: '',
    hips: '',
    shoulder_width: ''
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Track if we've cleaned up recommendations for this manual session
  const hasCleanedUpForManual = useRef(false)
  // Track if we've initialized manual form from existing measurements
  const hasInitializedFromScan = useRef(false)

  // Check if navigated from manual entry
  const location = useLocation()
  const isManualMode = location.state?.manual || manualInput

  // Predict size when measurements are available (skip in manual mode)
  useEffect(() => {
    console.log("SizeResult - measurements:", measurements)
    console.log("SizeResult - preferences:", preferences)

    // Skip automatic prediction in manual mode - user enters their own data
    if (measurements && !recommendations && !isManualMode) {
      // Validate measurements have valid numeric values
      const m = measurements
      const hasValidMeasurements = (
        m && typeof m.height === 'number' && m.height > 0 &&
        typeof m.chest === 'number' && m.chest > 0
      )

      if (hasValidMeasurements) {
        console.log("Calling predict with:", measurements)
        predict(measurements, {
          category: preferences.category || 'shirts',
          gender: preferences.gender || 'men',
        })
      } else {
        console.warn("Invalid measurements - not calling predict:", measurements)
      }
    }
  }, [measurements, recommendations, predict, preferences, isManualMode])

  // Clear stale recommendations once when entering manual mode (not on every recommendation change)
  useEffect(() => {
    if (isManualMode && !hasCleanedUpForManual.current) {
      // Only clear once per manual session
      clearRecommendations()
      clearPrediction()
      hasCleanedUpForManual.current = true
    }
    // Reset cleanup flag when leaving manual mode
    if (!isManualMode) {
      hasCleanedUpForManual.current = false
    }
  }, [isManualMode, clearRecommendations, clearPrediction])

  // Pre-populate manual form when entering edit mode from scan mode
  useEffect(() => {
    // Only initialize when entering manual mode with existing scan measurements
    if (isManualMode && measurements && !hasInitializedFromScan.current) {
      setManualMeasurements({
        height: String(measurements.height || ''),
        chest: String(measurements.chest || ''),
        waist: String(measurements.waist || ''),
        hips: String(measurements.hips || ''),
        shoulder_width: String(measurements.shoulder_width || '')
      })
      hasInitializedFromScan.current = true
    }
    // Reset flag when leaving manual mode
    if (!isManualMode) {
      hasInitializedFromScan.current = false
    }
  }, [isManualMode, measurements])

  // Use measurements from context or manual input
  const displayMeasurements = isManualMode ? manualMeasurements : measurements

  // Handle manual input changes
  const handleManualChange = (field, value) => {
    setManualMeasurements(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Submit manual measurements
  const handleManualSubmit = async () => {
    // Convert string values to numbers, preserving existing values for empty fields
    const numericMeasurements = {
      height: manualMeasurements.height ? parseFloat(manualMeasurements.height) : (measurements?.height || 0),
      chest: manualMeasurements.chest ? parseFloat(manualMeasurements.chest) : (measurements?.chest || 0),
      waist: manualMeasurements.waist ? parseFloat(manualMeasurements.waist) : (measurements?.waist || 0),
      hips: manualMeasurements.hips ? parseFloat(manualMeasurements.hips) : (measurements?.hips || 0),
      shoulder_width: manualMeasurements.shoulder_width ? parseFloat(manualMeasurements.shoulder_width) : (measurements?.shoulder_width || 0)
    }

    // Write to context to establish single source of truth
    setMeasurements(numericMeasurements)

    await predict(numericMeasurements, {
      category: preferences.category,
      gender: preferences.gender,
    })
  }

  // Retry prediction
  const handleRetry = () => {
    clearError()
    if (measurements) {
      predict(measurements, {
        category: preferences.category,
        gender: preferences.gender,
      })
    }
  }

  const handlePreferenceChange = async (field, value) => {
    const nextPreferences = {
      ...preferences,
      [field]: value,
    }

    setPreferences({ [field]: value })
    clearRecommendations()
    clearPrediction()
    clearError()

    if (measurements && !isManualMode) {
      await predict(measurements, {
        category: nextPreferences.category,
        gender: nextPreferences.gender,
      })
    }
  }

  // Scan again
  const handleScanAgain = () => {
    clearMeasurements()
    navigate("/camera")
  }

  // Save measurements to profile
  const handleSaveToProfile = async () => {
    // Use measurements from context (single source of truth after handleManualSubmit writes to it)
    // In scan mode: measurements from scan
    // In manual mode: measurements set by handleManualSubmit
    if (!measurements) return

    // Validate we have numeric values
    const hasValidData = (
      typeof measurements.height === 'number' && measurements.height > 0 &&
      typeof measurements.chest === 'number' && measurements.chest > 0
    )
    if (!hasValidData) return

    setProfileSaving(true)
    try {
      // Use a simple localStorage user ID for now (in production, would use auth)
      const userId = localStorage.getItem('user_id') || 'anonymous'
      await saveProfile(userId, measurements, 'My Profile')
      setProfileSaved(true)
    } catch (err) {
      console.error("Failed to save profile:", err)
    } finally {
      setProfileSaving(false)
    }
  }

  // If no measurements and not in manual mode, show manual input form
  if (!measurements && !isManualMode) {
    return (
      <div className="min-h-screen bg-[#e7e3dd] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-semibold mb-4 text-center">Enter Your Measurements</h2>
          <p className="text-gray-600 mb-4 text-center text-sm">
            No scan data available. Please enter your measurements manually.
          </p>
          <button
            onClick={() => setManualInput(true)}
            className="w-full bg-clay text-white py-2 rounded-lg hover:bg-opacity-90 transition-colors"
          >
            Enter Manually
          </button>
          <button
            onClick={handleScanAgain}
            className="w-full mt-3 text-clay underline py-2"
          >
            Scan Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#e7e3dd] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-semibold text-center mb-6">
          {loading ? 'Analyzing...' : 'Your Recommended Size'}
        </h2>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="text-lg font-medium mb-4">Recommendation Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Gender</label>
              <select
                value={preferences.gender || "men"}
                onChange={(e) => handlePreferenceChange("gender", e.target.value)}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-clay"
                disabled={loading}
              >
                <option value="men">Men</option>
                <option value="women">Women</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Category</label>
              <select
                value={preferences.category || "shirts"}
                onChange={(e) => handlePreferenceChange("category", e.target.value)}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-clay"
                disabled={loading}
              >
                <option value="shirts">Shirts</option>
                <option value="pants">Pants</option>
                <option value="jackets">Jackets</option>
                <option value="dresses">Dresses</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scan Classification Banner */}
        {scanClassification && (
          <div className={`p-4 rounded-lg mb-4 ${
            (scanClassification.type === "full" || scanClassification.type === "full_body") ? "bg-green-50 border-green-200" :
            (scanClassification.type === "partial" || scanClassification.type === "upper_body") ? "bg-yellow-50 border-yellow-200" :
            "bg-red-50 border-red-200"
          } border`}>
            {(scanClassification.type === "full" || scanClassification.type === "full_body") && "Full Body Scan (High Confidence)"}
            {(scanClassification.type === "partial" || scanClassification.type === "upper_body") && "Partial Scan (Limited Accuracy)"}
            {scanClassification.type === "invalid" && "Invalid Scan (Retake Required)"}
          </div>
        )}
        {/* Warnings Box */}
        {warnings && warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            {warnings.map((warning, idx) => (
              <p key={idx} className="text-yellow-800 text-sm">⚠️ {warning}</p>
            ))}
          </div>
        )}

        {/* Measurements Display */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="text-lg font-medium mb-4">Your Measurements</h3>

          {isManualMode ? (
            // Manual input form
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'height', label: 'Height (cm)' },
                { key: 'chest', label: 'Chest (cm)' },
                { key: 'waist', label: 'Waist (cm)' },
                { key: 'hips', label: 'Hips (cm)' },
                { key: 'shoulder_width', label: 'Shoulder (cm)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm text-gray-600 mb-1">{label}</label>
                  <input
                    type="number"
                    value={manualMeasurements[key]}
                    onChange={(e) => handleManualChange(key, e.target.value)}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-clay"
                    placeholder={label}
                  />
                </div>
              ))}
              <div className="col-span-2 mt-2">
                <button
                  onClick={handleManualSubmit}
                  disabled={loading}
                  className="w-full bg-clay text-white py-2 rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Calculating...' : 'Get Recommendation'}
                </button>
              </div>
            </div>
          ) : (
            // Display measurements from scan
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {measurements && (
                <>
                  <MeasurementCard label="Height" value={measurements.height} unit="cm" confidence={confidenceScores?.height} />
                  <MeasurementCard label="Chest" value={measurements.chest} unit="cm" confidence={confidenceScores?.chest} />
                  <MeasurementCard label="Waist" value={measurements.waist} unit="cm" confidence={confidenceScores?.waist} />
                  <MeasurementCard label="Hips" value={measurements.hips} unit="cm" confidence={confidenceScores?.hips} />
                  <MeasurementCard label="Shoulder" value={measurements.shoulder_width} unit="cm" confidence={confidenceScores?.shoulder_width} />
                </>
              )}
            </div>
          )}

          {/* Edit button */}
          {!isManualMode && measurements && (
            <button
              onClick={() => setManualInput(true)}
              className="mt-4 text-sm text-clay underline"
            >
              Edit measurements
            </button>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex flex-col items-center justify-center py-8">
              <LoadingSpinner size="lg" />
              <p className="mt-4 text-gray-600">Calculating your size...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="mb-6">
            <ErrorMessage
              error={error}
              title="Size Prediction Failed"
              onRetry={handleRetry}
            />
          </div>
        )}

        {/* Results */}
        {recommendations && !loading && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-medium mb-4">Size Recommendations</h3>

            {recommendations.recommendations && recommendations.recommendations.length > 0 ? (
              <div className="space-y-4">
                {recommendations.recommendations.map((rec, index) => (
                  <SizeRecommendationCard
                    key={index}
                    recommendation={rec}
                    isPrimary={index === 0}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-600">No recommendations available.</p>
            )}

            {recommendations.warnings && recommendations.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  {recommendations.warnings.join(' ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleScanAgain}
            className="px-6 py-2 border border-clay text-clay rounded-lg hover:bg-clay hover:text-white transition-colors"
          >
            Scan Again
          </button>
          <button
            onClick={handleSaveToProfile}
            disabled={profileSaving || profileSaved || !measurements}
            className="px-6 py-2 border border-green-500 text-green-600 rounded-lg hover:bg-green-500 hover:text-white transition-colors disabled:opacity-50"
          >
            {profileSaved ? "Saved!" : profileSaving ? "Saving..." : "Save to Profile"}
          </button>
          <button
            onClick={() => navigate("/preview")}
            disabled={!recommendations}
            className="px-6 py-2 bg-clay text-white rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50"
          >
            Explore Virtual Try-On
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Get confidence color based on score
 */
const getConfidenceColor = (score) => {
  if (!score) return 'text-gray-400'
  const pct = score * 100
  if (pct > 85) return 'text-green-600'
  if (pct >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

/**
 * Measurement display card
 */
function MeasurementCard({ label, value, unit, confidence }) {
  // Show "User confirmed" for height when confidence is 100%
  const isUserConfirmed = label === 'Height' && confidence === 1.0

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold">
        {value ? value.toFixed(1) : '--'}
        <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
      </p>
      {confidence !== undefined && (
        <p className={`text-xs ${getConfidenceColor(confidence)}`}>
          {isUserConfirmed ? 'User confirmed' : `${Math.round(confidence * 100)}% confidence`}
        </p>
      )}
    </div>
  )
}

/**
 * Size recommendation card
 */
function SizeRecommendationCard({ recommendation, isPrimary }) {
  const { size, confidence, fit_type, explanation, alternative_size } = recommendation

  const fitColors = {
    tight: 'bg-red-100 text-red-800',
    perfect: 'bg-green-100 text-green-800',
    loose: 'bg-blue-100 text-blue-800',
    between_sizes: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <div className={`border rounded-lg p-4 ${isPrimary ? 'border-clay bg-clay/5' : 'border-gray-200'}`}>
      {isPrimary && (
        <span className="text-xs font-medium text-clay uppercase tracking-wide">
          Recommended
        </span>
      )}

      <div className="flex items-start justify-between mt-1">
        <div>
          <p className="text-2xl font-bold">{size}</p>
          <p className="text-sm text-gray-600 mt-1">{explanation}</p>
        </div>

        <div className="text-right">
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${fitColors[fit_type] || 'bg-gray-100 text-gray-800'}`}>
            {fit_type.replace('_', ' ')}
          </span>
          <p className="text-sm text-gray-500 mt-1">
            {confidence}% confidence
          </p>
        </div>
      </div>

      {alternative_size && (
        <p className="text-sm text-gray-500 mt-2">
          Alternative: {alternative_size}
        </p>
      )}
    </div>
  )
}

export default SizeResult
