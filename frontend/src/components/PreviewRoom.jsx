import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { generateVirtualTryOn } from "../api/vto"
import { useApp } from "../context/AppContext"

const VIEW_ORDER = [
  { key: "front", label: "Front" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
  { key: "back", label: "Back" },
]

function parsePreviewPayload() {
  const params = new URLSearchParams(window.location.search)
  const rawData = params.get("data")

  if (!rawData) return null

  try {
    return JSON.parse(decodeURIComponent(rawData))
  } catch (error) {
    console.error("Invalid preview payload", error)
    return null
  }
}

function asDataUrl(image) {
  if (!image || typeof image !== "string") return ""
  return image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`
}

function getPrimaryRecommendation(recommendations) {
  if (Array.isArray(recommendations)) return recommendations[0] || null
  if (Array.isArray(recommendations?.recommendations)) return recommendations.recommendations[0] || null
  return null
}

function MeasurementRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
      <span style={{ color: "#6f675d", textTransform: "capitalize" }}>{label.replace("_", " ")}</span>
      <strong>{Math.round(Number(value) || 0)} cm</strong>
    </div>
  )
}

function EmptyImageState({ children }) {
  return (
    <div style={{
      height: "100%",
      minHeight: "420px",
      borderRadius: "28px",
      display: "grid",
      placeItems: "center",
      textAlign: "center",
      color: "#81776b",
      background: "repeating-linear-gradient(135deg, #f5efe7, #f5efe7 12px, #ece3d8 12px, #ece3d8 24px)",
      padding: "28px",
    }}>
      {children}
    </div>
  )
}

function ProductWindow({ product, garmentImage, sizeChart }) {
  return (
    <aside style={{
      background: "rgba(255, 252, 246, 0.9)",
      border: "1px solid rgba(58, 47, 39, 0.12)",
      borderRadius: "30px",
      padding: "20px",
      boxShadow: "0 24px 70px rgba(53, 42, 32, 0.1)",
    }}>
      <div style={{ fontSize: "12px", color: "#8b8175", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        Selected Cloth
      </div>
      <h2 style={{ margin: "6px 0 16px", fontSize: "26px", lineHeight: 1.05, color: "#2f2a25" }}>
        {product?.title || "No product selected"}
      </h2>

      {garmentImage ? (
        <img
          src={garmentImage}
          alt={product?.title || "Selected garment"}
          style={{
            width: "100%",
            height: "320px",
            objectFit: "contain",
            borderRadius: "24px",
            background: "linear-gradient(135deg, #f4efe7, #d8cfc4)",
          }}
        />
      ) : (
        <EmptyImageState>
          Open a product through the ReadyMe extension so the selected cloth appears here.
        </EmptyImageState>
      )}

      <div style={{ display: "grid", gap: "8px", marginTop: "16px", fontSize: "14px", color: "#5e564d" }}>
        {product?.brand && <div><strong>Brand:</strong> {product.brand}</div>}
        {product?.price && <div><strong>Price:</strong> {product.price}</div>}
        {product?.site_name && <div><strong>Store:</strong> {product.site_name}</div>}
        {sizeChart?.sizes?.length ? <div><strong>Size chart:</strong> {sizeChart.sizes.length} sizes detected</div> : null}
      </div>
    </aside>
  )
}

function ViewCarousel({ views, activeIndex, setActiveIndex, loading }) {
  const activeView = views[activeIndex] || views[0]
  const canGoPrevious = views.length > 1
  const canGoNext = views.length > 1

  const goPrevious = () => {
    if (!canGoPrevious) return
    setActiveIndex((current) => (current - 1 + views.length) % views.length)
  }

  const goNext = () => {
    if (!canGoNext) return
    setActiveIndex((current) => (current + 1) % views.length)
  }

  return (
    <section style={{
      background: "rgba(255, 252, 246, 0.9)",
      border: "1px solid rgba(58, 47, 39, 0.12)",
      borderRadius: "34px",
      padding: "20px",
      boxShadow: "0 24px 70px rgba(53, 42, 32, 0.1)",
      minHeight: "620px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "14px" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#8b8175", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            User Wearing Selected Cloth
          </div>
          <h2 style={{ margin: "4px 0 0", fontSize: "30px", color: "#2f2a25" }}>
            {activeView?.label || "Try-On Preview"} View
          </h2>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={goPrevious} disabled={!canGoPrevious} style={navButtonStyle}>Prev</button>
          <button onClick={goNext} disabled={!canGoNext} style={navButtonStyle}>Next</button>
        </div>
      </div>

      <div
        style={{ overflow: "hidden", borderRadius: "28px" }}
        onTouchStart={(event) => {
          event.currentTarget.dataset.touchStartX = String(event.touches[0].clientX)
        }}
        onTouchEnd={(event) => {
          const startX = Number(event.currentTarget.dataset.touchStartX || 0)
          const endX = event.changedTouches[0].clientX
          const delta = endX - startX
          if (Math.abs(delta) < 40) return
          if (delta > 0) goPrevious()
          else goNext()
        }}
      >
        {activeView?.previewImage || activeView?.sourceImage ? (
          <img
            src={activeView.previewImage || activeView.sourceImage}
            alt={`${activeView.label} try-on preview`}
            style={{
              width: "100%",
              height: "500px",
              objectFit: "contain",
              borderRadius: "28px",
              background: "linear-gradient(135deg, #f4efe7, #d8cfc4)",
              display: "block",
            }}
          />
        ) : (
          <EmptyImageState>
            {loading ? "Generating all four views..." : "No scan image found for this view yet."}
          </EmptyImageState>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
        {views.map((view, index) => {
          const isActive = index === activeIndex
          return (
            <button
              key={view.key}
              onClick={() => setActiveIndex(index)}
              style={{
                border: `1px solid ${isActive ? "#2f2a25" : "rgba(47, 42, 37, 0.16)"}`,
                background: isActive ? "#2f2a25" : "rgba(255,255,255,0.42)",
                color: isActive ? "#fffaf2" : "#4b433b",
                borderRadius: "999px",
                padding: "9px 14px",
                cursor: "pointer",
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {view.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

const navButtonStyle = {
  border: "1px solid rgba(47, 42, 37, 0.2)",
  background: "rgba(255,255,255,0.52)",
  borderRadius: "999px",
  padding: "10px 14px",
  cursor: "pointer",
  color: "#2f2a25",
}

export default function PreviewRoom() {
  const navigate = useNavigate()
  const { measurements, scanImages, recommendations, hasMeasurements } = useApp()
  const [payload, setPayload] = useState(null)
  const [viewResults, setViewResults] = useState({})
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [warnings, setWarnings] = useState([])

  useEffect(() => {
    setPayload(parsePreviewPayload())
  }, [])

  const product = payload?.product || payload || null
  const sizeChart = payload?.sizeChart || payload?.size_chart || payload?.backendSync?.size_chart || null
  const garmentImage = product?.image || ""
  const primaryRecommendation = getPrimaryRecommendation(recommendations)

  const scanViews = useMemo(() => VIEW_ORDER.map((view) => ({
    ...view,
    sourceImage: asDataUrl(scanImages?.[view.key]),
    previewImage: viewResults[view.key]?.preview_image ? asDataUrl(viewResults[view.key].preview_image) : "",
  })), [scanImages, viewResults])

  const availableViews = scanViews.filter((view) => Boolean(view.sourceImage))
  const carouselViews = availableViews.length > 0 ? scanViews : VIEW_ORDER.map((view) => ({ ...view, sourceImage: "", previewImage: "" }))
  const canGenerate = Boolean(availableViews.length > 0 && garmentImage && measurements)

  const measurementEntries = useMemo(() => {
    if (!measurements) return []
    return Object.entries(measurements).filter(([, value]) => Number(value) > 0)
  }, [measurements])

  const handleGenerateAllViews = async () => {
    if (!canGenerate || loading) return

    setLoading(true)
    setError(null)
    setStatusMessage("")
    setWarnings([])
    setViewResults({})

    try {
      const nextResults = {}
      const nextWarnings = []

      for (const view of availableViews) {
        setStatusMessage(`Generating ${view.label.toLowerCase()} view...`)
        const response = await generateVirtualTryOn({
          personImage: view.sourceImage,
          garmentImage,
          measurements,
          product: {
            ...product,
            requested_view: view.key,
          },
          sizeRecommendation: primaryRecommendation,
        })

        if (!response?.success) {
          throw new Error(response?.message || `${view.label} view generation failed`)
        }

        nextResults[view.key] = response
        nextWarnings.push(...(response.warnings || []))
        setViewResults({ ...nextResults })
      }

      setStatusMessage(`Generated ${availableViews.length} try-on view${availableViews.length === 1 ? "" : "s"}. Swipe to compare angles.`)
      setWarnings([...new Set(nextWarnings)])
      setActiveIndex(0)
    } catch (err) {
      setError(err.getUserFriendlyMessage?.() || err.message || "Virtual try-on failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      padding: "28px",
      color: "#2f2a25",
      background: "#E7E3DD",
      fontFamily: "Georgia, 'Times New Roman', serif",
    }}>
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "20px",
        marginBottom: "24px",
      }}>
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#6f675d" }}>ReadyMe VTO Studio</div>
          <h1 style={{ margin: "4px 0", fontSize: "42px", lineHeight: 1 }}>Four-Angle Virtual Try-On</h1>
          <p style={{ margin: 0, maxWidth: "760px", color: "#5e564d" }}>
            The selected cloth stays fixed on the side while you swipe through front, left, right, and back try-on views generated from your scan photos.
          </p>
        </div>

        <button onClick={() => navigate("/scan")} style={navButtonStyle}>
          Retake Scan
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(320px, 0.8fr)", gap: "20px", alignItems: "start" }}>
        <ViewCarousel
          views={carouselViews}
          activeIndex={Math.min(activeIndex, carouselViews.length - 1)}
          setActiveIndex={setActiveIndex}
          loading={loading}
        />

        <ProductWindow product={product} garmentImage={garmentImage} sizeChart={sizeChart} />
      </div>

      <section style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 0.8fr",
        gap: "18px",
        marginTop: "18px",
      }}>
        <div style={{
          background: "rgba(255, 252, 246, 0.86)",
          border: "1px solid rgba(58, 47, 39, 0.12)",
          borderRadius: "24px",
          padding: "20px",
        }}>
          <h3 style={{ marginTop: 0 }}>Generate All Four Views</h3>

          {!hasMeasurements && <p style={{ color: "#8a4b32" }}>No body measurements found yet. Retake scan before generating try-on.</p>}
          {availableViews.length === 0 && <p style={{ color: "#8a4b32" }}>No scan photos found. The four-angle VTO flow needs your captured scan images.</p>}
          {availableViews.length > 0 && availableViews.length < 4 && (
            <p style={{ color: "#8a6a22" }}>Only {availableViews.length} of 4 scan views are available. Retake scan for a complete swipe set.</p>
          )}
          {!garmentImage && <p style={{ color: "#8a4b32" }}>No selected cloth image found. Open a product through the ReadyMe extension first.</p>}

          {statusMessage && <p style={{ color: "#5e564d" }}>{statusMessage}</p>}
          {error && <p style={{ color: "#a33d2f" }}>{error}</p>}
          {warnings.length > 0 && <p style={{ color: "#8a6a22" }}>{warnings.join(" ")}</p>}

          <button
            onClick={handleGenerateAllViews}
            disabled={!canGenerate || loading}
            style={{
              border: 0,
              borderRadius: "999px",
              padding: "14px 24px",
              cursor: canGenerate && !loading ? "pointer" : "not-allowed",
              background: canGenerate ? "#2f2a25" : "#a99f93",
              color: "#fffaf2",
              fontWeight: 700,
              marginTop: "8px",
            }}
          >
            {loading ? "Generating Views..." : "Generate Try-On Views"}
          </button>
        </div>

        <aside style={{
          background: "rgba(255, 252, 246, 0.86)",
          border: "1px solid rgba(58, 47, 39, 0.12)",
          borderRadius: "24px",
          padding: "20px",
        }}>
          <h3 style={{ marginTop: 0 }}>Fit Context</h3>

          {primaryRecommendation ? (
            <p style={{ marginTop: 0 }}>
              Recommended size: <strong>{primaryRecommendation.size}</strong> ({primaryRecommendation.fit_type || "fit"})
            </p>
          ) : (
            <p style={{ marginTop: 0, color: "#6f675d" }}>No size recommendation loaded yet.</p>
          )}

          {measurementEntries.length > 0 ? (
            <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
              {measurementEntries.map(([key, value]) => (
                <MeasurementRow key={key} label={key} value={value} />
              ))}
            </div>
          ) : (
            <p style={{ color: "#6f675d" }}>Measurements will appear after scan.</p>
          )}
        </aside>
      </section>
    </main>
  )
}
