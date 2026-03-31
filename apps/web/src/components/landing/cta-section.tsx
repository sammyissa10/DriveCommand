import Link from "next/link"
import { ArrowRight, CheckCircle2, Phone } from "lucide-react"
import { FadeIn } from "./fade-in"

export function CTASection() {
  return (
    <section id="demo" className="relative overflow-hidden px-6 py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[120px]" />
      </div>
      <FadeIn className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
          Transform Your Fleet Operations{" "}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Today
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-gray-400">
          Join hundreds of fleet operators who&apos;ve switched to DriveCommand. Get started in
          minutes, not months.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-110"
          >
            Request Demo
            <ArrowRight className="h-5 w-5" />
          </Link>
          <a
            href="tel:+18005550199"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
          >
            <Phone className="h-4 w-4" />
            Call Sales
          </a>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-500">
          {["Free 14-day trial", "No credit card required", "Setup in under an hour"].map(
            (badge) => (
              <div key={badge} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {badge}
              </div>
            )
          )}
        </div>
      </FadeIn>
    </section>
  )
}
