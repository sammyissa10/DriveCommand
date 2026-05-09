'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';

export function DriverSignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/sign-in';
    } catch {
      setIsSigningOut(false);
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="flex items-center gap-4 w-full bg-card rounded-lg border border-border px-4 py-3 min-h-[52px] hover:bg-muted/50 active:scale-[0.99] transition-all text-left disabled:opacity-60 group"
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0 bg-gray-100 dark:bg-gray-800">
        <LogOut className="h-5 w-5 text-gray-600 dark:text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {isSigningOut ? 'Signing out...' : 'Log Out'}
        </p>
        <p className="text-xs text-muted-foreground">Sign out of your account</p>
      </div>
    </button>
  );
}
