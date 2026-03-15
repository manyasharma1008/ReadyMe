// FeaturePanel.jsx
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
  'Body Scan',
  'Style Match',
]

export default function FeaturePanel({ currentLook }) {
  const navigate = useNavigate()

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

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-charcoal-700/10" />
        <span className="font-mono text-[9px] tracking-widest text-charcoal-700/30 uppercase">
          SS 2025
        </span>
        <div className="h-px flex-1 bg-charcoal-700/10" />
      </div>

      {/* Description */}
      <p className="font-sans text-sm leading-relaxed text-charcoal-700/70 font-light max-w-xs">
        ReadyMe lets you visualise any outfit in a photorealistic 3D environment
        before you buy — seeing exactly how fabric drapes, moves and fits your
        unique body shape in seconds.
      </p>

      {/* Primary feature cards */}
      <div className="flex flex-col gap-3" id="features">
        {PRIMARY_FEATURES.map((f, i) => (
          <div
            key={f.label}
            className={`feature-tag flex items-start gap-4 px-4 py-3 bg-cream-50 border border-charcoal-700/8 rounded-sm cursor-default animate-fade-up stagger-${i + 3}`}
          >
            <span className="text-clay text-lg mt-0.5 select-none">{f.icon}</span>
            <div>
              <p className="font-sans text-xs font-medium tracking-wider uppercase text-charcoal-800">
                {f.label}
              </p>
              <p className="font-sans text-xs text-charcoal-700/55 mt-0.5 font-light leading-relaxed">
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary tags */}
      <div className="flex flex-wrap gap-2">
        {SECONDARY_TAGS.map(tag => (
          <span
            key={tag}
            className="feature-tag inline-flex items-center px-3 py-1.5 bg-cream-200 border border-charcoal-700/10 rounded-sm font-mono text-[10px] tracking-widest uppercase text-charcoal-700/60 cursor-default"
          >
            {tag}
          </span>
        ))}
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
            <span className="text-clay text-sm select-none">{icon}</span>
            <div>
              <p className="font-sans text-[10px] font-medium tracking-wide text-charcoal-800">
                {title}
              </p>
              <p className="font-sans text-[9px] text-charcoal-700/45 font-light">
                {sub}
              </p>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}