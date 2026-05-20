/**
 * DataGrid Shell Demo Page
 *
 * Visual testing ground for the new DataGrid shell components.
 * Demonstrates desktop table and mobile card views with all states.
 */

'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { GridShell } from '@/components/data-grid/shell';
import { StatusBadge } from '@/components/data-grid/shell/shared/StatusBadge';
import { QuickActions, type QuickAction } from '@/components/data-grid/shell/shared/QuickActions';
import { Eye, Pencil, Trash2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

interface DemoRow {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'pending' | 'expired' | 'inactive';
  created: string;
  role: string;
}

const mockData: DemoRow[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com', status: 'active', created: '2024-01-15', role: 'Admin' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com', status: 'pending', created: '2024-01-20', role: 'User' },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com', status: 'active', created: '2024-02-01', role: 'User' },
  { id: '4', name: 'Alice Williams', email: 'alice@example.com', status: 'expired', created: '2024-02-10', role: 'User' },
  { id: '5', name: 'Charlie Brown', email: 'charlie@example.com', status: 'active', created: '2024-02-15', role: 'Manager' },
  { id: '6', name: 'Diana Prince', email: 'diana@example.com', status: 'inactive', created: '2024-03-01', role: 'User' },
  { id: '7', name: 'Ethan Hunt', email: 'ethan@example.com', status: 'active', created: '2024-03-10', role: 'User' },
  { id: '8', name: 'Fiona Gallagher', email: 'fiona@example.com', status: 'pending', created: '2024-03-15', role: 'User' },
  { id: '9', name: 'George Miller', email: 'george@example.com', status: 'active', created: '2024-03-20', role: 'Admin' },
  { id: '10', name: 'Hannah Montana', email: 'hannah@example.com', status: 'active', created: '2024-03-25', role: 'User' },
];

const columnHelper = createColumnHelper<DemoRow>();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataGridDemoPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!search) return mockData;
    const lowerSearch = search.toLowerCase();
    return mockData.filter(
      (row) =>
        row.name.toLowerCase().includes(lowerSearch) ||
        row.email.toLowerCase().includes(lowerSearch)
    );
  }, [search]);

  // Columns
  const columns = useMemo(
    () => [
      columnHelper.accessor('id', {
        header: 'ID',
        size: 80,
        meta: {
          dataType: 'number',
        },
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        size: 200,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 120,
        cell: ({ getValue }) => {
          const status = getValue();
          const variantMap = {
            active: 'success',
            pending: 'warning',
            expired: 'danger',
            inactive: 'neutral',
          } as const;
          return (
            <StatusBadge variant={variantMap[status]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </StatusBadge>
          );
        },
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        size: 250,
      }),
      columnHelper.accessor('created', {
        header: 'Created',
        size: 120,
      }),
    ],
    []
  );

  // TanStack Table instance
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: false,
  });

  const rows = table.getRowModel().rows;

  // Selection handlers
  const handleRowSelect = (rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Quick actions
  const renderQuickActions = (row: DemoRow) => {
    const actions: QuickAction[] = [
      {
        id: 'view',
        label: 'View details',
        icon: Eye,
        onClick: () => console.log('View', row.name),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => console.log('Edit', row.name),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => console.log('Delete', row.name),
        destructive: true,
        confirmTitle: 'Delete user?',
        confirmDescription: `Are you sure you want to delete ${row.name}?`,
      },
    ];
    return <QuickActions actions={actions} selectedCount={selectedIds.size} />;
  };

  // Pagination
  const totalRows = filteredData.length;
  const pageCount = Math.ceil(totalRows / pageSize);

  const pagination = {
    pageIndex,
    pageSize,
    pageCount,
    totalRows,
    canPreviousPage: pageIndex > 0,
    canNextPage: pageIndex < pageCount - 1,
    previousPage: () => setPageIndex((p) => Math.max(0, p - 1)),
    nextPage: () => setPageIndex((p) => Math.min(pageCount - 1, p + 1)),
    setPageSize: (size: number) => {
      setPageSize(size);
      setPageIndex(0);
    },
  };

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">DataGrid Shell Demo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Visual testing ground for the new Vercel/Apple crisp-minimal DataGrid shell.
        </p>
      </div>

      {/* Section 1: Basic Table */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">1. Basic Table</h2>
          <p className="text-sm text-muted-foreground">
            Desktop view with sorting, selection, and quick actions.
          </p>
        </div>
        <GridShell
          gridId="demo-basic"
          table={table}
          rows={rows}
          enableSelection
          selectedIds={selectedIds}
          onRowSelect={handleRowSelect}
          onRowDoubleClick={(row) => console.log('Double-click', row.name)}
          renderQuickActions={renderQuickActions}
          pagination={pagination}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search users..."
          showNew
          onNew={() => console.log('Create new user')}
          onClearSelection={handleClearSelection}
          primaryColumn="name"
          metadataColumns={['email', 'role', 'created']}
          statusColumn="status"
        />
      </div>

      {/* Section 2: Empty State */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">2. Empty State</h2>
          <p className="text-sm text-muted-foreground">
            Grid with no data shows EmptyState component.
          </p>
        </div>
        <GridShell
          gridId="demo-empty"
          table={useReactTable({
            data: [],
            columns,
            getCoreRowModel: getCoreRowModel(),
          })}
          rows={[]}
          search=""
          onSearchChange={() => {}}
        />
      </div>

      {/* Section 3: Loading State */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">3. Loading State</h2>
          <p className="text-sm text-muted-foreground">
            Grid with isLoading=true shows LoadingSkeleton.
          </p>
        </div>
        <GridShell
          gridId="demo-loading"
          table={table}
          rows={rows}
          isLoading
          search=""
          onSearchChange={() => {}}
        />
      </div>

      {/* Section 4: Mobile Preview */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">4. Mobile Preview</h2>
          <p className="text-sm text-muted-foreground">
            Resize viewport below 768px to see card layout with FAB.
          </p>
        </div>
        <div className="mx-auto max-w-md">
          <GridShell
            gridId="demo-mobile"
            table={table}
            rows={rows.slice(0, 5)}
            enableSelection
            selectedIds={selectedIds}
            onRowSelect={handleRowSelect}
            onRowDoubleClick={(row) => console.log('Tap', row.name)}
            showNew
            onNew={() => console.log('Create new (mobile)')}
            onClearSelection={handleClearSelection}
            primaryColumn="name"
            metadataColumns={['email', 'created']}
            statusColumn="status"
          />
        </div>
      </div>

      {/* Design audit checklist */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-base font-medium text-foreground mb-4">Design Audit Checklist</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>✅ No vertical cell borders</li>
          <li>✅ Row height is exactly 48px</li>
          <li>✅ Headers are text-xs uppercase tracking-wider</li>
          <li>✅ All icons have strokeWidth={'{1.5}'}</li>
          <li>✅ StatusBadges use tinted bg pattern</li>
          <li>✅ Mobile (&lt;768px) shows cards, not squished table</li>
          <li>✅ FAB visible on mobile, hidden during selection</li>
          <li>✅ Hover states are subtle (bg-muted/50)</li>
          <li>✅ Focus rings are visible and use brand blue</li>
          <li>✅ Keyboard navigation works (arrows, space, escape)</li>
          <li>✅ Motion respects prefers-reduced-motion</li>
        </ul>
      </div>
    </div>
  );
}
