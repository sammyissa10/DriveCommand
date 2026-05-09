"use client"

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { NotificationCenter } from './notification-center';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export function NotificationBell() {
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

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function handleMarkedAllRead() {
    setUnreadCount(0);
  }

  const displayCount = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div ref={containerRef} className="relative z-[1001]">
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

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-[1001]">
          <NotificationCenter
            onClose={() => setIsOpen(false)}
            onMarkedAllRead={handleMarkedAllRead}
          />
        </div>
      )}
    </div>
  );
}
