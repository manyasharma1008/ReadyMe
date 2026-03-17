import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

function BodyScan() {

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const navigate = useNavigate()

  const [step, setStep] = useState(1)

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
          video: true
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

    // cleanup when leaving page
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

  const capture = () => {

    if (step < 4) {

      setStep(step + 1)

    } else {

      stopCamera()
      navigate("/size-result")

    }

  }

  return (

    <div
      style={{
        textAlign: "center",
        padding: "40px"
      }}
    >

      <h2>Body Scan</h2>

      <p>{instructions[step - 1]}</p>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        width="420"
        style={{
          borderRadius: "10px",
          marginTop: "20px"
        }}
      />

      <br />

      <button
        onClick={capture}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          cursor: "pointer"
        }}
      >
        Capture
      </button>

      <p style={{ marginTop: "10px" }}>
        Step {step} of 4
      </p>

    </div>

  )

}

export default BodyScan