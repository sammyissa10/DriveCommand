"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, ChevronDown, ChevronRight } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AddButton, SheetContainer, SectionHeader } from "@/components/ui/ds"
import { cn } from "@/lib/utils"
import { QUICK_ACTION_SECTIONS } from "./quickActions.config"

/**
 * QuickActionsMenu - Create button with dropdown/sheet for quick create + actions
 *
 * Desktop (`variant="desktop"`, default):
 * - Two sections: Quick Create (records) and Quick Actions (operations)
 * - Keyboard shortcut hints for each action
 * - Linear/Vercel-style premium dropdown design
 * - Solid surfaces (no backdrop blur)
 *
 * Mobile (`variant="mobile"`):
 * - AddButton trigger + ds SheetContainer bottom sheet
 * - Grouped ds-card sections with muted icons, chevrons, inset hairlines
 */
export function QuickActionsMenu({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const router = useRouter()

  if (variant === "mobile") {
    return <MobileQuickActionsMenu />
  }

  const handleAction = (href: string) => {
    router.push(href)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
            "bg-[hsl(220_60%_50%)] hover:bg-[hsl(220_60%_55%)]",
            "text-white text-sm font-medium",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(220_60%_50%)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220_32%_11%)]"
          )}
          type="button"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          <span className="hidden sm:inline">Create</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn(
          // Solid surface - NO transparency/blur
          "bg-[hsl(220_32%_11%)] dark:bg-[hsl(220_32%_11%)]",
          "border border-[hsl(220_25%_18%)] dark:border-[hsl(220_25%_18%)]",
          // Shadow
          "shadow-[0_4px_12px_rgba(0,0,0,0.15),_0_24px_48px_-12px_rgba(0,0,0,0.4)]",
          // Size
          "w-64",
          // Animation
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2"
        )}
      >
        {QUICK_ACTION_SECTIONS.map((section, sectionIndex) => (
          <div key={section.id}>
            {sectionIndex > 0 && (
              <DropdownMenuSeparator className="bg-[hsl(220_25%_18%)]" />
            )}

            <DropdownMenuLabel
              className={cn(
                "text-[11px] font-medium uppercase tracking-wider",
                "text-[hsl(220_10%_50%)] px-3 py-2"
              )}
            >
              {section.label}
            </DropdownMenuLabel>

            <DropdownMenuGroup>
              {section.items.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => handleAction(item.href)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg cursor-pointer",
                    "text-[hsl(0_0%_92%)]",
                    "focus:bg-[hsl(220_28%_18%)] focus:text-[hsl(0_0%_98%)]",
                    "hover:bg-[hsl(220_28%_18%)]",
                    "transition-none" // Snappy selection
                  )}
                >
                  <item.icon
                    className="h-4 w-4 shrink-0 text-[hsl(220_10%_60%)]"
                    strokeWidth={1.75}
                  />
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-[11px] text-[hsl(220_10%_50%)] font-mono">
                      {item.shortcut}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Mobile bottom-sheet variant — ds kit only (AddButton, SheetContainer,
 * SectionHeader). Grouped ds-card sections with muted icons, chevrons, and
 * inset hairlines between rows.
 */
function MobileQuickActionsMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const handleSelect = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <AddButton label="Create" onClick={() => setOpen(true)} />
      <SheetContainer
        open={open}
        onCancel={() => setOpen(false)}
        title="Create"
        subtitle="Create a record or run a quick action"
      >
        <div className="space-y-6">
          {QUICK_ACTION_SECTIONS.map((section) => (
            <div key={section.id}>
              <SectionHeader title={section.label} />
              <div className="mt-2 overflow-hidden rounded-[20px] bg-ds-card">
                {section.items.map((item, itemIndex) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 min-h-[52px] text-left transition active:opacity-75"
                      onClick={() => handleSelect(item.href)}
                    >
                      <item.icon className="h-5 w-5 shrink-0 text-ds-txt2" />
                      <span className="flex-1 text-[17px] text-ds-txt">{item.label}</span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-ds-txt3" />
                    </button>
                    {itemIndex < section.items.length - 1 && (
                      <div className="ml-12 h-px bg-ds-hairline" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContainer>
    </>
  )
}
