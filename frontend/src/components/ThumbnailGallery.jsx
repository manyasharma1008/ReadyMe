// ThumbnailGallery.jsx
// Uses Unsplash fashion photos as placeholder images
const THUMBS = [
  {
    id: 1,
    src: "https://img.freepik.com/free-photo/high-fashion-look-glamor-closeup-portrait-beautiful-sexy-stylish-caucasian-young-woman-model_158538-2774.jpg?semt=ais_hybrid&w=740&q=80",
    alt: "Look 01",
  },
  {
    id: 2,
    src: "https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?cs=srgb&dl=pexels-aksioart-1926769.jpg&fm=jpg",
    alt: "Look 02",
  },
  {
    id: 3,
    src: "https://www.apetogentleman.com/wp-content/uploads/2018/06/male-models-noah.jpg",
    alt: "Look 03",
  },
  {
    id: 4,
    src: "https://images.stockcake.com/public/f/7/5/f75b9f31-6177-495f-bfca-9564a83f687a_large/minimal-fashion-portrait-stockcake.jpg",
    alt: "Look 04",
  },
  {
    id: 5,
    src: "https://burst.shopifycdn.com/photos/man-in-white-and-light-tan-outfit.jpg?width=1000&format=pjpg&exif=0&iptc=0",
    alt: "Look 05",
  },
];

export default function ThumbnailGallery({ active, onSelect }) {
  return (
    <div className="flex flex-col gap-3 items-center">
      {THUMBS.map((thumb, i) => (
        <button
          key={thumb.id}
          onClick={() => onSelect(thumb)}
          className="group relative w-full focus:outline-none"
          aria-label={`Select ${thumb.alt}`}
        >
          {/* Number label */}
          <span className="block text-center font-mono text-[10px] tracking-widest text-charcoal-700/40 mb-1">
            {String(i + 1).padStart(2, '0')}
          </span>

          {/* Thumbnail image */}
          <div className={`
            overflow-hidden rounded-sm border transition-all duration-300
            ${active?.id === thumb.id
              ? 'border-clay shadow-md scale-105'
              : 'border-charcoal-700/10 hover:border-clay/60'
            }
          `}>
            <img
              src={thumb.src}
              alt={thumb.alt}
              className={`thumbnail-img w-full h-16 object-cover object-top ${active?.id === thumb.id ? 'active' : ''}`}
            />
          </div>

          {/* Active indicator line */}
          {active?.id === thumb.id && (
            <span className="absolute left-0 top-6 bottom-1 w-0.5 bg-rust rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}

export { THUMBS }
