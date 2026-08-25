/**
 * Settings Sub-Navigation Configuration
 *
 * This defines the structure of the Settings page sub-navigation.
 * Each section contains items that link to dedicated settings pages.
 *
 * STRUCTURE:
 * - GENERAL: Workspace + Account (personal & workspace basics)
 * - CONFIGURATION: Templates, Financial, Workflows, Notifications (business config)
 * - PLATFORM: Integrations, Billing (external connections & subscription)
 *
 * CONSTRAINTS:
 * - Maximum 8 sub-nav items total (current: 8)
 * - No icons in sub-nav (text-only, subordinate to main sidebar)
 * - Keyword aliases power Cmd+K search
 */

/**
 * Settings navigation item
 */
export interface SettingsNavItem {
  /** Unique identifier for this item */
  id: string
  /** Display label in sub-nav */
  label: string
  /** URL path (relative to /settings) */
  href: string
  /** Keywords for Cmd+K search */
  keywords: string[]
}

/**
 * Settings navigation section (group of items)
 */
export interface SettingsNavSection {
  /** Section identifier */
  id: string
  /** Section label (displayed as uppercase header) */
  label: string
  /** Items within this section */
  items: SettingsNavItem[]
}

/**
 * Settings page metadata (for headers)
 */
export interface SettingsPageMeta {
  /** Page title (28px font-semibold) */
  title: string
  /** One-line subtitle (14px muted) */
  subtitle: string
}

/**
 * Settings sub-navigation sections
 */
export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = [
  {
    id: "general",
    label: "General",
    items: [
      {
        id: "workspace",
        label: "Workspace",
        href: "/settings/workspace",
        keywords: ["workspace", "company", "team", "branding", "logo"],
      },
      {
        id: "account",
        label: "Account",
        href: "/settings/account",
        keywords: ["account", "profile", "password", "security", "2fa"],
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        id: "templates",
        label: "Templates",
        href: "/settings/templates",
        keywords: ["templates", "rate confirmation", "bol", "forms", "documents"],
      },
      {
        id: "financial",
        label: "Financial Configuration",
        href: "/settings/financial",
        keywords: ["expense categories", "driver pay rules", "tax", "financial"],
      },
      {
        id: "workflows",
        label: "Workflows & Automations",
        href: "/settings/workflows",
        keywords: ["workflows", "automation", "rules", "triggers"],
      },
      {
        id: "notifications",
        label: "Notifications",
        href: "/settings/notifications",
        keywords: ["notifications", "alerts", "email", "sms", "in-app"],
      },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    items: [
      {
        id: "integrations",
        label: "Integrations",
        href: "/settings/integrations",
        keywords: ["integrations", "quickbooks", "samsara", "stripe", "connect", "eld"],
      },
      {
        id: "billing",
        label: "Billing",
        href: "/settings/billing",
        keywords: ["billing", "subscription", "invoice", "payment", "plan"],
      },
    ],
  },
]

/**
 * Settings page metadata map
 * Used by SettingsHeader to display consistent titles/subtitles
 */
export const SETTINGS_PAGE_META: Record<string, SettingsPageMeta> = {
  workspace: {
    title: "Workspace Settings",
    subtitle: "Manage your company name, branding, and team members",
  },
  account: {
    title: "Your Account",
    subtitle: "Personal preferences and security",
  },
  templates: {
    title: "Templates",
    subtitle: "Reusable documents and forms for your operations",
  },
  financial: {
    title: "Financial Configuration",
    subtitle: "Expense categories, driver pay rules, and tax settings",
  },
  workflows: {
    title: "Workflows & Automations",
    subtitle: "Automate routine actions and create custom rules",
  },
  notifications: {
    title: "Notifications",
    subtitle: "Choose what to be notified about and where",
  },
  operations: {
    title: "Operations",
    subtitle: "Pre-trip inspections and how a failed one affects a trip",
  },
  integrations: {
    title: "Integrations",
    subtitle: "Connect DriveCommand with your other tools",
  },
  billing: {
    title: "Billing & Subscription",
    subtitle: "Manage your plan, payment method, and invoices",
  },
}

/**
 * Template type configuration (for /settings/templates sub-pages)
 */
export interface TemplateTypeConfig {
  id: string
  slug: string
  title: string
  description: string
}

export const TEMPLATE_TYPES: TemplateTypeConfig[] = [
  {
    id: "rate-confirmations",
    slug: "rate-confirmations",
    title: "Rate Confirmations",
    description: "Templates for confirming rates with brokers and clients",
  },
  {
    id: "bol",
    slug: "bol",
    title: "Bill of Lading (BOL)",
    description: "Customizable BOL forms for your loads",
  },
  {
    id: "checklist",
    slug: "checklist",
    title: "Checklist Templates",
    description: "Pre-trip, post-trip, maintenance, and custom checklists",
  },
  {
    id: "expense",
    slug: "expense",
    title: "Expense Templates",
    description: "Recurring expense templates for fast logging",
  },
]

/**
 * Get all settings nav items flattened (for search indexing)
 */
export function getAllSettingsNavItems(): SettingsNavItem[] {
  return SETTINGS_NAV_SECTIONS.flatMap((section) => section.items)
}

/**
 * Find a nav item by its href
 */
export function findSettingsNavItemByHref(href: string): SettingsNavItem | undefined {
  return getAllSettingsNavItems().find((item) => item.href === href)
}
