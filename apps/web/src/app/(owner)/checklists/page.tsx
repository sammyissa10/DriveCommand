import Link from 'next/link';
import { BarChart2, Zap } from 'lucide-react';
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
      <div className="mt-8 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Auto-Start Rules</p>
            <p className="text-xs text-muted-foreground">Automatically start checklists when key events happen</p>
          </div>
        </div>
        <Link
          href="/checklists/automation"
          className="shrink-0 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
        >
          Manage Rules
        </Link>
      </div>
    </div>
  );
}
