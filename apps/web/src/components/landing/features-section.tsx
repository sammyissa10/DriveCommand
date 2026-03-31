import Link from "next/link"
import {
  MapPin,
  Shield,
  ArrowRight,
  CheckCircle2,
  BarChart3,
  Smartphone,
  DollarSign,
  TrendingUp,
  Brain,
  MessageSquare,
  Camera,
  Receipt,
  Calculator,
  FileText,
  CreditCard,
  Route,
  Clock,
} from "lucide-react"
import { FadeIn } from "./fade-in"

export function FeaturesSection() {
  return (
    <>
      {/* Feature Section 1: Fleet Tracking */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <FadeIn direction="left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
              <MapPin className="h-3 w-3" />
              Real-Time Tracking
            </div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Complete Fleet Visibility,{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                In Real Time
              </span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-400">
              Know exactly where every truck is, what every driver is doing, and how every route is
              performing &mdash; all from a single dashboard.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Live GPS tracking with interactive fleet map",
                "Vehicle status indicators (Moving, Idle, Offline)",
                "Route history and replay for any vehicle",
                "Automatic ETA calculations sent to customers",
                "Tag-based fleet filtering and grouping",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="#demo"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-blue-400 transition-colors hover:text-blue-300"
            >
              Request Demo <ArrowRight className="h-4 w-4" />
            </Link>
          </FadeIn>
          <FadeIn direction="right" delay={100}>
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-blue-900/20 to-indigo-900/10 p-8">
              <div className="space-y-3">
                {[
                  { truck: "Truck #1042", driver: "Mike Johnson", status: "Moving", location: "I-95 N, Richmond VA", color: "bg-green-500" },
                  { truck: "Truck #1087", driver: "Sarah Chen", status: "Loading", location: "Warehouse 3, Atlanta GA", color: "bg-yellow-500" },
                  { truck: "Truck #1023", driver: "James Wilson", status: "Moving", location: "I-40 W, Nashville TN", color: "bg-green-500" },
                  { truck: "Truck #1056", driver: "Alex Rivera", status: "Idle", location: "Rest Stop, Charlotte NC", color: "bg-orange-500" },
                ].map(({ truck, driver, status, location, color }) => (
                  <div key={truck} className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.03] p-4">
                    <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">{truck}</span>
                        <span className="text-xs text-gray-500">{status}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {driver} &bull; {location}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Feature Section 2: Safety & Compliance */}
      <section className="bg-white/[0.02] px-6 py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <FadeIn direction="left" className="order-2 lg:order-1">
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-900/20 to-cyan-900/10 p-8">
              <div className="mb-6 text-center">
                <div className="text-6xl font-bold text-white">94.2</div>
                <div className="mt-1 text-sm text-gray-500">Fleet Safety Score</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[94%] rounded-full bg-gradient-to-r from-green-500 to-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Harsh Braking", count: "12", trend: "-18%" },
                  { label: "Speeding", count: "8", trend: "-24%" },
                  { label: "Distracted", count: "3", trend: "-45%" },
                  { label: "Seatbelt", count: "1", trend: "-67%" },
                ].map(({ label, count, trend }) => (
                  <div key={label} className="rounded-lg border border-white/5 bg-white/[0.03] p-3 text-center">
                    <div className="text-lg font-bold text-white">{count}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="mt-1 text-xs text-green-400">{trend}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn direction="right" delay={100} className="order-1 lg:order-2">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <Shield className="h-3 w-3" />
              Safety & Compliance
            </div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Protect Your Drivers,{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Protect Your Business
              </span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-400">
              AI-powered safety monitoring catches dangerous driving patterns before they become
              incidents. Track compliance, reduce insurance costs, and keep everyone safe.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Fleet safety score with driver leaderboards",
                "8 event types tracked: harsh braking, speeding, distraction & more",
                "Real-time incident alerts with severity levels",
                "Driver coaching insights and trend analysis",
                "Document expiry tracking for compliance",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="#demo"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
            >
              Request Demo <ArrowRight className="h-4 w-4" />
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* Feature Section 3: Driver & Ops Apps */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400">
              <Smartphone className="h-3 w-3" />
              Time is Money. Save Both.
            </div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Apps for{" "}
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Every Role
              </span>
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Purpose-built tools for drivers on the road and operations teams in the office.
              Eliminate paperwork and automate the busywork.
            </p>
          </FadeIn>

          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            <FadeIn delay={100} direction="left">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Smartphone className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Driver App</h3>
                    <p className="text-sm text-gray-500">Everything drivers need on the road</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Camera, text: "POD/BOL scanning & document capture" },
                    { icon: MessageSquare, text: "Secure fleet messaging (replace WhatsApp)" },
                    { icon: Route, text: "Real-time load updates & navigation" },
                    { icon: MapPin, text: "GPS tracking with turn-by-turn directions" },
                    { icon: Clock, text: "Hours of Service (HOS) tracking" },
                    { icon: Shield, text: "Incident reporting with photo evidence" },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
                      <Icon className="h-4 w-4 shrink-0 text-blue-400" />
                      <span className="text-sm text-gray-300">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={200} direction="right">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <BarChart3 className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Operations Hub</h3>
                    <p className="text-sm text-gray-500">Streamline your back office</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Brain, text: "AI-powered invoice & rate con reading" },
                    { icon: CreditCard, text: "One-click billing integration" },
                    { icon: Route, text: "Dispatch and load management" },
                    { icon: Calculator, text: "Automated payroll processing" },
                    { icon: Receipt, text: "Accounts receivable & payable" },
                    { icon: FileText, text: "Compliance tracking & document management" },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
                      <Icon className="h-4 w-4 shrink-0 text-purple-400" />
                      <span className="text-sm text-gray-300">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Feature Section 4: Financial Intelligence */}
      <section className="bg-white/[0.02] px-6 py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <FadeIn direction="left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
              <DollarSign className="h-3 w-3" />
              Financial Intelligence
            </div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Hello,{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                Profit
              </span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-400">
              Stop guessing and start knowing. AI-driven financial tools give you true visibility
              into your profitability per truck, per lane, and per mile.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Automatic, AI-read expense & invoice reporting",
                "True profit/loss per truck, per lane, per mile",
                "Embedded AI profit predictor before you accept loads",
                "Fuel cost optimization and MPG trend analysis",
                "Real-time cost-per-mile tracking",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="#demo"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-amber-400 transition-colors hover:text-amber-300"
            >
              Request Demo <ArrowRight className="h-4 w-4" />
            </Link>
          </FadeIn>
          <FadeIn direction="right" delay={100}>
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-amber-900/20 to-orange-900/10 p-8">
              <div className="mb-6 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] p-4">
                <div>
                  <div className="text-sm text-gray-500">Monthly Profit Margin</div>
                  <div className="mt-1 text-3xl font-bold text-white">23.5%</div>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-sm text-green-400">
                  <TrendingUp className="h-3 w-3" />
                  +4.2%
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Revenue per Mile", value: "$3.42", change: "+8%" },
                  { label: "Cost per Mile", value: "$2.61", change: "-3%" },
                  { label: "Fuel Efficiency", value: "7.2 MPG", change: "+5%" },
                  { label: "Idle Waste", value: "$1,240", change: "-22%" },
                ].map(({ label, value, change }) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] p-3">
                    <span className="text-sm text-gray-400">{label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">{value}</span>
                      <span className="text-xs text-green-400">{change}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  )
}
