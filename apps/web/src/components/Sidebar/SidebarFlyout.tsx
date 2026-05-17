"use client"

import { useState } from "react"
import Link from "next/link"
import * as Popover from "@radix-ui/react-popover"
import { FLYOUT_BORDER_RADIUS, ITEM_BORDER_RADIUS } from "./sidebar.config"
import type { NavItem } from "./sidebar.config"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarFlyoutProps {
  item: NavItem
  isActive: boolean
  index: number
  onNavigate: () => void
}

/**
 * SidebarFlyout - Radix Popover flyout for collapsed submenu hover
 * - Trigger: parent item icon (hover trigger)
 * - Content: positioned right with 8px offset
 * - Border radius: 12px
 * - Shadow: multi-layer soft shadow
 * - Arrow keys navigate within flyout
 * - Close on click or Escape
 */
export function SidebarFlyout({
  item,
  isActive,
  index,
  onNavigate,
}: SidebarFlyoutProps) {
  const [isOpen, setIsOpen] = useState(false)
  const Icon = item.icon

  const trigger = (
    <div
      className={cn(
        "flex items-center justify-center p-2 rounded-lg transition-colors duration-150",
        "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
        isActive && "bg-sidebar-accent"
      )}
      style={{
        borderRadius: `${ITEM_BORDER_RADIUS}px`,
      }}
    >
      <Icon
        className="shrink-0 text-[hsl(var(--sidebar-fg-muted))]"
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </div>
  )

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <button
              className="w-full"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setIsOpen(false)}
            >
              {trigger}
            </button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>

      <Popover.Portal>
        <Popover.Content
          side="right"
          sideOffset={8}
          align="start"
          className={cn(
            "z-50 min-w-[200px] p-2",
            "shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3),_0_8px_32px_-8px_rgba(0,0,0,0.2)]",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-left-2"
          )}
          style={{
            borderRadius: `${FLYOUT_BORDER_RADIUS}px`,
            // Solid surface matching sidebar gradient
            background: "linear-gradient(180deg, hsl(220 32% 10%) 0%, hsl(222 36% 8%) 100%)",
            border: "1px solid hsl(220 22% 16%)",
            // Layered shadow for depth + subtle inner highlight
            boxShadow: "0 4px 24px -4px rgba(0,0,0,0.4), 0 8px 32px -8px rgba(0,0,0,0.3), inset 1px 1px 0 0 hsl(0 0% 100% / 0.03)",
          }}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsOpen(false)
            }
          }}
        >
          <div className="space-y-1">
            <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-fg-subtle))]">
              {item.label}
            </div>
            {item.children?.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                onClick={() => {
                  setIsOpen(false)
                  onNavigate()
                }}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
                  "hover:bg-sidebar-accent/80 text-[13px] font-normal text-[hsl(var(--sidebar-fg-muted))]"
                )}
                style={{
                  borderRadius: `${ITEM_BORDER_RADIUS}px`,
                }}
              >
                {child.label}
              </Link>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
