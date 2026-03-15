import { useState } from 'react'
import Navbar from '../components/Navbar'
import ThumbnailGallery, { THUMBS } from '../components/ThumbnailGallery'
import LandingSection from '../components/LandingSection'
import FeaturePanel from '../components/FeaturePanel'

export default function Home() {
  const [activeThumb, setActiveThumb] = useState(THUMBS[0])

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      {/* Main 3-column grid */}
      <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-20 pb-12">

        {/* ── Desktop: 3-column layout ─────────────────────────── */}
        <div className="hidden md:grid grid-cols-[80px_1fr_340px] lg:grid-cols-[100px_1fr_380px] gap-6 lg:gap-10 items-start min-h-[calc(100vh-80px)] pt-6">

          {/* LEFT — Thumbnail gallery */}
          <aside className="sticky top-24 pt-2 animate-fade-up stagger-1">
            <ThumbnailGallery active={activeThumb} onSelect={setActiveThumb} />
          </aside>

          {/* CENTER — Large feature image */}
          <section className="flex flex-col">
            <LandingSection image={activeThumb} />
          </section>

          {/* RIGHT — Feature info panel */}
          <aside className="sticky top-24 overflow-y-auto max-h-[calc(100vh-96px)] pr-1">
            <FeaturePanel currentLook={activeThumb} />
          </aside>
        </div>

        {/* ── Mobile/Tablet: stacked layout ───────────────────── */}
        <div className="md:hidden flex flex-col gap-6 pt-6">

          {/* Feature panel first on mobile */}
          <FeaturePanel currentLook={activeThumb} />

          {/* Main image */}
          <LandingSection image={activeThumb} />

          {/* Thumbnails — horizontal scroll on mobile */}
          <div className="flex gap-3 overflow-x-auto thumb-scroll pb-2">
            {THUMBS.map((thumb) => (
              <button
                key={thumb.id}
                onClick={() => setActiveThumb(thumb)}
                className={`flex-shrink-0 w-20 overflow-hidden rounded-sm border transition-all duration-300 ${
                  activeThumb?.id === thumb.id
                    ? 'border-clay shadow-md'
                    : 'border-charcoal-700/10'
                }`}
              >
                <img
                  src={thumb.src}
                  alt={thumb.alt}
                  className="w-full h-24 object-cover object-top"
                />
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Footer strip */}
      <footer id="contact" className="border-t border-charcoal-700/10 bg-cream-50">
        <div className="max-w-screen-xl mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-display italic text-2xl font-light text-charcoal-700/30 tracking-wide">
            ReadyMe
          </p>

          <div className="flex gap-8">
            {['Privacy', 'Terms'].map(item => (
              <a
                key={item}
                href="#"
                className="font-mono text-[9px] tracking-widest uppercase text-charcoal-700/40 hover:text-rust transition-colors duration-300"
              >
                {item}
              </a>
            ))}
          </div>

          <p className="font-mono text-[9px] tracking-wider text-charcoal-700/30">
            © 2025 ReadyMe
          </p>
        </div>
      </footer>
    </div>
  )
}