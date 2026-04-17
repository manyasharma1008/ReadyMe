const ACTIVE_PRODUCT_STORAGE_KEY = "readyMeActiveProductSession"

const STATUS_LABELS = {
  loading: "Loading",
  ready: "Ready",
  no_size_chart: "No Size Chart",
  not_product_page: "Not a Product Page",
  backend_unreachable: "Backend Offline",
  error: "Error",
}
// fbu
const CATEGORY_MAP = {
  shirt: "shirts",
  shirts: "shirts",
  tshirt: "shirts",
  "t-shirt": "shirts",
  tee: "shirts",
  top: "shirts",
  blouse: "shirts",
  polo: "shirts",
  pant: "pants",
  pants: "pants",
  trouser: "pants",
  trousers: "pants",
  jean: "pants",
  jeans: "pants",
  leggings: "pants",
  shorts: "pants",
  jacket: "jackets",
  jackets: "jackets",
  blazer: "jackets",
  coat: "jackets",
  hoodie: "jackets",
  hoodies: "jackets",
  sweater: "jackets",
  dress: "dresses",
  dresses: "dresses",
  gown: "dresses",
  kurti: "dresses",
  saree: "dresses",
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  )
}

function normalizeCategory(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (CATEGORY_MAP[normalized]) return CATEGORY_MAP[normalized]

  for (const [keyword, mapped] of Object.entries(CATEGORY_MAP)) {
    if (normalized.includes(keyword)) return mapped
  }

  return normalized
}

function normalizeGender(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("women") || normalized.includes("female") || normalized.includes("girl")) return "women"
  if (normalized.includes("men") || normalized.includes("male") || normalized.includes("boy")) return "men"
  if (normalized.includes("unisex")) return "unisex"
  return normalized
}

function normalizeSiteName(value) {
  const normalized = String(value || "").trim().toLowerCase()
  return normalized ? normalized.replace(/^www\./, "") : null
}

function normalizeWarnings(value) {
  if (Array.isArray(value)) return uniqueStrings(value)
  if (typeof value === "string" && value.trim()) return [value.trim()]
  return []
}

function parseJsonMaybe(value) {
  if (!value) return null

  try {
    return JSON.parse(value)
  } catch (error) {
    try {
      return JSON.parse(decodeURIComponent(value))
    } catch (decodeError) {
      return null
    }
  }
}

function deriveStatus(raw, product, sizeChart) {
  if (typeof raw?.status === "string" && raw.status.trim()) return raw.status
  if (raw?.isProductPage === false) return "not_product_page"
  if (raw?.backendSync === "unavailable") return "backend_unreachable"
  if (product?.url && sizeChart) return "ready"
  if (product?.url) return "no_size_chart"
  return "error"
}

export function normalizeProduct(rawProduct = {}) {
  const images = uniqueStrings([rawProduct.image, ...(rawProduct.images || [])])
  const image = rawProduct.image || images[0] || null

  return {
    url: rawProduct.url || null,
    title: rawProduct.title || rawProduct.name || null,
    image,
    images,
    price: rawProduct.price || null,
    product_id: rawProduct.product_id || null,
    brand: rawProduct.brand || null,
    category: normalizeCategory(rawProduct.category),
    gender: normalizeGender(rawProduct.gender),
    site_name: normalizeSiteName(rawProduct.site_name || rawProduct.site),
  }
}

export function getBackendSizeChart(session) {
  if (!session?.backendSync || typeof session.backendSync !== "object") {
    return session?.sizeChart || null
  }

  return (
    session.backendSync.size_chart ||
    session.backendSync.result?.size_chart ||
    session.sizeChart ||
    null
  )
}

export function normalizeActiveProductSession(rawSession) {
  if (!rawSession || typeof rawSession !== "object") return null

  const productSource = rawSession.product && typeof rawSession.product === "object"
    ? rawSession.product
    : rawSession
  const product = normalizeProduct(productSource)
  const warnings = normalizeWarnings(rawSession.warnings || rawSession.extractionWarnings)
  const backendSync = rawSession.backendSync ?? null
  const sizeChart =
    rawSession.sizeChart ||
    rawSession.size_chart ||
    (typeof backendSync === "object" ? backendSync.size_chart || backendSync.result?.size_chart : null) ||
    null

  return {
    status: deriveStatus(rawSession, product, sizeChart),
    product,
    sizeChart,
    backendSync,
    warnings,
    timestamp: rawSession.timestamp || null,
  }
}

export function parseActiveProductSessionFromSearch(search = "") {
  const params = new URLSearchParams(search)
  const encoded = params.get("data")
  if (!encoded) return null

  return normalizeActiveProductSession(parseJsonMaybe(encoded))
}

export function persistActiveProductSession(session) {
  if (typeof window === "undefined") return

  if (!session) {
    window.sessionStorage.removeItem(ACTIVE_PRODUCT_STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(
    ACTIVE_PRODUCT_STORAGE_KEY,
    JSON.stringify(normalizeActiveProductSession(session))
  )
}

export function loadPersistedActiveProductSession() {
  if (typeof window === "undefined") return null

  const rawValue = window.sessionStorage.getItem(ACTIVE_PRODUCT_STORAGE_KEY)
  return normalizeActiveProductSession(parseJsonMaybe(rawValue))
}

export function clearPersistedActiveProductSession() {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(ACTIVE_PRODUCT_STORAGE_KEY)
}

export function formatActiveProductStatus(status) {
  return STATUS_LABELS[status] || "Unknown"
}

export function getInitialPreferencesFromProduct(session) {
  const product = session?.product
  if (!product) return {}

  const nextPreferences = {}
  if (["shirts", "pants", "jackets", "dresses"].includes(product.category)) {
    nextPreferences.category = product.category
  }
  if (["men", "women"].includes(product.gender)) {
    nextPreferences.gender = product.gender
  }

  return nextPreferences
}
