import {
  Package,
  Truck,
  Users2,
  FileText,
  UserCircle,
  UserPlus,
  Send,
  CheckCircle,
  Route,
  Building2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * QuickActionItem - A single action in the Quick Actions menu
 */
export interface QuickActionItem {
  id: string
  label: string
  icon: LucideIcon
  href: string
  shortcut?: string
  description?: string
}

/**
 * QuickActionSection - A grouped section of actions
 */
export interface QuickActionSection {
  id: string
  label: string
  items: QuickActionItem[]
}

/**
 * Quick Create section - Ordered by carrier workflow
 *
 * Workflow order: Client → Contract → Route → Load → Dispatch → Driver → Facility → Expense
 *
 * Keyboard shortcuts (Linear-style two-key sequences):
 * - C then L = Create Load (highest frequency — easiest shortcut)
 * - C then D = Create Dispatch
 * - C then E = Create Expense
 * All other Quick Create items: Cmd+K → type "create [name]" → enter
 */
const QUICK_CREATE_ITEMS: QuickActionItem[] = [
  {
    id: "create-client",
    label: "New Client",
    icon: Users2,
    href: "/carrier/clients/new",
    shortcut: "C C",
    description: "Add a new client",
  },
  {
    id: "create-contract",
    label: "New Contract",
    icon: FileText,
    href: "/carrier/contracts/new",
    shortcut: "C O",
    description: "Create a new contract",
  },
  {
    id: "create-route",
    label: "New Route",
    icon: Route,
    // Legacy /routes/new is retired; route creation now funnels to carrier Trips
    // (carrier fleet drivers + trucks). See TKT-0074/0056/0057.
    href: "/carrier/trips/new",
    shortcut: "C T", // T for "Trip" since R is taken by driver
    description: "Assign a driver and truck for a trip",
  },
  // KEYBOARD SHORTCUT: C then L — highest frequency action, easiest shortcut
  {
    id: "create-load",
    label: "New Load",
    icon: Package,
    href: "/carrier/loads/new",
    shortcut: "C L",
    description: "Create a new load",
  },
  // KEYBOARD SHORTCUT: C then D
  {
    id: "create-dispatch",
    label: "New Dispatch",
    icon: Truck,
    href: "/carrier/trips/new",
    shortcut: "C D",
    description: "Create a new dispatch",
  },
  {
    id: "create-driver",
    label: "New Driver",
    icon: UserCircle,
    href: "/carrier/fleet/drivers/new",
    shortcut: "C R",
    description: "Add a new driver",
  },
  {
    id: "create-facility",
    label: "New Facility",
    icon: Building2,
    href: "/carrier/facilities/new",
    shortcut: "C F",
    description: "Add a new facility",
  },
]

/**
 * Quick Actions section - Common operations
 */
const QUICK_ACTION_ITEMS: QuickActionItem[] = [
  {
    id: "action-assign-driver",
    label: "Assign Driver to Load",
    icon: UserPlus,
    href: "/carrier/loads",
    shortcut: "⌘⇧A",
    description: "Assign a driver to an existing load",
  },
  {
    id: "action-send-rate-confirmation",
    label: "Send Rate Confirmation",
    icon: Send,
    href: "/carrier/loads",
    shortcut: "⌘⇧R",
    description: "Send rate confirmation for a load",
  },
  {
    id: "action-mark-delivered",
    label: "Mark Load Delivered",
    icon: CheckCircle,
    href: "/carrier/loads",
    shortcut: "⌘⇧D",
    description: "Mark a load as delivered",
  },
]

/**
 * All quick action sections
 */
export const QUICK_ACTION_SECTIONS: QuickActionSection[] = [
  {
    id: "quick-create",
    label: "Quick Create",
    items: QUICK_CREATE_ITEMS,
  },
  {
    id: "quick-actions",
    label: "Quick Actions",
    items: QUICK_ACTION_ITEMS,
  },
]

/**
 * Flat list of all quick action items (for search provider)
 */
export const ALL_QUICK_ACTION_ITEMS = [
  ...QUICK_CREATE_ITEMS,
  ...QUICK_ACTION_ITEMS,
]
