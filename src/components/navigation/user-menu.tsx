"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { LogOut, User } from "lucide-react";

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
      <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
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
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label="User menu"
      >
        {initials}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute bottom-full mb-2 right-0 z-50 w-56 rounded-lg border border-border bg-card shadow-lg p-1">
            {/* User info */}
            <div className="px-3 py-2 border-b border-border mb-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-semibold">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
            </div>

            {/* Sign out */}
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
