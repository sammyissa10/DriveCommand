"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  clients: "Clients",
  contracts: "Contracts",
  templates: "Route Templates",
  dispatches: "Dispatches",
  trips: "Trips",
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

/**
 * Carrier route segments that are grouping folders with NO landing page.tsx.
 * They exist only to nest children (e.g. /carrier/fleet/{trucks,drivers}), so
 * linking them in the breadcrumb produced a 404 (TKT-0080). Rendered as plain
 * text instead of a link. Keep in sync with app/(owner)/carrier/* folders that
 * have subfolders but no page.tsx of their own.
 */
const NON_NAVIGABLE_SEGMENTS = new Set(["fleet", "driver-pay", "reports", "stops"])

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
    // Only build an href for real pages: not the terminal crumb, and not a
    // grouping folder that has no page.tsx (which would 404 — TKT-0080).
    const navigable = !isLast && !NON_NAVIGABLE_SEGMENTS.has(seg)
    const href = navigable ? "/carrier/" + segments.slice(0, idx + 1).join("/") : undefined
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
            {isLast ? (
              <span className="text-foreground font-medium">{item.label}</span>
            ) : item.href ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              // Grouping segment with no page — plain text, not a dead link.
              <span>{item.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
