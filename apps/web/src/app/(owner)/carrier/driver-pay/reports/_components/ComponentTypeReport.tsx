'use client';

/**
 * ComponentTypeReport — Migrated to DataGrid.
 * Pay component type breakdown with pie chart + table.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta } from '@/components/data-grid/core/types';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BigNumberHero } from './BigNumberHero';
import { CsvExportButton } from './CsvExportButton';
import { ReportTableSkeleton } from './ReportTableSkeleton';
import { fmtMoney } from './format';

interface ComponentTypeRow {
  componentType: string;
  totalAmount: string;
  count: number;
  pct: number;
}

interface ApiResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  rows: ComponentTypeRow[];
}

interface Props {
  period: string;
  customStart?: string;
  customEnd?: string;
  driverIds?: string[];
}

const EMPTY_MSG = 'No data for this period. Try selecting a different date range.';

const CHART_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
];

// ---------------------------------------------------------------------------
// Column Definitions with color indicator
// ---------------------------------------------------------------------------

function createColumns(data: ComponentTypeRow[]): ColumnDef<ComponentTypeRow, unknown>[] {
  return [
    {
      id: 'componentType',
      accessorKey: 'componentType',
      header: 'Type',
      cell: ({ row }) => {
        const rowIndex = data.findIndex((r) => r.componentType === row.original.componentType);
        const color = CHART_COLORS[rowIndex % CHART_COLORS.length];
        return (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="font-medium text-sm">{row.original.componentType}</span>
          </div>
        );
      },
      enableSorting: true,
      meta: {
        freezable: true,
        defaultFrozen: true,
        filterType: 'text',
      } as DataGridColumnMeta,
    },
    {
      id: 'totalAmount',
      accessorKey: 'totalAmount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="text-right font-mono text-sm">
          {fmtMoney(row.original.totalAmount)}
        </span>
      ),
      enableSorting: true,
      meta: {
        dataType: 'currency',
      } as DataGridColumnMeta,
    },
    {
      id: 'count',
      accessorKey: 'count',
      header: 'Count',
      cell: ({ row }) => (
        <span className="text-right text-sm">{row.original.count}</span>
      ),
      enableSorting: true,
      meta: {
        dataType: 'number',
      } as DataGridColumnMeta,
    },
    {
      id: 'pct',
      accessorKey: 'pct',
      header: '% of Total',
      cell: ({ row }) => (
        <span className="text-right text-sm">{row.original.pct.toFixed(1)}%</span>
      ),
      enableSorting: true,
      meta: {
        dataType: 'number',
      } as DataGridColumnMeta,
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComponentTypeReport({ period, customStart, customEnd, driverIds }: Props) {
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
      const res = await fetch(`/api/driver-pay/reports/component-type?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as ApiResult;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd, driverIds]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const columns = data ? createColumns(data.rows) : [];

  // Use data grid for the table
  const { table, isLoading: gridLoading } = useDataGrid({
    gridId: 'component-type-report',
    columns,
    data: data?.rows ?? [],
    rowIdAccessor: (row) => row.componentType,
    initialPageSize: 25,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  const csvParams: Record<string, string | string[] | undefined> = {
    period,
    customStart,
    customEnd,
    driverIds,
  };

  const chartData =
    data?.rows.map((r) => ({
      name: r.componentType,
      value: parseFloat(r.totalAmount),
    })) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Component Type Breakdown</CardTitle>
          <CsvExportButton endpoint="/api/driver-pay/reports/component-type" params={csvParams} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ReportTableSkeleton rows={6} columns={4} />
        ) : !data || data.rows.length === 0 ? (
          <>
            {data && (
              <BigNumberHero
                value={fmtMoney(data.bigNumber)}
                subtitle="Total pay components by type"
                deltaPct={data.deltaPct}
              />
            )}
            <p className="text-center text-sm text-muted-foreground py-8">{EMPTY_MSG}</p>
          </>
        ) : (
          <>
            <BigNumberHero
              value={fmtMoney(data.bigNumber)}
              subtitle="Total pay components by type"
              deltaPct={data.deltaPct}
            />

            {/* Donut chart */}
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="40%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => fmtMoney(String(val))} />
                  <Legend layout="vertical" verticalAlign="middle" align="right" />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <GridShell
              gridId="component-type-report"
              table={table}
              rows={rows}
              isLoading={gridLoading}
              columns={columns}
              pagination={{
                pageIndex,
                pageSize,
                pageCount,
                totalRows: data.rows.length,
                canPreviousPage: table.getCanPreviousPage(),
                canNextPage: table.getCanNextPage(),
                previousPage: () => table.previousPage(),
                nextPage: () => table.nextPage(),
                setPageSize: (size) => table.setPageSize(size),
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
