'use client';

import { Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getScoreColor, getScoreLabel } from '@/lib/safety/score-calculator';
import { SafetyEventSeverity } from '@/generated/prisma';

interface SafetyScoreCardProps {
  score: number;
  totalEvents: number;
  eventsBySeverity: Record<SafetyEventSeverity, number>;
  period: number;
}

export function SafetyScoreCard({ score, totalEvents, eventsBySeverity, period }: SafetyScoreCardProps) {
  // Handle empty state
  if (totalEvents === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Fleet Safety Score
          </CardTitle>
          <CardDescription>Last {period} days</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No safety events recorded</p>
        </CardContent>
      </Card>
    );
  }

  const scoreColor = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Fleet Safety Score
        </CardTitle>
        <CardDescription>Last {period} days</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        {/* Large score display */}
        <div className="flex flex-col items-center gap-2">
          <div className={`text-6xl font-bold ${scoreColor}`}>
            {score}
          </div>
          <div className="text-lg font-medium text-muted-foreground">
            {scoreLabel}
          </div>
        </div>

        {/* Total events count */}
        <div className="text-sm text-muted-foreground">
          {totalEvents} event{totalEvents !== 1 ? 's' : ''} recorded
        </div>

        {/* Severity breakdown badges */}
        <div className="flex flex-wrap gap-2 justify-center">
          <Badge variant="outline" className="border-gray-300">
            <span className="text-muted-foreground mr-1">LOW</span>
            <span className="font-semibold">{eventsBySeverity.LOW}</span>
          </Badge>
          <Badge variant="secondary">
            <span className="text-muted-foreground mr-1">MEDIUM</span>
            <span className="font-semibold">{eventsBySeverity.MEDIUM}</span>
          </Badge>
          <Badge variant="destructive" className="bg-orange-500 hover:bg-orange-600">
            <span className="mr-1">HIGH</span>
            <span className="font-semibold">{eventsBySeverity.HIGH}</span>
          </Badge>
          <Badge variant="destructive">
            <span className="mr-1">CRITICAL</span>
            <span className="font-semibold">{eventsBySeverity.CRITICAL}</span>
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
