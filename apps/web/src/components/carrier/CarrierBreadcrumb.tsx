"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  clients: "Clients",
  contracts: "Contracts",
  templates: "Route Templates",
  dispatches: "Dispatches",
  loads: "Loads",
  fleet: "Fleet",
  facilities: "Facilities",
  reports: "Reports",
  drivers: "Drivers",
  trucks: "Trucks",
  revenue: "Revenue",
  "driver-pay": "Driver Pay",
  aging: "AR Aging",
  performance: "Performance",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getLabel(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment]
  if (segment === "new") return "New"
  if (UUID_RE.test(segment)) return "Detail"
  // Fallback: capitalize first letter
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

/**
 * Pathname-aware breadcrumb rendered above all /carrier/* pages.
 * Renders: Carrier > Section > Sub-section / Detail
 */
export function CarrierBreadcrumb() {
  const pathname = usePathname()

  // Extract segments after /carrier/
  const carrierPrefix = "/carrier/"
  const afterCarrier = pathname.startsWith(carrierPrefix)
    ? pathname.slice(carrierPrefix.length)
    : ""
  const segments = afterCarrier ? afterCarrier.split("/").filter(Boolean) : []

  // Build breadcrumb items: [{label, href}] — last item has no href (terminal)
  type BreadcrumbItem = { label: string; href?: string }
  const items: BreadcrumbItem[] = [{ label: "Carrier", href: "/carrier/dashboard" }]

  segments.forEach((seg, idx) => {
    const isLast = idx === segments.length - 1
    const href = isLast ? undefined : "/carrier/" + segments.slice(0, idx + 1).join("/")
    items.push({ label: getLabel(seg), href })
  })

  if (items.length <= 1) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={idx} className="flex items-center gap-1.5">
            {idx > 0 && <span aria-hidden="true">&gt;</span>}
            {isLast || !item.href ? (
              <span className="text-foreground font-medium">{item.label}</span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
