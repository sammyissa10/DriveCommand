import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Truck, MapPin, Shield, Fuel, ArrowRight } from "lucide-react";

export default async function Home() {
  const session = await getSession();

  // Redirect authenticated users to dashboard
  if (session) {
    redirect("/dashboard");
  }

  // Landing page for visitors
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-24">
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="text-center space-y-6 max-w-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
              <Truck className="h-6 w-6" />
            </div>
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            DriveCommand
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            The modern fleet management platform. Track vehicles, monitor safety, optimize fuel, and manage your entire fleet from one place.
          </p>

          <div className="flex gap-3 justify-center pt-2">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              Sign In
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Feature cards */}
        <div className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl w-full">
          {[
            { icon: MapPin, title: "Live Tracking", desc: "Real-time GPS for your entire fleet" },
            { icon: Shield, title: "Safety Monitoring", desc: "Driver scores and event tracking" },
            { icon: Fuel, title: "Fuel Analytics", desc: "MPG trends and cost optimization" },
            { icon: Truck, title: "Fleet Management", desc: "Vehicles, drivers, routes & docs" },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5 text-center transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
