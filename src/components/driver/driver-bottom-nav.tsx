'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MapPin, Package, MessageSquare, Clock, AlertTriangle, LifeBuoy } from 'lucide-react';

const navItems = [
  { href: '/my-route', label: 'Route', icon: MapPin },
  { href: '/my-load', label: 'Load', icon: Package },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/hours', label: 'Hours', icon: Clock },
  { href: '/incidents', label: 'Report', icon: AlertTriangle },
  { href: '/my-tickets', label: 'Support', icon: LifeBuoy },
];

export function DriverBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Driver navigation"
    >
      <div className="flex items-stretch">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center min-h-[56px] flex-1 gap-0.5 transition-colors ${
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
