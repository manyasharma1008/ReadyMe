import { useNavigate } from "react-router-dom"

export default function CameraPermission() {

  const navigate = useNavigate()

  const handleAllowCamera = () => {
    navigate("/scan")
  }

  const handleManualEntry = () => {
    navigate("/size-result", { state: { manual: true } })
  }

  return (
    <div className="min-h-screen bg-[#e7e3dd] flex items-center justify-center px-4">

      <div className="w-full max-w-md bg-cream-50 border border-charcoal-700/10 rounded-md shadow-[0_20px_60px_rgba(44,43,40,0.12)] p-8 flex flex-col items-center text-center">

        <h1 className="text-2xl font-light">
          Enable Camera Access
        </h1>

        <p className="mt-3 text-sm text-charcoal-700/60">
          We need camera access to scan your body and generate your avatar.
        </p>

        <div className="w-full h-px bg-charcoal-700/10 my-6" />
        <div className="flex flex-col gap-3 w-full">

  <button
    onClick={handleAllowCamera}
    className="cta-btn border border-charcoal-700 px-8 py-3 font-mono text-xs tracking-[0.2em] uppercase w-full"
  >
    <span>ALLOW CAMERA</span>
  </button>

  <button
    onClick={handleManualEntry}
    className="cta-btn border border-charcoal-700 px-8 py-3 font-mono text-xs tracking-[0.2em] uppercase w-full"
  >
    <span>ENTER SIZES MANUALLY</span>
  </button>

</div>
      </div>
    </div>
  )
}