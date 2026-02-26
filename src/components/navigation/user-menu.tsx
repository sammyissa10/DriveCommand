"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
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

export function UserMenu() {
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
  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.email ?? "User";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 rounded-lg px-2 py-1.5 w-full hover:bg-muted transition-colors text-left"
      >
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-semibold shadow-sm">
          {initials}
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">{displayName}</span>
          <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
        </div>
        <ChevronsUpDown className="ml-auto size-4" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full mt-2 left-0 right-0 z-50 rounded-lg border border-border bg-card shadow-lg p-1">
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-60"
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
