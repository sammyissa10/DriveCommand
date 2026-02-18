import { IncidentReportForm } from '@/components/driver/incident-report-form';

export default function DriverIncidentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Incident Report</h1>
        <p className="mt-1 text-muted-foreground">
          Report incidents, accidents, or safety concerns
        </p>
      </div>
      <IncidentReportForm />
    </div>
  );
}
