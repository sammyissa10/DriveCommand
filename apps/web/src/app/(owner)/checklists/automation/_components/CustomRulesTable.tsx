'use client';

/**
 * CustomRulesTable — Migrated to DataGrid.
 * Custom automation rules with delete action.
 */

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { GridShell } from '@/components/data-grid';
import { useDataGrid } from '@/components/data-grid/core/useDataGrid';
import type { DataGridColumnMeta } from '@/components/data-grid/core/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Plain-English labels for trigger events
const EVENT_LABELS: Record<string, string> = {
  ON_DRIVER_CREATE: 'A driver is added',
  ON_VEHICLE_CREATE: 'A truck is added',
  ON_DISPATCH_CREATE: 'A dispatch is created',
  ON_DISPATCH_DEPART: 'A dispatch departs',
  ON_DISPATCH_DELIVER: 'A dispatch is delivered',
  ON_PARTNER_CREATE: 'A partner is added',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

interface CustomRule {
  id: string;
  triggerEvent: string;
  conditions: JsonValue;
  isActive: boolean;
  playbookId: string;
  playbookName: string;
  createdAt: Date | string;
}

interface CustomRulesTableProps {
  rules: CustomRule[];
  isLoading: boolean;
  onDelete: (triggerId: string) => void;
  deletingId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatConditions(conditions: any): string {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) return 'All';
  const entries = Object.entries(conditions as Record<string, unknown>);
  if (entries.length === 0) return 'All';
  return entries.map(([k, v]) => `${k} = ${String(v)}`).join(', ');
}

// ---------------------------------------------------------------------------
// Column Definitions Factory
// ---------------------------------------------------------------------------

function createColumns(
  onDeleteClick: (ruleId: string) => void,
  deletingId: string | null
): ColumnDef<CustomRule, unknown>[] {
  return [
    {
      id: 'triggerEvent',
      accessorKey: 'triggerEvent',
      header: 'When',
      cell: ({ row }) => (
        <span className="font-medium">
          {EVENT_LABELS[row.original.triggerEvent] ?? row.original.triggerEvent}
        </span>
      ),
      meta: {
        freezable: true,
        defaultFrozen: true,
        filterType: 'select',
        filterOptions: Object.entries(EVENT_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
      } as DataGridColumnMeta,
    },
    {
      id: 'conditions',
      accessorFn: (row) => formatConditions(row.conditions),
      header: 'For which records',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatConditions(row.original.conditions)}
        </span>
      ),
      meta: {
        filterType: 'text',
      } as DataGridColumnMeta,
    },
    {
      id: 'playbookName',
      accessorKey: 'playbookName',
      header: 'Checklist',
      cell: ({ row }) => row.original.playbookName,
      meta: {
        filterType: 'text',
      } as DataGridColumnMeta,
    },
    {
      id: 'isActive',
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant={row.original.isActive ? 'default' : 'secondary'}
          className="text-xs"
        >
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
      meta: {
        filterType: 'select',
        filterOptions: [
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Inactive' },
        ],
      } as DataGridColumnMeta,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDeleteClick(row.original.id)}
          disabled={deletingId === row.original.id}
          aria-label={`Delete rule: ${EVENT_LABELS[row.original.triggerEvent] ?? row.original.triggerEvent} — ${row.original.playbookName}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      ),
      meta: {
        exportable: false,
      } as DataGridColumnMeta,
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomRulesTable({
  rules,
  isLoading,
  onDelete,
  deletingId,
}: CustomRulesTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const columns = createColumns(
    (ruleId) => setConfirmDeleteId(ruleId),
    deletingId
  );

  // Use data grid hook
  const { table } = useDataGrid({
    gridId: 'custom-rules',
    columns,
    data: rules,
    rowIdAccessor: (row) => row.id,
    initialPageSize: 25,
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>No custom rules yet.</p>
          <p className="text-xs">Click &ldquo;Create Custom Rule&rdquo; to add one.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <GridShell
        gridId="custom-rules"
        table={table}
        rows={rows}
        columns={columns}
        pagination={{
          pageIndex,
          pageSize,
          pageCount,
          totalRows: rules.length,
          canPreviousPage: table.getCanPreviousPage(),
          canNextPage: table.getCanNextPage(),
          previousPage: () => table.previousPage(),
          nextPage: () => table.nextPage(),
          setPageSize: (size) => table.setPageSize(size),
        }}
      />

      {/* Confirm delete dialog */}
      <AlertDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this auto-start rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the rule. Any checklists already started by this rule
              will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
