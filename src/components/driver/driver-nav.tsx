'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Route, Package, MessageSquare, Clock, AlertTriangle, LifeBuoy } from 'lucide-react';

const navItems = [
  { href: '/my-route', label: 'My Route', icon: Route },
  { href: '/my-load', label: 'My Load', icon: Package },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/hours', label: 'Hours', icon: Clock },
  { href: '/incidents', label: 'Report', icon: AlertTriangle },
  { href: '/my-tickets', label: 'Support', icon: LifeBuoy },
];

export function DriverNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-6 pb-2">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
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
