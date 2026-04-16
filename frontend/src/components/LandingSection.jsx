import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"

export default function LandingSection({
  image,
  images = [],
  slideDuration = 3000,
  onSelectImage,
  isScanned,
  onPreview
}) {
  const cardRef = useRef(null)
  const navigate = useNavigate()

  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)
  const [progressKey, setProgressKey] = useState(0)

  const handleMouseMove = (e) => {
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 6
    const rotateX = -((y - rect.height / 2) / (rect.height / 2)) * 6

    setTilt({ x: rotateX, y: rotateY })
  }

  useEffect(() => {
    setProgressKey((current) => current + 1)
  }, [image?.id])

  return (
    <div className="relative flex flex-col items-center justify-center h-full animate-fade-up stagger-2">

      {/* IMAGE */}
      <div
        ref={cardRef}
        className="relative w-full"
        style={{ perspective: "1200px" }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false)
          setTilt({ x: 0, y: 0 })
        }}
      >
        <motion.div
          className="relative overflow-hidden rounded-md shadow-[0_20px_60px_rgba(44,43,40,0.12)] transition-transform duration-200 ease-out will-change-transform"
          style={{
            transform: isHovering
              ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
              : "rotateX(0deg) rotateY(0deg)"
          }}
        >
          <div
            className="relative overflow-hidden"
            style={{ height: "clamp(420px, 70vh, 680px)" }}
          >
            <AnimatePresence mode="wait">
              <motion.img
                key={image?.id || "default-look"}
                src={
                  image?.src ||
                  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=90"
                }
                alt={image?.alt || "Featured fashion look"}
                className="absolute inset-0 w-full h-full object-cover object-top"
                initial={{ opacity: 0, x: 36, scale: 1.03 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -36, scale: 0.99 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              />
            </AnimatePresence>
          </div>

          {/* ✅ ADD THIS OVERLAY */}
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal-700/20 to-transparent" />

          {/* ✅ ADD THIS LOOK LABEL */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <span className="font-mono text-[9px] tracking-widest text-cream-100/70 uppercase">
              Look {image?.id ? String(image.id).padStart(2, "0") : "01"}
            </span>
            <div className="w-8 h-px bg-cream-100" />
          </div>

        </motion.div>
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex w-full items-center gap-4 px-1">
          <div className="flex items-center gap-2">
            {images.map((slide) => {
              const isActive = slide.id === image?.id

              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => onSelectImage?.(slide)}
                  aria-label={`Show ${slide.alt || `Look ${slide.id}`}`}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isActive ? "w-8 bg-charcoal-700" : "w-2 bg-charcoal-700/25 hover:bg-charcoal-700/50"
                  }`}
                />
              )
            })}
          </div>

          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-charcoal-700/10">
            <motion.div
              key={progressKey}
              className="h-full origin-left bg-clay"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: slideDuration / 1000, ease: "linear" }}
            />
          </div>

          <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-charcoal-700/45">
            Auto
          </span>
        </div>
      )}

      {/* BUTTONS */}
      <div className="mt-10 flex items-center gap-4">

        {/* Body Scan */}
        <button
          onClick={() => navigate("/camera")}
          className="cta-btn border border-charcoal-700 px-8 py-3 font-mono text-xs tracking-[0.2em] uppercase text-charcoal-700"
        >
          <span>BODY SCAN</span>
        </button>

        {/* Explore */}
        <button
          onClick={() => {
            if (onPreview) {
              onPreview()
              return
            }

            navigate("/preview")
          }}
          className="cta-btn border border-charcoal-700 px-8 py-3 font-mono text-xs tracking-[0.25em] uppercase text-charcoal-700 transition"
        >
          <span>EXPLORE VIRTUAL TRY-ON</span>
        </button>

      </div>

      {!isScanned && (
        <p className="text-xs text-charcoal-700/40 mt-2">
          Demo preview is available before scan
        </p>
      )}

      <div className="mt-6 text-center">
        <span className="font-display italic text-4xl text-charcoal-700/12">
          virtual fashion
        </span>
      </div>
    </div>
  )
}
