'use client';

import { Trophy, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getScoreColor, getScoreLabel } from '@/lib/safety/score-calculator';

interface DriverLeaderboardProps {
  rankings: Array<{
    truckId: string;
    name: string;
    licensePlate: string;
    score: number;
    totalEvents: number;
  }>;
}

export function DriverLeaderboard({ rankings }: DriverLeaderboardProps) {
  // Handle empty state
  if (rankings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Safety Rankings</CardTitle>
          <CardDescription>Ranked by safety score, best to worst</CardDescription>
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
        <CardTitle>Vehicle Safety Rankings</CardTitle>
        <CardDescription>Ranked by safety score, best to worst</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rankings.map((truck, index) => {
            const rank = index + 1;
            const scoreColor = getScoreColor(truck.score);
            const scoreLabel = getScoreLabel(truck.score);
            const isTopPerformer = rank <= 3;
            const isLowPerformer = truck.score < 60;

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

                {/* Score and warning indicator */}
                <div className="flex items-center gap-3">
                  {/* Score */}
                  <div className="text-right">
                    <div className={`text-lg font-bold ${scoreColor}`}>{truck.score}</div>
                    <div className="text-xs text-muted-foreground">{scoreLabel}</div>
                  </div>

                  {/* Low performer warning */}
                  {isLowPerformer && (
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                  )}
                </div>

                {/* Events count */}
                <div className="ml-4 text-sm text-muted-foreground whitespace-nowrap">
                  {truck.totalEvents} event{truck.totalEvents !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
