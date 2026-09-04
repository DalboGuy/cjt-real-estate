export function Hero() {
  return (
    <section id="top" className="relative flex min-h-svh items-end overflow-hidden">
      <img
        src="/images/hero-exterior.png"
        alt="The Cedar House lit up at dusk with warm light glowing through floor-to-ceiling windows"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" />

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-32 sm:pb-24">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/70">
          Private Home Retreat
        </p>
        <h1 className="max-w-3xl text-balance font-serif text-5xl font-medium leading-[1.05] text-white sm:text-6xl md:text-7xl">
          Your unforgettable escape, booked directly.
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-white/80">
          A secluded four-bedroom home surrounded by nature — thoughtfully designed
          for rest, gathering, and slow mornings. No platform fees. No middlemen.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="#inquire"
            className="rounded-sm bg-accent px-7 py-3.5 text-center text-sm font-medium tracking-wide text-accent-foreground transition-opacity hover:opacity-90"
          >
            Request Your Dates
          </a>
          <a
            href="#gallery"
            className="rounded-sm border border-white/40 px-7 py-3.5 text-center text-sm font-medium tracking-wide text-white transition-colors hover:bg-white/10"
          >
            Explore the Home
          </a>
        </div>
      </div>
    </section>
  )
}
