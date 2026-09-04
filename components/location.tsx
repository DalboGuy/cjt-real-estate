const attractions = [
  { title: "Vineyard tastings", detail: "Award-winning wineries a 10-minute drive away", distance: "10 min" },
  { title: "Hiking trails", detail: "Miles of forest and ridgeline trails from your door", distance: "On-site" },
  { title: "Village dining", detail: "Farm-to-table restaurants and cafés in town", distance: "15 min" },
  { title: "Lake & beach", detail: "Swimming, kayaking, and lakeside picnics", distance: "20 min" },
  { title: "Farmers market", detail: "Local produce and artisans every weekend", distance: "12 min" },
  { title: "Regional airport", detail: "Easy arrivals and departures", distance: "45 min" },
]

export function Location() {
  return (
    <section id="location" className="border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-accent">Location</p>
          <h2 className="text-balance font-serif text-4xl font-medium leading-tight sm:text-5xl">
            Secluded, yet close to everything
          </h2>
          <p className="mt-6 text-pretty leading-relaxed text-muted-foreground">
            Tucked into the hills with total privacy, but only minutes from the best
            the region has to offer. Exact address shared after booking.
          </p>
        </div>

        <div className="grid gap-x-8 gap-y-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {attractions.map((item) => (
            <div key={item.title} className="flex items-start justify-between gap-4 bg-card p-6">
              <div>
                <h3 className="font-serif text-xl font-medium">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
              </div>
              <span className="shrink-0 text-xs uppercase tracking-wider text-accent">
                {item.distance}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
