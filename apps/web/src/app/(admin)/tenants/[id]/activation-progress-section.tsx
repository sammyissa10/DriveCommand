import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/db/prisma';

interface Props {
  tenantId: string;
}

const MILESTONES = [
  { field: 'accountCreatedAt', label: 'Account Created' },
  { field: 'firstRealTruckAt', label: 'First Truck Added' },
  { field: 'firstRealDriverAt', label: 'First Driver Added' },
  { field: 'firstRealClientAt', label: 'First Client Added' },
  { field: 'firstLoadInTransitAt', label: 'First Load Dispatched' },
  { field: 'firstLoadDeliveredAt', label: 'First Load Delivered' },
] as const;

type MilestoneField = (typeof MILESTONES)[number]['field'];

export async function ActivationProgressSection({ tenantId }: Props) {
  const progress = await prisma.activationProgress.findUnique({
    where: { tenantId },
  });

  if (!progress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Activation Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">No activation progress record found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          Activation Progress
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            progress.isActivated ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {progress.completionPct}% — {progress.isActivated ? 'Activated' : 'In Progress'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {MILESTONES.map(({ field, label }) => {
          const value = progress[field as MilestoneField] as Date | null;
          return (
            <div key={field} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className={value ? 'text-green-500' : 'text-gray-300'}>
                  {value ? '✓' : '○'}
                </span>
                <span className={value ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
              </span>
              <span className="text-xs text-gray-400">
                {value ? new Date(value).toLocaleDateString() : '—'}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
