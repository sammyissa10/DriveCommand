import { AlertTriangle } from 'lucide-react';

interface RouteFinancialSummaryProps {
  totalExpenses: string;
  totalRevenue: string;
  totalPaidRevenue: string;
  totalPendingRevenue: string;
  profit: string;
  marginPercent: number;
  isLowMargin: boolean;
}

function formatCurrency(amount: string): string {
  const num = parseFloat(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function RouteFinancialSummary({
  totalExpenses,
  totalRevenue,
  totalPaidRevenue,
  totalPendingRevenue,
  profit,
  marginPercent,
  isLowMargin,
}: RouteFinancialSummaryProps) {
  const profitNum = parseFloat(profit);
  const isNegative = profitNum < 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-card-foreground mb-4">
        Financial Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Revenue */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">
            Total Revenue
          </div>
          <div className="text-2xl font-bold text-foreground">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatCurrency(totalPaidRevenue)} paid / {formatCurrency(totalPendingRevenue)} pending
          </div>
        </div>

        {/* Total Expenses */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">
            Total Expenses
          </div>
          <div className="text-2xl font-bold text-foreground">
            {formatCurrency(totalExpenses)}
          </div>
        </div>

        {/* Profit */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">Profit</div>
          <div
            className={`text-2xl font-bold ${
              isNegative
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            }`}
          >
            {formatCurrency(profit)}
          </div>
        </div>

        {/* Margin */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">Margin</div>
          <div className="flex items-center gap-2">
            <div
              className={`text-2xl font-bold ${
                isLowMargin
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-foreground'
              }`}
            >
              {marginPercent.toFixed(2)}%
            </div>
            {isLowMargin && (
              <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">Below threshold</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
