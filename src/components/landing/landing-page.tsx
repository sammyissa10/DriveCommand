"use client";

import Link from "next/link";
import {
  Truck,
  MapPin,
  Shield,
  Fuel,
  ArrowRight,
  CheckCircle2,
  Star,
  Users,
  BarChart3,
  Clock,
  FileText,
  CreditCard,
  Bell,
  Route,
  Globe,
  Phone,
  Mail,
  Zap,
  TrendingUp,
  DollarSign,
  Brain,
  Smartphone,
  MessageSquare,
  Camera,
  Receipt,
  Calculator,
} from "lucide-react";
import { FadeIn } from "./fade-in";

const companies = [
  "Westfield Transport",
  "AC Transport",
  "PHD Logistics",
  "Transbay Xpress",
  "SJ Transport",
  "Giant Dispatch",
  "Kingsmen Haulers",
  "PBTL Transport",
  "All Day Hauling",
  "ATZ Trans",
  "Ryes Transportation",
  "Forever Carrier",
];

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
];

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
];

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
];

export function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#0a0e1a]">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0e1a]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">DriveCommand</span>
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              <a href="#features" className="text-sm text-gray-400 transition-colors hover:text-white">
                Features
              </a>
              <a href="#how-it-works" className="text-sm text-gray-400 transition-colors hover:text-white">
                How It Works
              </a>
              <a href="#testimonials" className="text-sm text-gray-400 transition-colors hover:text-white">
                Testimonials
              </a>
              <a href="#integrations" className="text-sm text-gray-400 transition-colors hover:text-white">
                Integrations
              </a>
              <a href="#pricing" className="text-sm text-gray-400 transition-colors hover:text-white">
                Pricing
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="hidden text-sm font-medium text-gray-300 transition-colors hover:text-white sm:block"
            >
              Sign In
            </Link>
            <Link
              href="#demo"
              className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-110"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pb-20 pt-20 lg:pt-28">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[600px] w-[600px] animate-pulse rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute right-1/4 top-1/4 h-[400px] w-[400px] animate-pulse rounded-full bg-indigo-600/10 blur-[100px] [animation-delay:1s]" />
          <div className="absolute bottom-0 left-1/2 h-[300px] w-[500px] -translate-x-1/2 animate-pulse rounded-full bg-cyan-600/5 blur-[80px] [animation-delay:2s]" />
        </div>

        <div className="mx-auto max-w-7xl">
          <FadeIn className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400">
              <Zap className="h-3.5 w-3.5" />
              Trusted by North American fleet leaders
            </div>

            <h1 className="bg-gradient-to-b from-white to-gray-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl lg:text-7xl">
              The AI-Powered Operating System for Modern Fleets
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
              Track vehicles in real-time, monitor driver safety, optimize fuel costs, and manage your entire fleet operations from one intelligent platform.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="#demo"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-110"
              >
                Request Demo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                Learn More
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-500">
              {["No Contract Required", "Cancel Anytime", "Free Onboarding", "24/7 Support"].map(
                (badge) => (
                  <div key={badge} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {badge}
                  </div>
                )
              )}
            </div>
          </FadeIn>

          {/* Hero product preview */}
          <FadeIn delay={200} className="mx-auto mt-16 max-w-5xl">
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent p-1 shadow-2xl shadow-blue-500/10">
              <div className="rounded-xl bg-[#0d1220] p-6 lg:p-8">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {[
                    { label: "Active Trucks", value: "148", change: "+12%", icon: Truck },
                    { label: "Drivers Online", value: "96", change: "+8%", icon: Users },
                    { label: "Routes Today", value: "67", change: "+23%", icon: Route },
                    { label: "Fleet Score", value: "94.2", change: "+3.1", icon: Shield },
                  ].map(({ label, value, change, icon: Icon }) => (
                    <div key={label} className="rounded-lg border border-white/5 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-2 text-gray-500">
                        <Icon className="h-4 w-4" />
                        <span className="text-xs">{label}</span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">{value}</span>
                        <span className="text-xs text-green-400">{change}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-white/5 bg-gradient-to-br from-blue-900/20 to-indigo-900/20 lg:h-64">
                  <div className="text-center">
                    <MapPin className="mx-auto h-8 w-8 text-blue-400/50" />
                    <p className="mt-2 text-sm text-gray-600">Live Fleet Map</p>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Customer Logo Marquee */}
      <section className="border-y border-white/5 bg-white/[0.02] py-10">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-sm font-medium uppercase tracking-wider text-gray-500">
            Trusted by thousands of North American fleet operators
          </p>
          <div className="relative overflow-hidden">
            <div className="absolute left-0 top-0 z-10 h-full w-20 bg-gradient-to-r from-[#0a0e1a] to-transparent" />
            <div className="absolute right-0 top-0 z-10 h-full w-20 bg-gradient-to-l from-[#0a0e1a] to-transparent" />
            <div className="flex animate-marquee gap-12">
              {[...companies, ...companies].map((name, i) => (
                <div
                  key={`${name}-${i}`}
                  className="flex h-10 shrink-0 items-center rounded-md border border-white/5 bg-white/[0.03] px-6 text-sm font-medium text-gray-500"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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

      {/* How It Works */}
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

      {/* Integration Section */}
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

      {/* Testimonials Section */}
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

      {/* Pricing Section */}
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

      {/* CTA Section */}
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

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#070a12] px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700">
                  <Truck className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">DriveCommand</span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
                The AI-powered operating system for modern fleets. Track, manage, and optimize your
                entire fleet from one platform.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs text-gray-500">All systems operational</span>
              </div>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Product</h4>
              <ul className="space-y-3">
                {["Features", "Integrations", "Pricing", "Changelog"].map((item) => (
                  <li key={item}>
                    <a
                      href={`#${item.toLowerCase()}`}
                      className="text-sm text-gray-500 transition-colors hover:text-white"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Company</h4>
              <ul className="space-y-3">
                {["About", "Careers", "Blog", "Contact"].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm text-gray-500 transition-colors hover:text-white"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Support</h4>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail className="h-3.5 w-3.5" />
                  support@drivecommand.com
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5" />
                  +1 (800) 555-0199
                </li>
                <li className="text-sm text-gray-500">Mon-Fri 8am-5pm EST</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
            <p className="text-xs text-gray-600">
              &copy; {new Date().getFullYear()} DriveCommand. All rights reserved.
            </p>
            <div className="flex gap-6">
              {["Privacy Policy", "Terms of Service", "Cookie Policy"].map((item) => (
                <a
                  key={item}
                  href="#"
                  className="text-xs text-gray-600 transition-colors hover:text-gray-400"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
