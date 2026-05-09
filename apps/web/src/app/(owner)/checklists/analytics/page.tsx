import { AnalyticsDashboard } from './_components/AnalyticsDashboard';

export const metadata = { title: 'Workflow Analytics — DriveCommand' };

export default function ChecklistAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workflow Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Completion rates, average times, and step drop-off across your playbooks.
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
