import Link from "next/link"
import { DCChevronIcon, DriveCommandWordmark } from "@/components/navigation/app-logo"
import {
  Truck,
  MapPin,
  Shield,
  ArrowRight,
  CheckCircle2,
  Users,
  BarChart3,
  Route,
  Zap,
} from "lucide-react"
import { FadeIn } from "./fade-in"

export function HeroSection() {
  return (
    <>
      {/* Navigation Header */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0e1a]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <DCChevronIcon size={28} variant="light" />
              <DriveCommandWordmark size="md" className="text-white" />
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
    </>
  )
}
