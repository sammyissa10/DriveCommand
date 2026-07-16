"use client"

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { NotificationCenter } from './notification-center';
import { SheetContainer } from '@/components/ui/ds';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

/**
 * `desktop` = the sidebar/top-bar bell with an anchored dropdown panel.
 * `mobile` = the mobile-web ds shell: the panel opens as a bottom `SheetContainer`
 * so it never gets clipped by the far-right anchor at narrow widths. The shell
 * mounts each variant in its own responsive (`lg:hidden` / `hidden lg:*`) branch,
 * so this is a prop, not a JS breakpoint — no SSR hydration mismatch.
 */
export function NotificationBell({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function fetchUnreadCount() {
    try {
      const res = await fetch('/api/v1/carrier/notifications?unread=true&limit=1');
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently fail — badge simply won't update
    }
  }

  // Initial fetch + polling every 60s
  useEffect(() => {
    fetchUnreadCount();
    const intervalId = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  // Close the desktop dropdown when clicking outside. The mobile sheet renders
  // in a portal (outside containerRef) and owns its own backdrop/Escape close,
  // so this listener must not run for it — it would close on its own first tap.
  useEffect(() => {
    if (variant !== 'desktop' || !isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, variant]);

  function handleMarkedAllRead() {
    setUnreadCount(0);
  }

  const displayCount = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className="relative flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Bell size={20} />
        {displayCount !== null && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
            {displayCount}
          </span>
        )}
      </button>

      {variant === 'mobile' ? (
        <SheetContainer open={isOpen} onCancel={() => setIsOpen(false)} title="Notifications">
          <NotificationCenter
            variant="sheet"
            onClose={() => setIsOpen(false)}
            onMarkedAllRead={handleMarkedAllRead}
          />
        </SheetContainer>
      ) : (
        isOpen && (
          <div className="absolute right-0 top-full mt-2 z-40">
            <NotificationCenter
              variant="dropdown"
              onClose={() => setIsOpen(false)}
              onMarkedAllRead={handleMarkedAllRead}
            />
          </div>
        )
      )}
    </div>
  );
}
