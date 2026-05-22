'use client';

/**
 * AdminFeaturesListPage — Migrated to DataGrid.
 * Browse and filter all features in the registry.
 */

import { useState, useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { features } from '@/lib/docs/feature-registry';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta } from '@/components/data-grid/core/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

type Feature = (typeof features)[number];

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<Feature, unknown>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        href={`/docs/features/${row.original.slug}`}
        className="font-medium text-blue-600 hover:underline"
      >
        {row.original.name}
      </Link>
    ),
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'slug',
    accessorKey: 'slug',
    header: 'Slug',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-gray-600">{row.original.slug}</span>
    ),
    meta: {
      filterType: 'text',
    } as DataGridColumnMeta,
  },
  {
    id: 'portal',
    accessorKey: 'portal',
    header: 'Portal',
    cell: ({ row }) => <Badge variant="outline">{row.original.portal}</Badge>,
    enableSorting: true,
    meta: {
      filterType: 'select',
      filterOptions: Array.from(new Set(features.map((f) => f.portal))).map((p) => ({
        value: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
      })),
    } as DataGridColumnMeta,
  },
  {
    id: 'category',
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => (
      <span className="capitalize">{row.original.category}</span>
    ),
    enableSorting: true,
    meta: {
      filterType: 'select',
      filterOptions: Array.from(new Set(features.map((f) => f.category))).map((c) => ({
        value: c,
        label: c.charAt(0).toUpperCase() + c.slice(1),
      })),
    } as DataGridColumnMeta,
  },
  {
    id: 'planTier',
    accessorKey: 'planTier',
    header: 'Plan Tier',
    cell: ({ row }) => (
      <span className="capitalize">{row.original.planTier}</span>
    ),
    enableSorting: true,
    meta: {
      filterType: 'select',
      filterOptions: Array.from(new Set(features.map((f) => f.planTier))).map((t) => ({
        value: t,
        label: t.charAt(0).toUpperCase() + t.slice(1),
      })),
    } as DataGridColumnMeta,
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.status === 'stable'
            ? 'default'
            : row.original.status === 'beta'
            ? 'secondary'
            : 'outline'
        }
      >
        {row.original.status}
      </Badge>
    ),
    enableSorting: true,
    meta: {
      filterType: 'select',
      filterOptions: Array.from(new Set(features.map((f) => f.status))).map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
    } as DataGridColumnMeta,
  },
  {
    id: 'lastDocReviewedAt',
    accessorKey: 'lastDocReviewedAt',
    header: 'Last Reviewed',
    cell: ({ row }) => {
      const lastReviewed = new Date(row.original.lastDocReviewedAt);
      const now = new Date();
      const ageMs = now.getTime() - lastReviewed.getTime();
      const isStale = ageMs > NINETY_DAYS_MS;

      return (
        <div className="flex items-center gap-2">
          {isStale && <AlertCircle className="h-4 w-4 text-yellow-600" />}
          <span className="text-sm text-gray-600">
            {lastReviewed.toLocaleDateString()}
          </span>
        </div>
      );
    },
    enableSorting: true,
    meta: {
      filterType: 'date',
    } as DataGridColumnMeta,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminFeaturesListPage() {
  const [portalFilter, setPortalFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      if (portalFilter !== 'all' && f.portal !== portalFilter) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      return true;
    });
  }, [portalFilter, categoryFilter, statusFilter]);

  // Extract unique values for filters
  const portals = Array.from(new Set(features.map((f) => f.portal)));
  const categories = Array.from(new Set(features.map((f) => f.category)));
  const statuses = Array.from(new Set(features.map((f) => f.status)));

  const { table } = useDataGrid({
    gridId: 'admin-features',
    columns,
    data: filteredFeatures,
    rowIdAccessor: (row) => row.slug,
    initialPageSize: 25,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Feature Reference
        </h1>
        <p className="text-gray-600">
          Browse all {features.length} features in the registry
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={portalFilter} onValueChange={setPortalFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Portal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Portals</SelectItem>
            {portals.map((p) => (
              <SelectItem key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* DataGrid */}
      <GridShell
        gridId="admin-features"
        table={table}
        rows={rows}
        columns={columns}
        pagination={{
          pageIndex,
          pageSize,
          pageCount,
          totalRows: filteredFeatures.length,
          canPreviousPage: table.getCanPreviousPage(),
          canNextPage: table.getCanNextPage(),
          previousPage: () => table.previousPage(),
          nextPage: () => table.nextPage(),
          setPageSize: (size) => table.setPageSize(size),
        }}
      />
    </div>
  );
}
