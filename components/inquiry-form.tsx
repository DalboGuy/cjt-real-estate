"use client"

import { useState } from "react"
import { Check } from "lucide-react"

export function InquiryForm() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <section id="inquire" className="relative overflow-hidden">
      <img
        src="/images/outdoor-pool.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-primary/90" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-24 sm:py-32 md:grid-cols-2 md:gap-16">
        <div className="text-primary-foreground">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-accent">Check Availability</p>
          <h2 className="text-balance font-serif text-4xl font-medium leading-tight sm:text-5xl">
            Request your dates
          </h2>
          <p className="mt-6 max-w-md text-pretty leading-relaxed text-primary-foreground/70">
            Tell us when you&apos;d like to stay and a little about your trip. We personally
            reply to every inquiry within 24 hours with availability and a direct rate.
          </p>
        </div>

        <div className="rounded-sm bg-card p-8 text-card-foreground sm:p-10">
          {submitted ? (
            <div className="flex h-full flex-col items-center justify-center py-8 text-center">
              <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Check className="h-7 w-7" />
              </span>
              <h3 className="font-serif text-2xl font-medium">Request received</h3>
              <p className="mt-3 max-w-xs text-pretty leading-relaxed text-muted-foreground">
                Thank you — we&apos;ve got your inquiry and will be in touch within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="rounded-sm border border-border bg-background px-4 py-3 text-sm outline-none ring-ring/40 focus:ring-2"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="rounded-sm border border-border bg-background px-4 py-3 text-sm outline-none ring-ring/40 focus:ring-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="checkin" className="text-sm font-medium">
                    Check-in
                  </label>
                  <input
                    id="checkin"
                    name="checkin"
                    type="date"
                    required
                    className="rounded-sm border border-border bg-background px-4 py-3 text-sm outline-none ring-ring/40 focus:ring-2"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="checkout" className="text-sm font-medium">
                    Check-out
                  </label>
                  <input
                    id="checkout"
                    name="checkout"
                    type="date"
                    required
                    className="rounded-sm border border-border bg-background px-4 py-3 text-sm outline-none ring-ring/40 focus:ring-2"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="guests" className="text-sm font-medium">
                  Guests
                </label>
                <select
                  id="guests"
                  name="guests"
                  className="rounded-sm border border-border bg-background px-4 py-3 text-sm outline-none ring-ring/40 focus:ring-2"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "guest" : "guests"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="message" className="text-sm font-medium">
                  Anything else? <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  className="resize-none rounded-sm border border-border bg-background px-4 py-3 text-sm outline-none ring-ring/40 focus:ring-2"
                />
              </div>

              <button
                type="submit"
                className="mt-1 rounded-sm bg-accent px-6 py-3.5 text-sm font-medium tracking-wide text-accent-foreground transition-opacity hover:opacity-90"
              >
                Send Inquiry
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
