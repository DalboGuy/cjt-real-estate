import { SiteHeader } from "@/components/site-header"
import { Hero } from "@/components/hero"
import { Gallery } from "@/components/gallery"
import { Amenities } from "@/components/amenities"
import { Reviews } from "@/components/reviews"
import { Location } from "@/components/location"
import { InquiryForm } from "@/components/inquiry-form"
import { SiteFooter } from "@/components/site-footer"

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Gallery />
        <Amenities />
        <Reviews />
        <Location />
        <InquiryForm />
      </main>
      <SiteFooter />
    </>
  )
}
