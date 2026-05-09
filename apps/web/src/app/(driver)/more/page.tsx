import Link from 'next/link';
import { Package, Clock, FileText, AlertTriangle, LifeBuoy, ChevronRight } from 'lucide-react';
import { DriverSignOutButton } from '@/components/driver/driver-sign-out-button';

export const dynamic = 'force-dynamic';

const menuItems = [
  {
    href: '/my-load',
    label: 'My Load',
    description: 'View your current load details',
    icon: Package,
    iconClass: 'text-sky-600 dark:text-sky-400',
    bgClass: 'bg-sky-50 dark:bg-sky-950',
  },
  {
    href: '/hours',
    label: 'Hours of Service',
    description: 'View your HOS logs and duty status',
    icon: Clock,
    iconClass: 'text-purple-600 dark:text-purple-400',
    bgClass: 'bg-purple-50 dark:bg-purple-950',
  },
  {
    href: '/documents',
    label: 'Documents',
    description: 'View and upload compliance documents',
    icon: FileText,
    iconClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-50 dark:bg-orange-950',
  },
  {
    href: '/incidents',
    label: 'Report Incident',
    description: 'Submit a new incident report',
    icon: AlertTriangle,
    iconClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-950',
  },
  {
    href: '/my-tickets',
    label: 'Support Tickets',
    description: 'View and submit support requests',
    icon: LifeBuoy,
    iconClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-50 dark:bg-blue-950',
  },
];

/**
 * More menu — additional driver portal navigation.
 * Hours, Documents, Incidents, Support, and Log Out.
 */
export default function DriverMorePage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">More</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hours, documents, support, and account options.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {menuItems.map(({ href, label, description, icon: Icon, iconClass, bgClass }) => (
          <Link
            key={`${href}-${label}`}
            href={href}
            className="flex items-center gap-4 bg-card rounded-lg border border-border px-4 py-3 min-h-[52px] hover:bg-muted/50 active:scale-[0.99] transition-all group"
          >
            <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${bgClass}`}>
              <Icon className={`h-5 w-5 ${iconClass}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </Link>
        ))}

        {/* Sign Out */}
        <div className="mt-4">
          <DriverSignOutButton />
        </div>
      </div>
    </div>
  );
}
