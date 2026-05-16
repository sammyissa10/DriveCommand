'use client';

/**
 * AccessorialSpendReport — Accessorial spend grouped by client/contract.
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
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney } from './format';

interface AccessorialSpendRow {
  clientId: string | null;
  clientName: string;
  contractId: string | null;
  contractName: string | null;
  totalAmount: string;
  componentCount: number;
  avgAmount: string;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  rows: AccessorialSpendRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

export function AccessorialSpendReport({ period, customStart, customEnd, driverIds }: Props) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (customStart) params.set('customStart', customStart);
      if (customEnd) params.set('customEnd', customEnd);
      if (driverIds?.length) {
        for (const id of driverIds) params.append('driverIds', id);
      }
      const res = await fetch(`/api/driver-pay/reports/accessorial-spend?${params.toString()}`);
      if (res.ok) {
        const json = await res.json() as ApiResult;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd, driverIds]);

  useEffect(() => { void fetchData(); }, [fetchData]);

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
          <CardTitle className="text-base font-semibold">Accessorial Spend by Client</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/accessorial-spend" params={csvParams} />
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
                subtitle="Total accessorial spend this period"
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
              subtitle="Total accessorial spend this period"
              deltaPct={data.deltaPct}
              deltaInvertedForSpend
            />
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Avg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row, i) => (
                    <TableRow key={row.clientId ?? `no-client-${i}`}>
                      <TableCell className="font-medium">{row.clientName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.contractName ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-right text-sm">{row.componentCount}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(row.avgAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
