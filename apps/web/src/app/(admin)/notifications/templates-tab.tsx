'use client';

// SysAdmin can EDIT and TOGGLE templates but cannot ADD or DELETE from the UI.
// New triggers require a code change + npm run seed:notifications run.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { BlockEditor } from '@/components/notifications/block-editor';
import {
  toggleNotificationTemplateActive,
  updateNotificationTemplate,
} from '@/app/(admin)/actions/notifications';
import type { NotificationCategory } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationTemplate = {
  id: string;
  triggerKey: string;
  category: NotificationCategory;
  displayName: string;
  isActive: boolean;
  updatedAt: Date;
  availableVariables: unknown;
  defaultBlockJson: unknown;
  defaultSubject: string;
};

// ---------------------------------------------------------------------------
// Category badge colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<NotificationCategory, string> = {
  USER: 'bg-blue-100 text-blue-700',
  LOAD: 'bg-orange-100 text-orange-700',
  DRIVER: 'bg-green-100 text-green-700',
  TRUCK: 'bg-yellow-100 text-yellow-800',
  MESSAGE: 'bg-purple-100 text-purple-700',
  FINANCE: 'bg-teal-100 text-teal-700',
  ROUTE: 'bg-indigo-100 text-indigo-700',
  CUSTOMER: 'bg-pink-100 text-pink-700',
  DIGEST: 'bg-gray-100 text-gray-700',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TemplatesTabProps {
  templates: NotificationTemplate[];
}

export function TemplatesTab({ templates }: TemplatesTabProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    await toggleNotificationTemplateActive(id, !currentValue);
    router.refresh();
  };

  const handleSave = async (blockJson: unknown, subject: string, cachedHtml: string) => {
    if (!selectedTemplate) return;
    await updateNotificationTemplate(selectedTemplate.id, {
      defaultSubject: subject,
      defaultBlockJson: blockJson,
      cachedHtml,
    });
    router.refresh();
    setSheetOpen(false);
  };

  const columns: ColumnDef<NotificationTemplate>[] = [
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => {
        const cat = row.original.category;
        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {cat}
          </span>
        );
      },
    },
    {
      accessorKey: 'displayName',
      header: 'Name',
      cell: (info) => (
        <span className="font-medium text-gray-900">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'triggerKey',
      header: 'Trigger Key',
      cell: (info) => (
        <span className="font-mono text-xs text-gray-500">{info.getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Active',
      cell: ({ row }) => {
        const tmpl = row.original;
        return (
          <Switch
            checked={tmpl.isActive}
            onCheckedChange={() => handleToggleActive(tmpl.id, tmpl.isActive)}
            onClick={(e) => e.stopPropagation()}
          />
        );
      },
    },
    {
      accessorKey: 'updatedAt',
      header: 'Last Updated',
      cell: (info) => {
        const date = info.getValue() as Date;
        return new Date(date).toLocaleDateString();
      },
    },
  ];

  const table = useReactTable({
    data: templates,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <>
      <div className="space-y-4">
        {/* Search */}
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search templates..."
          className="w-full max-w-md border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
        />

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left text-sm font-medium text-gray-500 uppercase px-6 py-3"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={
                            header.column.getCanSort()
                              ? 'cursor-pointer select-none flex items-center gap-2'
                              : ''
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                          {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedTemplate(row.original);
                    setSheetOpen(true);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {table.getRowModel().rows.length === 0 && (
            <div className="text-center py-12 text-gray-500">No templates found.</div>
          )}
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[900px] sm:max-w-[900px] flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle>Edit Template</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 mt-4">
            {selectedTemplate && (
              <BlockEditor
                template={selectedTemplate}
                onSave={handleSave}
                onCancel={() => setSheetOpen(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
