import {
  Shield,
  CreditCard,
  Bell,
  Tag,
  FileSpreadsheet,
  Settings,
  User,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface SettingsNavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  description?: string
}

export interface SettingsNavSection {
  id: string
  label: string
  items: SettingsNavItem[]
}

/**
 * Settings navigation sections for the drill-down sidebar view
 */
export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = [
  {
    id: "general",
    label: "General",
    items: [
      {
        id: "team-permissions",
        label: "Team Permissions",
        href: "/settings/team-permissions",
        icon: Shield,
        description: "Manage team roles and access",
      },
      {
        id: "subscription",
        label: "Subscription",
        href: "/subscription",
        icon: CreditCard,
        description: "Billing and plan details",
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        id: "notifications",
        label: "Notifications",
        href: "/settings/notifications",
        icon: Bell,
        description: "Tenant notification settings",
      },
      {
        id: "expense-categories",
        label: "Expense Categories",
        href: "/settings/expense-categories",
        icon: Tag,
        description: "Manage expense categories",
      },
      {
        id: "expense-templates",
        label: "Expense Templates",
        href: "/settings/expense-templates",
        icon: FileSpreadsheet,
        description: "Recurring expense templates",
      },
      {
        id: "integrations",
        label: "Integrations",
        href: "/settings/integrations",
        icon: Settings,
        description: "Connect third-party services",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "my-notifications",
        label: "My Notifications",
        href: "/settings/my-notifications",
        icon: User,
        description: "Personal notification preferences",
      },
    ],
  },
]
