import { Mail, Phone, AtSign } from "lucide-react"

export function SiteFooter() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-serif text-2xl font-semibold">The Cedar House</p>
            <p className="mt-4 text-pretty leading-relaxed text-primary-foreground/60">
              A private luxury home retreat, available for direct booking year-round.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-sm uppercase tracking-[0.2em] text-accent">Get in touch</p>
            <a
              href="mailto:stay@thecedarhouse.com"
              className="flex items-center gap-3 text-sm text-primary-foreground/80 transition-colors hover:text-primary-foreground"
            >
              <Mail className="h-4 w-4" strokeWidth={1.5} />
              stay@thecedarhouse.com
            </a>
            <a
              href="tel:+15551234567"
              className="flex items-center gap-3 text-sm text-primary-foreground/80 transition-colors hover:text-primary-foreground"
            >
              <Phone className="h-4 w-4" strokeWidth={1.5} />
              +1 (555) 123-4567
            </a>
            <a
              href="#"
              className="flex items-center gap-3 text-sm text-primary-foreground/80 transition-colors hover:text-primary-foreground"
            >
              <AtSign className="h-4 w-4" strokeWidth={1.5} />
              @thecedarhouse
            </a>
          </div>
        </div>

        <div className="mt-12 border-t border-primary-foreground/15 pt-6 text-xs text-primary-foreground/50">
          © {new Date().getFullYear()} The Cedar House. Book directly and save.
        </div>
      </div>
    </footer>
  )
}
