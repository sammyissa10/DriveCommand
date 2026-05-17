"use client"

import Link from "next/link"
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * TopBarHelpButton - Help icon button for the TopBar
 *
 * Position: between Quick Create button and notifications bell
 * On hover: subtle bg fill, tooltip "Help (?)"
 * On click: navigates to /help
 */
export function TopBarHelpButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/help"
            className={cn(
              "inline-flex items-center justify-center rounded-lg p-2",
              "text-[hsl(var(--sidebar-fg-muted))] hover:text-[hsl(var(--sidebar-fg))]",
              "hover:bg-white/10 transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            )}
            aria-label="Open Help Center"
          >
            <HelpCircle size={18} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          Help (?)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
