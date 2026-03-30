import { useEffect, useRef, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useScanImage } from "../hooks"
import { useMediaPipe } from "../hooks/useMediaPipe"
import { useApp } from "../context/AppContext"
import { scanMeasureEnhanced, scanMeasureMultiple } from "../api"
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

  // Use local error state for scan errors
  const displayError = localError || scanError || mediapipeError

  const instructions = [
    "Stand facing the camera (Front)",
    "Turn to your left side",
    "Turn to your right side",
    "Turn your back to the camera"
  ]

  // Start real-time landmark detection when video is ready
  useEffect(() => {
    if (!mediapipeLoaded || !videoRef.current) return

    const video = videoRef.current

    // Wait for video to be ready, then start detection
    const handleLoadedMetadata = () => {
      // Start continuous detection
      startDetection(video, (landmarks) => {
        // Update current landmarks state for display
        if (landmarks && landmarks.length > 0 && overlayCanvasRef.current) {
          setCurrentLandmarks(landmarks)
          // Draw in real-time mode (showLandmarks = true during preview)
          if (showLandmarks) {
            drawLandmarksOnCanvas(overlayCanvasRef.current, video, landmarks, video.videoWidth || 520, video.videoHeight || 300)
          }
        }
      })
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    // If video already loaded
    if (video.readyState >= 1) {
      startDetection(video, (landmarks) => {
        if (landmarks && landmarks.length > 0 && overlayCanvasRef.current) {
          setCurrentLandmarks(landmarks)
          // Always draw landmarks in real-time
          drawLandmarksOnCanvas(overlayCanvasRef.current, video, landmarks, video.videoWidth || 520, video.videoHeight || 300)
        }
      })
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
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
    setMultiScanResults(null)

    // Keep showing landmarks during scanning
    setShowLandmarks(true)

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
      // Stop real-time detection when done
      stopDetection()
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
        // STEP 1: SAFE BASE64 NORMALIZATION
        const normalizeToBase64 = async (img) => {
          if (!img) return null;
          if (typeof img === "string") {
            return img.includes(",") ? img.split(",")[1] : img;
          }
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(img);
            reader.onload = () => {
              const result = reader.result;
              const base64 = result.split(",")[1];
              resolve(base64);
            };
            reader.onerror = reject;
          });
        };

        // STEP 2: CONVERT ALL IMAGES
        const base64Images = {
          front: await normalizeToBase64(imagesToSend.front),
          back: await normalizeToBase64(imagesToSend.back),
          left: await normalizeToBase64(imagesToSend.left),
          right: await normalizeToBase64(imagesToSend.right),
        };

        // Safety check
        const base64Values = Object.values(base64Images).filter(Boolean);
        if (base64Values.length === 0 || !base64Values.every(v => typeof v === "string")) {
          setLocalError("Image conversion failed. Please try again.");
          setMultiLoading(false);
          return;
        }

        console.log("ENHANCED PIPELINE ACTIVE ✅");
        console.log("Base64 Images prepared:", Object.keys(base64Images));

        // STEP 3: CALL ENHANCED ENDPOINT (PARALLEL)
        const heightVal = parseFloat(userHeight);
        const heightParam =
          userHeight && heightVal > 100 && heightVal < 250 ? heightVal : null;

        const responses = await Promise.all([
          base64Images.front
            ? scanMeasureEnhanced(base64Images.front, heightParam)
            : null,
          base64Images.back
            ? scanMeasureEnhanced(base64Images.back, heightParam)
            : null,
          base64Images.left
            ? scanMeasureEnhanced(base64Images.left, heightParam)
            : null,
          base64Images.right
            ? scanMeasureEnhanced(base64Images.right, heightParam)
            : null,
        ]);

        // FIX 5: LOG EACH ANGLE (DEBUG GOLD)
        responses.forEach((r, i) => {
          console.log(`Response ${i}:`, r);
        });

        setMultiLoading(false)

        // STEP 4: SAFE RESPONSE FILTERING
        const validResponses = responses.filter(
          (r) => r && r.measurements && Object.keys(r.measurements).length > 0
        );

        // FIX 2: HANDLE NO VALID RESPONSES
        if (validResponses.length === 0) {
          console.error("No valid scan responses ❌");

          setScanClassification({ type: "invalid", confidence: 0 });
          setWarnings(["Scan failed. Please ensure full body is visible and try again."]);
          setConfidenceScores({});

          return;
        }

        // STEP 5: COMBINE CLASSIFICATION
        const scanTypes = validResponses.map(r => r.scan_type);
        let finalScanType = "invalid";
        if (scanTypes.includes("full_body")) {
          finalScanType = "full_body";
        } else if (scanTypes.includes("upper_body")) {
          finalScanType = "upper_body";
        }

        // STEP 6: COMBINE WARNINGS (FIX 3: DEDUPLICATE)
        const warnings = [
          ...new Set(validResponses.flatMap(r => r.warnings || []))
        ];

        // STEP 7: COMBINE CONFIDENCE (FIX 4: SAFE AVERAGING)
        const confidenceList = validResponses.map(r => r.confidence || {});
        const combinedConfidence = {};

        confidenceList.forEach(conf => {
          Object.keys(conf).forEach(key => {
            if (!combinedConfidence[key]) combinedConfidence[key] = [];
            if (typeof conf[key] === "number") {
              combinedConfidence[key].push(conf[key]);
            }
          });
        });

        Object.keys(combinedConfidence).forEach(key => {
          const values = combinedConfidence[key];
          if (values.length > 0) {
            combinedConfidence[key] =
              values.reduce((a, b) => a + b, 0) / values.length;
          } else {
            combinedConfidence[key] = 0;
          }
        });

        // STEP 8: COMBINE MEASUREMENTS (average all valid)
        const measurementsList = validResponses.map(r => r.measurements);
        const finalMeasurements = {
          height: 0,
          chest: 0,
          waist: 0,
          hips: 0,
          shoulder_width: 0,
        };

        const measurementKeys = ["height", "chest", "waist", "hips", "shoulder_width"];
        measurementKeys.forEach(key => {
          const values = measurementsList
            .map(m => m[key])
            .filter(v => typeof v === "number" && v > 0);
          if (values.length > 0) {
            finalMeasurements[key] = values.reduce((a, b) => a + b, 0) / values.length;
          }
        });

        // Debug logs
        console.log("Final Type:", finalScanType);
        console.log("Confidence:", combinedConfidence);
        console.log("Warnings:", warnings);
        console.log("Final Measurements:", finalMeasurements);

        // STEP 9: SET STATE (FIX 6: BETTER CLASSIFICATION CONFIDENCE)
        setScanClassification({
          type: finalScanType,
          confidence:
            combinedConfidence.overall ||
            Math.max(...Object.values(combinedConfidence), 0)
        });

        setWarnings(warnings);
        setConfidenceScores(combinedConfidence);
        setMeasurements(finalMeasurements);

        // Handle invalid scans
        if (finalScanType === 'invalid') {
          setLocalError("Scan failed. Please ensure full body is visible and try again.")
          return
        }

        // Validate final measurements
        if (!finalMeasurements || finalMeasurements.height <= 0) {
          setLocalError("Invalid measurements returned")
          return
        }

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

  // Automated multi-capture function - captures 4 images with countdowns
  const startAutoCapture = async () => {
    if (isCapturing || countingDown || loading) return

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

      // Show "turn to next pose" message for steps 2-4
      if (i > 0) {
        setCountingDown(true)
        setCountdownNumber(0)
        // Give user 3 seconds to turn to next position
        for (let t = 3; t > 0; t--) {
          setCountdownNumber(-t) // negative to show "turn" message
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Safety check: ensure landmarks exist before capture
      if (!currentLandmarks || currentLandmarks.length === 0) {
        setLocalError("Please stand properly in frame")
        setIsCapturing(false)
        setCountingDown(false)
        return
      }

      // Countdown: 3 -> 2 -> 1
      setCountingDown(true)
      for (let t = 3; t > 0; t--) {
        setCountdownNumber(t)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      setCountingDown(false)

      // Capture frame
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

  // Process scanned images - handles backend API calls
  const processScannedImages = async (imagesMapArg, imagesArray) => {
    if (!imagesArray || imagesArray.length === 0) {
      setLocalError("No images captured")
      return
    }

    // Build images object
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
      // Normalize to base64
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

      // Safety check
      const base64Values = Object.values(base64Images).filter(Boolean)
      if (base64Values.length === 0 || !base64Values.every(v => typeof v === "string")) {
        setLocalError("Image conversion failed. Please try again.")
        setMultiLoading(false)
        return
      }

      console.log("ENHANCED PIPELINE ACTIVE ✅")
      console.log("Base64 Images prepared:", Object.keys(base64Images))
      console.log("Image lengths:", {
        front: base64Images.front?.length,
        back: base64Images.back?.length,
        left: base64Images.left?.length,
        right: base64Images.right?.length,
      })

      // Call measure-multiple endpoint (returns images with landmarks for 2x2 grid)
      const heightVal = parseFloat(userHeight)
      const heightParam = userHeight && heightVal > 100 && heightVal < 250 ? heightVal : null

      // First, get measurements from each image individually (like original manual flow)
      const responses = await Promise.all([
        base64Images.front ? scanMeasureEnhanced(base64Images.front, heightParam) : null,
        base64Images.back ? scanMeasureEnhanced(base64Images.back, heightParam) : null,
        base64Images.left ? scanMeasureEnhanced(base64Images.left, heightParam) : null,
        base64Images.right ? scanMeasureEnhanced(base64Images.right, heightParam) : null,
      ])

      console.log("Individual responses:", responses)

      setMultiLoading(false)

      // Filter valid responses
      const validResponses = responses.filter(
        (r) => r && r.measurements && Object.keys(r.measurements).length > 0
      )

      if (validResponses.length === 0) {
        console.error("No valid scan responses ❌")
        setScanClassification({ type: "invalid", confidence: 0 })
        setWarnings(["Scan failed. Please ensure full body is visible and try again."])
        setConfidenceScores({})
        return
      }

      // Now get visualization data from measure-multiple for the 2x2 grid
      const visResponse = await scanMeasureMultiple(base64Images, heightParam)

      // Set multiScanResults for 2x2 grid display (from visualize endpoint)
      if (visResponse && visResponse.images) {
        setMultiScanResults({ images: visResponse.images })
      }

      console.log("Valid responses count:", validResponses.length)

      // Combine measurements from all valid responses
      const measurementsList = validResponses.map(r => r.measurements)
      const finalMeasurements = {
        height: 0,
        chest: 0,
        waist: 0,
        hips: 0,
        shoulder_width: 0,
      }

      const measurementKeys = ["height", "chest", "waist", "hips", "shoulder_width"]
      measurementKeys.forEach(key => {
        const values = measurementsList
          .map(m => m[key])
          .filter(v => typeof v === "number" && v > 0)
        if (values.length > 0) {
          finalMeasurements[key] = values.reduce((a, b) => a + b, 0) / values.length
        }
      })

      console.log("Final measurements:", finalMeasurements)

      // Combine scan types
      const scanTypes = validResponses.map(r => r.scan_type)
      let finalScanType = "invalid"
      if (scanTypes.includes("full_body")) {
        finalScanType = "full_body"
      } else if (scanTypes.includes("upper_body")) {
        finalScanType = "upper_body"
      }

      // Combine warnings
      const warnings = [...new Set(validResponses.flatMap(r => r.warnings || []))]

      // Combine confidence
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
        if (values.length > 0) {
          combinedConfidence[key] = values.reduce((a, b) => a + b, 0) / values.length
        } else {
          combinedConfidence[key] = 0
        }
      })

      console.log("Final Type:", finalScanType)
      console.log("Confidence:", combinedConfidence)
      console.log("Warnings:", warnings)
      console.log("Final Measurements:", finalMeasurements)

      // Set state
      setScanClassification({
        type: finalScanType,
        confidence: combinedConfidence.overall || Math.max(...Object.values(combinedConfidence), 0)
      })

      setWarnings(warnings)
      setConfidenceScores(combinedConfidence)
      setMeasurements(finalMeasurements)

      // Handle invalid scans
      if (finalScanType === "invalid") {
        setLocalError("Scan failed. Please ensure full body is visible and try again.")
        return
      }

      // Validate final measurements
      console.log("Validating measurements - height:", finalMeasurements?.height)
      if (!finalMeasurements || finalMeasurements.height <= 0) {
        console.error("Measurements validation failed:", finalMeasurements)
        setLocalError("Invalid measurements returned - please try again with better lighting")
        return
      }

      // Navigate after 3.5 seconds
      setTimeout(() => {
        navigate("/size-result")
      }, 3500)

    } catch (err) {
      console.error("Scan error:", err)
      setLocalError(err.message || "An error occurred during scanning")
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

      {/* Real-time detection status */}
      {mediapipeLoaded && !mediapipeLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Real-time pose detection active
        </div>
      )}

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

          {/* Canvas overlay for landmarks - always visible when MediaPipe is loaded */}
          <canvas
            ref={overlayCanvasRef}
            className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${mediapipeLoaded && !mediapipeLoading ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          />

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
              {countdownNumber > 0 ? (
                <>
                  <p className="text-8xl font-bold text-clay animate-pulse">{countdownNumber}</p>
                  <p className="mt-4 text-lg">
                    {isCapturing ? instructions[currentCaptureStep - 1] : "Get ready!"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-4xl font-bold text-clay">Turn to next position</p>
                  <p className="mt-4 text-lg">
                    {instructions[currentCaptureStep - 1]}
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
        disabled={loading || countingDown || isCapturing}
        className={`mt-6 text-sm relative group transition-all duration-300 ${
          loading || countingDown || isCapturing
            ? "text-gray-400 cursor-not-allowed"
            : "text-charcoal-900"
        }`}
      >
        <span className="relative z-10">
          {loading ? "Processing..." : isCapturing ? "Scanning..." : "Start Scan"}
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