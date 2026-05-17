import type { LucideIcon } from "lucide-react"

/**
 * SearchResult - A single result item in the command palette
 */
export interface SearchResult {
  /** Unique identifier for this result */
  id: string
  /** Primary display text */
  label: string
  /** Optional secondary text (displayed right-aligned, muted) */
  secondary?: string
  /** Icon to display (Lucide icon component) */
  icon?: LucideIcon
  /** Section/category this result belongs to */
  section: SearchSection
  /** Action to execute when selected (navigate, open modal, etc.) */
  action: () => void
  /** Additional keywords for fuzzy matching beyond the label */
  keywords?: string[]
  /** Optional keyboard shortcut hint to display */
  shortcut?: string
}

/**
 * SearchSection - Defines the grouping and order of search results
 */
export type SearchSection =
  | "navigation"
  | "quick-actions"
  | "settings"
  | "help"
  | "clients"
  | "loads"
  | "drivers"
  | "other"

/**
 * Section display config for UI rendering
 */
export const SECTION_CONFIG: Record<SearchSection, { label: string; priority: number }> = {
  navigation: { label: "Navigation", priority: 1 },
  "quick-actions": { label: "Quick Actions", priority: 2 },
  settings: { label: "Settings", priority: 3 },
  help: { label: "Help", priority: 4 },
  clients: { label: "Clients", priority: 5 },
  loads: { label: "Loads", priority: 6 },
  drivers: { label: "Drivers", priority: 7 },
  other: { label: "Other", priority: 8 },
}

/**
 * SearchProvider - Interface for providing search results
 * Each provider handles a specific category of searchable items
 */
export interface SearchProvider {
  /** Unique name for this provider */
  name: string
  /** Get search results for a query. Can be sync or async. */
  getResults: (query: string) => SearchResult[] | Promise<SearchResult[]>
}

/**
 * RecentItem - Stored recent search/navigation for empty state
 */
export interface RecentItem {
  id: string
  label: string
  href: string
  icon?: string // Icon name as string for serialization
  timestamp: number
}

/**
 * LocalStorage key for recent items
 */
export const RECENTS_STORAGE_KEY = "drivecommand:command-palette:recents"
export const MAX_RECENTS = 5
