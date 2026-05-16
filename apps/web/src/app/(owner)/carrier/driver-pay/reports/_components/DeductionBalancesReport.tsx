'use client';

/**
 * DeductionBalancesReport — FIXED_INSTALLMENTS deductions with outstanding balance.
 * Point-in-time: no period filter.
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

interface DeductionBalanceRow {
  driverId: string;
  driverName: string;
  deductionId: string;
  deductionType: string;
  totalAmount: string;
  amountCollected: string;
  remaining: string;
  percentComplete: number;
  schedule: string;
}

interface ApiResult {
  bigNumber: string;
  driversWithBalanceCount: number;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: DeductionBalanceRow[];
}

interface Props {
  driverIds?: string[];
}

const EMPTY_MSG = 'No outstanding deduction balances found.';

export function DeductionBalancesReport({ driverIds }: Props) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // NOTE: No period params — point-in-time balance snapshot
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (driverIds?.length) {
        for (const id of driverIds) params.append('driverIds', id);
      }
      const res = await fetch(`/api/driver-pay/reports/deduction-balances?${params.toString()}`);
      if (res.ok) {
        const json = await res.json() as ApiResult;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [driverIds, page]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const totalPages = data ? Math.ceil(data.totalCount / 25) : 1;

  const csvParams: Record<string, string | string[] | undefined> = {
    driverIds,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Deduction Balances</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/deduction-balances" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ReportTableSkeleton rows={5} columns={7} />
        ) : !data || data.rows.length === 0 ? (
          <>
            {data && (
              <BigNumberHero
                value={fmtMoney(data.bigNumber)}
                subtitle={`Outstanding across ${data.driversWithBalanceCount} drivers`}
                deltaPct={null}
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            <BigNumberHero
              value={fmtMoney(data.bigNumber)}
              subtitle={`Outstanding across ${data.driversWithBalanceCount} driver${data.driversWithBalanceCount !== 1 ? 's' : ''}`}
              deltaPct={null}
            />
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>% Complete</TableHead>
                    <TableHead>Schedule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.deductionId}>
                      <TableCell className="font-medium text-sm">{row.driverName}</TableCell>
                      <TableCell className="text-sm">{row.deductionType}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.amountCollected)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {fmtMoney(row.remaining)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0 h-1.5 bg-muted rounded-full overflow-hidden" style={{ width: 60 }}>
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(100, row.percentComplete)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {row.percentComplete.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.schedule}</TableCell>
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
