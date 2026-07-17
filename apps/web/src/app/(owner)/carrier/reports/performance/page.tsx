'use client';

import { useEffect, useState, useCallback } from 'react';
import { PerformanceDesktop } from './PerformanceDesktop';
import { PerformanceMobile } from './PerformanceMobile';
import {
  getMonthStartISO,
  getTodayISO,
  type PerformanceRow,
} from './performance-report-utils';

export default function PerformanceReportPage() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(getMonthStartISO());
  const [dateTo, setDateTo] = useState(getTodayISO());
  const [driverFilter, setDriverFilter] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (driverFilter) params.set('driver_name', driverFilter);
      const res = await fetch(`/api/v1/carrier/reports/performance?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load performance report');
      const json = await res.json();
      setRows(json.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, driverFilter]);

  useEffect(() => {
    fetchRows();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Only auto-fetch on mount; subsequent fetches are triggered by Filter/Apply.

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <PerformanceMobile
          rows={rows}
          loading={loading}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          driverFilter={driverFilter}
          setDriverFilter={setDriverFilter}
          fetchRows={fetchRows}
        />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block">
        <PerformanceDesktop
          rows={rows}
          loading={loading}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          driverFilter={driverFilter}
          setDriverFilter={setDriverFilter}
          fetchRows={fetchRows}
        />
      </div>
    </>
  );
}
