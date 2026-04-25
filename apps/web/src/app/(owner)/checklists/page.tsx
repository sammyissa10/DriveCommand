import Link from 'next/link';
import { BarChart2 } from 'lucide-react';
import { DashboardClient } from './_components/DashboardClient';

export const dynamic = 'force-dynamic';

export default function ChecklistsPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Checklists &amp; Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build reusable checklists for driver onboarding, vehicle inspections, partner setup, and more.
          </p>
        </div>
        <Link
          href="/checklists/analytics"
          className="shrink-0 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
        >
          <BarChart2 className="h-4 w-4" />
          Analytics
        </Link>
      </div>
      <DashboardClient />
    </div>
  );
}
