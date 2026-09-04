const photos = [
  { src: "/images/living-room.png", alt: "Bright living room with floor-to-ceiling windows and a nature view", span: "md:col-span-2 md:row-span-2" },
  { src: "/images/kitchen.png", alt: "Modern kitchen with a marble island and brass fixtures", span: "" },
  { src: "/images/bedroom.png", alt: "Serene master bedroom with plush neutral bedding and soft morning light", span: "" },
  { src: "/images/outdoor-pool.png", alt: "Outdoor terrace with an infinity pool at golden hour", span: "md:col-span-2" },
  { src: "/images/bathroom.png", alt: "Spa-like bathroom with a freestanding stone bathtub", span: "" },
  { src: "/images/dining.png", alt: "Elegant dining area with a long wooden table and statement lighting", span: "" },
]

export function Gallery() {
  return (
    <section id="gallery" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mb-12 max-w-2xl">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-accent">Gallery</p>
        <h2 className="text-balance font-serif text-4xl font-medium leading-tight sm:text-5xl">
          Every corner designed to be lived in
        </h2>
      </div>

      <div className="grid auto-rows-[220px] grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {photos.map((photo) => (
          <div
            key={photo.src}
            className={`group relative overflow-hidden rounded-sm ${photo.span}`}
          >
            <img
              src={photo.src || "/placeholder.svg"}
              alt={photo.alt}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
