import {
  Sparkles,
  Package,
  Route,
  UserCircle,
  TrendingUp,
  Plug,
  type LucideIcon,
} from "lucide-react"

/**
 * Help Center Configuration
 *
 * This file defines the structure of the Help Center:
 * - Categories with icons, descriptions, and article counts
 * - Stub articles per category (titles only, content comes later)
 *
 * The design follows a warm, plain English tone suitable for carrier owners
 * who aren't engineers. Copy should feel like a friendly note, not a cold KB.
 */

export interface HelpArticle {
  /** URL-safe slug for the article (kebab-case) */
  slug: string
  /** Human-readable title */
  title: string
  /** One-line preview for listings */
  preview: string
  /** Keywords for search matching */
  keywords: string[]
}

export interface HelpCategory {
  /** URL-safe slug for the category (kebab-case) */
  slug: string
  /** Human-readable name */
  name: string
  /** One-line description for the category card */
  description: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Articles in this category */
  articles: HelpArticle[]
  /** When true, the category is hidden from index, category/article pages, and search. Content is preserved for later restoration. */
  hidden?: boolean
}

/**
 * All help categories with their stub articles
 */
export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "getting-started",
    name: "Getting Started",
    description: "Set up your workspace and learn the basics.",
    icon: Sparkles,
    articles: [
      {
        slug: "welcome-to-drivecommand",
        title: "Welcome to DriveCommand",
        preview: "A quick intro to what DriveCommand can do for your fleet.",
        keywords: ["welcome", "intro", "introduction", "what is", "overview"],
      },
      {
        slug: "setting-up-first-client",
        title: "Setting up your first client",
        preview: "Add your first shipper or broker to start booking loads.",
        keywords: ["client", "shipper", "broker", "first", "setup", "add client"],
      },
      {
        slug: "inviting-your-team",
        title: "Inviting your team",
        preview: "Bring your dispatchers and drivers into DriveCommand.",
        keywords: ["invite", "team", "dispatcher", "driver", "add user", "onboarding"],
      },
      {
        slug: "understanding-dashboard",
        title: "Understanding your dashboard",
        preview: "Learn what each metric on your dashboard means.",
        keywords: ["dashboard", "metrics", "kpi", "overview", "stats"],
      },
      {
        slug: "mobile-app-setup",
        title: "Setting up the mobile app",
        preview: "Get your drivers started with the DriveCommand mobile app.",
        keywords: ["mobile", "app", "phone", "driver app", "ios", "android"],
      },
      {
        slug: "quick-start-checklist",
        title: "Quick start checklist",
        preview: "A simple checklist to get your operation running.",
        keywords: ["checklist", "quick start", "getting started", "setup guide"],
      },
      {
        slug: "keyboard-shortcuts",
        title: "Keyboard shortcuts",
        preview: "Speed up your workflow with these shortcuts.",
        keywords: ["keyboard", "shortcuts", "hotkeys", "cmd", "ctrl"],
      },
      {
        slug: "searching-and-filtering",
        title: "Searching and filtering",
        preview: "Find loads, drivers, and clients quickly.",
        keywords: ["search", "filter", "find", "cmd k", "command palette"],
      },
    ],
  },
  {
    slug: "loads-and-dispatches",
    name: "Loads & Trips",
    description: "Create loads, build trips, assign drivers, and track deliveries.",
    icon: Package,
    articles: [
      {
        slug: "creating-a-load",
        title: "Creating a load",
        preview: "Step-by-step guide to booking a new load.",
        keywords: ["create load", "new load", "add load", "book load"],
      },
      {
        slug: "assigning-driver-to-load",
        title: "Assigning a driver to a load",
        preview: "Match the right driver to each shipment.",
        keywords: ["assign driver", "trip", "assign load", "driver assignment"],
      },
      {
        slug: "tracking-load-realtime",
        title: "Tracking a load in real-time",
        preview: "See where your loads are at any moment.",
        keywords: ["tracking", "real-time", "gps", "location", "live map"],
      },
      {
        slug: "updating-load-status",
        title: "Updating load status",
        preview: "Mark loads as picked up, in transit, or delivered.",
        keywords: ["status", "update", "picked up", "delivered", "in transit"],
      },
      {
        slug: "load-documents",
        title: "Attaching documents to loads",
        preview: "Add BOLs, rate confirmations, and PODs to your loads.",
        keywords: ["documents", "bol", "pod", "rate con", "attachments"],
      },
      {
        slug: "dispatch-workflow",
        title: "Understanding the trip workflow",
        preview: "Learn how loads flow from creation to delivery.",
        keywords: ["trip", "workflow", "process", "lifecycle"],
      },
      {
        slug: "bulk-load-import",
        title: "Importing loads in bulk",
        preview: "Upload multiple loads at once from a spreadsheet.",
        keywords: ["import", "bulk", "csv", "spreadsheet", "upload"],
      },
      {
        slug: "load-templates",
        title: "Using load templates",
        preview: "Save time on recurring shipments.",
        keywords: ["template", "recurring", "repeat", "save time"],
      },
      {
        slug: "canceling-load",
        title: "Canceling or archiving a load",
        preview: "What to do when a load falls through.",
        keywords: ["cancel", "archive", "delete", "remove load"],
      },
      {
        slug: "rate-confirmation",
        title: "Sending rate confirmations",
        preview: "Get your rates confirmed before pickup.",
        keywords: ["rate confirmation", "rate con", "confirm rate", "agreement"],
      },
      {
        slug: "detention-tracking",
        title: "Tracking detention time",
        preview: "Log waiting time for billing purposes.",
        keywords: ["detention", "waiting time", "demurrage", "delay"],
      },
      {
        slug: "customer-tracking-link",
        title: "Sharing tracking with customers",
        preview: "Give your customers visibility into their shipments.",
        keywords: ["customer tracking", "share link", "visibility", "customer portal"],
      },
      {
        slug: "load-messaging",
        title: "Messaging about a load",
        preview: "Communicate with your driver about specific loads.",
        keywords: ["message", "chat", "communication", "driver message"],
      },
      {
        slug: "multi-stop-loads",
        title: "Creating multi-stop loads",
        preview: "Handle loads with multiple pickups or deliveries.",
        keywords: ["multi-stop", "multiple stops", "ltl", "partial"],
      },
      {
        slug: "hazmat-loads",
        title: "Handling hazmat loads",
        preview: "Special considerations for dangerous goods.",
        keywords: ["hazmat", "dangerous goods", "placard", "special handling"],
      },
    ],
  },
  {
    slug: "routes",
    name: "Routes",
    description: "Build reusable route templates for recurring contracts.",
    icon: Route,
    articles: [
      {
        slug: "what-is-a-route",
        title: "What is a Route?",
        preview: "Routes are reusable blueprints for recurring trips.",
        keywords: ["route", "what is", "definition", "blueprint"],
      },
      {
        slug: "creating-first-route",
        title: "Creating your first route",
        preview: "Turn a regular run into a reusable template.",
        keywords: ["create route", "new route", "add route", "first route"],
      },
      {
        slug: "modifying-route",
        title: "Modifying a route",
        preview: "Update stops, timing, or other route details.",
        keywords: ["modify", "edit", "update", "change route"],
      },
      {
        slug: "dispatching-from-route",
        title: "Dispatching from a route",
        preview: "Turn a route template into an active load.",
        keywords: ["dispatch", "route template", "create from route", "use route"],
      },
      {
        slug: "route-scheduling",
        title: "Setting up route schedules",
        preview: "Automate recurring dispatches on a schedule.",
        keywords: ["schedule", "recurring", "weekly", "daily", "automation"],
      },
      {
        slug: "route-optimization",
        title: "Optimizing route efficiency",
        preview: "Tips for reducing miles and maximizing profit.",
        keywords: ["optimize", "efficiency", "deadhead", "fuel", "profit"],
      },
    ],
  },
  {
    slug: "drivers-and-fleet",
    name: "Drivers & Fleet",
    description: "Manage drivers, vehicles, and compliance.",
    icon: UserCircle,
    articles: [
      {
        slug: "adding-new-driver",
        title: "Adding a new driver",
        preview: "Onboard a driver to your fleet.",
        keywords: ["add driver", "new driver", "hire", "onboard"],
      },
      {
        slug: "managing-driver-pay",
        title: "Managing driver pay",
        preview: "Set up pay rates and track earnings.",
        keywords: ["driver pay", "pay rate", "earnings", "compensation", "settlement"],
      },
      {
        slug: "tracking-vehicle-maintenance",
        title: "Tracking vehicle maintenance",
        preview: "Stay on top of service schedules and repairs.",
        keywords: ["maintenance", "service", "repair", "oil change", "inspection"],
      },
      {
        slug: "driver-documents",
        title: "Managing driver documents",
        preview: "Keep CDLs, medicals, and certifications up to date.",
        keywords: ["documents", "cdl", "medical", "certification", "expiry"],
      },
      {
        slug: "truck-documents",
        title: "Managing truck documents",
        preview: "Track registration, insurance, and inspection records.",
        keywords: ["truck documents", "registration", "insurance", "inspection"],
      },
      {
        slug: "compliance-dashboard",
        title: "Using the compliance dashboard",
        preview: "See expiring documents at a glance.",
        keywords: ["compliance", "expiry", "dashboard", "alerts"],
      },
      {
        slug: "hours-of-service",
        title: "Understanding Hours of Service",
        preview: "How HOS logging works in DriveCommand.",
        keywords: ["hos", "hours of service", "eld", "driving time", "duty status"],
      },
      {
        slug: "driver-incidents",
        title: "Reporting driver incidents",
        preview: "Log accidents, breakdowns, and safety events.",
        keywords: ["incident", "accident", "breakdown", "safety", "report"],
      },
      {
        slug: "fuel-tracking",
        title: "Tracking fuel purchases",
        preview: "Log fuel stops for IFTA reporting.",
        keywords: ["fuel", "gas", "diesel", "ifta", "fuel log"],
      },
      {
        slug: "ifta-reporting",
        title: "IFTA reporting made easy",
        preview: "Generate your quarterly IFTA reports.",
        keywords: ["ifta", "quarterly", "tax", "fuel tax", "miles by state"],
      },
    ],
  },
  {
    slug: "financials",
    hidden: true,
    name: "Financials",
    description: "Track revenue, expenses, and driver pay.",
    icon: TrendingUp,
    articles: [
      {
        slug: "financials-dashboard",
        title: "Reading your financials dashboard",
        preview: "Understand your profit at a glance.",
        keywords: ["financials", "dashboard", "profit", "revenue", "overview"],
      },
      {
        slug: "logging-expenses",
        title: "Logging expenses",
        preview: "Track fuel, tolls, and other costs.",
        keywords: ["expense", "log", "fuel", "toll", "cost"],
      },
      {
        slug: "sending-invoice",
        title: "Sending an invoice",
        preview: "Bill your customers for completed loads.",
        keywords: ["invoice", "bill", "send invoice", "payment"],
      },
      {
        slug: "invoice-templates",
        title: "Customizing invoice templates",
        preview: "Add your logo and payment terms.",
        keywords: ["invoice template", "customize", "logo", "branding"],
      },
      {
        slug: "tracking-payments",
        title: "Tracking payments",
        preview: "See which invoices are paid and which are outstanding.",
        keywords: ["payment", "paid", "outstanding", "receivable", "aging"],
      },
      {
        slug: "profit-per-load",
        title: "Understanding profit per load",
        preview: "See how much you actually make on each shipment.",
        keywords: ["profit", "per load", "margin", "cost per mile"],
      },
      {
        slug: "profit-predictor",
        title: "Using the profit predictor",
        preview: "Estimate profitability before accepting a load.",
        keywords: ["profit predictor", "estimate", "calculator", "lane analysis"],
      },
      {
        slug: "driver-settlements",
        title: "Running driver settlements",
        preview: "Pay your drivers accurately and on time.",
        keywords: ["settlement", "driver pay", "payroll", "weekly pay"],
      },
      {
        slug: "fuel-surcharge",
        title: "Calculating fuel surcharges",
        preview: "Add FSC to your invoices automatically.",
        keywords: ["fuel surcharge", "fsc", "surcharge", "fuel cost"],
      },
      {
        slug: "revenue-reports",
        title: "Generating revenue reports",
        preview: "See your earnings by period, client, or lane.",
        keywords: ["report", "revenue", "earnings", "export", "analytics"],
      },
      {
        slug: "expense-categories",
        title: "Setting up expense categories",
        preview: "Organize your costs for better reporting.",
        keywords: ["expense category", "organize", "categorize", "cost type"],
      },
      {
        slug: "factoring-integration",
        title: "Working with factoring companies",
        preview: "Get paid faster with load factoring.",
        keywords: ["factoring", "quick pay", "fast pay", "advance"],
      },
    ],
  },
  {
    slug: "integrations",
    name: "Integrations",
    description: "Connect QuickBooks, Samsara, and other tools.",
    icon: Plug,
    articles: [
      {
        slug: "connecting-quickbooks",
        title: "Connecting QuickBooks",
        preview: "Sync your invoices and expenses to QuickBooks.",
        keywords: ["quickbooks", "accounting", "sync", "integration"],
      },
      {
        slug: "eld-integration",
        title: "Setting up ELD integration",
        preview: "Connect Samsara, Motive, or other ELD providers.",
        keywords: ["eld", "samsara", "motive", "keeptruckin", "electronic logging"],
      },
      {
        slug: "gps-tracking-setup",
        title: "Setting up GPS tracking",
        preview: "Get real-time location from your trucks.",
        keywords: ["gps", "tracking", "location", "real-time"],
      },
      {
        slug: "email-notifications",
        title: "Configuring email notifications",
        preview: "Control which emails you and your team receive.",
        keywords: ["email", "notification", "alert", "settings"],
      },
      {
        slug: "webhook-integrations",
        title: "Using webhooks for custom integrations",
        preview: "Send data to your own systems automatically.",
        keywords: ["webhook", "api", "custom", "automation", "developer"],
      },
      {
        slug: "load-board-integration",
        title: "Importing from load boards",
        preview: "Bring loads in from DAT, Truckstop, and more.",
        keywords: ["load board", "dat", "truckstop", "import"],
      },
      {
        slug: "banking-integration",
        title: "Connecting your bank account",
        preview: "Track payments automatically.",
        keywords: ["bank", "plaid", "payments", "auto-import"],
      },
    ],
  },
]

/**
 * Get a category by its slug
 * Returns undefined for hidden categories so route pages naturally 404.
 */
export function getCategoryBySlug(slug: string): HelpCategory | undefined {
  const category = HELP_CATEGORIES.find((cat) => cat.slug === slug)
  if (!category || category.hidden) return undefined
  return category
}

/**
 * Get an article by category slug and article slug
 */
export function getArticleBySlug(
  categorySlug: string,
  articleSlug: string
): { category: HelpCategory; article: HelpArticle } | undefined {
  const category = getCategoryBySlug(categorySlug)
  if (!category) return undefined

  const article = category.articles.find((a) => a.slug === articleSlug)
  if (!article) return undefined

  return { category, article }
}

/**
 * Get all articles across all categories (flattened)
 * Useful for search indexing. Excludes hidden categories.
 */
export function getAllArticles(): Array<HelpArticle & { categorySlug: string; categoryName: string }> {
  return HELP_CATEGORIES.filter((category) => !category.hidden).flatMap((category) =>
    category.articles.map((article) => ({
      ...article,
      categorySlug: category.slug,
      categoryName: category.name,
    }))
  )
}

/**
 * Get article count for a category
 * TODO: Wire to real article count when content is added
 */
export function getArticleCount(categorySlug: string): number {
  const category = getCategoryBySlug(categorySlug)
  return category?.articles.length ?? 0
}
