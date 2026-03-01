import { getDriverHOS } from '@/app/(driver)/actions/driver-hos';
import { HOSDashboard } from '@/components/driver/hos-dashboard';

export default async function DriverHoursPage() {
  let hosData: Awaited<ReturnType<typeof getDriverHOS>> | null = null;
  try {
    hosData = await getDriverHOS();
  } catch (err) {
    console.error('[DriverHoursPage] Failed to fetch HOS data:', err);
  }

  if (!hosData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hours of Service</h1>
          <p className="mt-1 text-muted-foreground">
            Unable to load HOS data. Please try again.
          </p>
        </div>
      </div>
    );
  }

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
