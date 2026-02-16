'use client';

import { Fuel, DollarSign, Gauge, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getEfficiencyColor } from '@/lib/fuel/fuel-calculator';

interface FuelSummaryCardProps {
  totalGallons: number;
  totalCost: number;
  avgMPG: number;
  costPerMile: number;
  fillUpCount: number;
  period: number;
}

export function FuelSummaryCard({
  totalGallons,
  totalCost,
  avgMPG,
  costPerMile,
  fillUpCount,
  period,
}: FuelSummaryCardProps) {
  // Handle empty state
  if (totalGallons === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5" />
            Fleet Fuel Summary
          </CardTitle>
          <CardDescription>{period}-day overview</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Fuel className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No fuel records in this period</p>
        </CardContent>
      </Card>
    );
  }

  const mpgColor = getEfficiencyColor(avgMPG);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fuel className="h-5 w-5" />
          Fleet Fuel Summary
        </CardTitle>
        <CardDescription>{period}-day overview</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Total Gallons */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Fuel className="h-4 w-4" />
              <span>Total Gallons</span>
            </div>
            <div className="text-2xl font-bold">
              {totalGallons.toLocaleString(undefined, { maximumFractionDigits: 0 })} gal
            </div>
          </div>

          {/* Total Cost */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span>Total Cost</span>
            </div>
            <div className="text-2xl font-bold">
              ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>

          {/* Avg MPG */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gauge className="h-4 w-4" />
              <span>Avg MPG</span>
            </div>
            <div className={`text-2xl font-bold ${mpgColor}`}>
              {avgMPG.toFixed(1)} mpg
            </div>
          </div>

          {/* Cost per Mile */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span>Cost/Mile</span>
            </div>
            <div className="text-2xl font-bold">
              ${costPerMile.toFixed(2)} /mi
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {fillUpCount} fill-ups recorded
      </CardFooter>
    </Card>
  );
}
