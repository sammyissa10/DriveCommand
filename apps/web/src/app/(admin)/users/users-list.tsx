'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type FilterFn,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { type AdminUserRow } from '@/app/(admin)/actions/users';

interface UsersListProps {
  users: AdminUserRow[];
}

const roleBadgeClasses: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-800',
  MANAGER: 'bg-blue-100 text-blue-800',
  DRIVER: 'bg-green-100 text-green-800',
};

/**
 * Custom global filter: searches firstName+lastName, email, and tenant name
 * case-insensitively across all three fields.
 */
const userGlobalFilter: FilterFn<AdminUserRow> = (row, _columnId, filterValue: string) => {
  const q = filterValue.toLowerCase();
  const fullName = `${row.original.firstName ?? ''} ${row.original.lastName ?? ''}`.toLowerCase();
  const email = row.original.email.toLowerCase();
  const tenantName = (row.original.tenant?.name ?? '').toLowerCase();
  return fullName.includes(q) || email.includes(q) || tenantName.includes(q);
};

export function UsersList({ users }: UsersListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [tenantFilter, setTenantFilter] = useState('ALL');

  /** Distinct sorted tenant names for the tenant dropdown. */
  const tenantOptions = useMemo(() => {
    const names = Array.from(
      new Set(users.map((u) => u.tenant?.name).filter((n): n is string => !!n))
    );
    return names.sort();
  }, [users]);

  /** Pre-filter by role, status, and tenant before handing to TanStack Table. */
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'INACTIVE' && u.isActive) return false;
      if (tenantFilter !== 'ALL' && u.tenant?.name !== tenantFilter) return false;
      return true;
    });
  }, [users, roleFilter, statusFilter, tenantFilter]);

  const columns: ColumnDef<AdminUserRow>[] = [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
      cell: ({ row, getValue }) => (
        <a
          href={`mailto:${row.original.email}`}
          className="text-blue-600 hover:underline"
        >
          {getValue() as string}
        </a>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (info) => info.getValue() as string,
    },
    {
      id: 'tenant',
      header: 'Tenant',
      accessorFn: (r) => r.tenant?.name ?? '—',
      cell: ({ row, getValue }) => (
        <span title={row.original.tenantId}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: (info) => {
        const role = info.getValue() as string;
        const classes = roleBadgeClasses[role] ?? 'bg-gray-100 text-gray-800';
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
            {role}
          </span>
        );
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: (info) => {
        const active = info.getValue() as boolean;
        return active ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            Inactive
          </span>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: (info) => {
        const date = info.getValue() as Date;
        return format(new Date(date), 'MMM d, yyyy');
      },
    },
  ];

  const table = useReactTable({
    data: filteredUsers,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: userGlobalFilter,
  });

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Search */}
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search name, email, or tenant…"
          className="w-full max-w-md border border-gray-300 rounded-md px-4 py-2 text-sm focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
        />

        {/* Filter dropdowns */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="ALL">All Roles</option>
            <option value="OWNER">Owner</option>
            <option value="MANAGER">Manager</option>
            <option value="DRIVER">Driver</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="ALL">All Tenants</option>
            {tenantOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
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
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center text-gray-500 py-8"
                >
                  No users match the current filters
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4 text-sm text-gray-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
