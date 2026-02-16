'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Label, Cell } from 'recharts';

interface EventDistributionChartProps {
  byType: Array<{ eventType: string; label: string; count: number }>;
  bySeverity: Array<{ severity: string; label: string; count: number; fill: string }>;
}

export function EventDistributionChart({ byType, bySeverity }: EventDistributionChartProps) {
  // Handle empty state
  if (byType.length === 0 && bySeverity.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Safety Events</CardTitle>
          <CardDescription>Distribution by type and severity</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No safety events recorded</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate total events for donut center label
  const totalEvents = bySeverity.reduce((sum, item) => sum + item.count, 0);

  // Chart configs
  const typeChartConfig = {
    count: {
      label: 'Events',
      color: 'hsl(var(--chart-1))',
    },
  };

  const severityChartConfig = {
    low: {
      label: 'Low',
      color: 'hsl(var(--chart-2))',
    },
    medium: {
      label: 'Medium',
      color: 'hsl(var(--chart-3))',
    },
    high: {
      label: 'High',
      color: 'hsl(var(--chart-4))',
    },
    critical: {
      label: 'Critical',
      color: 'hsl(var(--chart-5))',
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Safety Events</CardTitle>
        <CardDescription>Distribution by type and severity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bar chart: events by type */}
          {byType.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">By Event Type</h4>
              <ChartContainer config={typeChartConfig} className="min-h-[300px] w-full">
                <BarChart data={byType} layout="vertical">
                  <XAxis type="number" />
                  <YAxis dataKey="label" type="category" width={140} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            </div>
          )}

          {/* Donut chart: events by severity */}
          {bySeverity.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">By Severity</h4>
              <ChartContainer config={severityChartConfig} className="min-h-[300px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={bySeverity}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={60}
                    strokeWidth={5}
                  >
                    {bySeverity.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={viewBox.cy}
                                className="fill-foreground text-3xl font-bold"
                              >
                                {totalEvents}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 24}
                                className="fill-muted-foreground"
                              >
                                Events
                              </tspan>
                            </text>
                          );
                        }
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
