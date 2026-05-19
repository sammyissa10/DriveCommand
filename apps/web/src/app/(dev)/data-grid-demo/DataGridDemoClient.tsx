'use client';

/**
 * DataGrid Demo Client Component
 *
 * Demonstrates all DataGrid shell components with fake user data.
 * Development-only page for testing and showcasing features.
 */

import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  DataGrid,
  GridShell,
  GridHeader,
  GridBody,
  GridFooter,
  GridToolbar,
  BulkActionsBar,
  GridEmptyState,
  GridLoadingSkeleton,
  QuickActions,
  type DataGridColumnMeta,
  type BulkAction,
} from '@/components/data-grid';
import { Badge } from '@/components/ui/badge';
import { Archive, Mail } from 'lucide-react';

// ---------------------------------------------------------------------------
// Fake User Data
// ---------------------------------------------------------------------------

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'pending';
  createdAt: Date;
}

// Generate 100 fake users
function generateUsers(count: number): User[] {
  const roles: User['role'][] = ['admin', 'editor', 'viewer'];
  const statuses: User['status'][] = ['active', 'inactive', 'pending'];
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

  return Array.from({ length: count }, (_, i) => {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;

    return {
      id: `user-${i + 1}`,
      name,
      email,
      role: roles[Math.floor(Math.random() * roles.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)),
    };
  });
}

const users = generateUsers(100);

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

const columns: ColumnDef<User, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: (info) => info.getValue(),
    meta: {
      freezable: true,
      defaultFrozen: true,
      editable: true,
    } as DataGridColumnMeta,
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: (info) => info.getValue(),
    meta: {
      editable: true,
    } as DataGridColumnMeta,
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: (info) => {
      const role = info.getValue() as User['role'];
      const variant = role === 'admin' ? 'default' : role === 'editor' ? 'secondary' : 'outline';
      return <Badge variant={variant}>{role}</Badge>;
    },
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'admin', label: 'Admin' },
        { value: 'editor', label: 'Editor' },
        { value: 'viewer', label: 'Viewer' },
      ],
    } as DataGridColumnMeta,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: (info) => {
      const status = info.getValue() as User['status'];
      const variant = status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'secondary';
      return <Badge variant={variant}>{status}</Badge>;
    },
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
        { value: 'pending', label: 'Pending' },
      ],
    } as DataGridColumnMeta,
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: (info) => {
      const date = info.getValue() as Date;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    meta: {
      filterType: 'date',
    } as DataGridColumnMeta,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <QuickActions
        row={row.original}
        onView={(user) => {
          toast.info(`Viewing ${user.name}`);
        }}
        onEdit={(user) => {
          toast.info(`Editing ${user.name}`);
        }}
        onDelete={async (user) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          toast.success(`Deleted ${user.name}`);
        }}
        itemLabel="user"
      />
    ),
    meta: {
      exportable: false,
    } as DataGridColumnMeta,
  },
];

// ---------------------------------------------------------------------------
// Demo Page Component
// ---------------------------------------------------------------------------

export function DataGridDemoClient() {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filteredUsers, setFilteredUsers] = React.useState(users);
  const [isLoading, setIsLoading] = React.useState(false);

  // Filter users based on search
  React.useEffect(() => {
    if (!searchQuery) {
      setFilteredUsers(users);
      return;
    }

    const lowercaseQuery = searchQuery.toLowerCase();
    const filtered = users.filter(
      (user) =>
        user.name.toLowerCase().includes(lowercaseQuery) ||
        user.email.toLowerCase().includes(lowercaseQuery) ||
        user.role.toLowerCase().includes(lowercaseQuery) ||
        user.status.toLowerCase().includes(lowercaseQuery)
    );
    setFilteredUsers(filtered);
  }, [searchQuery]);

  // Handle new user
  const handleNew = () => {
    toast.info('Create new user clicked');
  };

  // Handle bulk delete
  const handleBulkDelete = async (selectedIds: string[]) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success(`Deleted ${selectedIds.length} users`);
  };

  // Bulk actions
  const bulkActions: BulkAction[] = [
    {
      label: 'Archive',
      icon: Archive,
      onClick: (ids) => toast.info(`Archive ${ids.length} users`),
    },
    {
      label: 'Send Email',
      icon: Mail,
      onClick: (ids) => toast.info(`Send email to ${ids.length} users`),
    },
  ];

  // Simulate loading
  const handleSimulateLoading = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">DataGrid Demo</h1>
          <p className="text-muted-foreground mt-1">
            Showcasing all DataGrid features with 100 fake users.
          </p>
          <button
            onClick={handleSimulateLoading}
            className="mt-2 text-sm text-primary underline"
          >
            Simulate loading state
          </button>
        </div>

        <div className="h-[calc(100vh-200px)]">
          {isLoading ? (
            <div className="border rounded-lg">
              <GridLoadingSkeleton rowCount={10} columnCount={6} showSelection />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="border rounded-lg">
              <GridEmptyState
                type={searchQuery ? 'filtered-empty' : 'no-data'}
                onClearFilters={() => setSearchQuery('')}
              />
            </div>
          ) : (
            <DataGrid
              gridId="demo-users"
              columns={columns}
              data={filteredUsers}
              enableSelection
              enablePersistence
              initialPageSize={25}
            >
              <GridShell className="h-full">
                <GridToolbar
                  showNew
                  onNew={handleNew}
                  searchPlaceholder="Search users..."
                  exportFilename="users-export"
                  onSearch={setSearchQuery}
                  searchValue={searchQuery}
                />
                <GridHeader enableSelection />
                <GridBody enableSelection />
                <GridFooter pageSizeOptions={[10, 25, 50, 100]} />
                <BulkActionsBar
                  actions={bulkActions}
                  onDelete={handleBulkDelete}
                  itemLabel="user"
                />
              </GridShell>
            </DataGrid>
          )}
        </div>
      </div>
    </div>
  );
}
