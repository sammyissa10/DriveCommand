'use client';

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
import { suspendTenant, reactivateTenant, deleteTenant } from '@/app/(admin)/actions/tenants';

/**
 * Tenant type matching getAllTenants return shape
 */
type Tenant = {
  id: string;
  name: string;
  slug: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    users: number;
    trucks: number;
    routes: number;
  };
};

interface TenantListClientProps {
  tenants: Tenant[];
}

type ConfirmAction = {
  type: 'suspend' | 'delete';
  tenantId: string;
  tenantName: string;
} | null;

export function TenantListClient({ tenants }: TenantListClientProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const handleSuspend = (tenantId: string, tenantName: string) => {
    setConfirmAction({ type: 'suspend', tenantId, tenantName });
  };

  const handleDelete = (tenantId: string, tenantName: string) => {
    setConfirmAction({ type: 'delete', tenantId, tenantName });
  };

  const handleReactivate = async (tenantId: string) => {
    await reactivateTenant(tenantId);
    router.refresh();
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;

    try {
      if (confirmAction.type === 'suspend') {
        await suspendTenant(confirmAction.tenantId);
      } else if (confirmAction.type === 'delete') {
        const result = await deleteTenant(confirmAction.tenantId);
        if (!result.success && 'error' in result) {
          alert(result.error);
        }
      }
      router.refresh();
      setConfirmAction(null);
    } catch (error: any) {
      alert(error.message || 'An error occurred');
    }
  };

  const columns: ColumnDef<Tenant>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
      cell: (info) => {
        const value = info.getValue() as string | null;
        return value || '---';
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: (info) => {
        const isActive = info.getValue() as boolean;
        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {isActive ? 'Active' : 'Suspended'}
          </span>
        );
      },
    },
    {
      header: 'Users',
      accessorFn: (row) => row._count.users,
      cell: (info) => info.getValue(),
    },
    {
      header: 'Trucks',
      accessorFn: (row) => row._count.trucks,
      cell: (info) => info.getValue(),
    },
    {
      header: 'Routes',
      accessorFn: (row) => row._count.routes,
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: (info) => {
        const date = info.getValue() as Date;
        return new Date(date).toLocaleDateString();
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const tenant = row.original;
        return (
          <div className="flex gap-2">
            {tenant.isActive ? (
              <button
                onClick={() => handleSuspend(tenant.id, tenant.name)}
                className="text-orange-600 hover:text-orange-800 font-medium"
              >
                Suspend
              </button>
            ) : (
              <button
                onClick={() => handleReactivate(tenant.id)}
                className="text-green-600 hover:text-green-800 font-medium"
              >
                Reactivate
              </button>
            )}
            <button
              onClick={() => handleDelete(tenant.id, tenant.name)}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              Delete
            </button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: tenants,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (tenants.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">No tenants found. Create your first tenant to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Search Input */}
        <div>
          <input
            type="text"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search tenants..."
            className="w-full max-w-md border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
          />
        </div>

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
                <tr key={row.id} className="border-b hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-3">
              {confirmAction.type === 'suspend' ? 'Suspend Tenant' : 'Delete Tenant'}
            </h3>
            <p className="text-gray-600 mb-6">
              {confirmAction.type === 'suspend' ? (
                <>
                  Suspend <strong>{confirmAction.tenantName}</strong>? Users will not be able to access
                  their accounts.
                </>
              ) : (
                <>
                  Delete <strong>{confirmAction.tenantName}</strong>? This action cannot be undone. All
                  tenant data will be permanently removed.
                </>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  confirmAction.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {confirmAction.type === 'suspend' ? 'Suspend' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
