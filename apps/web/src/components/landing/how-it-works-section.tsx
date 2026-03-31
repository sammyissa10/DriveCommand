import { BarChart3, Globe, Brain } from "lucide-react"
import { FadeIn } from "./fade-in"

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Up and Running in{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Minutes
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            No complex setup. No IT team required. Get your fleet connected and start saving
            today.
          </p>
        </FadeIn>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Connect Your Fleet",
              desc: "Import your trucks and drivers. Connect your ELD, GPS, and accounting tools with one-click integrations.",
              icon: Globe,
            },
            {
              step: "02",
              title: "See Everything",
              desc: "Instant visibility into every vehicle, route, and financial metric. Live maps, safety scores, and profit tracking from day one.",
              icon: BarChart3,
            },
            {
              step: "03",
              title: "Let AI Optimize",
              desc: "Our AI analyzes your operations, predicts profit on loads, automates invoicing, and surfaces insights that save you money.",
              icon: Brain,
            },
          ].map(({ step, title, desc, icon: Icon }, i) => (
            <FadeIn key={step} delay={i * 150}>
              <div className="group relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8 transition-all hover:border-blue-500/20 hover:bg-white/[0.04]">
                <div className="mb-4 text-sm font-bold text-blue-500">{step}</div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                  <Icon className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
