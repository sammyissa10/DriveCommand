"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import type { SearchResult, RecentItem } from "./types"
import { RECENTS_STORAGE_KEY, MAX_RECENTS, SECTION_CONFIG } from "./types"
import {
  createNavigationProvider,
  createQuickActionsProvider,
  createEntityProvider,
  createSettingsProvider,
  createHelpProvider,
  QUICK_ACTIONS,
} from "./searchProviders"

/**
 * Check if focus is in an input/textarea (keyboard shortcuts should not fire)
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement
  if (!activeElement) return false

  const tagName = activeElement.tagName.toLowerCase()
  if (tagName === "input" || tagName === "textarea") return true
  if ((activeElement as HTMLElement).isContentEditable) return true

  return false
}

/**
 * Debounce helper
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

interface CommandPaletteContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  query: string
  setQuery: (query: string) => void
  results: SearchResult[]
  groupedResults: Record<string, SearchResult[]>
  recentItems: RecentItem[]
  isLoading: boolean
  executeResult: (result: SearchResult) => void
  navigate: (href: string, label?: string, iconName?: string) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function useCommandPaletteContext() {
  const context = useContext(CommandPaletteContext)
  if (!context) {
    throw new Error("useCommandPaletteContext must be used within CommandPaletteProvider")
  }
  return context
}

interface CommandPaletteProviderProps {
  children: ReactNode
}

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const debouncedQuery = useDebounce(query, 80)

  // Navigation helper that also tracks recents
  const navigate = useCallback(
    (href: string, label?: string, iconName?: string) => {
      router.push(href)
      setIsOpen(false)
      setQuery("")

      // Track as recent navigation
      if (label) {
        const newRecent: RecentItem = {
          id: `recent-${Date.now()}`,
          label,
          href,
          icon: iconName,
          timestamp: Date.now(),
        }

        setRecentItems((prev) => {
          const filtered = prev.filter((item) => item.href !== href)
          const updated = [newRecent, ...filtered].slice(0, MAX_RECENTS)

          try {
            localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(updated))
          } catch {
            // Ignore storage errors
          }

          return updated
        })
      }
    },
    [router]
  )

  // Create search providers
  const navigationProvider = createNavigationProvider(navigate)
  const quickActionsProvider = createQuickActionsProvider(navigate)
  const settingsProvider = createSettingsProvider(navigate)
  const helpProvider = createHelpProvider(navigate)
  const entityProvider = createEntityProvider(navigate)

  // Load recent items from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENTS_STORAGE_KEY)
      if (stored) {
        setRecentItems(JSON.parse(stored))
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  // Aggregate search results when query changes
  useEffect(() => {
    async function fetchResults() {
      setIsLoading(true)

      try {
        const [navResults, actionResults, settingsResults, helpResults, entityResults] = await Promise.all([
          Promise.resolve(navigationProvider.getResults(debouncedQuery)),
          Promise.resolve(quickActionsProvider.getResults(debouncedQuery)),
          Promise.resolve(settingsProvider.getResults(debouncedQuery)),
          Promise.resolve(helpProvider.getResults(debouncedQuery)),
          Promise.resolve(entityProvider.getResults(debouncedQuery)),
        ])

        const MAX_PER_SECTION = 6

        const limitedNav = navResults.slice(0, MAX_PER_SECTION)
        const limitedActions = actionResults.slice(0, MAX_PER_SECTION)
        const limitedSettings = settingsResults.slice(0, MAX_PER_SECTION)
        const limitedHelp = helpResults.slice(0, MAX_PER_SECTION)
        const limitedEntities = entityResults.slice(0, MAX_PER_SECTION)

        const allResults = [...limitedNav, ...limitedActions, ...limitedSettings, ...limitedHelp, ...limitedEntities]
        allResults.sort((a, b) => {
          const priorityA = SECTION_CONFIG[a.section]?.priority ?? 99
          const priorityB = SECTION_CONFIG[b.section]?.priority ?? 99
          return priorityA - priorityB
        })

        setResults(allResults)
      } catch (error) {
        console.error("Search error:", error)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchResults()
  }, [debouncedQuery])

  // Global keyboard shortcut: Cmd+K / Ctrl+K to open, "?" to open help
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        if (isInputFocused() && !isOpen) return

        event.preventDefault()
        setIsOpen((prev) => !prev)
        if (!isOpen) {
          setQuery("")
        }
      }

      if (event.key === "Escape" && isOpen) {
        setIsOpen(false)
        setQuery("")
      }

      // "?" keyboard shortcut → navigate to /help
      // Must NOT fire when focus is in an input/textarea
      if (event.key === "?" && !isInputFocused() && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        navigate("/help", "Help")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, navigate])

  // Two-key sequence shortcuts for quick actions
  useEffect(() => {
    let pendingKey: string | null = null
    let pendingTimeout: NodeJS.Timeout | null = null

    function clearPending() {
      pendingKey = null
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        pendingTimeout = null
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isInputFocused()) return

      // Handle modifier shortcuts (Cmd+Shift+X)
      if (event.metaKey && event.shiftKey) {
        const action = QUICK_ACTIONS.find((a) => {
          if (!a.shortcut?.startsWith("⌘⇧")) return false
          const key = a.shortcut.replace("⌘⇧", "").toLowerCase()
          return event.key.toLowerCase() === key
        })

        if (action?.href) {
          event.preventDefault()
          navigate(action.href)
          return
        }
      }

      // Handle two-key sequences (C then L)
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const key = event.key.toLowerCase()

        if (key === "c" && !pendingKey) {
          pendingKey = "c"
          pendingTimeout = setTimeout(clearPending, 500)
          return
        }

        if (pendingKey === "c") {
          const action = QUICK_ACTIONS.find((a) => {
            if (a.section !== "quick-create") return false
            if (!a.shortcut?.startsWith("C ")) return false
            const secondKey = a.shortcut.replace("C ", "").toLowerCase()
            return key === secondKey
          })

          if (action?.href) {
            event.preventDefault()
            navigate(action.href)
          }

          clearPending()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (pendingTimeout) clearTimeout(pendingTimeout)
    }
  }, [navigate])

  const open = useCallback(() => {
    setIsOpen(true)
    setQuery("")
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery("")
  }, [])

  const executeResult = useCallback((result: SearchResult) => {
    result.action()
    setIsOpen(false)
    setQuery("")
  }, [])

  const groupedResults = results.reduce(
    (acc, result) => {
      const section = result.section
      if (!acc[section]) {
        acc[section] = []
      }
      acc[section].push(result)
      return acc
    },
    {} as Record<string, SearchResult[]>
  )

  const value: CommandPaletteContextValue = {
    isOpen,
    open,
    close,
    query,
    setQuery,
    results,
    groupedResults,
    recentItems,
    isLoading,
    executeResult,
    navigate,
  }

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  )
}
