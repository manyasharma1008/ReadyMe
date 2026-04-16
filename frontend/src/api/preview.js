const PREVIEW_VIEWS = [
  { key: "front", label: "Front", title: "Front view" },
  { key: "back", label: "Back", title: "Back view" },
  { key: "left", label: "Left", title: "Left side" },
  { key: "right", label: "Right", title: "Right side" },
]

const SIZE_RANKS = {
  xxs: 0,
  xs: 1,
  s: 2,
  m: 3,
  l: 4,
  xl: 5,
  xxl: 6,
  xxxl: 7,
  xxxxl: 8,
}

const FIT_THEMES = {
  tight: {
    accent: "#C54B3D",
    glow: "#F1B8AC",
    badgeFill: "#C54B3D",
    badgeText: "#FFFFFF",
    garmentScaleX: 1.08,
    garmentScaleY: 1.05,
    garmentOpacity: 0.96,
    pillFill: "#FBEAE6",
    pillText: "#9D3D31",
  },
  perfect: {
    accent: "#3D7E63",
    glow: "#B9DDCA",
    badgeFill: "#3D7E63",
    badgeText: "#FFFFFF",
    garmentScaleX: 1,
    garmentScaleY: 1,
    garmentOpacity: 0.92,
    pillFill: "#E8F3ED",
    pillText: "#2F6A53",
  },
  loose: {
    accent: "#4D6FB3",
    glow: "#B8CBEF",
    badgeFill: "#4D6FB3",
    badgeText: "#FFFFFF",
    garmentScaleX: 0.92,
    garmentScaleY: 0.95,
    garmentOpacity: 0.88,
    pillFill: "#E8F0FB",
    pillText: "#335AA6",
  },
}

const VIEW_LAYOUT = {
  front: {
    title: "Front view",
    imageX: 72,
    imageY: 72,
    imageWidth: 816,
    imageHeight: 1128,
    garmentX: 258,
    garmentY: 438,
    garmentWidth: 444,
    garmentHeight: 458,
    garmentScaleX: 1,
    garmentScaleY: 1,
  },
  back: {
    title: "Back view",
    imageX: 72,
    imageY: 72,
    imageWidth: 816,
    imageHeight: 1128,
    garmentX: 256,
    garmentY: 446,
    garmentWidth: 448,
    garmentHeight: 450,
    garmentScaleX: 0.98,
    garmentScaleY: 0.98,
  },
  left: {
    title: "Left side",
    imageX: 72,
    imageY: 72,
    imageWidth: 816,
    imageHeight: 1128,
    garmentX: 272,
    garmentY: 448,
    garmentWidth: 414,
    garmentHeight: 444,
    garmentScaleX: 0.94,
    garmentScaleY: 1.02,
  },
  right: {
    title: "Right side",
    imageX: 72,
    imageY: 72,
    imageWidth: 816,
    imageHeight: 1128,
    garmentX: 274,
    garmentY: 448,
    garmentWidth: 414,
    garmentHeight: 444,
    garmentScaleX: 0.94,
    garmentScaleY: 1.02,
  },
}

const PREVIEW_CACHE = new Map()
const IN_FLIGHT_REQUESTS = new Map()

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function safeString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function escapeSvgText(value) {
  return safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function escapeSvgUrl(value) {
  const raw = safeString(value).trim()

  if (!raw) {
    return ""
  }

  return encodeURI(raw)
    .replace(/#/g, "%23")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "%22")
    .replace(/'/g, "%27")
}

function firstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue
    const stringValue = String(value).trim()
    if (stringValue) {
      return value
    }
  }

  return ""
}

function normalizeSizeRank(size) {
  if (size === undefined || size === null || size === "") {
    return null
  }

  if (typeof size === "number" && Number.isFinite(size)) {
    return size
  }

  const raw = String(size).trim().toLowerCase()
  if (!raw) return null

  if (/^[+-]?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw)
  }

  const compact = raw
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/\./g, "")

  const primaryToken = compact.split(/[-/]/)[0]
  if (primaryToken in SIZE_RANKS) {
    return SIZE_RANKS[primaryToken]
  }

  const aliases = {
    extrasmall: SIZE_RANKS.xs - 1,
    extra_small: SIZE_RANKS.xs - 1,
    small: SIZE_RANKS.s,
    medium: SIZE_RANKS.m,
    large: SIZE_RANKS.l,
    extralarge: SIZE_RANKS.xl,
    extra_large: SIZE_RANKS.xl,
    xlarge: SIZE_RANKS.xl,
    xxlarge: SIZE_RANKS.xxl,
    triplexl: SIZE_RANKS.xxxl,
    xxl: SIZE_RANKS.xxl,
    xxxl: SIZE_RANKS.xxxl,
    xxxxl: SIZE_RANKS.xxxxl,
  }

  if (primaryToken in aliases) {
    return aliases[primaryToken]
  }

  return null
}

export function normalizePreviewProduct(raw = {}) {
  let value = raw

  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      value = {}
    }
  }

  const userImagesSource =
    value.userImages ||
    value.user_images ||
    value.images ||
    value.scanImages ||
    value.scan_images ||
    {}

  return {
    productImage: firstValue(
      value.productImage,
      value.product_image,
      value.image,
      value.imageUrl,
      value.image_url,
      value.product?.image,
      value.product?.imageUrl,
      value.product?.image_url,
    ),
    productName: firstValue(
      value.productName,
      value.product_name,
      value.name,
      value.title,
      value.product?.name,
      value.product?.title,
    ) || "Product",
    selectedSize: firstValue(
      value.selectedSize,
      value.selected_size,
      value.size,
      value.sizeLabel,
      value.product?.selectedSize,
      value.product?.selected_size,
    ),
    recommendedSize: firstValue(
      value.recommendedSize,
      value.recommended_size,
      value.backendRecommendedSize,
      value.backend_recommended_size,
      value.product?.recommendedSize,
      value.product?.recommended_size,
      value.size,
    ),
    userImages: {
      front: firstValue(
        userImagesSource.front,
        userImagesSource.frontImage,
        userImagesSource.front_image,
        value.front,
        value.frontImage,
        value.front_image,
      ),
      back: firstValue(
        userImagesSource.back,
        userImagesSource.backImage,
        userImagesSource.back_image,
        value.back,
        value.backImage,
        value.back_image,
      ),
      left: firstValue(
        userImagesSource.left,
        userImagesSource.leftImage,
        userImagesSource.left_image,
        value.left,
        value.leftImage,
        value.left_image,
      ),
      right: firstValue(
        userImagesSource.right,
        userImagesSource.rightImage,
        userImagesSource.right_image,
        value.right,
        value.rightImage,
        value.right_image,
      ),
    },
  }
}

export function resolveFitLabel(sizeInput = {}) {
  const context =
    typeof sizeInput === "object" && sizeInput !== null
      ? sizeInput
      : { selectedSize: sizeInput }

  const selectedSize = firstValue(
    context.selectedSize,
    context.selected_size,
    context.size,
  )
  const recommendedSize = firstValue(
    context.recommendedSize,
    context.recommended_size,
    context.targetSize,
    context.target_size,
    selectedSize,
  )

  const selectedRank = normalizeSizeRank(selectedSize)
  const recommendedRank = normalizeSizeRank(recommendedSize)

  if (selectedRank === null || recommendedRank === null) {
    return { fitStatus: "perfect", fitLabel: "Perfect Fit" }
  }

  if (selectedRank < recommendedRank) {
    return { fitStatus: "tight", fitLabel: "Tight" }
  }

  if (selectedRank > recommendedRank) {
    return { fitStatus: "loose", fitLabel: "Loose" }
  }

  return { fitStatus: "perfect", fitLabel: "Perfect Fit" }
}

function buildPreviewCacheKey(userImages, productImage, sizeInput) {
  const context =
    typeof sizeInput === "object" && sizeInput !== null
      ? sizeInput
      : { selectedSize: sizeInput }

  return JSON.stringify({
    productImage: safeString(productImage),
    productName: safeString(context.productName),
    userImages: {
      front: safeString(userImages?.front),
      back: safeString(userImages?.back),
      left: safeString(userImages?.left),
      right: safeString(userImages?.right),
    },
    size: {
      selectedSize: safeString(context.selectedSize),
      recommendedSize: safeString(context.recommendedSize),
    },
  })
}

function buildPreviewSvg({
  view,
  userSource,
  productSource,
  fitLabel,
  fitStatus,
  selectedSize,
  recommendedSize,
  productName,
}) {
  const layout = VIEW_LAYOUT[view] || VIEW_LAYOUT.front
  const theme = FIT_THEMES[fitStatus] || FIT_THEMES.perfect
  const userHref = escapeSvgUrl(userSource)
  const productHref = escapeSvgUrl(productSource)
  const fitLabelText = escapeSvgText(fitLabel)
  const productNameText = escapeSvgText(productName || "Product")
  const selectedText = escapeSvgText(selectedSize || "N/A")
  const recommendedText = escapeSvgText(recommendedSize || "N/A")
  const viewTitleText = escapeSvgText(layout.title)

  const accent = theme.accent
  const glow = theme.glow
  const badgeFill = theme.badgeFill
  const badgeText = theme.badgeText
  const garmentScaleX = layout.garmentScaleX * theme.garmentScaleX
  const garmentScaleY = layout.garmentScaleY * theme.garmentScaleY

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 960 1280" role="img" aria-label="${viewTitleText} virtual try-on preview">
      <defs>
        <linearGradient id="bg-${view}" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#F8F2E8" />
          <stop offset="56%" stop-color="#F1E8DB" />
          <stop offset="100%" stop-color="#E8DED0" />
        </linearGradient>
        <radialGradient id="glow-${view}" cx="50%" cy="35%" r="62%">
          <stop offset="0%" stop-color="${glow}" stop-opacity="0.95" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
        </radialGradient>
        <filter id="shadow-${view}" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#2C2B28" flood-opacity="0.18" />
        </filter>
        <clipPath id="photo-clip-${view}">
          <rect x="${layout.imageX}" y="${layout.imageY}" width="${layout.imageWidth}" height="${layout.imageHeight}" rx="56" ry="56" />
        </clipPath>
        <clipPath id="garment-clip-${view}">
          <rect x="0" y="0" width="${layout.garmentWidth}" height="${layout.garmentHeight}" rx="34" ry="34" />
        </clipPath>
      </defs>

      <rect width="960" height="1280" fill="url(#bg-${view})" />
      <rect width="960" height="1280" fill="url(#glow-${view})" />

      <g filter="url(#shadow-${view})">
        <image href="${userHref}" xlink:href="${userHref}" x="${layout.imageX}" y="${layout.imageY}" width="${layout.imageWidth}" height="${layout.imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo-clip-${view})" />
        <rect x="${layout.imageX}" y="${layout.imageY}" width="${layout.imageWidth}" height="${layout.imageHeight}" rx="56" ry="56" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="2" />
      </g>

      <rect x="${layout.imageX}" y="${layout.imageY}" width="${layout.imageWidth}" height="${layout.imageHeight}" rx="56" ry="56" fill="${accent}" fill-opacity="0.08" />

      <g transform="translate(${layout.garmentX} ${layout.garmentY}) scale(${garmentScaleX} ${garmentScaleY})" filter="url(#shadow-${view})">
        <rect x="-12" y="-12" width="${layout.garmentWidth + 24}" height="${layout.garmentHeight + 24}" rx="42" ry="42" fill="${theme.pillFill}" fill-opacity="0.14" stroke="${accent}" stroke-opacity="0.24" />
        <image href="${productHref}" xlink:href="${productHref}" x="0" y="0" width="${layout.garmentWidth}" height="${layout.garmentHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#garment-clip-${view})" opacity="${theme.garmentOpacity}" />
        <rect x="0" y="0" width="${layout.garmentWidth}" height="${layout.garmentHeight}" rx="34" ry="34" fill="none" stroke="${accent}" stroke-opacity="0.44" stroke-width="2.5" />
      </g>

      <g transform="translate(92 94)">
        <rect width="170" height="46" rx="23" fill="#2C2B28" fill-opacity="0.68" />
        <text x="85" y="29" text-anchor="middle" fill="#FFFFFF" font-size="18" font-weight="700" font-family="DM Sans, Arial, sans-serif">${viewTitleText}</text>
      </g>

      <g transform="translate(92 1150)">
        <rect width="168" height="48" rx="24" fill="${badgeFill}" fill-opacity="0.16" />
        <text x="84" y="30" text-anchor="middle" fill="${badgeText}" font-size="18" font-weight="700" font-family="DM Sans, Arial, sans-serif">${fitLabelText}</text>
      </g>

      <g transform="translate(92 1210)">
        <text x="0" y="0" fill="#2C2B28" fill-opacity="0.88" font-size="15" font-weight="600" font-family="DM Sans, Arial, sans-serif">${productNameText}</text>
        <text x="0" y="22" fill="#2C2B28" fill-opacity="0.62" font-size="13" font-family="DM Sans, Arial, sans-serif">Selected ${selectedText} · Recommended ${recommendedText}</text>
      </g>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// NEW: fit labeling logic
export function buildPreviewFitContext(sizeInput = {}) {
  const context =
    typeof sizeInput === "object" && sizeInput !== null
      ? sizeInput
      : { selectedSize: sizeInput }

  const selectedSize = firstValue(
    context.selectedSize,
    context.selected_size,
    context.size,
  )
  const recommendedSize = firstValue(
    context.recommendedSize,
    context.recommended_size,
    context.targetSize,
    context.target_size,
    selectedSize,
  )

  const { fitStatus, fitLabel } = resolveFitLabel({
    selectedSize,
    recommendedSize,
  })

  return {
    selectedSize,
    recommendedSize,
    fitStatus,
    fitLabel,
  }
}

// NEW: VTO integration
export async function generateTryOnImages(userImages = {}, productImage = "", sizeInput = {}) {
  if (typeof window === "undefined") {
    return {
      front: "",
      back: "",
      left: "",
      right: "",
    }
  }

  const cacheKey = buildPreviewCacheKey(userImages, productImage, sizeInput)

  if (PREVIEW_CACHE.has(cacheKey)) {
    return PREVIEW_CACHE.get(cacheKey)
  }

  if (IN_FLIGHT_REQUESTS.has(cacheKey)) {
    return IN_FLIGHT_REQUESTS.get(cacheKey)
  }

  const request = (async () => {
    // This mock delay mirrors the latency we will have once the real Google VTO request is wired in.
    await wait(800)

    const { fitStatus, fitLabel, selectedSize, recommendedSize } =
      buildPreviewFitContext(sizeInput)

    const result = PREVIEW_VIEWS.reduce((accumulator, view) => {
      const sourceImage =
        userImages?.[view.key] ||
        userImages?.front ||
        userImages?.back ||
        userImages?.left ||
        userImages?.right ||
        productImage

      accumulator[view.key] = buildPreviewSvg({
        view: view.key,
        userSource: sourceImage || productImage,
        productSource: productImage || sourceImage,
        fitLabel,
        fitStatus,
        selectedSize,
        recommendedSize,
        productName: sizeInput?.productName || "",
      })

      return accumulator
    }, {})

    PREVIEW_CACHE.set(cacheKey, result)
    return result
  })()

  IN_FLIGHT_REQUESTS.set(cacheKey, request)

  try {
    return await request
  } finally {
    IN_FLIGHT_REQUESTS.delete(cacheKey)
  }
}

export { PREVIEW_VIEWS }
