'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MapPin, ClipboardList, MessageSquare, LayoutGrid, DollarSign } from 'lucide-react';

const navItems = [
  { href: '/home', label: 'Dashboard', icon: Home, exact: true },
  { href: '/my-route', label: 'Route', icon: MapPin, exact: false },
  { href: '/pay', label: 'Pay', icon: DollarSign, exact: false },
  { href: '/messages', label: 'Messages', icon: MessageSquare, exact: false },
  { href: '/more', label: 'More', icon: LayoutGrid, exact: false },
];

export function DriverBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Driver navigation"
    >
      <div className="flex items-stretch">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center min-h-[60px] flex-1 gap-0.5 transition-colors ${
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
