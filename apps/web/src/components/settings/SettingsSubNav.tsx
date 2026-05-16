"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { SETTINGS_NAV_SECTIONS } from "./settings.config"

/**
 * SettingsSubNav - Left-side navigation for Settings pages
 *
 * Design principles (Emil Kowalski / Linear-grade taste):
 * - Restrained, calm, professional — settings is where users focus on configuration
 * - No icons (text-only labels) — subordinate to main sidebar
 * - Subtle active state — less prominent than main sidebar active
 * - Section headers match sidebar section label treatment
 *
 * Width: ~220px fixed
 * Sticky positioning within the settings content area
 */
export function SettingsSubNav() {
  const pathname = usePathname()

  return (
    <nav
      className="w-[220px] shrink-0 sticky top-[88px] self-start"
      aria-label="Settings navigation"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">Settings</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Configure your workspace and account
        </p>
      </div>

      {/* Navigation sections */}
      <div className="space-y-6">
        {SETTINGS_NAV_SECTIONS.map((section) => (
          <div key={section.id}>
            {/* Section label — matches main sidebar section header treatment */}
            <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70 mb-2 px-2">
              {section.label}
            </h3>

            {/* Section items */}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                // Active state: exact match or starts with (for nested routes like /settings/templates/bol)
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`)

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={cn(
                        "block px-2 py-1.5 rounded-md text-[14px] transition-colors duration-150",
                        isActive
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
