import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Design constants for sidebar dimensions and styling
 * Updated for CSS grid layout with auto-extending content
 */
export const SIDEBAR_WIDTH_EXPANDED = 240 // Apple-style narrower sidebar
export const SIDEBAR_WIDTH_COLLAPSED = 56 // Comfortable icon rail
export const SIDEBAR_ITEM_HEIGHT = 36 // 8px + 20px + 8px padding
export const FLYOUT_BORDER_RADIUS = 12
export const ITEM_BORDER_RADIUS = 8

/**
 * Animation timing for sidebar transitions
 */
export const SIDEBAR_ANIMATION_DURATION = 320 // ms
export const SIDEBAR_ANIMATION_EASING = "cubic-bezier(0.32, 0.72, 0, 1)" // Apple smooth curve

/**
 * Hover-peek timing
 */
export const PEEK_ENTER_DELAY = 140 // ms before peek opens on hover
export const PEEK_EXIT_DELAY = 220 // ms before peek closes on mouse leave

/**
 * Navigation item type
 */
export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: ReactNode
  children?: NavItem[]
  permission?: string
}

/**
 * Navigation group type
 */
export interface NavGroup {
  label: string
  items: NavItem[]
  permission?: string
}

/**
 * Navigation section type (used for the restructured IA)
 *
 * SIDEBAR IA STRUCTURE (exact order):
 *
 * INTELLIGENCE (situational awareness)
 * - Live Map
 * - Carrier Dashboard
 * - Financials
 *
 * OPERATIONS (the workflow — things that happen)
 * - Clients
 * - Contracts
 * - Routes (renamed from Templates — route blueprints, not rate sheets)
 * - Loads
 * - Dispatches
 *
 * RESOURCES (managed entities)
 * - Drivers
 * - Fleet
 * - Facilities
 * - Checklists
 *
 * (divider, no header)
 * - Messages
 *
 * (footer block — separated by border-top)
 * - Settings
 * - Help
 * - Collapse toggle
 *
 * CONSTRAINTS:
 * - OPERATIONS section max 5 items
 * - RESOURCES section max 5 items
 * - If a future item gets proposed, force a discussion before adding
 */
export interface NavSection {
  id: string
  label?: string // omit for sections without header (e.g., floating Messages)
  items: NavItem[]
}

/**
 * Footer navigation item (Settings, Help)
 * Distinct from regular nav items — rendered in footer with border-top separator
 */
export interface FooterNavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Tooltip text for collapsed mode (optional, defaults to label) */
  tooltip?: string
  /** Keyboard shortcut hint (e.g., "?") */
  shortcut?: string
  /** Match active state on any sub-routes (e.g., /settings/*) */
  matchPattern?: RegExp
}
