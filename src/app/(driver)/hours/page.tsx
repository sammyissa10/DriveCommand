import { getDriverHOS } from '@/app/(driver)/actions/driver-hos';
import { HOSDashboard } from '@/components/driver/hos-dashboard';

export default async function DriverHoursPage() {
  const hosData = await getDriverHOS();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Hours of Service</h1>
        <p className="mt-1 text-muted-foreground">
          Track your driving hours and duty status
        </p>
      </div>
      <HOSDashboard hosData={hosData} />
    </div>
  );
}
