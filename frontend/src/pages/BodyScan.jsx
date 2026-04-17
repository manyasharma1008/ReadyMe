import { useEffect, useRef, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useScanImage } from "../hooks"
import { useMediaPipe } from "../hooks/useMediaPipe"
import { useFramingGuidance } from "../hooks/useFramingGuidance"
import { useAutoCapture } from "../hooks/useAutoCapture"
import { useApp } from "../context/AppContext"
import { scanMeasureEnhanced, scanMeasureMultiple } from "../api"
import LoadingSpinner from "../components/common/LoadingSpinner"
import ErrorMessage from "../components/common/ErrorMessage"
import { FramingOverlay } from "../components/FramingOverlay"
// skds
// Validation utility
const isValidHeight = (h) => {
  const num = Number(h)
  return num >= 100 && num <= 250
}

const CONFIDENCE_THRESHOLD = 0.5
const MEASUREMENT_KEYS = ["height", "chest", "waist", "hips", "shoulder_width"]
const RELIABLE_MEASUREMENT_KEYS = ["chest", "waist", "hips", "shoulder_width"]

const getConfirmedHeightCm = (heightValue, confirmed) => {
  if (!confirmed || !isValidHeight(heightValue)) return null
  return parseFloat(heightValue)
}

const getKeypointsDetected = (response) => {
  if (!response) return 0
  if (typeof response.keypoints_detected === "number") return response.keypoints_detected
  if (Array.isArray(response.landmarks)) return response.landmarks.length
  if (Array.isArray(response.keypoints)) return response.keypoints.length
  return 0
}

// Clear cached height from localStorage
const clearHeight = () => {
  localStorage.removeItem("userHeight")
}

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

// Mirror landmarks horizontally (x -> 1 - x) to compensate for mirrored video feed
function mirrorLandmarks(landmarks) {
  if (!landmarks || landmarks.length === 0) return landmarks
  return landmarks.map(point => ({
    ...point,
    x: 1 - point.x
  }))
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

  // Use landmarks directly - CSS scale-x-[-1] on canvas handles mirroring
  const mirroredLandmarks = landmarks

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
    if (startIdx < mirroredLandmarks.length && endIdx < mirroredLandmarks.length) {
      const start = mirroredLandmarks[startIdx]
      const end = mirroredLandmarks[endIdx]
      ctx.beginPath()
      ctx.moveTo(start.x * width, start.y * height)
      ctx.lineTo(end.x * width, end.y * height)
      ctx.stroke()
    }
  })

  // Draw landmark points
  mirroredLandmarks.forEach((landmark, index) => {
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

    // Use landmarks directly - CSS scale-x-[-1] handles mirroring
    const mirroredLandmarks = landmarks

    // Draw connections
    const connections = [
      [11, 12], [23, 24], [11, 23], [12, 24],
      [23, 25], [25, 27], [24, 26], [26, 28],
      [11, 13], [13, 15], [12, 14], [14, 16],
    ]

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'
    ctx.lineWidth = 2

    connections.forEach(([startIdx, endIdx]) => {
      if (startIdx < mirroredLandmarks.length && endIdx < mirroredLandmarks.length) {
        const start = mirroredLandmarks[startIdx]
        const end = mirroredLandmarks[endIdx]
        ctx.beginPath()
        ctx.moveTo(start.x * width, start.y * height)
        ctx.lineTo(end.x * width, end.y * height)
        ctx.stroke()
      }
    })

    // Draw landmark points
    mirroredLandmarks.forEach((landmark, index) => {
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
  }
}

function BodyScan() {

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const landmarksRef = useRef(null)
  const navigate = useNavigate()

  // Ref to store startAutoCapture callback for useAutoCapture hook
  const startAutoCaptureRef = useRef(null)

  const [step, setStep] = useState(1)
  const [capturedImages, setCapturedImages] = useState([])
  const [capturedImagesMap, setCapturedImagesMap] = useState({ front: null, left: null, right: null, back: null })
  const [userHeight, setUserHeight] = useState("")
  const [showHeightInput, setShowHeightInput] = useState(true)
  const [hasCachedHeight, setHasCachedHeight] = useState(false)
  const [heightConfirmed, setHeightConfirmed] = useState(false)
  const [visualizationImage, setVisualizationImage] = useState(null)
  const [showVisualization, setShowVisualization] = useState(false)
  const [currentLandmarks, setCurrentLandmarks] = useState(null)
  const [showLandmarks, setShowLandmarks] = useState(false)
  const [multiScanResults, setMultiScanResults] = useState(null)
  const [multiLoading, setMultiLoading] = useState(false)
  const [countingDown, setCountingDown] = useState(false)
  const [manualCountdownNumber, setManualCountdownNumber] = useState(3)
  const [localError, setLocalError] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [currentCaptureStep, setCurrentCaptureStep] = useState(0)

  const { setMeasurements, setConfidenceScores, setWarnings, setScanClassification } = useApp()
  const { scan, loading, error: scanError, clearError } = useScanImage()

  // Real-time MediaPipe pose detection
  const {
    isLoaded: mediapipeLoaded,
    isLoading: mediapipeLoading,
    error: mediapipeError,
    startDetection,
    stopDetection,
    clearLandmarks,
  } = useMediaPipe()

  // Real-time framing guidance
  const framing = useFramingGuidance(videoRef)

  // Auto-capture hook - uses ref to access startAutoCapture after it's defined
  const {
    countdownActive,
    countdownNumber,
    stabilizing,
    cancel: cancelAutoCapture,
    resetCapture,
    handleFramingChange,
  } = useAutoCapture(videoRef, () => startAutoCaptureRef.current?.(), {
    enabled: !isCapturing,
    stabilityMs: 3000,
    countdownMs: 1000,
  })

  // Pass framing changes to auto-capture
  useEffect(() => {
    handleFramingChange(framing.status)
  }, [framing.status, handleFramingChange])

  useEffect(() => {
    if (!isCapturing) {
      resetCapture()
    }
  }, [isCapturing, resetCapture])

  // Use local error state for scan errors
  const displayError = localError || scanError || mediapipeError

  const instructions = [
    "Stand facing the camera (Front)",
    "Turn to your left side",
    "Turn to your right side",
    "Turn your back to the camera"
  ]

  const activeInstruction =
    isCapturing && currentCaptureStep > 0
      ? instructions[currentCaptureStep - 1]
      : instructions[step - 1]

  // Load saved height from localStorage on mount (as suggestion, not source of truth)
  useEffect(() => {
    const savedHeight = localStorage.getItem('userHeight')
    if (savedHeight && isValidHeight(savedHeight)) {
      // Pre-fill but DO NOT hide input - require explicit confirmation
      setUserHeight(savedHeight)
      setHasCachedHeight(true)
    } else if (savedHeight) {
      // Invalid cached value - clear it
      clearHeight()
    }
    // Always show height input for user confirmation
  }, [])

  // Start real-time landmark detection when video is ready
  useEffect(() => {
    if (!mediapipeLoaded || !videoRef.current) return

    const video = videoRef.current

    // Wait for video to be ready, then start detection
    const handleLoadedMetadata = () => {
      // Start continuous detection
      startDetection(video, (landmarks) => {
        const liveLandmarks = landmarks && landmarks.length > 0 ? landmarks : null
        landmarksRef.current = liveLandmarks
        // Update current landmarks state for display
        setCurrentLandmarks(liveLandmarks)
        if (liveLandmarks && overlayCanvasRef.current) {
          // Draw in real-time mode (showLandmarks = true during preview)
          if (showLandmarks) {
            drawLandmarksOnCanvas(overlayCanvasRef.current, video, liveLandmarks, video.videoWidth || 520, video.videoHeight || 300)
          }
        } else if (overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext('2d')
          ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height)
        }
      })
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    // If video already loaded
    if (video.readyState >= 1) {
      startDetection(video, (landmarks) => {
        const liveLandmarks = landmarks && landmarks.length > 0 ? landmarks : null
        landmarksRef.current = liveLandmarks
        setCurrentLandmarks(liveLandmarks)
        if (liveLandmarks && overlayCanvasRef.current) {
          // Always draw landmarks in real-time
          drawLandmarksOnCanvas(overlayCanvasRef.current, video, liveLandmarks, video.videoWidth || 520, video.videoHeight || 300)
        } else if (overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext('2d')
          ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height)
        }
      })
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      landmarksRef.current = null
      stopDetection()
    }
  }, [mediapipeLoaded, startDetection, stopDetection])

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
        console.error("Camera error:", error)
        setCameraError(error.name === 'NotAllowedError'
          ? "Camera permission denied. Please allow camera access and try again."
          : "Failed to access camera. Please ensure your camera is connected.")
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
    landmarksRef.current = null
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

  const logCaptureStage = useCallback((stage, data = {}) => {
    console.log("[BodyScan capture]", {
      stage,
      timestamp: new Date().toISOString(),
      ...data,
    })
  }, [])

  const handleCapture = async () => {
    await startAutoCapture()
  }

  // Automated multi-capture function - captures 4 images with countdowns
  const startAutoCapture = async () => {
    if (isCapturing || countingDown || loading) return

    cancelAutoCapture()
    setIsCapturing(true)
    setStep(1)
    clearError()
    setShowVisualization(false)
    setVisualizationImage(null)
    setMultiScanResults(null)
    setShowLandmarks(true)

    // Use local variables to collect images (state updates are async)
    const capturedImagesArray = []
    const capturedImagesMapLocal = { front: null, left: null, right: null, back: null }

    for (let i = 0; i < 4; i++) {
      setCurrentCaptureStep(i + 1)
      setStep(i + 1)
      logCaptureStage("step-start", {
        step: i + 1,
        hasLandmarks: !!landmarksRef.current,
      })

      // Show "turn to next pose" message for steps 2-4
      if (i > 0) {
        setCountingDown(true)
        setManualCountdownNumber(0)
        // Give user 3 seconds to turn to next position
        for (let t = 3; t > 0; t--) {
          setManualCountdownNumber(-t) // negative to show "turn" message
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Safety check: ensure landmarks exist before capture
      if (!landmarksRef.current || landmarksRef.current.length === 0) {
        logCaptureStage("step-failed-no-landmarks-before-countdown", {
          step: i + 1,
          hasLandmarks: !!landmarksRef.current,
        })
        setLocalError("Please stand properly in frame")
        setIsCapturing(false)
        setCountingDown(false)
        return
      }

      // Countdown: 3 -> 2 -> 1
      setCountingDown(true)
      for (let t = 3; t > 0; t--) {
        setManualCountdownNumber(t)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      setCountingDown(false)
      logCaptureStage("countdown-complete", {
        step: i + 1,
        hasLandmarks: !!landmarksRef.current,
      })

      if (!landmarksRef.current || landmarksRef.current.length === 0) {
        logCaptureStage("step-failed-no-landmarks-before-capture", {
          step: i + 1,
          hasLandmarks: !!landmarksRef.current,
        })
        setLocalError("Pose lost during capture. Please retake scan.")
        setIsCapturing(false)
        return
      }

      // Capture frame
      logCaptureStage("capture-frame", {
        step: i + 1,
        hasLandmarks: !!landmarksRef.current,
      })
      const imageData = captureFrame()
      if (!imageData) {
        setLocalError("Failed to capture image")
        setIsCapturing(false)
        return
      }

      // Store in local variables
      const imageType = stepToImageType[i + 1]
      capturedImagesMapLocal[imageType] = imageData
      capturedImagesArray.push(imageData)

      // Also update state for UI display
      setCapturedImagesMap(prev => ({ ...prev, [imageType]: imageData }))
      setCapturedImages(prev => [...prev, imageData])

      console.log(`Captured ${imageType} image`)
    }

    // All 4 captured - proceed to processing
    setIsCapturing(false)
    stopDetection()
    stopCamera()

    // Pass images directly from local variables
    await processScannedImages(capturedImagesMapLocal, capturedImagesArray)
  }

  useEffect(() => {
    startAutoCaptureRef.current = startAutoCapture
  }, [startAutoCapture])

  // Process scanned images - handles backend API calls
  const processScannedImages = async (imagesMapArg, imagesArray) => {
    if (!imagesArray || imagesArray.length === 0) {
      setLocalError("No images captured")
      return
    }

    const imagesToSend = {
      front: imagesMapArg.front,
      left: imagesMapArg.left,
      right: imagesMapArg.right,
      back: imagesMapArg.back
    }

    setLocalError(null)
    clearError()
    setMultiLoading(true)

    try {
      const normalizeToBase64 = async (img) => {
        if (!img) return null
        if (typeof img === "string") {
          return img.includes(",") ? img.split(",")[1] : img
        }
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.readAsDataURL(img)
          reader.onload = () => {
            const result = reader.result
            const base64 = result.split(",")[1]
            resolve(base64)
          }
          reader.onerror = reject
        })
      }

      const base64Images = {
        front: await normalizeToBase64(imagesToSend.front),
        back: await normalizeToBase64(imagesToSend.back),
        left: await normalizeToBase64(imagesToSend.left),
        right: await normalizeToBase64(imagesToSend.right),
      }

      const base64Values = Object.values(base64Images).filter(Boolean)
      if (base64Values.length === 0 || !base64Values.every(v => typeof v === "string")) {
        setLocalError("Image conversion failed. Please try again.")
        setMultiLoading(false)
        return
      }

      const confirmedHeightCm = getConfirmedHeightCm(userHeight, heightConfirmed)
      const heightParam = confirmedHeightCm
      console.log("Height confirmation:", { heightConfirmed, confirmedHeightCm })

      const orderedImages = [
        ["front", base64Images.front],
        ["back", base64Images.back],
        ["left", base64Images.left],
        ["right", base64Images.right],
      ]

      const responses = []
      for (const [imageType, imageData] of orderedImages) {
        if (!imageData) {
          responses.push(null)
          continue
        }

        console.log(`Processing ${imageType} scan...`)
        const response = await scanMeasureEnhanced(imageData, heightParam)
        responses.push(response)
      }

      console.log("Individual responses:", responses)
      console.log(
        "Keypoints detected:",
        responses.map((response, index) => ({
          index,
          keypoints: getKeypointsDetected(response),
          scan_type: response?.scan_type || null,
        }))
      )
      console.log("Full scan responses:", JSON.stringify(responses, null, 2))

      const visResponse = await scanMeasureMultiple(base64Images, heightParam)
      console.log("Multi-image scan response:", JSON.stringify(visResponse, null, 2))
      if (visResponse && visResponse.images) {
        setMultiScanResults({ images: visResponse.images })
      }

      const validResponses = responses.filter((response) => {
        if (!response?.measurements) return false
        return RELIABLE_MEASUREMENT_KEYS.some((key) => {
          const value = response.measurements?.[key]
          return typeof value === "number" && value > 0
        })
      })

      const hasMultiMeasurements = RELIABLE_MEASUREMENT_KEYS.some((key) => {
        const value = visResponse?.measurements?.[key]
        return typeof value === "number" && value > 0
      })

      if (validResponses.length === 0 && !hasMultiMeasurements) {
        logCaptureStage("scan-failed-no-valid-measurements", {
          responsesReceived: responses.filter(Boolean).length,
          multiResponseSuccess: visResponse?.success || false,
        })
        const backendWarnings = [
          ...(visResponse?.warnings || []),
          ...responses.flatMap((response) => response?.warnings || []),
        ]
        const dedupedWarnings = backendWarnings.length > 0
          ? [...new Set(backendWarnings)]
          : ["No measurements detected. Please retake scan."]

        setScanClassification({ type: "invalid", confidence: 0 })
        setWarnings(dedupedWarnings)
        setConfidenceScores({})
        setMultiLoading(false)
        setLocalError(dedupedWarnings[0] || "No measurements detected. Please retake scan.")
        return
      }

      const warnings = validResponses.length > 0
        ? [...new Set([
            ...validResponses.flatMap(r => r.warnings || []),
            ...(visResponse?.warnings || [])
          ])]
        : [...new Set(visResponse?.warnings || ["Scan failed. Please ensure full body is visible and try again."])]

      const confidenceList = validResponses.map(r => r.confidence || {})
      const combinedConfidence = {}
      confidenceList.forEach(conf => {
        Object.keys(conf).forEach(key => {
          if (!combinedConfidence[key]) combinedConfidence[key] = []
          if (typeof conf[key] === "number") {
            combinedConfidence[key].push(conf[key])
          }
        })
      })

      Object.keys(combinedConfidence).forEach(key => {
        const values = combinedConfidence[key]
        combinedConfidence[key] = values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0
      })

      // Use fusion confidence directly if available (from ellipse fusion)
      const fusionConfidence = visResponse?.fusion_debug?.confidence
      if (typeof fusionConfidence === 'number' && fusionConfidence > 0) {
        // Apply fusion confidence to circumference measurements
        combinedConfidence['chest'] = fusionConfidence
        combinedConfidence['waist'] = fusionConfidence
        combinedConfidence['hips'] = fusionConfidence
      } else if (visResponse?.confidence) {
        // Fall back to per-image confidence only when no fusion available
        const confidenceEntries = Object.entries(visResponse.confidence)
        confidenceEntries.forEach(([key, value]) => {
          if (typeof value === "number") {
            combinedConfidence[key] = Math.max(combinedConfidence[key] || 0, value)
          } else if (typeof value === "string") {
            const normalizedKey = key === "shoulders" ? "shoulder_width" : key
            const levelScore =
              value === "high" ? 0.9 :
              value === "medium" ? 0.65 :
              value === "low" ? 0.35 : 0
            combinedConfidence[normalizedKey] = Math.max(combinedConfidence[normalizedKey] || 0, levelScore)
          }
        })
      }

      const averagedMeasurements = {
        height: 0,
        chest: 0,
        waist: 0,
        hips: 0,
        shoulder_width: 0,
      }

      MEASUREMENT_KEYS.forEach((key) => {
        const values = validResponses
          .map(r => r.measurements?.[key])
          .filter(v => typeof v === "number" && v > 0)
        if (values.length > 0) {
          averagedMeasurements[key] = values.reduce((a, b) => a + b, 0) / values.length
        }
      })

      const finalMeasurements = {
        ...averagedMeasurements,
        ...(visResponse?.measurements || {}),
      }

      const finalConfidence = { ...combinedConfidence }
      if (confirmedHeightCm !== null) {
        finalMeasurements.height = confirmedHeightCm
        finalConfidence.height = 1.0
      }

      const excludedMeasurements = []
      MEASUREMENT_KEYS.forEach((key) => {
        if (key === "height" && confirmedHeightCm !== null) return
        const score = finalConfidence[key]
        if (typeof score === "number" && score < CONFIDENCE_THRESHOLD) {
          finalMeasurements[key] = 0
          excludedMeasurements.push(key)
        }
      })
      if (excludedMeasurements.length > 0) {
        console.log("Excluded low-confidence measurements:", excludedMeasurements)
      }

      const reliableMeasurementCount = RELIABLE_MEASUREMENT_KEYS.filter((key) => {
        const score = finalConfidence[key]
        return typeof score === "number" && score >= CONFIDENCE_THRESHOLD && finalMeasurements[key] > 0
      }).length
      if (reliableMeasurementCount < 2) {
        setMultiLoading(false)
        setLocalError("Fewer than two reliable measurements were detected. Please retake scan.")
        return
      }

      let finalScanType = "invalid"
      const scanTypes = [
        ...validResponses.map(r => r.scan_type),
        visResponse?.scan_type,
      ].filter(Boolean)
      if (scanTypes.includes("full_body")) {
        finalScanType = "full"
      } else if (scanTypes.includes("upper_body")) {
        finalScanType = "partial"
      }

      const classificationConfidence =
        finalConfidence.overall || Math.max(...Object.values(finalConfidence), 0)

      console.log("Final Type:", finalScanType)
      console.log("Confidence:", finalConfidence)
      console.log("Warnings:", warnings)
      console.log("Final Measurements:", finalMeasurements)
      console.log("Height used for calibration:", confirmedHeightCm)

      setScanClassification({ type: finalScanType, confidence: classificationConfidence })
      setWarnings(warnings)
      setConfidenceScores(finalConfidence)

      if (finalScanType === "invalid") {
        setMultiLoading(false)
        setLocalError("Scan failed. Please ensure full body is visible and try again.")
        return
      }

      if (!finalMeasurements || finalMeasurements.height <= 0) {
        setMultiLoading(false)
        setLocalError("Invalid measurements returned - please try again with better lighting")
        return
      }

      setMeasurements(finalMeasurements)
      setMultiLoading(false)

      setTimeout(() => {
        navigate("/size-result")
      }, 3500)

    } catch (err) {
      console.error("Scan error:", err)
      setMultiLoading(false)
      setLocalError(err.message || "An error occurred during scanning")
    }
  }
  // Save height to localStorage only if valid, then proceed
  const handleHeightConfirm = () => {
    if (isValidHeight(userHeight)) {
      localStorage.setItem('userHeight', userHeight)
      setHeightConfirmed(true)
      setShowHeightInput(false)
    }
  }

  const handleSkipToManual = () => {
    stopCamera()
    navigate("/size-result", { state: { manual: true } })
  }

  return (
    <div className="min-h-screen bg-[#e7e3dd] flex flex-col items-center justify-center text-center px-4">

      {/* Title */}
      <h1 className="text-3xl font-light text-charcoal-900">
        Body Scan
      </h1>

      {/* Camera Error Display */}
      {cameraError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
          <p className="text-sm text-red-700 font-medium">Camera Error</p>
          <p className="text-sm text-red-600 mt-1">{cameraError}</p>
          <button
            onClick={() => {
              setCameraError(null)
              window.location.reload()
            }}
            className="mt-3 text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Real-time detection status */}
      {mediapipeLoaded && !mediapipeLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Real-time pose detection active
        </div>
      )}

      {/* Subtitle */}
      <p className="mt-2 text-sm text-charcoal-700/70">
        {activeInstruction}
      </p>

      {/* Height Input for Calibration */}
      {showHeightInput && step === 1 && (
        <div className="mt-4 bg-white/80 rounded-lg p-4 max-w-md">
          <p className="text-sm text-gray-600 mb-2">
            For accurate measurements, enter your height:
          </p>
          {hasCachedHeight && (
            <p className="text-xs text-blue-600 mb-2">
              Previously used height: {userHeight} cm - You can edit before confirming
            </p>
          )}
          <div className="flex gap-2 justify-center items-center">
            <input
              type="number"
              placeholder="Your height (cm)"
              value={userHeight}
              onChange={(e) => {
                setUserHeight(e.target.value)
                setHeightConfirmed(false)
              }}
              className="border rounded px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-clay"
            />
            <button
              onClick={handleHeightConfirm}
              disabled={!isValidHeight(userHeight)}
              className="text-sm bg-clay text-white px-3 py-1 rounded disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                // Skip does NOT save anything to localStorage
                setHeightConfirmed(false)
                setShowHeightInput(false)
              }}
              className="text-sm text-clay underline"
            >
              Skip
            </button>
          </div>
          {hasCachedHeight && (
            <button
              onClick={() => {
                clearHeight()
                setUserHeight("")
                setHasCachedHeight(false)
                setHeightConfirmed(false)
              }}
              className="text-xs text-gray-500 underline mt-2"
            >
              Clear saved height and start fresh
            </button>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Providing your height (100-250 cm) enables calibrated measurements for better accuracy
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

          {/* Canvas overlay for landmarks - always visible when MediaPipe is loaded */}
          <canvas
            ref={overlayCanvasRef}
            className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${mediapipeLoaded && !mediapipeLoading ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          />

          {/* Framing guidance overlay */}
          {mediapipeLoaded && !mediapipeLoading && (
            <FramingOverlay state={framing} />
          )}

          {/* Auto-capture countdown overlay */}
          {countdownActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
              <span className="text-9xl font-bold text-white animate-pulse">
                {countdownNumber}
              </span>
            </div>
          )}

          {/* Auto-capture stabilizing message */}
          {stabilizing && !countdownActive && (
            <div className="absolute bottom-24 left-0 right-0 text-center z-40">
              <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-full inline-block">
                Hold still for auto-capture...
              </p>
            </div>
          )}

          {/* MediaPipe loading indicator */}
          {mediapipeLoading && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
              <LoadingSpinner size="md" color="white" />
              <p className="mt-2 text-sm">Loading pose detection...</p>
            </div>
          )}

          {/* Loading overlay for backend processing */}
          {(loading || multiLoading) && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
              <LoadingSpinner size="lg" color="white" />
              <p className="mt-4">Analyzing body posture...</p>
            </div>
          )}

          {/* Countdown overlay */}
          {countingDown && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white">
              {manualCountdownNumber > 0 ? (
                <>
                  <p className="text-8xl font-bold text-clay animate-pulse">{manualCountdownNumber}</p>
                  <p className="mt-4 text-lg">
                    {isCapturing ? activeInstruction : "Get ready!"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-4xl font-bold text-clay">Turn to next position</p>
                  <p className="mt-4 text-lg">
                    {activeInstruction}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2x2 Grid Display - Shows all 4 images with landmarks after scan completes */}
      {multiScanResults && multiScanResults.images && multiScanResults.images.length > 0 && (
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
                          // Use landmarks directly - CSS scale-x-[-1] on canvas handles mirroring
                          const mirroredLandmarks = landmarks

                          const connections = [
                            [11, 12], [23, 24], [11, 23], [12, 24],
                            [23, 25], [25, 27], [24, 26], [26, 28],
                            [11, 13], [13, 15], [12, 14], [14, 16],
                          ]

                          ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'
                          ctx.lineWidth = 2

                          connections.forEach(([startIdx, endIdx]) => {
                            if (startIdx < mirroredLandmarks.length && endIdx < mirroredLandmarks.length) {
                              const start = mirroredLandmarks[startIdx]
                              const end = mirroredLandmarks[endIdx]
                              ctx.beginPath()
                              ctx.moveTo(start.x * width, start.y * height)
                              ctx.lineTo(end.x * width, end.y * height)
                              ctx.stroke()
                            }
                          })

                          mirroredLandmarks.forEach((landmark, index) => {
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
        onClick={startAutoCapture}
        disabled={loading || countingDown || isCapturing || !['ideal', 'near_too_far', 'near_too_close'].includes(framing.status)}
        className={`mt-6 text-sm relative group transition-all duration-300 ${
          loading || countingDown || isCapturing || !['ideal', 'near_too_far', 'near_too_close'].includes(framing.status)
            ? "text-gray-400 cursor-not-allowed"
            : "text-charcoal-900"
        }`}
      >
        <span className="relative z-10">
          {loading ? "Processing..." : isCapturing ? "Scanning..." : ['ideal', 'near_too_far', 'near_too_close'].includes(framing.status) ? (stabilizing && !countdownActive ? "Hold for auto..." : "Start Scan") : "Waiting for good framing..."}
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
        {isCapturing ? `Capturing ${currentCaptureStep} of 4` : `Step ${step} of 4`}
      </p>

      {/* Dots */}
      <div className="flex gap-2 mt-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full ${
              s === (isCapturing ? currentCaptureStep : step) ? "bg-charcoal-900" : "bg-gray-300"
            }`}
          />
        ))}
      </div>

    </div>
  )
}

export default BodyScan
