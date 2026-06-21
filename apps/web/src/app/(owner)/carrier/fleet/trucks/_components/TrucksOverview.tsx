'use client';

import { useMemo, useState } from 'react';
import { differenceInDays } from 'date-fns';
import { TruckKPIStrip } from './TruckKPIStrip';
import { TruckStatusTabs, type TruckStatusFilter } from './TruckStatusTabs';
import { TrucksGrid } from '../_grid/TrucksGrid';
import type { TruckRow, TruckKPIData, TruckStatusCounts } from '../_grid/types';

/**
 * TrucksOverview — Client wrapper for trucks overview with KPIs, tabs, and grid.
 *
 * Handles:
 * - KPI calculation from truck data
 * - Status filtering
 * - Passing filtered data to TrucksGrid
 */

interface TrucksOverviewProps {
  trucks: TruckRow[];
}

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function TrucksOverview({ trucks }: TrucksOverviewProps) {
  const [statusFilter, setStatusFilter] = useState<TruckStatusFilter>('all');

  // Calculate KPI data
  const kpiData: TruckKPIData = useMemo(() => {
    let activeCompliant = 0;
    let expiringSoon = 0;
    let needsAction = 0;

    for (const truck of trucks) {
      const regDays = daysUntil(truck.registrationExpiry);
      const licDays = daysUntil(truck.licenseExpiry);
      const insDays = daysUntil(truck.insuranceExpiry);

      const isExpired =
        (regDays !== null && regDays < 0) ||
        (licDays !== null && licDays < 0) ||
        (insDays !== null && insDays < 0);

      const isExpiringSoon =
        (regDays !== null && regDays >= 0 && regDays <= 30) ||
        (licDays !== null && licDays >= 0 && licDays <= 30) ||
        (insDays !== null && insDays >= 0 && insDays <= 30);

      const isActive = truck.status === 'active';

      if (isExpired || truck.status === 'out_of_service') {
        needsAction++;
      } else if (isExpiringSoon) {
        expiringSoon++;
      } else if (isActive) {
        activeCompliant++;
      }
    }

    return {
      totalFleet: trucks.length,
      activeCompliant,
      expiringSoon,
      needsAction,
    };
  }, [trucks]);

  // Calculate status counts
  const statusCounts: TruckStatusCounts = useMemo(() => {
    const counts = {
      all: trucks.length,
      active: 0,
      maintenance: 0,
      out_of_service: 0,
    };

    for (const truck of trucks) {
      if (truck.status === 'active') counts.active++;
      else if (truck.status === 'maintenance') counts.maintenance++;
      else if (truck.status === 'out_of_service') counts.out_of_service++;
    }

    return counts;
  }, [trucks]);

  // Filter trucks by status
  const filteredTrucks = useMemo(() => {
    if (statusFilter === 'all') return trucks;
    return trucks.filter((t) => t.status === statusFilter);
  }, [trucks, statusFilter]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <TruckKPIStrip data={kpiData} />

      {/* Status Tabs */}
      <TruckStatusTabs
        counts={statusCounts}
        activeTab={statusFilter}
        onTabChange={setStatusFilter}
      />

      {/* DataGrid */}
      <TrucksGrid trucks={filteredTrucks} />
    </div>
  );
}
