import { useEffect, useRef, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useScanImage } from "../hooks"
import { useApp } from "../context/AppContext"
import { scanMeasureCalibrated, visualizeLandmarks } from "../api"
import LoadingSpinner from "../components/common/LoadingSpinner"
import ErrorMessage from "../components/common/ErrorMessage"

// Landmark indices from MediaPipe Pose
const LANDMARK_INDICES = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
}

const LANDMARK_COLORS = {
  0: '#ff0000',      // Nose - Red
  11: '#00ff00',     // Left shoulder - Green
  12: '#00ff00',     // Right shoulder - Green
  23: '#ff00ff',     // Left hip - Magenta
  24: '#ff00ff',     // Right hip - Magenta
  27: '#ffff00',     // Left ankle - Yellow
  28: '#ffff00',     // Right ankle - Yellow
  25: '#00ffff',     // Left knee - Cyan
  26: '#00ffff',     // Right knee - Cyan
  13: '#800080',     // Left elbow - Purple
  14: '#800080',     // Right elbow - Purple
  15: '#008080',     // Left wrist - Teal
  16: '#008080',     // Right wrist - Teal
}

function drawLandmarksOnCanvas(canvas, landmarks, width, height) {
  if (!canvas || !landmarks || landmarks.length === 0) return

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)

  // Mirror the canvas to match the mirrored video
  ctx.save()
  ctx.scale(-1, 1)
  ctx.translate(-width, 0)

  // Draw connections (body outline)
  const connections = [
    [11, 12],   // shoulders
    [23, 24],   // hips
    [11, 23],   // left shoulder to left hip
    [12, 24],   // right shoulder to right hip
    [23, 25],   // left hip to knee
    [25, 27],   // left knee to ankle
    [24, 26],   // right hip to knee
    [26, 28],   // right knee to ankle
    [11, 13],   // left shoulder to elbow
    [13, 15],   // left elbow to wrist
    [12, 14],   // right shoulder to elbow
    [14, 16],   // right elbow to wrist
  ]

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'
  ctx.lineWidth = 2

  connections.forEach(([startIdx, endIdx]) => {
    if (startIdx < landmarks.length && endIdx < landmarks.length) {
      const start = landmarks[startIdx]
      const end = landmarks[endIdx]
      ctx.beginPath()
      ctx.moveTo(start.x * width, start.y * height)
      ctx.lineTo(end.x * width, end.y * height)
      ctx.stroke()
    }
  })

  // Draw landmark points
  landmarks.forEach((landmark, index) => {
    const x = landmark.x * width
    const y = landmark.y * height
    const color = LANDMARK_COLORS[index] || '#ffffff'

    // Outer circle
    ctx.beginPath()
    ctx.arc(x, y, 10, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()

    // Inner circle
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  })

  ctx.restore()
}

function BodyScan() {

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [capturedImages, setCapturedImages] = useState([])
  const [userHeight, setUserHeight] = useState("")
  const [showHeightInput, setShowHeightInput] = useState(true)
  const [visualizationImage, setVisualizationImage] = useState(null)
  const [showVisualization, setShowVisualization] = useState(false)
  const [currentLandmarks, setCurrentLandmarks] = useState(null)
  const [showLandmarks, setShowLandmarks] = useState(false)
  const [countingDown, setCountingDown] = useState(false)
  const [countdownNumber, setCountdownNumber] = useState(3)
  const [localError, setLocalError] = useState(null)

  const { setMeasurements } = useApp()
  const { scan, loading, error: scanError, clearError } = useScanImage()

  // Use local error state for scan errors
  const displayError = localError || scanError

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
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
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

  // Draw raw landmarks when they update (fallback when visualization fails)
  useEffect(() => {
    // Only draw raw landmarks if we don't have a visualization image
    // The visualization is drawn directly in the capture handler
    if (showLandmarks && currentLandmarks && currentLandmarks.length > 0 && !visualizationImage && overlayCanvasRef.current && videoRef.current) {
      const video = videoRef.current
      const canvas = overlayCanvasRef.current

      const width = video.videoWidth || 520
      const height = video.videoHeight || 300

      canvas.width = width
      canvas.height = height

      drawLandmarksOnCanvas(canvas, currentLandmarks, width, height)
    }
  }, [currentLandmarks, showLandmarks, visualizationImage])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.8)
  }, [])

  const handleCapture = async () => {
    // If already counting down or loading, don't start a new capture
    if (countingDown || loading) return

    // Start countdown: 3 -> 2 -> 1 -> capture
    setCountingDown(true)
    setCountdownNumber(3)

    // Countdown sequence
    for (let i = 3; i > 0; i--) {
      setCountdownNumber(i)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    setCountingDown(false)

    // Now perform the actual capture
    clearError()
    setShowVisualization(false)
    setVisualizationImage(null)
    setShowLandmarks(false)
    setCurrentLandmarks(null)

    const imageData = captureFrame()
    if (!imageData) return

    const newImages = [...capturedImages, imageData]
    setCapturedImages(newImages)

    if (step < 4) {
      setStep(step + 1)
    } else {
      stopCamera()

      const frontImage = newImages[0] || imageData
      let measurements = null
      let visResult = null

      // Use calibrated measurement if user provided their height
      const height = parseFloat(userHeight)

      // Clear any previous errors
      setLocalError(null)
      clearError()

      try {
        // Step 1: Call scan API
        let scanResponse
        if (userHeight && height > 100 && height < 250) {
          scanResponse = await scanMeasureCalibrated(frontImage, height)
        } else {
          scanResponse = await scan(frontImage)
        }

        console.log("Scan response:", scanResponse)

        // Step 2: Check if scan was successful
        if (!scanResponse) {
          setLocalError("No response from scan API")
          return
        }

        if (!scanResponse.success) {
          // Scan failed - show error from backend
          setLocalError(scanResponse.message || "Scan failed")
          return
        }

        // Step 3: Scan succeeded - now call visualize
        let visualizeResponse = null
        try {
          const base64Image = frontImage.includes(",") ? frontImage.split(",")[1] : frontImage
          visualizeResponse = await visualizeLandmarks(base64Image, userHeight ? height : null, true, true)
          console.log("Visualize response:", visualizeResponse)
        } catch (visErr) {
          console.warn("Visualization failed:", visErr)
        }

        // Step 4: Get measurements from scan response
        const m = scanResponse.measurements
        if (!m) {
          setLocalError("No measurements in response")
          return
        }

        const validMeasurements = {
          height: Number(m.height) || 0,
          chest: Number(m.chest) || 0,
          waist: Number(m.waist) || 0,
          hips: Number(m.hips) || 0,
          shoulder_width: Number(m.shoulder_width) || 0
        }

        if (validMeasurements.height <= 0 || validMeasurements.chest <= 0) {
          setLocalError("Invalid measurements returned")
          return
        }

        // Store measurements
        setMeasurements(validMeasurements)

        // Step 5: Draw visualization on canvas
        if (visualizeResponse && visualizeResponse.success && visualizeResponse.image_data) {
          // Draw the visualization image on canvas
          const img = new Image()
          img.src = `data:image/png;base64,${visualizeResponse.image_data}`

          img.onload = () => {
            if (overlayCanvasRef.current && videoRef.current) {
              const canvas = overlayCanvasRef.current
              const video = videoRef.current

              // Match canvas size to video
              canvas.width = video.videoWidth || 520
              canvas.height = video.videoHeight || 300

              const ctx = canvas.getContext('2d')

              // Draw the visualization image scaled to canvas
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

              // Make canvas visible
              setShowLandmarks(true)
              console.log("Visualization drawn on canvas")
            }
          }

          img.onerror = () => {
            console.error("Failed to load visualization image")
            // Fallback to raw landmarks
            if (scanResponse.landmarks && scanResponse.landmarks.length > 0) {
              setCurrentLandmarks(scanResponse.landmarks)
              setShowLandmarks(true)
            }
          }
        } else if (scanResponse.landmarks && scanResponse.landmarks.length > 0) {
          // Fallback: use raw landmarks from scan response
          console.log("Using raw landmarks:", scanResponse.landmarks.length)
          setCurrentLandmarks(scanResponse.landmarks)
          setShowLandmarks(true)
        }

        // Step 6: Navigate after 3.5 seconds
        setTimeout(() => {
          navigate("/size-result")
        }, 3500)

      } catch (err) {
        console.error("Scan error:", err)
        setLocalError(err.message || "An error occurred during scanning")
      }
    }
  }

  const handleSkipToManual = () => {
    stopCamera()
    navigate("/size-result")
  }

  return (
    <div className="min-h-screen bg-[#e7e3dd] flex flex-col items-center justify-center text-center px-4">

      {/* Title */}
      <h1 className="text-3xl font-light text-charcoal-900">
        Body Scan
      </h1>

      {/* Subtitle */}
      <p className="mt-2 text-sm text-charcoal-700/70">
        {instructions[step - 1]}
      </p>

      {/* Height Input for Calibration */}
      {showHeightInput && step === 1 && (
        <div className="mt-4 bg-white/80 rounded-lg p-4 max-w-md">
          <p className="text-sm text-gray-600 mb-2">
            For accurate measurements, enter your height:
          </p>
          <div className="flex gap-2 justify-center items-center">
            <input
              type="number"
              placeholder="Your height (cm)"
              value={userHeight}
              onChange={(e) => setUserHeight(e.target.value)}
              className="border rounded px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-clay"
            />
            <button
              onClick={() => setShowHeightInput(false)}
              className="text-sm text-clay underline"
            >
              Skip
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Providing your height enables calibrated measurements for better accuracy
          </p>
        </div>
      )}

      {/* Landmark Preview - Shows AFTER capture but BEFORE navigating */}
      {showLandmarks && currentLandmarks && (
        <div className="mt-4">
          <p className="text-sm font-medium text-green-700 mb-2">Landmarks Detected!</p>
          <p className="text-xs text-gray-600 mb-2">Green dots = shoulders, Cyan = knees, Yellow = ankles</p>
        </div>
      )}

      {/* Visualization Display */}
      {showVisualization && visualizationImage && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Landmark Detection Preview</p>
          <img
            src={visualizationImage}
            alt="Body landmarks"
            className="w-[520px] h-[300px] rounded-xl shadow-md object-contain bg-black"
          />
          <button
            onClick={() => setShowVisualization(false)}
            className="mt-2 text-sm text-gray-500 underline"
          >
            Hide preview
          </button>
        </div>
      )}

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera with Landmark Overlay */}
      <div className="mt-8 flex justify-center">
        <div className="w-[520px] h-[300px] rounded-xl overflow-hidden shadow-md bg-black relative">

          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {/* Canvas overlay for landmarks - draws on top of video */}
          <canvas
            ref={overlayCanvasRef}
            className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${showLandmarks ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
              <LoadingSpinner size="lg" color="white" />
              <p className="mt-4">Analyzing your body...</p>
            </div>
          )}

          {/* Countdown overlay */}
          {countingDown && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white">
              <p className="text-8xl font-bold text-clay animate-pulse">{countdownNumber}</p>
              <p className="mt-4 text-lg">Get ready!</p>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {displayError && (
        <div className="max-w-md mx-auto mt-4">
          <ErrorMessage
            error={displayError}
            title="Scan Failed"
            onRetry={() => { setLocalError(null); clearError(); }}
          />
        </div>
      )}

      {/* Capture Button */}
      <button
        onClick={handleCapture}
        disabled={loading || countingDown}
        className={`mt-6 text-sm relative group transition-all duration-300 ${
          loading || countingDown
            ? "text-gray-400 cursor-not-allowed"
            : "text-charcoal-900"
        }`}
      >
        <span className="relative z-10">
          {loading ? "Processing..." : countingDown ? "Get Ready..." : "Capture"}
        </span>

        <span className="absolute left-0 bottom-0 w-0 h-[1px] bg-charcoal-900 transition-all duration-300 group-hover:w-full"></span>
      </button>

      {/* Manual Entry */}
      <p
        onClick={handleSkipToManual}
        className="mt-4 text-sm underline cursor-pointer text-charcoal-800 hover:opacity-70"
      >
        Enter measurements manually
      </p>

      {/* Step */}
      <p className="mt-3 text-sm text-charcoal-700/70">
        Step {step} of 4
      </p>

      {/* Dots */}
      <div className="flex gap-2 mt-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full ${
              s === step ? "bg-charcoal-900" : "bg-gray-300"
            }`}
          />
        ))}
      </div>

    </div>
  )
}

export default BodyScan