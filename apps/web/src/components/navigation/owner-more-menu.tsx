'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/lib/auth/roles';
import { hasPermission, type UserPermissions } from '@/lib/auth/permissions';
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

interface MenuItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Same permission key the desktop sidebar gates this destination on. */
  permission?: keyof UserPermissions;
  /** OWNER_ONLY_PATHS in middleware.ts — MANAGER is redirected away regardless. */
  ownerOnly?: boolean;
}

interface MenuSection {
  label: string;
  items: MenuItem[];
}

/**
 * ─── PERMISSIONS (quick-554) ────────────────────────────────────────────────
 *
 * Until quick-554 this file imported no auth at all and EVERY item here was
 * ungated — not just Reports. A manager whose owner had switched Revenue off saw
 * no Revenue link on a laptop and a Revenue link on a phone, and the same was
 * true of Clients, Contracts, Templates, Drivers, Trucks and Facilities.
 *
 * The `permission` key on each item is the SAME key the desktop sidebar uses for
 * the same href, and both now resolve it through the same `hasPermission()` the
 * middleware and the report APIs use. Two navigation surfaces disagreeing about
 * who may see what is not a cosmetic difference — it is two answers to one
 * question, and the phone was giving the more generous one.
 *
 * Deliberate alignment changes, not incidental:
 *  - AR Aging: quick-554 ADDED it here to align with the sidebar, which was
 *    then the one surface offering it. quick-566 REMOVED the sidebar entry;
 *    quick-567 removes this one too, so the two surfaces agree again — now at
 *    "no nav entry, direct URL only" rather than at "both have it". The route,
 *    page, API, the `arAgingReport` permission key and its
 *    `PERMISSION_GATED_PATHS` row are all untouched — `/carrier/reports/aging`
 *    still works for a permitted owner, just unlinked. Restoring it is
 *    re-adding the one line below, in the same one-line-reversible shape
 *    quick-566 used on the sidebar.
 *  - Team Permissions is marked `ownerOnly`. `OWNER_ONLY_PATHS` in middleware.ts
 *    redirects a MANAGER away from `/settings/team-permissions` outright, so this
 *    menu was showing managers a link that bounces them to the dashboard.
 *
 * Ungated entries are ungated on the desktop side too — Invoices, Payroll and
 * Support have no permission key in `UserPermissions` at all, and `/support` is
 * documented there as always accessible to managers. Leaving them without a key
 * matches the model rather than inventing one.
 */
const menuSections: MenuSection[] = [
  {
    label: 'Carrier Ops',
    items: [
      { label: 'Clients', href: '/carrier/clients', icon: Users2, permission: 'clients' },
      { label: 'Contracts', href: '/carrier/contracts', icon: FileText, permission: 'contracts' },
      { label: 'Templates', href: '/carrier/templates', icon: CalendarDays, permission: 'templates' },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { label: 'Carrier Drivers', href: '/carrier/fleet/drivers', icon: Users2, permission: 'carrierDrivers' },
      { label: 'Carrier Trucks', href: '/carrier/fleet/trucks', icon: Truck, permission: 'carrierTrucks' },
      { label: 'Facilities', href: '/carrier/facilities', icon: Boxes, permission: 'facilities' },
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
      { label: 'Revenue', href: '/carrier/reports/revenue', icon: BarChart3, permission: 'revenueReport' },
      { label: 'Driver Pay', href: '/carrier/reports/driver-pay', icon: BarChart3, permission: 'driverPayReport' },
      // AR Aging is deliberately absent — quick-567. Route, page, API, the
      // arAgingReport permission key and its PERMISSION_GATED_PATHS row are all
      // untouched; only this nav entry is gone, matching the sidebar
      // (quick-566). Reversing this is one line:
      // { label: 'AR Aging', href: '/carrier/reports/aging', icon: BarChart3, permission: 'arAgingReport' },
      { label: 'Performance', href: '/carrier/reports/performance', icon: BarChart3, permission: 'performanceReport' },
      // Shares `performanceReport` — see PERMISSION_GATED_PATHS and the report
      // page's own header for why it is not a key of its own.
      { label: "Today's Trips", href: '/carrier/reports/todays-trips', icon: BarChart3, permission: 'performanceReport' },
    ],
  },
  {
    label: 'Other',
    items: [
      { label: 'Team Permissions', href: '/settings/team-permissions', icon: Shield, ownerOnly: true },
      { label: 'Support', href: '/support', icon: LifeBuoy },
    ],
  },
];

/**
 * Which sections this viewer may see — pure, exported, and unit-tested in
 * `__tests__/owner-more-menu-permissions.test.ts`.
 *
 * Lifted out of the component body because the MANAGER cases are the ones that
 * matter and they cannot be reached from a browser here: proving them would mean
 * creating a restricted manager, and quick-554 may not change data. A pure
 * function over (role, permissions, isLoaded) can be asserted directly, which is
 * better evidence than a browser check that only ever exercises an owner.
 */
export function visibleMenuSections(
  sections: MenuSection[],
  viewer: { role: string; permissions: UserPermissions | null; isLoaded: boolean }
): MenuSection[] {
  if (!viewer.isLoaded) return sections;

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.ownerOnly && viewer.role !== UserRole.OWNER) return false;
        if (item.permission && !hasPermission(viewer.permissions, item.permission, viewer.role)) {
          return false;
        }
        return true;
      }),
    }))
    // A header over an empty list reads as a loading failure rather than as
    // "you may not see this", so an emptied section is dropped outright.
    .filter((section) => section.items.length > 0);
}

/** Exported for the test only — the component always filters the real list. */
export const OWNER_MORE_MENU_SECTIONS = menuSections;

interface OwnerMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OwnerMoreMenu({ isOpen, onClose }: OwnerMoreMenuProps) {
  const pathname = usePathname();
  const { user, isLoaded } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const role = user?.role ?? '';
  const permissions = (user?.permissions as UserPermissions | undefined) ?? null;

  /**
   * THE FILTER FAILS OPEN, DELIBERATELY.
   *
   * `useAuth()` starts at `{ user: null, isLoaded: false }` and only resolves
   * after `AuthProvider`'s fetch of `/api/auth/me` lands. Filtering during that
   * window would hide EVERY gated item, because `hasPermission(null, key, '')`
   * is false for an empty role — so an owner opening More on a slow connection
   * would get a menu containing Invoices, Payroll and Support and nothing else.
   * That was observed, not imagined: it is what this component did on the first
   * build of this change, and on a phone the More menu IS the navigation.
   *
   * "Not loaded yet" and "you may not see this" are different facts and must not
   * share a rendering — the same conflation as Phase 11's `.catch(() => [])`,
   * where a failed query rendered as a confident "No trucks yet".
   *
   * Failing open is safe here in a way it would NOT have been before this task:
   * the permission gate now lives in middleware and in every report API, so an
   * unfiltered link is a link to a redirect, not to data. That is exactly the
   * point of "UI gating must never be the only gate" — once the UI is no longer
   * load-bearing, it is free to fail in the direction that keeps the app usable.
   */
  const visibleSections = visibleMenuSections(menuSections, { role, permissions, isLoaded });

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
        {visibleSections.map((section) => (
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
