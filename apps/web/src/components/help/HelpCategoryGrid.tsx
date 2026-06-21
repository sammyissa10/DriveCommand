"use client"

import Link from "next/link"
import { HELP_CATEGORIES } from "./help.config"
import { cn } from "@/lib/utils"

/**
 * HelpCategoryGrid - 2x3 grid of help category cards
 *
 * Design principles:
 * - Calm, subtle hover state (no bouncy transforms)
 * - Warm, human copy
 * - Article count badge for each category
 *
 * TODO: Wire article counts to real count when content is added
 */
export function HelpCategoryGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
      {HELP_CATEGORIES.filter((category) => !category.hidden).map((category) => {
        const Icon = category.icon
        const articleCount = category.articles.length

        return (
          <Link
            key={category.slug}
            href={`/help/${category.slug}`}
            className={cn(
              "group block p-5 rounded-xl border border-border bg-card",
              "transition-colors duration-150",
              "hover:bg-muted/50"
            )}
          >
            {/* Icon */}
            <div className="mb-3">
              <div
                className={cn(
                  "inline-flex items-center justify-center w-10 h-10 rounded-lg",
                  "bg-primary/10 text-primary"
                )}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </div>
            </div>

            {/* Category name */}
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {category.name}
            </h3>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {category.description}
            </p>

            {/* Article count badge */}
            <span className="inline-flex items-center text-xs text-muted-foreground">
              {articleCount} {articleCount === 1 ? "article" : "articles"}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
