'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Truck, Package, Home, Map, LayoutGrid } from 'lucide-react';
import { OwnerMoreMenu } from '@/components/navigation/owner-more-menu';

const moreMenuPaths = [
  '/carrier/clients',
  '/carrier/contracts',
  '/carrier/templates',
  '/carrier/fleet',
  '/carrier/facilities',
  '/carrier/reports',
  '/ai-documents',
  '/settings',
  '/support',
];

export function OwnerBottomNav() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isOnMorePage = moreMenuPaths.some((p) => pathname.startsWith(p));

  type Tab = {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact: boolean;
    center?: boolean;
  };

  const tabs: Tab[] = [
    {
      href: '/carrier/dispatches',
      label: 'Trips',
      icon: Truck,
      exact: false,
    },
    {
      href: '/carrier/loads',
      label: 'Loads',
      icon: Package,
      exact: false,
    },
    {
      href: '/carrier/dashboard',
      label: 'Dashboard',
      icon: Home,
      exact: true,
      center: true,
    },
    {
      href: '/live-map',
      label: 'Live Map',
      icon: Map,
      exact: false,
    },
  ];

  return (
    <>
      <OwnerMoreMenu isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />

      <nav
        data-tour="tabs"
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-slate-900 shadow-[0_-2px_10px_rgba(0,0,0,0.3)] pb-[env(safe-area-inset-bottom)]"
        aria-label="Owner navigation"
      >
        <div className="flex items-stretch min-h-[60px]">
          {tabs.map(({ href, label, icon: Icon, exact, center }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors py-2 ${
                  isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={center ? 'h-6 w-6 shrink-0' : 'h-5 w-5 shrink-0'} />
                <span className="text-[10px] font-medium leading-tight">{label}</span>
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setIsMoreOpen(true)}
            className={`flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors py-2 ${
              isMoreOpen || isOnMorePage ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
            }`}
            aria-label="More menu"
          >
            <LayoutGrid className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium leading-tight">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
