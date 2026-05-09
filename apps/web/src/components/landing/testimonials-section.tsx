import { Star } from "lucide-react"
import { FadeIn } from "./fade-in"

const testimonials = [
  {
    name: "Marcus Thompson",
    company: "Kingsmen Haulers Inc",
    quote:
      "DriveCommand transformed how we manage our fleet. The real-time tracking and automated notifications save us hours every day. Our drivers love the app too.",
    rating: 5,
  },
  {
    name: "Jennifer Walsh",
    company: "Westfield Transport Ltd",
    quote:
      "The safety monitoring alone has reduced our insurance premiums by 15%. The driver coaching insights are incredibly actionable. Best investment we've made.",
    rating: 5,
  },
  {
    name: "David Chen",
    company: "AC Transport",
    quote:
      "We switched from three different tools to just DriveCommand. Everything in one place - tracking, documents, billing, payroll. It's a game changer.",
    rating: 5,
  },
  {
    name: "Raj Patel",
    company: "PHD Logistics",
    quote:
      "The AI profit predictor paid for itself in the first week. We now know exactly which loads are worth taking before we commit. Incredible tool.",
    rating: 5,
  },
  {
    name: "Lisa Martinez",
    company: "Transbay Xpress",
    quote:
      "Onboarding was seamless. We were up and running in under an hour. The support team is responsive and actually helpful. Highly recommend.",
    rating: 5,
  },
  {
    name: "Andre Jackson",
    company: "Giant Dispatch",
    quote:
      "The fuel analytics dashboard showed us we were wasting $3,000/month on idle time alone. DriveCommand literally pays for itself many times over.",
    rating: 5,
  },
]

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Loved by{" "}
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Fleet Operators
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Don&apos;t just take our word for it. Here&apos;s what our customers have to say.
          </p>
        </FadeIn>
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map(({ name, company, quote, rating }, i) => (
            <FadeIn key={name} delay={i * 100}>
              <div className="h-full rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-6">
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-gray-300">
                  &ldquo;{quote}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold text-white">
                    {name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{name}</div>
                    <div className="text-xs text-gray-500">{company}</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
