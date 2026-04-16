import { useNavigate } from "react-router-dom"

const PRIMARY_FEATURES = [
  {
    icon: '◈',
    label: '3D Visualization',
    desc: 'Photo-realistic cloth simulation rendered in real-time.',
  },
  {
    icon: '◎',
    label: 'Smart Fit AI',
    desc: 'AI maps your measurements to every garment instantly.',
  },
  {
    icon: '◐',
    label: 'Realistic Rendering',
    desc: 'Fabric drape, texture and lighting at near-physical fidelity.',
  },
]

const SECONDARY_TAGS = [
  'Virtual Try-On',
  'AR Mirror',
  'AI Fit Prediction',
]

export default function FeaturePanel({ currentLook, onTryOn }) {

  const navigate = useNavigate()

  const handleTagClick = (tag) => {
    if (tag === "Virtual Try-On") {
      if (onTryOn) {
        onTryOn()
      } else {
        navigate("/camera")
      }
    }
  }

  return (
    <div className="flex flex-col gap-7 animate-fade-up stagger-3 py-2">

      {/* Breadcrumb */}
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-charcoal-700/40">
        Platform / Virtual Fashion
      </p>

      {/* Title */}
      <div>
        <h1 className="font-display text-5xl md:text-6xl font-light leading-none tracking-wide text-charcoal-800">
          ReadyMe
        </h1>
        <p className="mt-2 font-display italic text-xl text-clay font-light tracking-wide">
          Virtual Fashion Experience
        </p>
      </div>

      {/* Description */}
      <p className="font-sans text-sm leading-relaxed text-charcoal-700/70 font-light max-w-xs">
        ReadyMe lets you visualise any outfit in a photorealistic 3D environment
        before you buy — seeing exactly how fabric drapes, moves and fits your
        unique body shape in seconds.
      </p>

      {/* Primary Features */}
      <div className="flex flex-col gap-3">
        {PRIMARY_FEATURES.map((f, i) => (
          <div
            key={f.label}
            className="feature-tag flex items-start gap-4 px-4 py-3 bg-cream-50 border border-charcoal-700/8 rounded-sm"
          >
            <span className="text-clay text-lg">{f.icon}</span>
            <div>
              <p className="text-xs uppercase">{f.label}</p>
              <p className="text-xs text-charcoal-700/55">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Tags (chips style) */}
      <div className="flex flex-wrap gap-2">
        {SECONDARY_TAGS.map(tag => {
          const isClickable = tag === "Virtual Try-On"

          return (
            <span
              key={tag}
              onClick={() => isClickable && handleTagClick(tag)}
              className={`feature-tag inline-flex items-center px-3 py-1.5 rounded-sm font-mono text-[10px] tracking-widest uppercase transition
  ${isClickable 
    ? "bg-cream-200 border border-charcoal-700/10 hover:bg-cream-100 text-charcoal-700/60 cursor-default"
    : "bg-cream-200 border border-charcoal-700/10 text-charcoal-700/40 cursor-default"
  }`}
            >
              {tag}
            </span>
          )
        })}
      </div>

      {/* Divider */}
      <div className="h-px bg-charcoal-700/10" />

      {/* Trust badges */}
      <div className="grid grid-cols-2 gap-3">
        {[
          ['◇', 'No Credit Card', 'Start for free instantly'],
          ['◈', 'AI-Powered', 'Trained on 10M+ fits'],
          ['◎', 'Body Inclusive', 'All shapes & sizes'],
          ['◐', '3D Engine', 'Real-time rendering'],
        ].map(([icon, title, sub]) => (
          <div key={title} className="flex items-start gap-2 p-2">
            <span className="text-clay text-sm">{icon}</span>
            <div>
              <p className="text-[10px]">{title}</p>
              <p className="text-[9px] text-charcoal-700/45">{sub}</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}