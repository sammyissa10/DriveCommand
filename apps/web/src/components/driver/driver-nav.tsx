'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MapPin, ClipboardList, MessageSquare, LayoutGrid } from 'lucide-react';

const navItems = [
  { href: '/home', label: 'Dashboard', icon: Home, exact: true },
  { href: '/my-route', label: 'My Route', icon: MapPin, exact: false },
  { href: '/tasks', label: 'Tasks', icon: ClipboardList, exact: false },
  { href: '/messages', label: 'Messages', icon: MessageSquare, exact: false },
  { href: '/more', label: 'More', icon: LayoutGrid, exact: false },
];

export function DriverNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden lg:flex gap-1 overflow-x-auto px-6 pb-2">
      {navItems.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
