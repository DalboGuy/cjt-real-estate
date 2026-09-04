import { Star } from "lucide-react"

const reviews = [
  {
    quote:
      "The most beautiful home we've ever stayed in. Photos don't do it justice — the light, the quiet, the pool at sunset. We're already planning our return.",
    name: "Elena & Marcus",
    detail: "Anniversary weekend",
  },
  {
    quote:
      "Booking directly was effortless and the host was incredibly responsive. Every detail was considered, from the espresso bar to the fresh linens.",
    name: "The Whitmore Family",
    detail: "Summer holiday",
  },
  {
    quote:
      "A truly serene retreat. We cooked every night in the chef's kitchen and spent mornings on the terrace. It felt like our own private resort.",
    name: "Priya S.",
    detail: "Friends getaway",
  },
]

export function Reviews() {
  return (
    <section id="reviews" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mb-12 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-accent">Guest Reviews</p>
          <h2 className="text-balance font-serif text-4xl font-medium leading-tight sm:text-5xl">
            Loved by every guest
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 text-accent">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-current" />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">4.98 · 120+ stays</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {reviews.map((review) => (
          <figure
            key={review.name}
            className="flex flex-col rounded-sm border border-border bg-card p-8"
          >
            <div className="mb-5 flex gap-0.5 text-accent">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-current" />
              ))}
            </div>
            <blockquote className="flex-1 text-pretty leading-relaxed text-card-foreground">
              {`"${review.quote}"`}
            </blockquote>
            <figcaption className="mt-6 border-t border-border pt-5">
              <p className="font-serif text-lg font-medium">{review.name}</p>
              <p className="text-sm text-muted-foreground">{review.detail}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
