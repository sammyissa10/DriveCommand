"use client"

import { Search } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

/**
 * HelpSearchInline - Large inline search for the Help Center page
 *
 * This is a visual stub for now. The search functionality will be
 * wired to a real help article search backend in a future pass.
 *
 * TODO: Connect to help article search backend (Algolia, Typesense, or custom)
 */
export function HelpSearchInline() {
  const [query, setQuery] = useState("")
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div className="relative max-w-xl mx-auto mb-10">
      <div
        className={cn(
          "relative flex items-center rounded-xl border bg-card transition-all duration-200",
          isFocused
            ? "border-primary/50 ring-2 ring-primary/20"
            : "border-border hover:border-border/80"
        )}
      >
        <Search
          className="absolute left-4 text-muted-foreground pointer-events-none"
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder='Search articles, e.g. "how to create a route"'
          className={cn(
            "w-full h-12 pl-12 pr-4 bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
            "focus:outline-none"
          )}
          aria-label="Search help articles"
        />
      </div>
      {/* TODO: Add search results dropdown when backend is connected */}
      {query && (
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Search coming soon. Use Cmd+K to search across the app.
        </p>
      )}
    </div>
  )
}
