import { DashboardClient } from './_components/DashboardClient';

export const dynamic = 'force-dynamic';

export default function ChecklistsPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Checklists &amp; Workflows</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Build reusable checklists for driver onboarding, vehicle inspections, partner setup, and more.
        </p>
      </div>
      <DashboardClient />
    </div>
  );
}
