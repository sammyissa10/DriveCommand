'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, Users, Truck, Route as RouteIcon } from 'lucide-react';

const navItems = [
  { href: '/carrier/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/loads', label: 'Loads', icon: Package, exact: false },
  { href: '/drivers', label: 'Drivers', icon: Users, exact: false },
  { href: '/trucks', label: 'Trucks', icon: Truck, exact: false },
  { href: '/routes', label: 'Routes', icon: RouteIcon, exact: false },
];

export function OwnerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Owner navigation"
    >
      <div className="flex items-stretch">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
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
