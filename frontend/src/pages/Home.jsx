import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import Navbar from '../components/Navbar'
import ThumbnailGallery, { THUMBS } from '../components/ThumbnailGallery'
import LandingSection from '../components/LandingSection'
import FeaturePanel from '../components/FeaturePanel'

const SLIDE_DURATION_MS = 6000

function buildDemoPreviewData(activeThumb) {
  const fallbackImage =
    activeThumb?.src ||
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=90"

  return {
    productImage: fallbackImage,
    productName: activeThumb?.alt || "ReadyMe Demo Look",
    selectedSize: "M",
    recommendedSize: "M",
    userImages: {
      front: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=900&q=90",
      back: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=900&q=90",
      left: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=900&q=90",
      right: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=90",
    },
  }
}

export default function Home() {

  const [activeThumb, setActiveThumb] = useState(THUMBS[0])
  const [isScanned, setIsScanned] = useState(false)

  const navigate = useNavigate()

  const handleTryOn = () => {
    navigate("/camera")
  }

  const handlePreview = () => {
    if (localStorage.getItem("bodyScanDone") === "true") {
      navigate("/preview")
      return
    }

    navigate("/preview", {
      state: {
        previewData: buildDemoPreviewData(activeThumb),
      },
    })
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const data = params.get("data")

    if (data) {
      try {
        const product = JSON.parse(decodeURIComponent(data))
        console.log("PRODUCT FROM EXTENSION:", product)
        localStorage.setItem("productData", JSON.stringify(product))
        navigate("/preview")
      } catch (error) {
        console.error("Invalid product data")
      }
    }

    // ✅ check scan status
    setIsScanned(localStorage.getItem("bodyScanDone") === "true")
  }, [navigate])

  useEffect(() => {
    if (THUMBS.length <= 1) return

    const slideInterval = window.setInterval(() => {
      setActiveThumb((currentThumb) => {
        const currentIndex = THUMBS.findIndex((thumb) => thumb.id === currentThumb?.id)
        const nextIndex = currentIndex >= 0
          ? (currentIndex + 1) % THUMBS.length
          : 0

        return THUMBS[nextIndex]
      })
    }, 3000)

    return () => window.clearInterval(slideInterval)
  }, [])

  return (
    <div className="min-h-screen bg-[#e7e3dd]">
      <Navbar />

      <main className="max-w-screen-xl mx-auto px-4 md:px-8 pt-20 pb-12">

        {/* Desktop */}
        <div className="hidden md:grid grid-cols-[80px_1fr_340px] lg:grid-cols-[100px_1fr_380px] gap-6 lg:gap-10 items-start min-h-[calc(100vh-80px)] pt-6">

          <aside className="sticky top-24 pt-2 animate-fade-up stagger-1">
            <ThumbnailGallery active={activeThumb} onSelect={setActiveThumb} />
          </aside>

          <section className="flex flex-col">
            <LandingSection 
              image={activeThumb}
              images={THUMBS}
              slideDuration={SLIDE_DURATION_MS}
              onSelectImage={setActiveThumb}
              isScanned={isScanned}
              onPreview={handlePreview}
            />
          </section>

          {/* ✅ removed scroll */}
          <aside className="sticky top-24 pr-1">
            <FeaturePanel
              currentLook={activeThumb}
              onTryOn={handleTryOn}
            />
          </aside>
        </div>

        {/* Mobile */}
        <div className="md:hidden flex flex-col gap-6 pt-6">

          <FeaturePanel
            currentLook={activeThumb}
            onTryOn={handleTryOn}
          />

          <LandingSection 
            image={activeThumb}
            images={THUMBS}
            slideDuration={SLIDE_DURATION_MS}
            onSelectImage={setActiveThumb}
            isScanned={isScanned}
            onPreview={handlePreview}
          />

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

      <footer className="border-t border-charcoal-700/10 bg-cream-50">
        <div className="max-w-screen-xl mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-display italic text-2xl font-light text-charcoal-700/30 tracking-wide">
            ReadyMe
          </p>

          <div className="flex gap-8">
            {['Privacy', 'Terms'].map(item => (
              <a key={item} href="#" className="font-mono text-[9px] tracking-widest uppercase text-charcoal-700/40 hover:text-rust transition">
                {item}
              </a>
            ))}
          </div>

          <p className="font-mono text-[9px] tracking-wider text-charcoal-700/30">
            © 2026 ReadyMe
          </p>
        </div>
      </footer>
    </div>
  )
}
