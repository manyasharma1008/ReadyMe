import {
  formatActiveProductStatus,
  getBackendSizeChart,
} from "../utils/activeProductSession"
// idew
const STATUS_STYLES = {
  loading: "bg-amber-100 text-amber-800",
  ready: "bg-green-100 text-green-800",
  no_size_chart: "bg-blue-100 text-blue-800",
  not_product_page: "bg-gray-200 text-gray-700",
  backend_unreachable: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
}

export default function ActiveProductPanel({
  session,
  compact = false,
  showGallery = false,
  selectedImage = null,
  onSelectImage = null,
}) {
  if (!session?.product?.url) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white/80 p-4 text-sm text-gray-500">
        No active product session yet.
      </div>
    )
  }

  const { product, warnings = [], status, backendSync } = session
  const images = product.images || []
  const primaryImage = selectedImage || product.image || images[0] || null
  const sizeChart = getBackendSizeChart(session)
  const metadata = [product.brand, product.site_name, product.price].filter(Boolean)
  const statusTone = STATUS_STYLES[status] || STATUS_STYLES.error

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/5 px-4 py-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">Active Product</p>
          <h3 className="mt-1 text-lg font-medium text-charcoal-900">
            {product.title || "Detected product"}
          </h3>
          {metadata.length > 0 && (
            <p className="mt-1 text-sm text-gray-600">{metadata.join(" • ")}</p>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone}`}>
          {formatActiveProductStatus(status)}
        </span>
      </div>

      <div className={`space-y-3 px-4 py-4 ${compact ? "" : "text-sm"}`}>
        <div className="grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-2">
          <div>
            <span className="font-medium text-charcoal-900">Site:</span>{" "}
            {product.site_name || "Unknown"}
          </div>
          <div>
            <span className="font-medium text-charcoal-900">Category:</span>{" "}
            {product.category || "Not detected"}
          </div>
          <div>
            <span className="font-medium text-charcoal-900">Gender:</span>{" "}
            {product.gender || "Not detected"}
          </div>
          <div>
            <span className="font-medium text-charcoal-900">Size rows:</span>{" "}
            {sizeChart?.sizes?.length || 0}
          </div>
          {backendSync && (
            <div className="md:col-span-2">
              <span className="font-medium text-charcoal-900">Backend:</span>{" "}
              {typeof backendSync === "string"
                ? backendSync
                : backendSync.success === false
                  ? backendSync.error || "Sync failed"
                  : "synced"}
            </div>
          )}
        </div>

        {warnings.length > 0 && (
          <p className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            {warnings[0]}
          </p>
        )}

        {showGallery && primaryImage && (
          <div className="space-y-3">
            <img
              src={primaryImage}
              alt={product.title || "Product"}
              className="h-56 w-full rounded-xl object-cover"
            />

            {images.length > 1 && onSelectImage && (
              <div className="flex flex-wrap gap-2">
                {images.map((imageSrc) => (
                  <button
                    key={imageSrc}
                    type="button"
                    onClick={() => onSelectImage(imageSrc)}
                    className={`overflow-hidden rounded-lg border ${
                      primaryImage === imageSrc ? "border-charcoal-900" : "border-gray-200"
                    }`}
                  >
                    <img
                      src={imageSrc}
                      alt="Product option"
                      className="h-14 w-14 object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
