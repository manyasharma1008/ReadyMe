import Navbar from "../components/Navbar"

export default function Help() {
  const faqs = [
    {
      q: "How does ReadyMe work?",
      a: "Upload a photo or use your camera. ReadyMe maps garments onto your body using AI-driven cloth simulation so you can preview outfits in real time."
    },
    {
      q: "Do I need special hardware?",
      a: "No special hardware is required. A standard smartphone or laptop camera works for most virtual try-on experiences."
    },
    {
      q: "Is my photo stored?",
      a: "Photos are used only for generating the virtual preview and are not permanently stored unless explicitly saved."
    },
    {
      q: "What types of clothing are supported?",
      a: "ReadyMe supports tops, jackets, dresses, and layered garments compatible with the simulation engine."
    },
    {
      q: "Why does the preview take time?",
      a: "The system generates a cloth simulation and lighting model to create a photorealistic preview."
    },
    {
      q: "How do I report an issue?",
      a: "Use the Contact page to send feedback or report technical problems."
    }
  ]

  return (
    <div className="min-h-screen bg-[#e7e3dd]">
      <Navbar />

      <main className="max-w-screen-xl mx-auto px-6 md:px-10 pt-24 pb-16">

        {/* Header */}
        <section className="max-w-3xl mb-14 animate-fade-up stagger-1">
          <p className="font-mono text-[10px] tracking-[0.35em] text-charcoal-700/40 uppercase mb-4">
            {/* Support / Assistance */}
          </p>

          <h1 className="font-display text-5xl font-light text-charcoal-800 mb-4">
            Help Center
          </h1>

          <p className="text-charcoal-700/70 leading-relaxed max-w-xl">
            Find answers to common questions about using ReadyMe’s virtual
            fashion platform, uploading photos, and trying outfits in the
            3D preview environment.
          </p>
        </section>

        {/* FAQ */}
        <section className="grid md:grid-cols-2 gap-6">

          {faqs.map((item, i) => (
            <div
              key={i}
              className={`border border-charcoal-700/10 rounded-md p-6 bg-cream-100 hover:border-rust/40 transition animate-fade-up stagger-${(i % 5) + 1}`}
            >
              <h3 className="font-display text-lg text-charcoal-800 mb-2">
                {item.q}
              </h3>

              <p className="text-sm text-charcoal-700/70 leading-relaxed">
                {item.a}
              </p>
            </div>
          ))}

        </section>

        {/* Support block */}
        <section className="mt-16 border-t border-charcoal-700/10 pt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 animate-fade-up stagger-3">

          <div>
            <h3 className="font-display text-2xl font-light text-charcoal-800">
              Still need help?
            </h3>

            <p className="text-charcoal-700/70 mt-2">
              Our support team can assist you with technical issues or
              platform questions.
            </p>
          </div>

          <a
            href="/contact"
            className="cta-btn border border-charcoal-800 px-6 py-3 font-mono text-[11px] tracking-widest uppercase"
          >
            <span>Contact Support</span>
          </a>

        </section>

      </main>
    </div>
  )
}