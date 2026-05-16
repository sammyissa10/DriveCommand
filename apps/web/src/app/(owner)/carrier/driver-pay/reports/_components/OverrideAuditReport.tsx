'use client';

/**
 * OverrideAuditReport — Override audit trail with dispatcher summary, paginated.
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
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtDate } from './format';

interface OverrideAuditRow {
  assignmentId: string;
  loadId: string;
  referenceNumber: string | null;
  driverId: string;
  driverName: string;
  overrideReason: string;
  createdBy: string | null;
  createdAt: string;
  payType: string | null;
  baseRate: string | null;
  rateUnit: string | null;
}

interface ByDispatcher {
  createdBy: string | null;
  count: number;
}

interface ApiResult {
  bigNumber: number;
  deltaPct: number | null;
  priorCount: number;
  byDispatcher: ByDispatcher[];
  page: number;
  pageSize: number;
  totalCount: number;
  rows: OverrideAuditRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

export function OverrideAuditReport({ period, customStart, customEnd, driverIds }: Props) {
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
      const res = await fetch(`/api/driver-pay/reports/override-audit?${params.toString()}`);
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
          <CardTitle className="text-base font-semibold">Override Audit</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/override-audit" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ReportTableSkeleton rows={5} columns={8} />
        ) : !data || data.rows.length === 0 ? (
          <>
            {data && (
              <BigNumberHero
                value={String(data.bigNumber)}
                subtitle="Pay overrides this period"
                deltaPct={data.deltaPct}
                deltaInvertedForSpend
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            <BigNumberHero
              value={String(data.bigNumber)}
              subtitle="Pay overrides this period"
              deltaPct={data.deltaPct}
              deltaInvertedForSpend
            />

            {/* Dispatcher summary */}
            {data.byDispatcher.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground self-center">Overrides by dispatcher:</span>
                {data.byDispatcher.map((d, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {d.createdBy ? d.createdBy.slice(0, 8) + '…' : 'Unknown'}: {d.count}
                  </Badge>
                ))}
              </div>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Load Ref</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Pay Type</TableHead>
                    <TableHead className="text-right">Base Rate</TableHead>
                    <TableHead>Rate Unit</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Created At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.assignmentId}>
                      <TableCell className="font-medium text-sm">{row.referenceNumber ?? '—'}</TableCell>
                      <TableCell className="text-sm">{row.driverName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{row.overrideReason}</TableCell>
                      <TableCell className="text-sm">{row.payType ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{row.baseRate ?? '—'}</TableCell>
                      <TableCell className="text-sm">{row.rateUnit ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {row.createdBy ? row.createdBy.slice(0, 8) + '…' : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(row.createdAt)}</TableCell>
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
