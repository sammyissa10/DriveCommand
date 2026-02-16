'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

interface MPGTrendChartProps {
  data: Array<{
    date: string;
    mpg: number;
    gallons: number;
    cost: number;
  }>;
}

export function MPGTrendChart({ data }: MPGTrendChartProps) {
  // Handle empty state
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fuel Efficiency Trend</CardTitle>
          <CardDescription>Daily average MPG</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No trend data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartConfig = {
    mpg: {
      label: 'MPG',
      color: 'hsl(var(--chart-1))',
    },
  };

  // Format date for display (MM/DD)
  const formattedData = data.map((item) => ({
    ...item,
    displayDate: new Date(item.date).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
    }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel Efficiency Trend</CardTitle>
        <CardDescription>Daily average MPG</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 12 }}
            />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="mpg"
              stroke="var(--color-mpg)"
              strokeWidth={2}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
