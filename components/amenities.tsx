import {
  Wifi,
  Waves,
  ChefHat,
  Flame,
  Car,
  Trees,
  Snowflake,
  Tv,
  WashingMachine,
  Dog,
  Bath,
  Coffee,
} from "lucide-react"

const amenities = [
  { icon: Waves, label: "Private infinity pool" },
  { icon: ChefHat, label: "Chef's kitchen" },
  { icon: Wifi, label: "High-speed Wi-Fi" },
  { icon: Flame, label: "Indoor fireplace" },
  { icon: Trees, label: "Landscaped grounds" },
  { icon: Car, label: "Free on-site parking" },
  { icon: Snowflake, label: "Central A/C & heating" },
  { icon: Tv, label: "Smart TVs throughout" },
  { icon: WashingMachine, label: "Washer & dryer" },
  { icon: Bath, label: "Spa-style bathrooms" },
  { icon: Coffee, label: "Espresso bar" },
  { icon: Dog, label: "Pet friendly" },
]

export function Amenities() {
  return (
    <section id="amenities" className="border-y border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:gap-16">
          <div>
            <p className="mb-3 text-sm uppercase tracking-[0.3em] text-accent">Amenities</p>
            <h2 className="text-balance font-serif text-4xl font-medium leading-tight sm:text-5xl">
              Thoughtful comforts, all included
            </h2>
            <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted-foreground">
              Sleeps up to eight across four ensuite bedrooms. Everything you need for
              a relaxed, effortless stay is already here.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            {amenities.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.label} className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-background text-accent">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <span className="text-sm leading-relaxed">{item.label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
