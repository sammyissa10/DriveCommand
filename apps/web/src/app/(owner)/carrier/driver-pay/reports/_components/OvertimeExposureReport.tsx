'use client';

/**
 * OvertimeExposureReport — OVERTIME pay components with driver/load context, paginated.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney } from './format';

interface OvertimeExposureRow {
  driverId: string;
  driverName: string;
  loadId: string | null;
  referenceNumber: string | null;
  overtimeAmount: string;
  actualHours: string | null;
  assignmentId: string;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  totalLoadsAffected: number;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: OvertimeExposureRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

export function OvertimeExposureReport({ period, customStart, customEnd, driverIds }: Props) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, page: String(page), pageSize: '25' });
      if (customStart) params.set('customStart', customStart);
      if (customEnd) params.set('customEnd', customEnd);
      if (driverIds?.length) {
        for (const id of driverIds) params.append('driverIds', id);
      }
      const res = await fetch(`/api/driver-pay/reports/overtime-exposure?${params.toString()}`);
      if (res.ok) {
        const json = await res.json() as ApiResult;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd, driverIds, page]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const totalPages = data ? Math.ceil(data.totalCount / 25) : 1;

  const csvParams: Record<string, string | string[] | undefined> = {
    period,
    customStart,
    customEnd,
    driverIds,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Overtime Exposure</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/overtime-exposure" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ReportTableSkeleton rows={5} columns={5} />
        ) : !data || data.rows.length === 0 ? (
          <>
            {data && (
              <BigNumberHero
                value={fmtMoney(data.bigNumber)}
                subtitle={`Total overtime exposure (${data.totalLoadsAffected} loads)`}
                deltaPct={data.deltaPct}
                deltaInvertedForSpend
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            <BigNumberHero
              value={fmtMoney(data.bigNumber)}
              subtitle={`Total overtime exposure (${data.totalLoadsAffected} loads)`}
              deltaPct={data.deltaPct}
              deltaInvertedForSpend
            />
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Load Ref</TableHead>
                    <TableHead className="text-right">OT Amount</TableHead>
                    <TableHead className="text-right">Actual Hours</TableHead>
                    <TableHead>Assignment ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.assignmentId}>
                      <TableCell className="font-medium text-sm">{row.driverName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.referenceNumber ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {fmtMoney(row.overtimeAmount)}
                      </TableCell>
                      <TableCell className="text-right text-sm">{row.actualHours ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{row.assignmentId.slice(0, 8)}…</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {data.totalCount > 0
                  ? `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, data.totalCount)} of ${data.totalCount}`
                  : 'No results'}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
