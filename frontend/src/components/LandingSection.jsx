import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingSection({ image }) {
  const cardRef = useRef(null)
  const navigate = useNavigate()

  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = (e) => {
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotateY = ((x - centerX) / centerX) * 6
    const rotateX = -((y - centerY) / centerY) * 6

    setTilt({ x: rotateX, y: rotateY })
  }

  const handleMouseEnter = () => setIsHovering(true)

  const handleMouseLeave = () => {
    setIsHovering(false)
    setTilt({ x: 0, y: 0 })
  }


  return (
    <div className="relative flex flex-col items-center justify-center h-full animate-fade-up stagger-2">

      {/* IMAGE CARD (NO CLICK NAVIGATION) */}
      <div
        ref={cardRef}
        className="relative w-full cursor-crosshair"
        style={{ perspective: '1200px' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="tilt-card relative overflow-hidden rounded-md shadow-[0_20px_60px_rgba(44,43,40,0.12)]"
          style={{
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHovering ? 1.02 : 1})`,
            transition: isHovering ? 'transform 0.1s ease-out' : 'transform 0.5s ease-out',
          }}
        >
          <img
            src={image?.src || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=90'}
            alt={image?.alt || 'Featured fashion look'}
            className="w-full object-cover object-top"
            style={{ height: 'clamp(420px, 70vh, 680px)' }}
          />

          <div
            className="absolute inset-0 bg-gradient-to-t from-charcoal-700/20 to-transparent transition-opacity duration-300"
            style={{ opacity: isHovering ? 1 : 0 }}
          />

          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <span className="font-mono text-[9px] tracking-widest text-cream-100/70 uppercase">
              Look {image?.id ? String(image.id).padStart(2, '0') : '01'}
            </span>
            <div className="w-8 h-px bg-cream-100/40" />
          </div>
        </div>
      </div>

     

      {/* Decorative label */}
      <div className="mt-6 text-center select-none">
        <span className="font-display italic text-4xl font-light text-charcoal-700/12 tracking-wide">
          virtual fashion
        </span>
      </div>
    </div>
  )
}