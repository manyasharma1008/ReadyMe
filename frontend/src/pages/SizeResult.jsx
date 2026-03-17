import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useApp } from "../context/AppContext"
import { useSizePrediction } from "../hooks"
import LoadingSpinner from "../components/common/LoadingSpinner"
import ErrorMessage from "../components/common/ErrorMessage"

function SizeResult() {

  const navigate = useNavigate()
  const { measurements, preferences, clearMeasurements } = useApp()
  const { recommendations, predict, loading, error, clearError } = useSizePrediction()

  const [manualInput, setManualInput] = useState(false)
  const [manualMeasurements, setManualMeasurements] = useState({
    height: '',
    chest: '',
    waist: '',
    hips: '',
    shoulder_width: ''
  })

  // Predict size when measurements are available
  useEffect(() => {
    if (measurements && !recommendations) {
      predict(measurements, {
        category: preferences.category,
        gender: preferences.gender,
      })
    }
  }, [measurements, recommendations, predict, preferences])

  // Use measurements from context or manual input
  const displayMeasurements = manualInput ? manualMeasurements : measurements

  // Handle manual input changes
  const handleManualChange = (field, value) => {
    setManualMeasurements(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Submit manual measurements
  const handleManualSubmit = async () => {
    // Convert string values to numbers
    const numericMeasurements = {
      height: parseFloat(manualMeasurements.height) || 0,
      chest: parseFloat(manualMeasurements.chest) || 0,
      waist: parseFloat(manualMeasurements.waist) || 0,
      hips: parseFloat(manualMeasurements.hips) || 0,
      shoulder_width: parseFloat(manualMeasurements.shoulder_width) || 0
    }

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

  // Scan again
  const handleScanAgain = () => {
    clearMeasurements()
    navigate("/camera")
  }

  // If no measurements and not in manual mode, show manual input form
  if (!measurements && !manualInput) {
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

        {/* Measurements Display */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="text-lg font-medium mb-4">Your Measurements</h3>

          {manualInput ? (
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
                  <MeasurementCard label="Height" value={measurements.height} unit="cm" />
                  <MeasurementCard label="Chest" value={measurements.chest} unit="cm" />
                  <MeasurementCard label="Waist" value={measurements.waist} unit="cm" />
                  <MeasurementCard label="Hips" value={measurements.hips} unit="cm" />
                  <MeasurementCard label="Shoulder" value={measurements.shoulder_width} unit="cm" />
                </>
              )}
            </div>
          )}

          {/* Edit button */}
          {!manualInput && measurements && (
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
 * Measurement display card
 */
function MeasurementCard({ label, value, unit }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold">
        {value ? value.toFixed(1) : '--'}
        <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
      </p>
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