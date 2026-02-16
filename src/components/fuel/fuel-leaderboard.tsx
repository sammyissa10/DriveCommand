'use client';

import { Trophy, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEfficiencyColor, getEfficiencyLabel } from '@/lib/fuel/fuel-calculator';

interface FuelLeaderboardProps {
  rankings: Array<{
    truckId: string;
    name: string;
    licensePlate: string;
    mpg: number;
    totalGallons: number;
    totalCost: number;
    totalMiles: number;
    costPerMile: number;
    fillUpCount: number;
  }>;
}

export function FuelLeaderboard({ rankings }: FuelLeaderboardProps) {
  // Handle empty state
  if (rankings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fuel Efficiency Rankings</CardTitle>
          <CardDescription>Fleet performance by MPG</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No vehicles found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel Efficiency Rankings</CardTitle>
        <CardDescription>Fleet performance by MPG</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rankings.map((truck, index) => {
            const rank = index + 1;
            const mpgColor = truck.fillUpCount > 0 ? getEfficiencyColor(truck.mpg) : 'text-muted-foreground';
            const mpgLabel = truck.fillUpCount > 0 ? getEfficiencyLabel(truck.mpg) : 'N/A';
            const isTopPerformer = rank <= 3 && truck.fillUpCount > 0;
            const isLowPerformer = truck.mpg < 4 && truck.fillUpCount > 0;

            return (
              <div
                key={truck.truckId}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  index % 2 === 1 ? 'bg-muted/50' : ''
                }`}
              >
                {/* Rank and truck info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Rank number */}
                  <div className={`flex items-center justify-center min-w-[2rem] ${isTopPerformer ? 'font-bold' : ''}`}>
                    {isTopPerformer && <Trophy className="h-4 w-4 text-yellow-500 mr-1" />}
                    {rank}
                  </div>

                  {/* Truck details */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{truck.name}</div>
                    <div className="text-sm text-muted-foreground">{truck.licensePlate}</div>
                  </div>
                </div>

                {/* MPG and warning indicator */}
                <div className="flex items-center gap-3">
                  {/* MPG */}
                  <div className="text-right">
                    <div className={`text-lg font-bold ${mpgColor}`}>
                      {truck.fillUpCount > 0 ? truck.mpg.toFixed(1) : 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground">{mpgLabel}</div>
                  </div>

                  {/* Low performer warning */}
                  {isLowPerformer && (
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                  )}
                </div>

                {/* Cost per mile */}
                <div className="ml-4 text-sm text-muted-foreground whitespace-nowrap">
                  {truck.fillUpCount > 0 ? `$${truck.costPerMile.toFixed(2)}/mi` : 'No data'}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
