import { DCChevronIcon, DriveCommandWordmark } from "@/components/navigation/app-logo"
import { Mail, Phone } from "lucide-react"

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
]

export function FooterSection() {
  return (
    <>
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

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#070a12] px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5">
                <DCChevronIcon size={28} variant="light" />
                <DriveCommandWordmark size="md" className="text-white" />
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
                    <a href="#" className="text-sm text-gray-500 transition-colors hover:text-white">
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
    </>
  )
}
