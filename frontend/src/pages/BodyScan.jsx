import { useEffect, useRef, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useScanImage } from "../hooks"
import { useApp } from "../context/AppContext"
import { scanMeasureCalibrated, scanMeasureMultiple } from "../api"
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

function drawLandmarksOnCanvas(canvas, video, landmarks, width, height) {
  if (!canvas || !landmarks || landmarks.length === 0) return

  const ctx = canvas.getContext('2d')

  // Set canvas size to match video dimensions
  canvas.width = width
  canvas.height = height

  // First, draw the video frame onto the canvas
  if (video && video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, width, height)
  } else {
    // If no video, fill with black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
  }

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

// Draw landmarks on a static image (not video)
function drawLandmarksOnStaticImage(canvas, imageSrc, landmarks, width, height) {
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  canvas.width = width
  canvas.height = height

  // Draw the image
  const img = new Image()
  img.src = imageSrc

  img.onload = () => {
    ctx.drawImage(img, 0, 0, width, height)

    if (!landmarks || landmarks.length === 0) return

    // Mirror the canvas
    ctx.save()
    ctx.scale(-1, 1)
    ctx.translate(-width, 0)

    // Draw connections
    const connections = [
      [11, 12], [23, 24], [11, 23], [12, 24],
      [23, 25], [25, 27], [24, 26], [26, 28],
      [11, 13], [13, 15], [12, 14], [14, 16],
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

      ctx.beginPath()
      ctx.arc(x, y, 10, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      ctx.beginPath()
      ctx.arc(x, y, 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    })

    ctx.restore()
  }
}

function BodyScan() {

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [capturedImages, setCapturedImages] = useState([])
  const [capturedImagesMap, setCapturedImagesMap] = useState({ front: null, left: null, right: null, back: null })
  const [userHeight, setUserHeight] = useState("")
  const [showHeightInput, setShowHeightInput] = useState(true)
  const [visualizationImage, setVisualizationImage] = useState(null)
  const [showVisualization, setShowVisualization] = useState(false)
  const [currentLandmarks, setCurrentLandmarks] = useState(null)
  const [showLandmarks, setShowLandmarks] = useState(false)
  const [multiScanResults, setMultiScanResults] = useState(null)
  const [multiLoading, setMultiLoading] = useState(false)
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

      drawLandmarksOnCanvas(canvas, video, currentLandmarks, width, height)
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

  // Map step to image type
  const stepToImageType = {
    1: 'front',
    2: 'left',
    3: 'right',
    4: 'back'
  }

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
    setMultiScanResults(null)

    const imageData = captureFrame()
    if (!imageData) return

    // Store image with its type (front, left, right, back)
    const imageType = stepToImageType[step]
    setCapturedImagesMap(prev => ({
      ...prev,
      [imageType]: imageData
    }))

    const newImages = [...capturedImages, imageData]
    setCapturedImages(newImages)

    if (step < 4) {
      setStep(step + 1)
    } else {
      stopCamera()

      // All 4 images captured - call measure-multiple
      const imagesToSend = {
        front: capturedImagesMap.front || newImages[0],
        left: capturedImagesMap.left || newImages[1],
        right: capturedImagesMap.right || newImages[2],
        back: capturedImagesMap.back || newImages[3]
      }

      // Clear any previous errors
      setLocalError(null)
      clearError()
      setMultiLoading(true)

      try {
        // Call measure-multiple API
        const height = parseFloat(userHeight)
        const scanResponse = await scanMeasureMultiple(imagesToSend, userHeight && height > 100 && height < 250 ? height : null)

        setMultiLoading(false)

        console.log("Measure multiple response:", scanResponse)

        if (!scanResponse) {
          setLocalError("No response from scan API")
          return
        }

        // Handle the response
        let scanSuccess = false
        let measurements = null
        let scanMessage = "Scan completed"

        if (scanResponse.success !== undefined) {
          scanSuccess = scanResponse.success === true
          scanMessage = scanResponse.message || scanMessage
          measurements = scanResponse.measurements
        } else if (scanResponse.measurements) {
          scanSuccess = true
          measurements = scanResponse.measurements
        }

        if (!scanSuccess) {
          setLocalError(scanMessage || "Scan failed")
          return
        }

        if (!measurements) {
          setLocalError("No measurements in response")
          return
        }

        // Store measurements
        setMeasurements(measurements)

        // Store the multi-scan results for display
        setMultiScanResults(scanResponse)

        // Navigate after 3.5 seconds
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
          {(loading || multiLoading) && (
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

      {/* 2x2 Grid Display - Shows all 4 images with landmarks after scan completes */}
      {multiScanResults && multiScanResults.images && (
        <div className="mt-8">
          <p className="text-lg font-medium text-gray-700 mb-4">Scan Results</p>
          <div className="grid grid-cols-2 gap-4">
            {multiScanResults.images.map((imgData, idx) => (
              <div key={idx} className="relative">
                <p className="text-sm font-medium text-gray-600 mb-1 capitalize">{imgData.image_type}</p>
                <canvas
                  ref={el => {
                    if (el && imgData.image_data && imgData.landmarks) {
                      const canvas = el
                      const img = new Image()
                      img.src = `data:image/jpeg;base64,${imgData.image_data}`
                      img.onload = () => {
                        const width = 260
                        const height = 150
                        canvas.width = width
                        canvas.height = height
                        const ctx = canvas.getContext('2d')
                        ctx.drawImage(img, 0, 0, width, height)

                        // Draw landmarks
                        const landmarks = imgData.landmarks
                        if (landmarks && landmarks.length > 0) {
                          ctx.save()
                          ctx.scale(-1, 1)
                          ctx.translate(-width, 0)

                          const connections = [
                            [11, 12], [23, 24], [11, 23], [12, 24],
                            [23, 25], [25, 27], [24, 26], [26, 28],
                            [11, 13], [13, 15], [12, 14], [14, 16],
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

                          landmarks.forEach((landmark, index) => {
                            const x = landmark.x * width
                            const y = landmark.y * height
                            const color = LANDMARK_COLORS[index] || '#ffffff'

                            ctx.beginPath()
                            ctx.arc(x, y, 6, 0, 2 * Math.PI)
                            ctx.fillStyle = color
                            ctx.fill()

                            ctx.beginPath()
                            ctx.arc(x, y, 3, 0, 2 * Math.PI)
                            ctx.fillStyle = '#ffffff'
                            ctx.fill()
                          })

                          ctx.restore()
                        }
                      }
                    }
                  }}
                  className="w-[260px] h-[150px] rounded-lg border-2 border-gray-300"
                />
              </div>
            ))}
          </div>
        </div>
      )}

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