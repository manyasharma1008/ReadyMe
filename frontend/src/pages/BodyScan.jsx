import { useEffect, useRef, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useScanImage } from "../hooks"
import { useApp } from "../context/AppContext"
import LoadingSpinner from "../components/common/LoadingSpinner"
import ErrorMessage from "../components/common/ErrorMessage"

function BodyScan() {

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [capturedImages, setCapturedImages] = useState([])

  const { setMeasurements } = useApp()
  const { scan, loading, error, clearError } = useScanImage()

  const instructions = [
    "Stand facing the camera (Front)",
    "Turn to your left side",
    "Turn to your right side",
    "Turn your back to the camera"
  ]

  useEffect(() => {

    async function startCamera() {

      try {

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 }
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        streamRef.current = stream

      } catch (error) {

        alert("Camera access denied")

      }

    }

    startCamera()

    
    return () => {
      stopCamera()
    }

  }, [])

  const stopCamera = () => {

    if (streamRef.current) {

      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null

    }

  }

  /**
   * Capture current frame from video
   */
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to base64 (without data URL prefix)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    return dataUrl
  }, [])

  /**
   * Handle capture button click
   */
  const handleCapture = async () => {
    clearError()
    console.log("FINAL STEP - calling scan");
    // Capture current frame
    const imageData = captureFrame()
    if (!imageData) {
      return
    }

    // Store captured image
    const newImages = [...capturedImages, imageData]
    setCapturedImages(newImages)

    if (step < 4) {
      // Move to next step
      setStep(step + 1)
    } else {
      // Final capture - process images
      stopCamera()

      // Use the front-facing image for body measurement
      // In a full implementation, you could combine all 4 views
      const frontImage = newImages[0] || imageData

      try {
        const measurements = await scan(frontImage)

        if (measurements) {
          // Store measurements in global context
          setMeasurements(measurements)
          // Navigate to results page
          navigate("/size-result")
        }
      } catch (err) {
        console.error("Scan failed:", err)
        // Error is already handled by the hook
      }
    }
  }

  /**
   * Skip scanning and enter measurements manually
   */
  const handleSkipToManual = () => {
    stopCamera()
    navigate("/size-result")
  }

  return (

    <div
      style={{
        textAlign: "center",
        padding: "40px",
        position: "relative"
      }}
    >

      <h2 className="text-2xl font-semibold mb-2">Body Scan</h2>

      <p className="text-gray-600 mb-4">{instructions[step - 1]}</p>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ position: 'relative', display: 'inline-block' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          width="420"
          style={{
            borderRadius: "10px",
            marginTop: "20px",
            transform: "scaleX(-1)" // Mirror for selfie view
          }}
        />

        {/* Loading overlay */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              borderRadius: '10px',
              marginTop: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              color: 'white'
            }}
          >
            <LoadingSpinner size="lg" color="white" />
            <p className="mt-4">Analyzing your body...</p>
          </div>
        )}
      </div>

      <br />

      {/* Error message */}
      {error && (
        <div className="max-w-md mx-auto mt-4">
          <ErrorMessage
            error={error}
            title="Scan Failed"
            onRetry={clearError}
          />
        </div>
      )}

      {/* Capture button */}
      <button
        onClick={handleCapture}
        disabled={loading}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.5 : 1
        }}
        className="bg-clay text-white rounded-lg hover:bg-opacity-90 transition-colors"
      >
        {loading ? "Processing..." : "Capture"}
      </button>

      {/* Skip to manual entry */}
      <button
        onClick={handleSkipToManual}
        disabled={loading}
        style={{
          marginTop: "10px",
          padding: "10px 20px",
          cursor: loading ? "not-allowed" : "pointer",
          display: "block",
          margin: "10px auto"
        }}
        className="text-gray-600 underline hover:text-gray-800"
      >
        Enter measurements manually
      </button>

      <p style={{ marginTop: "10px" }}>
        Step {step} of 4
      </p>

      {/* Progress indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full ${
              s <= step ? 'bg-clay' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

    </div>

  )

}

export default BodyScan