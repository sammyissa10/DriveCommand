import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Design constants for sidebar dimensions and styling
 */
export const SIDEBAR_WIDTH_EXPANDED = 256 // 16rem
export const SIDEBAR_WIDTH_COLLAPSED = 48 // 3rem
export const SIDEBAR_ITEM_HEIGHT = 36 // 8px + 20px + 8px padding
export const FLYOUT_BORDER_RADIUS = 12
export const ITEM_BORDER_RADIUS = 8
export const PEEK_ENTER_DELAY = 300 // ms before peek activates on hover
export const PEEK_EXIT_DELAY = 200 // ms before peek deactivates on leave

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
