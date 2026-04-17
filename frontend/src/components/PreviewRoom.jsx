import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import LoadingSpinner from "./common/LoadingSpinner"
import TryOnGrid from "./preview/TryOnGrid"
import {
  PREVIEW_VIEWS,
  generateTryOnImages,
  normalizePreviewProduct,
  resolveFitLabel,
} from "../api"

const PRODUCT_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 1000'%3E%3Crect width='800' height='1000' rx='48' fill='%23EFE8DD'/%3E%3Cpath d='M258 214h284c15 0 28 11 31 26l32 118c5 19-9 38-28 38h-52v438H275V396h-52c-19 0-33-19-28-38l32-118c3-15 16-26 31-26z' fill='%23D3C4B3'/%3E%3Cpath d='M318 178c17 24 43 38 82 38s65-14 82-38' fill='none' stroke='%23B79E84' stroke-width='20' stroke-linecap='round'/%3E%3Ctext x='400' y='800' text-anchor='middle' fill='%236A6054' font-family='Arial, sans-serif' font-size='30'%3EProduct preview%3C/text%3E%3C/svg%3E"

function readPreviewPayload(location) {
  const state = location?.state

  if (state?.previewData) {
    return state.previewData
  }

  if (state?.product) {
    return state.product
  }

  const searchParams = new URLSearchParams(location?.search || "")
  const encodedData = searchParams.get("data")

  if (encodedData) {
    try {
      const parsed = JSON.parse(decodeURIComponent(encodedData))
      localStorage.setItem("productData", JSON.stringify(parsed))
      return parsed
    } catch (error) {
      console.error("Invalid preview data in URL", error)
    }
  }

  const storedProduct = localStorage.getItem("productData")
  if (storedProduct) {
    try {
      return JSON.parse(storedProduct)
    } catch (error) {
      console.error("Invalid stored preview data", error)
    }
  }

  return null
}

function getSizeContext(product) {
  const selectedSize =
    product?.selectedSize ||
    product?.selected_size ||
    product?.size ||
    product?.sizeLabel ||
    product?.recommendedSize ||
    product?.recommended_size ||
    ""

  const recommendedSize =
    product?.recommendedSize ||
    product?.recommended_size ||
    product?.size ||
    selectedSize ||
    ""

  return { selectedSize, recommendedSize }
}

function safeText(value) {
  return value === undefined || value === null ? "" : String(value)
}

function escapeSvgText(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function escapeSvgUrl(value) {
  const raw = safeText(value).trim()
  if (!raw) return ""

  return encodeURI(raw)
    .replace(/#/g, "%23")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "%22")
    .replace(/'/g, "%27")
}

function slugify(value) {
  return safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "preview"
}

function buildDownloadSheetSvg({
  productName,
  selectedSize,
  recommendedSize,
  fitLabel,
  images,
}) {
  const layout = [
    { key: "front", x: 56, y: 176 },
    { key: "back", x: 816, y: 176 },
    { key: "left", x: 56, y: 1016 },
    { key: "right", x: 816, y: 1016 },
  ]

  const cards = layout
    .map(({ key, x, y }) => {
      const view = PREVIEW_VIEWS.find((item) => item.key === key)
      const imageHref = escapeSvgUrl(images?.[key])

      return `
        <g transform="translate(${x} ${y})">
          <rect x="0" y="0" width="688" height="820" rx="36" fill="#FFFFFF" fill-opacity="0.88" stroke="#D8CEC0" />
          <clipPath id="download-clip-${key}">
            <rect x="24" y="24" width="640" height="700" rx="28" />
          </clipPath>
          <image href="${imageHref}" xlink:href="${imageHref}" x="24" y="24" width="640" height="700" preserveAspectRatio="xMidYMid slice" clip-path="url(#download-clip-${key})" />
          <rect x="24" y="24" width="640" height="700" rx="28" fill="none" stroke="#FFFFFF" stroke-opacity="0.36" />
          <text x="32" y="770" fill="#2C2B28" font-size="24" font-weight="700" font-family="DM Sans, Arial, sans-serif">${escapeSvgText(view?.title || key)}</text>
          <text x="32" y="800" fill="#6B6258" font-size="17" font-family="DM Sans, Arial, sans-serif">${escapeSvgText(fitLabel)}</text>
        </g>
      `
    })
    .join("")

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1840">
      <defs>
        <linearGradient id="sheet-bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#F8F2E8" />
          <stop offset="100%" stop-color="#E9DED0" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1840" fill="url(#sheet-bg)" />
      <text x="56" y="78" fill="#2C2B28" font-size="42" font-weight="700" font-family="DM Sans, Arial, sans-serif">${escapeSvgText(productName || "Preview Room")}</text>
      <text x="56" y="122" fill="#6B6258" font-size="22" font-family="DM Sans, Arial, sans-serif">Selected ${escapeSvgText(selectedSize || "N/A")} · Recommended ${escapeSvgText(recommendedSize || "N/A")} · ${escapeSvgText(fitLabel)}</text>
      ${cards}
    </svg>
  `
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
  const navigate = useNavigate()
  const location = useLocation()

  const [rawProductData, setRawProductData] = useState(() =>
    readPreviewPayload(location),
  )
  const [previewImages, setPreviewImages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retrySeed, setRetrySeed] = useState(0)

  useEffect(() => {
    setRawProductData(readPreviewPayload(location))
  }, [location])

  const product = useMemo(
    () => normalizePreviewProduct(rawProductData || {}),
    [rawProductData],
  )
  const hasPreviewData = Boolean(rawProductData)
  const { selectedSize, recommendedSize } = getSizeContext(product)
  const { fitStatus, fitLabel } = resolveFitLabel({
    selectedSize,
    recommendedSize,
  })

  useEffect(() => {
    let cancelled = false

    const hasImages =
      Boolean(product.productImage) ||
      Boolean(product.userImages?.front) ||
      Boolean(product.userImages?.back) ||
      Boolean(product.userImages?.left) ||
      Boolean(product.userImages?.right)

    if (!hasPreviewData) {
      setPreviewImages(null)
      setError(null)
      setLoading(false)
      return undefined
    }

    const generatePreview = async () => {
      setLoading(true)
      setError(null)

      try {
        const generated = await generateTryOnImages(
          product.userImages || {},
          product.productImage || "",
          {
            selectedSize,
            recommendedSize,
            productName: product.productName,
          },
        )

        if (!cancelled) {
          setPreviewImages(generated)
        }
      } catch (generatedError) {
        if (!cancelled) {
          setPreviewImages(null)
          setError(generatedError)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (!hasImages) {
      setPreviewImages(null)
      setError(new Error("Preview not available. Try again."))
      setLoading(false)
      return undefined
    }

    void generatePreview()

    return () => {
      cancelled = true
    }
  }, [retrySeed, hasPreviewData, product, selectedSize, recommendedSize])

  const handleRetry = () => {
    setRetrySeed((value) => value + 1)
  }

  const handleDownload = () => {
    if (!previewImages) return

    const sheet = buildDownloadSheetSvg({
      productName: product.productName,
      selectedSize,
      recommendedSize,
      fitLabel,
      images: previewImages,
    })

    downloadSvg(
      sheet,
      `readyme-preview-${slugify(product.productName || "preview")}.svg`,
    )
  }

  if (!hasPreviewData) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(198,160,122,0.18),transparent_32%),linear-gradient(180deg,#F7F1E8_0%,#ECE0D2_100%)] px-4 py-8 text-[#2C2B28]">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl items-center justify-center">
          <div className="w-full rounded-[32px] border border-charcoal-700/10 bg-white/85 p-8 shadow-[0_28px_90px_rgba(44,43,40,0.12)] backdrop-blur">
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-charcoal-700/45">
              Preview Room
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              No preview data found.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-charcoal-700/70">
              Open this room from a product page or pass product data from the
              extension to generate the virtual try-on preview.
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-6 rounded-full border border-charcoal-700 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-charcoal-700 transition hover:bg-charcoal-700 hover:text-white"
            >
              Back Home
            </button>
          </div>
        </div>
      </div>
    )
  }

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

        <div
          className={`grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)] ${
            loading ? "pointer-events-none select-none" : ""
          }`}
          aria-busy={loading}
        >
          {/* NEW: preview room layout */}
          <aside className="animate-fade-up stagger-1 rounded-[32px] border border-charcoal-700/10 bg-white/85 p-5 shadow-[0_28px_90px_rgba(44,43,40,0.12)] backdrop-blur xl:sticky xl:top-6">
            <div className="overflow-hidden rounded-[26px] border border-charcoal-700/10 bg-[linear-gradient(180deg,#FCF9F4,#F0E6D8)] p-4">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-white shadow-[0_18px_50px_rgba(44,43,40,0.10)]">
                <img
                  src={product.productImage || previewImages?.front || previewImages?.back || previewImages?.left || previewImages?.right || PRODUCT_PLACEHOLDER}
                  alt={product.productName || "Selected product"}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                <div className="absolute left-4 top-4">
                  <span className="inline-flex items-center rounded-full border border-white/30 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur">
                    Product View
                  </span>
                </div>
                <div className="absolute bottom-4 left-4 right-4 rounded-[20px] border border-white/25 bg-black/55 p-4 text-white backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
                    Product
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {product.productName}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                      Selected {safeText(selectedSize || "N/A")}
                    </span>
                    <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                      Recommended {safeText(recommendedSize || "N/A")}
                    </span>
                    <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                      {fitLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-[22px] border border-charcoal-700/10 bg-cream-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-charcoal-700/45">
                  Product
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  {product.productName}
                </h2>
                <p className="mt-2 text-sm leading-6 text-charcoal-700/70">
                  The left panel keeps the selected item, while the right panel
                  renders the four-view virtual try-on mock.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[18px] border border-charcoal-700/10 bg-white/80 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-charcoal-700/45">
                    Selected size
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {safeText(selectedSize || "N/A")}
                  </p>
                </div>
                <div className="rounded-[18px] border border-charcoal-700/10 bg-white/80 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-charcoal-700/45">
                    Recommended size
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {safeText(recommendedSize || "N/A")}
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <section className="animate-fade-up stagger-2 rounded-[32px] border border-charcoal-700/10 bg-white/85 p-5 shadow-[0_28px_90px_rgba(44,43,40,0.12)] backdrop-blur md:p-6">
            {/* NEW: VTO integration */}
            {loading ? (
              <div className="flex min-h-[620px] flex-col items-center justify-center rounded-[28px] border border-dashed border-charcoal-700/10 bg-[linear-gradient(180deg,#FCF9F4,#F3EBDD)] px-6 text-center">
                <LoadingSpinner size="xl" color="#2C2B28" />
                <p className="mt-4 text-lg font-semibold">Generating preview...</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-charcoal-700/65">
                  Processing the mock Google VTO result for the front, back,
                  left and right views.
                </p>
              </div>
            ) : error ? (
              <div className="flex min-h-[620px] items-center justify-center rounded-[28px] border border-rose-200 bg-rose-50/70 px-6 text-center">
                <div className="max-w-md">
                  <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-rose-700/70">
                    Error
                  </p>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-rose-900">
                    Preview not available. Try again.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-rose-900/70">
                    {error?.message || "The virtual try-on mock could not be generated."}
                  </p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-6 rounded-full bg-[#2C2B28] px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-[#1F1E1C]"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : (
              <TryOnGrid
                images={previewImages}
                fitLabel={fitLabel}
                fitStatus={fitStatus}
                loading={loading}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
