"use client"

import { useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth/auth-context"
import { LogOut, User, Settings, Bell, HelpCircle, ChevronDown } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils"

function getInitials(firstName?: string, lastName?: string, email?: string): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  }
  if (firstName) {
    return firstName.slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }
  return "??"
}

interface UserMenuProps {
  dropdownDirection?: "up" | "down"
  compactOnMobile?: boolean
}

/**
 * UserMenu - Top-right account dropdown with Profile, Settings, My Notifications, Sign Out
 * - Uses Radix DropdownMenu for accessibility
 * - Glass treatment on dropdown
 * - Smooth transitions
 */
export function UserMenu({ dropdownDirection = "down", compactOnMobile = false }: UserMenuProps) {
  const { user, isLoaded } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      window.location.href = "/sign-in"
    } catch {
      setIsSigningOut(false)
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-3 px-2 py-1.5 pointer-events-none">
        <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        <div className={cn("flex-1 space-y-1", compactOnMobile && "hidden sm:block")}>
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  const initials = getInitials(user?.firstName, user?.lastName, user?.email)
  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.email ?? "User"

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left group/usermenu",
            "hover:bg-muted/80 active:bg-muted transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          )}
          style={{
            transition: "background-color 180ms ease-out",
          }}
        >
          <div
            className={cn(
              "flex aspect-square size-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm shrink-0",
              compactOnMobile ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground"
            )}
          >
            {initials}
          </div>
          <div className={cn("grid flex-1 text-left text-sm leading-tight min-w-0", compactOnMobile && "hidden sm:grid")}>
            <span className="truncate font-semibold text-foreground">{displayName}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          </div>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200",
              compactOnMobile && "hidden sm:block"
            )}
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={dropdownDirection === "up" ? "top" : "bottom"}
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 min-w-[220px] rounded-xl p-1.5",
            // Glass treatment: blur + tint + border + shadow
            "bg-card/95 backdrop-blur-xl",
            "border border-border/50",
            "shadow-lg shadow-black/10 dark:shadow-black/30",
            // Animation
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          )}
        >
          {/* User info header */}
          <div className="px-3 py-2.5 mb-1">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>

          <DropdownMenu.Separator className="h-px bg-border/50 my-1" />

          {/* Navigation items */}
          <DropdownMenu.Item asChild>
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer",
                "hover:bg-muted focus:bg-muted outline-none",
                "transition-colors duration-150"
              )}
            >
              <User className="size-4 text-muted-foreground" aria-hidden="true" />
              Profile
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/settings/my-notifications"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer",
                "hover:bg-muted focus:bg-muted outline-none",
                "transition-colors duration-150"
              )}
            >
              <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
              My Notifications
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/settings/notifications"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer",
                "hover:bg-muted focus:bg-muted outline-none",
                "transition-colors duration-150"
              )}
            >
              <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/help"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer",
                "hover:bg-muted focus:bg-muted outline-none",
                "transition-colors duration-150"
              )}
            >
              <HelpCircle className="size-4 text-muted-foreground" aria-hidden="true" />
              Help & Support
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-px bg-border/50 my-1" />

          {/* Sign out */}
          <DropdownMenu.Item
            onClick={handleSignOut}
            disabled={isSigningOut}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer",
              "text-destructive hover:bg-destructive/10 focus:bg-destructive/10 outline-none",
              "transition-colors duration-150",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            <LogOut className="size-4" aria-hidden="true" />
            {isSigningOut ? "Signing out..." : "Sign out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
