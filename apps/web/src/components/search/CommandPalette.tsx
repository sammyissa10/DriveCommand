"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, ArrowUp, ArrowDown, CornerDownLeft } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { useCommandPaletteContext } from "./CommandPaletteProvider"
import { SECTION_CONFIG } from "./types"
import type { SearchResult } from "./types"

/**
 * CommandPalette - Global search and command interface
 *
 * Features:
 * - Cmd+K / Ctrl+K to open
 * - Fuzzy search across navigation, actions, and entities
 * - Grouped results with section headers
 * - Keyboard navigation with arrow keys
 * - Recent items shown on empty query
 * - Premium Linear/Raycast-style UI
 */
export function CommandPalette() {
  const {
    isOpen,
    close,
    query,
    setQuery,
    groupedResults,
    recentItems,
    isLoading,
    executeResult,
    navigate,
  } = useCommandPaletteContext()

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Detect reduced motion preference
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(motionQuery.matches)
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    motionQuery.addEventListener("change", handler)
    return () => motionQuery.removeEventListener("change", handler)
  }, [])

  // Get ordered sections based on priority
  const orderedSections = Object.entries(groupedResults)
    .sort(([a], [b]) => {
      const priorityA = SECTION_CONFIG[a as keyof typeof SECTION_CONFIG]?.priority ?? 99
      const priorityB = SECTION_CONFIG[b as keyof typeof SECTION_CONFIG]?.priority ?? 99
      return priorityA - priorityB
    })

  const hasResults = orderedSections.length > 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className={cn(
          // Position: center-top
          "fixed left-[50%] translate-x-[-50%] top-[15vh] translate-y-0",
          // Size
          "w-full max-w-[640px] p-0",
          // Solid surface - NO transparency/blur
          "bg-[hsl(220_32%_11%)] dark:bg-[hsl(220_32%_11%)]",
          "border border-[hsl(220_25%_18%)] dark:border-[hsl(220_25%_18%)]",
          // Shadow
          "shadow-[0_4px_12px_rgba(0,0,0,0.15),_0_24px_48px_-12px_rgba(0,0,0,0.4)]",
          // Border radius
          "rounded-xl",
          // Remove default dialog animations/transforms
          "data-[state=open]:animate-none data-[state=closed]:animate-none",
          // Override dialog default styles
          "[&>button]:hidden" // Hide default close button
        )}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>

        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.18,
                ease: [0.32, 0.72, 0, 1],
              }}
              className="overflow-hidden rounded-xl"
            >
              <Command
                className="bg-transparent"
                shouldFilter={false} // We handle filtering ourselves
              >
                {/* Search input row */}
                <div className="flex items-center border-b border-[hsl(220_25%_18%)] px-4">
                  <Search
                    className="mr-3 h-4 w-4 shrink-0 text-[hsl(220_10%_55%)]"
                    strokeWidth={1.75}
                  />
                  <CommandInput
                    placeholder="Search or run a command..."
                    value={query}
                    onValueChange={setQuery}
                    className={cn(
                      "flex h-12 w-full bg-transparent py-3 text-[15px] outline-none",
                      "text-[hsl(0_0%_98%)] placeholder:text-[hsl(220_10%_55%)]",
                      "border-0 focus:ring-0"
                    )}
                  />
                  <kbd className="ml-2 pointer-events-none h-6 select-none flex items-center gap-1 rounded border border-[hsl(220_22%_20%)] bg-[hsl(220_28%_14%)] px-1.5 font-mono text-[11px] font-medium text-[hsl(220_10%_55%)]">
                    esc
                  </kbd>
                </div>

                {/* Results list */}
                <CommandList className="max-h-[400px] overflow-y-auto p-2">
                  {/* Loading state */}
                  {isLoading && (
                    <div className="py-6 text-center text-sm text-[hsl(220_10%_55%)]">
                      Searching...
                    </div>
                  )}

                  {/* Empty state when query has no matches */}
                  {!isLoading && query && !hasResults && (
                    <CommandEmpty className="py-6 text-center text-sm text-[hsl(220_10%_55%)]">
                      No results for &quot;{query}&quot;. Try a different search.
                    </CommandEmpty>
                  )}

                  {/* Recent items when no query */}
                  {!query && recentItems.length > 0 && (
                    <CommandGroup
                      heading="Recent"
                      className="text-[hsl(220_10%_55%)] [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {recentItems.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.id}
                          onSelect={() => navigate(item.href, item.label, item.icon)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                            "text-[hsl(0_0%_92%)]",
                            "aria-selected:bg-[hsl(220_28%_18%)]",
                            "hover:bg-[hsl(220_28%_18%)]",
                            "transition-none" // Snappy selection
                          )}
                        >
                          <span className="text-sm">{item.label}</span>
                          <span className="ml-auto text-xs text-[hsl(220_10%_50%)]">
                            {item.href}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {/* Grouped results */}
                  {orderedSections.map(([section, items]) => (
                    <CommandGroup
                      key={section}
                      heading={SECTION_CONFIG[section as keyof typeof SECTION_CONFIG]?.label ?? section}
                      className="text-[hsl(220_10%_55%)] [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {items.map((result: SearchResult) => (
                        <CommandItem
                          key={result.id}
                          value={result.id}
                          onSelect={() => executeResult(result)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                            "text-[hsl(0_0%_92%)]",
                            "aria-selected:bg-[hsl(220_28%_18%)]",
                            "hover:bg-[hsl(220_28%_18%)]",
                            "transition-none" // Snappy selection
                          )}
                        >
                          {result.icon && (
                            <result.icon
                              className="h-4 w-4 shrink-0 text-[hsl(220_10%_60%)]"
                              strokeWidth={1.75}
                            />
                          )}
                          <span className="text-sm font-medium">{result.label}</span>
                          {result.secondary && (
                            <span className="ml-auto text-xs text-[hsl(220_10%_50%)]">
                              {result.secondary}
                            </span>
                          )}
                          {result.shortcut && (
                            <CommandShortcut className="ml-auto text-[11px] text-[hsl(220_10%_50%)]">
                              {result.shortcut}
                            </CommandShortcut>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>

                {/* Footer with keyboard hints */}
                <div className="flex items-center gap-4 border-t border-[hsl(220_25%_18%)] px-4 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-[hsl(220_10%_50%)]">
                    <kbd className="flex h-5 w-5 items-center justify-center rounded border border-[hsl(220_22%_20%)] bg-[hsl(220_28%_14%)]">
                      <ArrowUp className="h-3 w-3" />
                    </kbd>
                    <kbd className="flex h-5 w-5 items-center justify-center rounded border border-[hsl(220_22%_20%)] bg-[hsl(220_28%_14%)]">
                      <ArrowDown className="h-3 w-3" />
                    </kbd>
                    <span className="ml-1">navigate</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[hsl(220_10%_50%)]">
                    <kbd className="flex h-5 w-5 items-center justify-center rounded border border-[hsl(220_22%_20%)] bg-[hsl(220_28%_14%)]">
                      <CornerDownLeft className="h-3 w-3" />
                    </kbd>
                    <span className="ml-1">select</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[hsl(220_10%_50%)]">
                    <kbd className="flex h-5 items-center justify-center rounded border border-[hsl(220_22%_20%)] bg-[hsl(220_28%_14%)] px-1.5 font-mono text-[10px]">
                      esc
                    </kbd>
                    <span className="ml-1">close</span>
                  </div>
                </div>
              </Command>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

/**
 * SearchTrigger - The search input element in the TopBar
 * Clicking it opens the command palette
 */
interface SearchTriggerProps {
  className?: string
}

export function SearchTrigger({ className }: SearchTriggerProps) {
  const { open } = useCommandPaletteContext()

  return (
    <button
      onClick={open}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg",
        "bg-[hsl(220_28%_14%)] border border-[hsl(220_22%_20%)]",
        "text-[hsl(220_10%_55%)] text-sm",
        "hover:bg-[hsl(220_28%_16%)] hover:border-[hsl(220_22%_24%)]",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(220_60%_50%)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220_32%_11%)]",
        "min-w-[200px] md:min-w-[280px]",
        className
      )}
      type="button"
      aria-label="Search or run a command"
    >
      <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="flex-1 text-left">Search...</span>
      <kbd className="pointer-events-none h-5 select-none flex items-center gap-0.5 rounded border border-[hsl(220_22%_20%)] bg-[hsl(220_28%_12%)] px-1.5 font-mono text-[10px] font-medium">
        <span className="text-[11px]">⌘</span>K
      </kbd>
    </button>
  )
}
