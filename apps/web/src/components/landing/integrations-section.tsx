import { Globe } from "lucide-react"
import { FadeIn } from "./fade-in"

const integrations = [
  { name: "Motive", category: "ELD" },
  { name: "Samsara", category: "ELD" },
  { name: "Geotab", category: "Fleet" },
  { name: "QuickBooks", category: "Accounting" },
  { name: "Xero", category: "Accounting" },
  { name: "Gmail", category: "Email" },
  { name: "Outlook", category: "Email" },
  { name: "Stripe", category: "Payments" },
  { name: "FTP Portal", category: "Factoring" },
  { name: "RTS Financial", category: "Factoring" },
  { name: "BorderConnect", category: "Compliance" },
  { name: "ACE/ACI", category: "Compliance" },
  { name: "CloudHawk", category: "ELD" },
  { name: "Relay", category: "Payments" },
  { name: "Flying J", category: "Fuel" },
  { name: "Pilot", category: "Fuel" },
  { name: "TCS Fuel", category: "Fuel" },
  { name: "Truck Miles", category: "Routing" },
]

export function IntegrationsSection() {
  return (
    <section id="integrations" className="bg-white/[0.02] px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
            <Globe className="h-3 w-3" />
            40+ Integrations
          </div>
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            We Believe in{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Quality Data
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Seamlessly connect with the tools you already use. From ELDs to accounting, we
            integrate with your entire tech stack.
          </p>
        </FadeIn>
        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {integrations.map(({ name, category }, i) => (
            <FadeIn key={name} delay={i * 50} direction="up">
              <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-4 text-center transition-all hover:border-white/10 hover:bg-white/[0.05]">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
                  {name.slice(0, 2)}
                </div>
                <span className="text-sm font-medium text-white">{name}</span>
                <span className="text-xs text-gray-500">{category}</span>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
