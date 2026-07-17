'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  ChevronRight,
  Users2,
  FileText,
  CalendarDays,
  Truck,
  Boxes,
  BarChart3,
  Receipt,
  DollarSign,
  Shield,
  LifeBuoy,
  LogOut,
} from 'lucide-react';

interface MenuSection {
  label: string;
  items: {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const menuSections: MenuSection[] = [
  {
    label: 'Carrier Ops',
    items: [
      { label: 'Clients', href: '/carrier/clients', icon: Users2 },
      { label: 'Contracts', href: '/carrier/contracts', icon: FileText },
      { label: 'Templates', href: '/carrier/templates', icon: CalendarDays },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { label: 'Carrier Drivers', href: '/carrier/fleet/drivers', icon: Users2 },
      { label: 'Carrier Trucks', href: '/carrier/fleet/trucks', icon: Truck },
      { label: 'Facilities', href: '/carrier/facilities', icon: Boxes },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices', href: '/invoices', icon: Receipt },
      { label: 'Payroll', href: '/payroll', icon: DollarSign },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Revenue', href: '/carrier/reports/revenue', icon: BarChart3 },
      { label: 'Driver Pay', href: '/carrier/reports/driver-pay', icon: BarChart3 },
      { label: 'Performance', href: '/carrier/reports/performance', icon: BarChart3 },
    ],
  },
  {
    label: 'Other',
    items: [
      { label: 'Team Permissions', href: '/settings/team-permissions', icon: Shield },
      { label: 'Support', href: '/support', icon: LifeBuoy },
    ],
  },
];

interface OwnerMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OwnerMoreMenu({ isOpen, onClose }: OwnerMoreMenuProps) {
  const pathname = usePathname();
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950"
      aria-label="More menu"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <span className="text-base font-semibold text-white">More</span>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {menuSections.map((section) => (
          <div key={section.label} className="mt-4">
            <div className="px-4 pb-2">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                {section.label}
              </span>
            </div>
            <div className="border-t border-slate-800">
              {section.items.map(({ label, href, icon: Icon }) => {
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={`flex items-center justify-between px-4 py-3 border-b border-slate-800 transition-colors ${
                      isActive
                        ? 'text-blue-400 bg-slate-900'
                        : 'text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Log Out */}
        <div className="mt-6 px-4 pb-6">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex w-full items-center justify-center gap-2 py-3 px-4 rounded-lg border border-red-900 text-red-400 hover:bg-red-950 active:bg-red-950 transition-colors disabled:opacity-60 text-sm font-medium"
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? 'Signing out...' : 'Log Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
