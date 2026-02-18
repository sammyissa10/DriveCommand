import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { ProfitPredictorForm } from '@/components/profit-predictor/profit-predictor-form';

export const fetchCache = 'force-no-store';

export default async function ProfitPredictorPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profit Predictor</h1>
        <p className="text-muted-foreground mt-1">
          Estimate load profitability before accepting — based on historical lane data and fleet cost averages
        </p>
      </div>
      <ProfitPredictorForm />
    </div>
  );
}
