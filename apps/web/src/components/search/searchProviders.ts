import {
  LayoutDashboard,
  MapPin,
  Boxes,
  UserCircle,
  Package,
  Users2,
  FileText,
  Truck,
  TrendingUp,
  MessageSquare,
  Plus,
  UserPlus,
  Receipt,
  Send,
  CheckCircle,
  Route,
  Building2,
  ListChecks,
  Settings,
  HelpCircle,
  Building,
  User,
  FileCheck,
  DollarSign,
  Zap,
  Bell,
  Plug,
  CreditCard,
} from "lucide-react"
import type { SearchProvider, SearchResult } from "./types"
import { getAllSettingsNavItems } from "@/components/settings/settings.config"
import { HELP_CATEGORIES, getAllArticles } from "@/components/help/help.config"

/**
 * NavigationProvider - All sidebar navigation items as searchable routes
 *
 * Updated for new IA structure:
 * INTELLIGENCE → OPERATIONS → RESOURCES → Messages → Footer (Settings, Help)
 */
export function createNavigationProvider(
  navigate: (href: string) => void
): SearchProvider {
  const navigationItems: Omit<SearchResult, "action">[] = [
    // ─── INTELLIGENCE ───────────────────────────────────────────────────────
    {
      id: "nav-live-map",
      label: "Live Map",
      icon: MapPin,
      section: "navigation",
      keywords: ["map", "trucks on map", "vehicles", "tracking", "gps", "location"],
    },
    {
      id: "nav-dashboard",
      label: "Carrier Dashboard",
      icon: LayoutDashboard,
      section: "navigation",
      keywords: ["dashboard", "home", "overview", "stats", "kpi"],
    },
    {
      id: "nav-financials",
      label: "Financials",
      icon: TrendingUp,
      section: "navigation",
      keywords: ["money", "revenue", "billing", "invoices", "profit", "reports"],
    },

    // ─── OPERATIONS (workflow order) ────────────────────────────────────────
    {
      id: "nav-clients",
      label: "Clients",
      icon: Users2,
      section: "navigation",
      keywords: ["customers", "shippers", "clients", "brokers"],
    },
    {
      id: "nav-contracts",
      label: "Contracts",
      icon: FileText,
      section: "navigation",
      keywords: ["contracts", "agreements", "terms"],
    },
    {
      id: "nav-routes",
      label: "Routes",
      icon: Route,
      section: "navigation",
      // Include "templates" as keyword alias so users who remember the old name still find it
      keywords: [
        "routes",
        "templates",
        "route templates",
        "recurring routes",
        "wisconsin route",
        "schedule template",
        "trip planning",
        "route blueprint",
      ],
    },
    {
      id: "nav-loads",
      label: "Loads",
      icon: Package,
      section: "navigation",
      keywords: ["loads", "shipments", "freight", "cargo"],
    },
    {
      id: "nav-dispatches",
      label: "Dispatches",
      icon: Truck,
      section: "navigation",
      keywords: ["dispatch", "assignments", "trips"],
    },

    // ─── RESOURCES (managed entities) ───────────────────────────────────────
    {
      id: "nav-drivers",
      label: "Drivers",
      icon: UserCircle,
      section: "navigation",
      keywords: ["drivers", "people", "team", "employees"],
    },
    {
      id: "nav-fleet",
      label: "Fleet",
      icon: Boxes,
      section: "navigation",
      keywords: ["trucks", "vehicles", "fleet", "equipment", "trailers"],
    },
    {
      id: "nav-facilities",
      label: "Facilities",
      icon: Building2,
      section: "navigation",
      keywords: [
        "facilities",
        "warehouses",
        "pickup locations",
        "delivery locations",
        "docks",
        "stops",
        "locations",
        "terminals",
      ],
    },
    {
      id: "nav-checklists",
      label: "Checklists",
      icon: ListChecks,
      section: "navigation",
      keywords: [
        "checklists",
        "pre-trip",
        "post-trip",
        "inspections",
        "compliance",
        "maintenance",
        "workflows",
        "playbooks",
      ],
    },

    // ─── FLOATING ───────────────────────────────────────────────────────────
    {
      id: "nav-messages",
      label: "Messages",
      icon: MessageSquare,
      section: "navigation",
      keywords: ["messages", "chat", "communication", "inbox"],
    },

    // ─── FOOTER ─────────────────────────────────────────────────────────────
    {
      id: "nav-settings",
      label: "Settings",
      icon: Settings,
      section: "navigation",
      keywords: ["settings", "preferences", "configuration", "config", "account"],
    },
    {
      id: "nav-help",
      label: "Help",
      icon: HelpCircle,
      section: "navigation",
      keywords: ["help", "support", "documentation", "docs", "how to", "guide", "faq"],
    },
  ]

  // Map href for each item
  const hrefMap: Record<string, string> = {
    "nav-live-map": "/live-map",
    "nav-dashboard": "/carrier/dashboard",
    "nav-financials": "/carrier/financials",
    "nav-clients": "/carrier/clients",
    "nav-contracts": "/carrier/contracts",
    "nav-routes": "/routes",
    "nav-dispatches": "/carrier/dispatches",
    "nav-loads": "/carrier/loads",
    "nav-drivers": "/carrier/fleet/drivers",
    "nav-fleet": "/carrier/fleet/trucks",
    "nav-facilities": "/carrier/facilities",
    "nav-checklists": "/checklists",
    "nav-messages": "/carrier/messages",
    "nav-settings": "/settings",
    "nav-help": "/help",
  }

  return {
    name: "navigation",
    getResults: (query: string): SearchResult[] => {
      const q = query.toLowerCase().trim()

      // If no query, return all navigation items
      if (!q) {
        return navigationItems.map((item) => ({
          ...item,
          action: () => navigate(hrefMap[item.id]),
        }))
      }

      // Simple fuzzy match: check if query is in label or keywords
      return navigationItems
        .filter((item) => {
          const labelMatch = item.label.toLowerCase().includes(q)
          const keywordMatch = item.keywords?.some((k) =>
            k.toLowerCase().includes(q)
          )
          return labelMatch || keywordMatch
        })
        .map((item) => ({
          ...item,
          action: () => navigate(hrefMap[item.id]),
        }))
    },
  }
}

/**
 * Quick action definition for both search and menu
 */
export interface QuickAction {
  id: string
  label: string
  icon: typeof Plus
  section: "quick-create" | "quick-action"
  href?: string
  shortcut?: string
  keywords?: string[]
}

/**
 * All quick actions (shared between search provider and QuickActionsMenu)
 *
 * Quick Create order follows carrier workflow:
 * Client → Contract → Route → Load → Dispatch → Driver → Facility → Expense
 *
 * Top-3 keyboard shortcuts (Linear-style two-key):
 * - C then L = Create Load (highest frequency)
 * - C then D = Create Dispatch
 * - C then E = Create Expense
 */
export const QUICK_ACTIONS: QuickAction[] = [
  // ─── Quick Create section (workflow order) ────────────────────────────────
  {
    id: "create-client",
    label: "New Client",
    icon: Users2,
    section: "quick-create",
    href: "/carrier/clients/new",
    shortcut: "C C",
    keywords: ["create client", "new client", "add client", "new customer"],
  },
  {
    id: "create-contract",
    label: "New Contract",
    icon: FileText,
    section: "quick-create",
    href: "/carrier/contracts/new",
    shortcut: "C O",
    keywords: ["create contract", "new contract", "add contract"],
  },
  {
    id: "create-route",
    label: "New Route",
    icon: Route,
    section: "quick-create",
    href: "/routes/new",
    shortcut: "C T", // T for "Trip" since R is taken by driver
    keywords: ["create route", "new route", "add route", "route blueprint", "recurring route"],
  },
  {
    id: "create-load",
    label: "New Load",
    icon: Package,
    section: "quick-create",
    href: "/carrier/loads/new",
    shortcut: "C L", // KEYBOARD SHORTCUT: highest frequency action
    keywords: ["create load", "new load", "add load"],
  },
  {
    id: "create-dispatch",
    label: "New Dispatch",
    icon: Truck,
    section: "quick-create",
    // TODO: Dispatch creation uses a modal in /carrier/dispatches
    href: "/carrier/dispatches",
    shortcut: "C D", // KEYBOARD SHORTCUT
    keywords: ["create dispatch", "new dispatch", "add dispatch"],
  },
  {
    id: "create-driver",
    label: "New Driver",
    icon: UserCircle,
    section: "quick-create",
    href: "/carrier/fleet/drivers/new",
    shortcut: "C R",
    keywords: ["create driver", "new driver", "add driver", "hire driver"],
  },
  {
    id: "create-facility",
    label: "New Facility",
    icon: Building2,
    section: "quick-create",
    href: "/carrier/facilities/new",
    shortcut: "C F",
    keywords: ["create facility", "new facility", "add facility", "warehouse", "location"],
  },
  {
    id: "create-expense",
    label: "New Expense",
    icon: Receipt,
    section: "quick-create",
    href: "/carrier/financials",
    shortcut: "C E", // KEYBOARD SHORTCUT
    keywords: ["create expense", "new expense", "add expense", "log expense"],
  },

  // ─── Quick Actions section ────────────────────────────────────────────────
  {
    id: "action-assign-driver",
    label: "Assign Driver to Load",
    icon: UserPlus,
    section: "quick-action",
    href: "/carrier/loads",
    shortcut: "⌘⇧A",
    keywords: ["assign driver", "assign", "driver assignment"],
  },
  {
    id: "action-send-rate-confirmation",
    label: "Send Rate Confirmation",
    icon: Send,
    section: "quick-action",
    href: "/carrier/loads",
    shortcut: "⌘⇧R",
    keywords: ["rate confirmation", "send rate", "rate con"],
  },
  {
    id: "action-mark-delivered",
    label: "Mark Load Delivered",
    icon: CheckCircle,
    section: "quick-action",
    href: "/carrier/loads",
    shortcut: "⌘⇧D",
    keywords: ["mark delivered", "delivered", "complete load", "finish load"],
  },
]

/**
 * QuickActionsProvider - Quick actions as searchable commands
 */
export function createQuickActionsProvider(
  navigate: (href: string) => void
): SearchProvider {
  return {
    name: "quick-actions",
    getResults: (query: string): SearchResult[] => {
      const q = query.toLowerCase().trim()

      const results = QUICK_ACTIONS.filter((action) => {
        if (!q) return true
        const labelMatch = action.label.toLowerCase().includes(q)
        const keywordMatch = action.keywords?.some((k) =>
          k.toLowerCase().includes(q)
        )
        return labelMatch || keywordMatch
      }).map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        section: "quick-actions" as const,
        shortcut: action.shortcut,
        keywords: action.keywords,
        action: () => {
          if (action.href) {
            navigate(action.href)
          }
        },
      }))

      return results
    },
  }
}

/**
 * SettingsProvider - Settings sub-pages as searchable routes
 *
 * Maps settings sub-nav items to search results with keyword aliases.
 * Allows users to jump directly to settings pages via Cmd+K.
 */
export function createSettingsProvider(
  navigate: (href: string) => void
): SearchProvider {
  // Icon map for settings items
  const iconMap: Record<string, typeof Settings> = {
    workspace: Building,
    account: User,
    templates: FileCheck,
    financial: DollarSign,
    workflows: Zap,
    notifications: Bell,
    integrations: Plug,
    billing: CreditCard,
  }

  return {
    name: "settings",
    getResults: (query: string): SearchResult[] => {
      const q = query.toLowerCase().trim()
      const items = getAllSettingsNavItems()

      // Filter by query if present
      const filtered = items.filter((item) => {
        if (!q) return true
        const labelMatch = item.label.toLowerCase().includes(q)
        const keywordMatch = item.keywords.some((k) => k.toLowerCase().includes(q))
        return labelMatch || keywordMatch
      })

      return filtered.map((item) => ({
        id: `settings-${item.id}`,
        label: item.label,
        secondary: "Settings",
        icon: iconMap[item.id] || Settings,
        section: "settings" as const,
        keywords: item.keywords,
        action: () => navigate(item.href),
      }))
    },
  }
}

/**
 * EntityProvider STUB - Returns empty array for now
 *
 * TODO: Implement real entity search by connecting to:
 * - /api/carrier/clients (for client search)
 * - /api/carrier/loads (for load search)
 * - /api/carrier/fleet/drivers (for driver search)
 *
 * This should use the existing API endpoints with a search query param
 * and return results formatted as SearchResult objects.
 *
 * Example implementation pattern:
 * ```ts
 * getResults: async (query) => {
 *   if (!query || query.length < 2) return []
 *   const res = await fetch(`/api/carrier/clients?search=${encodeURIComponent(query)}&limit=6`)
 *   const clients = await res.json()
 *   return clients.map(c => ({
 *     id: `client-${c.id}`,
 *     label: c.name,
 *     secondary: c.email,
 *     icon: Users2,
 *     section: 'clients',
 *     action: () => navigate(`/carrier/clients/${c.id}`),
 *   }))
 * }
 * ```
 */
export function createEntityProvider(
  _navigate: (href: string) => void
): SearchProvider {
  return {
    name: "entities",
    getResults: (_query: string): SearchResult[] => {
      // TODO: Implement real entity search
      // See comment above for implementation pattern
      return []
    },
  }
}

/**
 * HelpProvider - Help Center, categories, and articles as searchable items
 *
 * Surfaces:
 * - Top-level "Help Center" result (navigates to /help)
 * - All 6 category names (navigate to /help/[category])
 * - All stub article titles (navigate to /help/[category]/[article])
 *
 * Grouped under "Help" section in Cmd+K results.
 */
export function createHelpProvider(
  navigate: (href: string) => void
): SearchProvider {
  // Build help items once
  const helpItems: Omit<SearchResult, "action">[] = [
    // Top-level Help Center
    {
      id: "help-center",
      label: "Help Center",
      icon: HelpCircle,
      section: "help",
      keywords: ["help", "support", "documentation", "docs", "how to", "tutorial", "guide"],
    },
    // All categories
    ...HELP_CATEGORIES.map((category) => ({
      id: `help-cat-${category.slug}`,
      label: category.name,
      secondary: "Help",
      icon: category.icon,
      section: "help" as const,
      keywords: [category.slug.replace(/-/g, " "), category.description.toLowerCase()],
    })),
    // All articles
    ...getAllArticles().map((article) => ({
      id: `help-article-${article.categorySlug}-${article.slug}`,
      label: article.title,
      secondary: article.categoryName,
      icon: HelpCircle,
      section: "help" as const,
      keywords: article.keywords,
    })),
  ]

  // Map href for each item
  const hrefMap: Record<string, string> = {
    "help-center": "/help",
    ...Object.fromEntries(
      HELP_CATEGORIES.map((cat) => [`help-cat-${cat.slug}`, `/help/${cat.slug}`])
    ),
    ...Object.fromEntries(
      getAllArticles().map((article) => [
        `help-article-${article.categorySlug}-${article.slug}`,
        `/help/${article.categorySlug}/${article.slug}`,
      ])
    ),
  }

  return {
    name: "help",
    getResults: (query: string): SearchResult[] => {
      const q = query.toLowerCase().trim()

      // If no query, only return top-level help center and categories (not all articles)
      if (!q) {
        const topLevel = helpItems.filter(
          (item) => item.id === "help-center" || item.id.startsWith("help-cat-")
        )
        return topLevel.map((item) => ({
          ...item,
          action: () => navigate(hrefMap[item.id]),
        }))
      }

      // Filter by query
      return helpItems
        .filter((item) => {
          const labelMatch = item.label.toLowerCase().includes(q)
          const keywordMatch = item.keywords?.some((k) =>
            k.toLowerCase().includes(q)
          )
          return labelMatch || keywordMatch
        })
        .slice(0, 8) // Limit to 8 results to avoid overwhelming the list
        .map((item) => ({
          ...item,
          action: () => navigate(hrefMap[item.id]),
        }))
    },
  }
}
