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

  const handleCapture = async () => {
    clearError()

    const imageData = captureFrame()
    if (!imageData) return

    const newImages = [...capturedImages, imageData]
    setCapturedImages(newImages)

    if (step < 4) {
      setStep(step + 1)
    } else {
      stopCamera()

      const frontImage = newImages[0] || imageData

      try {
        const measurements = await scan(frontImage)

        if (measurements) {
          setMeasurements(measurements)
          navigate("/size-result")
        }
      } catch (err) {
        console.error("Scan failed:", err)
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

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera */}
      <div className="mt-8 flex justify-center">
        <div className="w-[520px] h-[300px] rounded-xl overflow-hidden shadow-md bg-black relative">

          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
              <LoadingSpinner size="lg" color="white" />
              <p className="mt-4">Analyzing your body...</p>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-md mx-auto mt-4">
          <ErrorMessage
            error={error}
            title="Scan Failed"
            onRetry={clearError}
          />
        </div>
      )}

      {/* Capture Button */}
      <button
        onClick={handleCapture}
        disabled={loading}
        className={`mt-6 text-sm relative group transition-all duration-300 ${
          loading
            ? "text-gray-400 cursor-not-allowed"
            : "text-charcoal-900"
        }`}
      >
        <span className="relative z-10">
          {loading ? "Processing..." : "Capture"}
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