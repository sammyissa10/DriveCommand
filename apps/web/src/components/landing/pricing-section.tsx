import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { FadeIn } from "./fade-in"

const pricingPlans = [
  {
    name: "Starter",
    price: "$49",
    period: "/truck/mo",
    desc: "Perfect for small fleets getting started",
    features: [
      "Up to 10 trucks",
      "Real-time GPS tracking",
      "Safety monitoring",
      "Basic reporting",
      "Driver app access",
      "Email support",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    name: "Professional",
    price: "$79",
    period: "/truck/mo",
    desc: "For growing fleets that need more power",
    features: [
      "Unlimited trucks",
      "Everything in Starter",
      "AI invoice reading",
      "Automated billing",
      "Fuel analytics",
      "40+ integrations",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For large operations with custom needs",
    features: [
      "Everything in Professional",
      "AI profit predictor",
      "Automated payroll",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantee",
      "On-site training",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="bg-white/[0.02] px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Simple,{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Transparent Pricing
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            No hidden fees. No long-term contracts. Start free and scale as you grow.
          </p>
        </FadeIn>
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {pricingPlans.map(({ name, price, period, desc, features, cta, highlight }, i) => (
            <FadeIn key={name} delay={i * 150}>
              <div
                className={`relative h-full rounded-2xl border p-8 ${
                  highlight
                    ? "border-blue-500/50 bg-gradient-to-b from-blue-500/10 to-transparent shadow-lg shadow-blue-500/10"
                    : "border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent"
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">{name}</h3>
                <p className="mt-1 text-sm text-gray-500">{desc}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{price}</span>
                  <span className="text-sm text-gray-500">{period}</span>
                </div>
                <Link
                  href="#demo"
                  className={`mt-6 block rounded-lg py-3 text-center text-sm font-semibold transition-all ${
                    highlight
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {cta}
                </Link>
                <ul className="mt-8 space-y-3">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-gray-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
