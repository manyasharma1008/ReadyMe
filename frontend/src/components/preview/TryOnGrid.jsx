import { PREVIEW_VIEWS } from "../../api"

const FIT_STYLES = {
  tight: {
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    glow: "from-rose-500/20",
    dot: "bg-rose-500",
  },
  perfect: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    glow: "from-emerald-500/20",
    dot: "bg-emerald-500",
  },
  loose: {
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    glow: "from-sky-500/20",
    dot: "bg-sky-500",
  },
}

const FALLBACK_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 1000'%3E%3Crect width='800' height='1000' rx='48' fill='%23EFE8DD'/%3E%3Ctext x='400' y='492' text-anchor='middle' fill='%23666666' font-family='Arial, sans-serif' font-size='30'%3ETry-on preview pending%3C/text%3E%3C/svg%3E"

export default function TryOnGrid({
  images,
  fitLabel,
  fitStatus = "perfect",
  loading = false,
}) {
  const style = FIT_STYLES[fitStatus] || FIT_STYLES.perfect

  return (
    <div
      className={`grid gap-4 md:grid-cols-2 ${loading ? "pointer-events-none select-none opacity-80" : ""}`}
      aria-busy={loading}
    >
      {PREVIEW_VIEWS.map((view) => {
        const imageSrc = images?.[view.key] || FALLBACK_IMAGE

        return (
          <article
            key={view.key}
            className="group overflow-hidden rounded-[28px] border border-charcoal-700/10 bg-white/90 shadow-[0_22px_70px_rgba(44,43,40,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(44,43,40,0.18)]"
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,237,227,0.92))]">
              <img
                src={imageSrc}
                alt={`${view.title} try-on result`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />

              <div className={`absolute inset-0 bg-gradient-to-t ${style.glow} via-transparent to-transparent opacity-100`} />

              <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                <span className="inline-flex items-center rounded-full border border-white/35 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white backdrop-blur">
                  {view.label}
                </span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] backdrop-blur ${style.chip}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {fitLabel}
                </span>
              </div>

              <div className="absolute inset-x-4 bottom-4 rounded-[22px] border border-white/30 bg-black/55 p-3 text-white backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
                  View
                </p>
                <p className="mt-1 text-sm font-medium text-white">
                  {view.title}
                </p>
                <p className="mt-1 text-xs text-white/70">
                  Lazy-loaded mock VTO frame
                </p>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

