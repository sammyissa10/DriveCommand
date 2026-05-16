"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { getDisplayName } from "@/lib/auth/display-name";
import { LogOut, ChevronsUpDown } from "lucide-react";

function getInitials(firstName?: string, lastName?: string, email?: string): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "??";
}

interface UserMenuProps {
  dropdownDirection?: "up" | "down";
  compactOnMobile?: boolean;
}

export function UserMenu({ dropdownDirection = "down", compactOnMobile = false }: UserMenuProps) {
  const { user, isLoaded } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/sign-in";
    } catch {
      setIsSigningOut(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-3 px-2 py-1.5 pointer-events-none">
        <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  const initials = getInitials(user?.firstName, user?.lastName, user?.email);
  const displayName = getDisplayName(user);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted active:bg-muted transition-colors text-left group/usermenu"
      >
        <div className={`flex aspect-square size-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm shrink-0 ${compactOnMobile ? "bg-blue-600 text-white" : "bg-white text-blue-600"}`}>
          {initials}
        </div>
        <div className={`${compactOnMobile ? "hidden sm:grid" : "grid"} flex-1 text-left text-sm leading-tight min-w-0`}>
          <span className="truncate font-semibold group-hover/usermenu:text-gray-900 group-active/usermenu:text-gray-900">{displayName}</span>
          <span className="truncate text-xs text-muted-foreground group-hover/usermenu:text-gray-600 group-active/usermenu:text-gray-600">{user?.email}</span>
        </div>
        <ChevronsUpDown className="size-4 group-hover/usermenu:text-gray-900 group-active/usermenu:text-gray-900" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute right-0 z-50 w-56 rounded-lg border border-border bg-card shadow-lg p-1 ${dropdownDirection === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}>
            <div className="px-3 py-2 mb-1 border-b border-border">
              <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-muted hover:text-gray-900 active:bg-muted active:text-gray-900 transition-colors disabled:opacity-60"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
