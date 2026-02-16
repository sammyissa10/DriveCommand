import { AlertTriangle } from 'lucide-react';

interface ProfitMarginAlertProps {
  isLowMargin: boolean;
  marginPercent: number;
  threshold: number;
}

export function ProfitMarginAlert({
  isLowMargin,
  marginPercent,
  threshold,
}: ProfitMarginAlertProps) {
  // Only render if margin is low
  if (!isLowMargin) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <p className="text-sm font-medium text-amber-900">
          Low Profit Margin — This route's margin ({marginPercent.toFixed(1)}%)
          is below the {threshold}% threshold.
        </p>
      </div>
    </div>
  );
}
