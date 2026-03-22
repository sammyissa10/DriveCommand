'use client';

import { Leaf } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCO2 } from '@/lib/fuel/fuel-calculator';

interface EmissionsCardProps {
  trucks: Array<{
    truckId: string;
    name: string;
    licensePlate: string;
    totalGallons: number;
    co2Kg: number;
  }>;
  fleetTotalCO2: number;
  fleetTotalGallons: number;
  methodology: string;
}

export function EmissionsCard({
  trucks,
  fleetTotalCO2,
  fleetTotalGallons,
  methodology,
}: EmissionsCardProps) {
  // Handle empty state
  if (trucks.length === 0 || fleetTotalGallons === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-green-600" />
            CO2 Emissions
          </CardTitle>
          <CardDescription>Estimated environmental impact</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No emissions data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Leaf className="h-5 w-5 text-green-600" />
          CO2 Emissions
        </CardTitle>
        <CardDescription>Estimated environmental impact</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Fleet total */}
        <div className="mb-4">
          <div className="text-3xl font-bold text-green-600">
            {formatCO2(fleetTotalCO2)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {methodology}
          </div>
        </div>

        {/* Per-truck list */}
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {trucks.map((truck, index) => (
            <div
              key={truck.truckId}
              className={`flex items-center justify-between p-2 rounded ${
                index % 2 === 1 ? 'bg-muted/50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{truck.name}</div>
                <div className="text-sm text-muted-foreground">{truck.licensePlate}</div>
              </div>
              <div className="text-right ml-4">
                <div className="text-sm font-medium">{formatCO2(truck.co2Kg)}</div>
                <div className="text-xs text-muted-foreground">
                  {truck.totalGallons.toFixed(0)} gal
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
