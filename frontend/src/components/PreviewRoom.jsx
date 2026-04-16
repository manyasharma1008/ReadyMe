```javascript
import { Canvas } from "@react-three/fiber"
import { OrbitControls, useGLTF, Center } from "@react-three/drei"
import { Suspense, useEffect, useState } from "react"

function Avatar() {
  const { scene } = useGLTF("/models/man.glb")
  return null
}

function downloadSvg(svgMarkup, filename) {
  const blob = new Blob([svgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export default function PreviewRoom() {
  const [product, setProduct] = useState(null)

  // FIXED: missing states
  const [loading, setLoading] = useState(false)
  const [previewImages, setPreviewImages] = useState(null)

  // FIXED: missing handlers
  const handleRetry = () => {}
  const handleDownload = () => {}

  // Read data from extension
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const data = params.get("data")

    if (data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(data))
        console.log("PRODUCT:", parsed)
        setProduct(parsed)
      } catch (err) {
        console.error("Invalid product data")
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(198,160,122,0.18),transparent_32%),linear-gradient(180deg,#F7F1E8_0%,#ECE0D2_100%)] px-4 py-6 text-[#2C2B28] md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="animate-fade-up">
            <p className="font-mono text-[10px] uppercase tracking-[0.38em] text-charcoal-700/45">
              Preview Room
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
              Virtual Try-On Results
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal-700/70">
              Mock Google VTO preview generated from your scan photos and the
              selected product data.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRetry}
              disabled={loading}
              className="rounded-full border border-charcoal-700/20 bg-white/75 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-charcoal-700 transition hover:border-charcoal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={loading || !previewImages}
              className="rounded-full bg-[#2C2B28] px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-[#1F1E1C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download Preview
            </button>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ width: "220px", padding: "20px" }}>
          <h3>Select Outfit</h3>

          {product ? (
            <div
              style={{
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "6px",
                background: "#fff",
                marginBottom: "10px",
              }}
            >
              <div style={{ fontSize: "12px", opacity: 0.6 }}>
                Detected Item
              </div>

              <div style={{ fontWeight: "500" }}>
                {product.title || "Product"}
              </div>

              {product.image && (
                <img
                  src={product.image}
                  alt=""
                  style={{
                    width: "100%",
                    marginTop: "8px",
                    borderRadius: "4px",
                  }}
                />
              )}
            </div>
          ) : (
            <div style={{ fontSize: "12px", opacity: 0.5 }}>
              No product detected
            </div>
          )}

          <div>Jacket</div>
          <div>Hoodie</div>
          <div>Shirt</div>
          <div>Dress</div>
        </div>
      </div>
    </div>
  )
}
```
