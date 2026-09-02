"use client"

import { useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth/auth-context"
import { LogOut, User, Settings, Bell, HelpCircle, ChevronDown } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils"
import { PORTAL_ROLES, type UserRole } from "@/lib/auth/roles"

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

  // /settings/notifications and /help are gated to the owner portal's roles
  // (quick-576). Two DIFFERENT mechanisms enforce this server-side, and a
  // future reader who checks only one of them would draw the wrong
  // conclusion about the other:
  //   - /settings/notifications is blocked by the bare '/settings' prefix in
  //     OWNER_PATHS (src/lib/auth/route-access.ts), enforced in middleware.
  //   - /help is NOT listed in OWNER_PATHS at all — middleware lets a DRIVER
  //     straight through. It is `src/app/(owner)/layout.tsx` that redirects
  //     anyone who isn't OWNER/MANAGER to /unauthorized. Checking OWNER_PATHS
  //     alone would wrongly conclude /help is safe to link for a driver.
  // Gate is PORTAL_ROLES.owner (not a hand-written [OWNER, MANAGER] array) so
  // a future change to who may enter the owner portal moves this menu with
  // it. `user` is null until /api/auth/me resolves, and `!!user` fails
  // closed in that gap — the `!isLoaded` early return above already skips
  // rendering the menu at all before the role is known, but this keeps the
  // same guarantee if that ever changes.
  const canSeeOwnerSettings = !!user && (PORTAL_ROLES.owner as readonly UserRole[]).includes(user.role)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          // quick-576: a role/text locator can't uniquely identify this
          // trigger in e2e — owner-shell.tsx mounts UserMenu TWICE (desktop
          // + `lg:hidden` mobile lanes) alongside QuickActionsMenu,
          // TopBarHelpButton and NotificationBell, so
          // `button[aria-haspopup="menu"]` is ambiguous on every owner page;
          // and `compactOnMobile` hides the name/email behind `hidden
          // sm:grid`, collapsing the accessible name to just the initials
          // below 640px, which specs run at (the `mobile` Playwright
          // project). A stable testid plus a `:visible` filter is the only
          // locator that works across both mount lanes and both viewports.
          data-testid="user-menu-trigger"
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
          {/* quick-576: /profile is a 404 for EVERY role (verified empirically —
              signed-out gives a 307 to /sign-in via the auth guard; signed in
              as OWNER it is a real 404). `find src/app -iname "*profile*"`
              returns nothing, next.config.ts has no rewrite/redirect for it,
              and this href is the only occurrence of the string in src/.
              Gating cannot fix a route that doesn't exist, and it's broken
              for OWNER too — so it is left in and reported as a known dead
              link pending a product decision (removing a nav entry is a call
              the user reserves), rather than silently deleted. */}
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

          {canSeeOwnerSettings && (
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
          )}

          {canSeeOwnerSettings && (
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
          )}

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
