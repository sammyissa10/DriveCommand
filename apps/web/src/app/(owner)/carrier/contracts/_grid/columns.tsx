/**
 * Column definitions for Contracts DataGrid
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '@/components/data-grid/shell';
import { AlertTriangle } from 'lucide-react';
import { isOneTimeContract, ONE_TIME_LABEL } from '@/lib/carrier/one-time-contract';
import type { ContractRow } from './types';

function formatRateDisplay(rateType: string | null, baseRate: string | null): string {
  if (!baseRate) return '—';
  const n = parseFloat(baseRate);
  const formatted = n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  switch (rateType) {
    case 'per_mile': return `${formatted}/mi`;
    case 'flat': return `${formatted} flat`;
    case 'per_hour': return `${formatted}/hr`;
    case 'per_load': return `${formatted}/load`;
    case 'percentage': return `${n}%`;
    default: return formatted;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  spot: 'Spot',
  dedicated: 'Dedicated',
  volume: 'Volume',
  brokerage: 'Brokerage',
};

export const contractsColumns: ColumnDef<ContractRow, unknown>[] = [
  {
    id: 'contractNumber',
    accessorKey: 'contractNumber',
    header: 'Contract #',
    meta: {
      dataType: 'text',
      freezable: true,
      defaultFrozen: true,
      minWidth: 130,
    },
    cell: ({ row }) => (
      <Link
        href={`/carrier/contracts/${row.original.id}`}
        className="font-medium hover:underline"
        style={{ fontFamily: 'var(--grid-font-data)' }}
      >
        {row.original.contractNumber}
      </Link>
    ),
  },
  {
    id: 'clientName',
    accessorKey: 'clientName',
    header: 'Client',
    meta: {
      dataType: 'text',
      minWidth: 150,
    },
    cell: ({ getValue }) => (
      <span className="truncate">{getValue() as string}</span>
    ),
  },
  {
    id: 'contractType',
    accessorKey: 'contractType',
    header: 'Type',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ row, getValue }) => {
      const type = getValue() as string | null;
      return (
        <span className="flex items-center gap-2 text-sm capitalize">
          {type ? (CONTRACT_TYPE_LABELS[type] || type) : '—'}
          {/* A contract effective for a single day is an agreement for one
              trip. Labelled here so it cannot be read as a standing one. */}
          {isOneTimeContract(row.original) ? (
            <span className="shrink-0 rounded-full bg-brand-warning/10 px-2 py-0.5 text-[11px] font-medium normal-case text-brand-warning">
              {ONE_TIME_LABEL}
            </span>
          ) : null}
        </span>
      );
    },
  },
  {
    id: 'rate',
    accessorFn: (row) => formatRateDisplay(row.rateType, row.baseRate),
    header: 'Rate',
    meta: {
      dataType: 'text',
      minWidth: 110,
    },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--grid-font-data)' }}>
        {getValue() as string}
      </span>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    meta: {
      dataType: 'text',
      minWidth: 100,
    },
    cell: ({ getValue }) => {
      const status = getValue() as string;
      const statusMap: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
        active: 'success',
        pending: 'warning',
        expired: 'danger',
        terminated: 'neutral',
      };
      return (
        <StatusBadge variant={statusMap[status] || 'neutral'}>
          {status}
        </StatusBadge>
      );
    },
  },
  {
    id: 'expirationDate',
    accessorKey: 'expirationDate',
    header: 'Expiration',
    meta: {
      dataType: 'date',
      minWidth: 130,
    },
    cell: ({ row }) => {
      const expDate = row.original.expirationDate;
      const isExpiringSoon = row.original.isExpiringSoon;
      return (
        <div className="flex items-center gap-1.5">
          <span style={{ fontFamily: 'var(--grid-font-data)' }}>
            {formatDate(expDate)}
          </span>
          {isExpiringSoon && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          )}
        </div>
      );
    },
  },
];
