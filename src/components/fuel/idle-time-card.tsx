'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis } from 'recharts';

interface IdleTimeCardProps {
  data: Array<{
    truckId: string;
    name: string;
    licensePlate: string;
    totalPoints: number;
    idlePoints: number;
    movingPoints: number;
    idlePercent: number;
    estimatedIdleCost: number;
  }>;
}

export function IdleTimeCard({ data }: IdleTimeCardProps) {
  // Handle empty state
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Idle Time Analysis</CardTitle>
          <CardDescription>Time spent idling vs. moving</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No idle time data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartConfig = {
    idle: {
      label: 'Idle %',
      color: 'hsl(var(--chart-3))',
    },
  };

  // Calculate fleet average and total cost
  const fleetAvgIdle = data.reduce((sum, truck) => sum + truck.idlePercent, 0) / data.length;
  const totalIdleCost = data.reduce((sum, truck) => sum + truck.estimatedIdleCost, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Idle Time Analysis</CardTitle>
        <CardDescription>Time spent idling vs. moving</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart data={data} layout="vertical">
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="grid gap-2">
                        <div className="font-medium">{data.name}</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <span className="text-muted-foreground">Idle:</span>
                          <span className="font-medium">{data.idlePercent}%</span>
                          <span className="text-muted-foreground">Cost:</span>
                          <span className="font-medium">${data.estimatedIdleCost.toFixed(2)}</span>
                          <span className="text-muted-foreground">Points:</span>
                          <span className="font-medium">{data.idlePoints}/{data.totalPoints}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="idlePercent"
              fill="var(--color-idle)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>

        {/* Summary below chart */}
        <div className="mt-4 pt-4 border-t flex justify-between text-sm">
          <div>
            <span className="text-muted-foreground">Fleet Average Idle:</span>
            <span className="ml-2 font-medium">{fleetAvgIdle.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Estimated Cost:</span>
            <span className="ml-2 font-medium">${totalIdleCost.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
