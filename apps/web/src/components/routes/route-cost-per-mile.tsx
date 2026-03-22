import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface RouteCostPerMileProps {
  costPerMile: string | null;
  miles: number | null;
  fleetAverage: string | null;
  fleetRouteCount: number;
  comparison: 'above' | 'below' | 'equal' | 'unknown';
  difference: string | null;
  differencePercent: number | null;
}

export function RouteCostPerMile({
  costPerMile,
  miles,
  fleetAverage,
  fleetRouteCount,
  comparison,
  difference,
  differencePercent,
}: RouteCostPerMileProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-card-foreground mb-4">
        Cost Per Mile Analysis
      </h2>

      {costPerMile === null ? (
        <div className="text-center py-8">
          <p className="text-2xl font-semibold text-muted-foreground mb-2">
            Cost Per Mile: N/A
          </p>
          <p className="text-sm text-muted-foreground">
            Add start and end odometer readings to calculate cost per mile.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Route Cost Per Mile */}
          <div>
            <p className="text-sm text-muted-foreground mb-1">Route Cost Per Mile</p>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-bold text-foreground">
                ${costPerMile}
                <span className="text-lg text-muted-foreground">/mi</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {miles} miles traveled
            </p>
          </div>

          {/* Fleet Average Comparison */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Fleet Average</p>
              <p className="text-lg font-semibold text-foreground">
                {fleetAverage !== null ? (
                  <>
                    ${fleetAverage}
                    <span className="text-sm text-muted-foreground">/mi</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">N/A</span>
                )}
              </p>
            </div>

            {fleetAverage !== null && fleetRouteCount > 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                (based on {fleetRouteCount} completed{' '}
                {fleetRouteCount === 1 ? 'route' : 'routes'})
              </p>
            )}

            {fleetAverage === null && (
              <p className="text-xs text-muted-foreground mb-3">
                No completed routes with distance data
              </p>
            )}

            {/* Comparison Indicator */}
            {comparison === 'below' && differencePercent !== null && (
              <div className="flex items-center gap-2 text-green-600">
                <TrendingDown className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {Math.abs(differencePercent).toFixed(1)}% below fleet average
                </span>
              </div>
            )}

            {comparison === 'above' && differencePercent !== null && (
              <div className="flex items-center gap-2 text-red-600">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {Math.abs(differencePercent).toFixed(1)}% above fleet average
                </span>
              </div>
            )}

            {comparison === 'equal' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Minus className="h-5 w-5" />
                <span className="text-sm font-medium">At fleet average</span>
              </div>
            )}

            {comparison === 'unknown' && fleetAverage !== null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm font-medium">
                  Insufficient data for comparison
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
