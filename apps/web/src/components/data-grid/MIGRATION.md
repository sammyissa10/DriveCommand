# DataGrid Migration Playbook

Step-by-step guide to migrate existing list pages to the DataGrid component.

## Overview

This guide helps you replace bespoke table implementations with the reusable DataGrid component, gaining filters, saved views, inline editing, CSV export, and keyboard navigation.

**Estimated time:** 30-60 minutes per page

## Prerequisites

- Existing list page with a table or list component
- API endpoint that returns paginated data
- Basic understanding of TanStack Table and React Server Components

## Step 1: Extend API Endpoint

Your API endpoint needs to accept DataGrid parameters. Update your handler to accept:

```typescript
interface DataGridParams {
  page: number;           // 1-indexed page number
  pageSize: number;       // Rows per page
  sort?: string;          // Format: "field:asc" or "field:desc"
  filters?: string;       // JSON-encoded GridFilter[]
  search?: string;        // Global search term
}
```

### Example: Extending GET /api/v1/carrier/clients

**Before:**
```typescript
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get('search') ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  const result = await listClients(orgId, { search, page });
  return NextResponse.json({ data: result });
}
```

**After:**
```typescript
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get('search') ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25', 10);

  // Parse sort
  const sortParam = searchParams.get('sort');
  let sort;
  if (sortParam) {
    const [field, direction] = sortParam.split(':');
    if (field && (direction === 'asc' || direction === 'desc')) {
      sort = { field, direction };
    }
  }

  // Parse filters
  const filtersParam = searchParams.get('filters');
  let filters;
  if (filtersParam) {
    try {
      filters = JSON.parse(filtersParam);
    } catch {
      // Ignore parse errors
    }
  }

  const result = await listClients(orgId, { search, page, pageSize, sort, filters });
  return NextResponse.json({ data: result });
}
```

### Update Data Access Layer

Update your data fetching function to handle filters and sort:

```typescript
import type { GridFilter } from '@/components/data-grid/core/types';
import type { Prisma } from '@/generated/prisma';

function gridFiltersToPrismaWhere(filters: GridFilter[]): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  for (const filter of filters) {
    const { columnId, operator, value } = filter;

    switch (operator) {
      case 'contains':
        where[columnId] = { contains: value as string, mode: 'insensitive' };
        break;
      case 'equals':
        where[columnId] = value;
        break;
      case 'anyOf':
        if (Array.isArray(value) && value.length > 0) {
          where[columnId] = { in: value };
        }
        break;
      case 'isEmpty':
        where[columnId] = null;
        break;
      // Add more operators as needed
    }
  }

  return where;
}

export async function listClients(
  orgId: string,
  params: { page: number; pageSize: number; sort?: { field: string; direction: 'asc' | 'desc' }; filters?: GridFilter[]; search?: string }
) {
  const { page, pageSize, sort, filters = [], search } = params;
  const skip = (page - 1) * pageSize;

  const where: Prisma.CarrierClientWhereInput = {
    orgId,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    ...gridFiltersToPrismaWhere(filters),
  };

  const orderBy: Prisma.CarrierClientOrderByWithRelationInput = sort
    ? { [sort.field]: sort.direction }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.carrierClient.findMany({ where, skip, take: pageSize, orderBy }),
    prisma.carrierClient.count({ where }),
  ]);

  return { items, total };
}
```

## Step 2: Define Column Configuration

Create a column configuration file for your DataGrid:

```typescript
// app/(owner)/carrier/clients/columns.ts
'use client';

import type { ExtendedColumnDef } from '@/components/data-grid';
import type { CarrierClient } from '@/generated/prisma';
import { Badge } from '@/components/ui/badge';

export const clientColumns: ExtendedColumnDef<CarrierClient>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    enableSorting: true,
    meta: {
      freezable: true,
      defaultFrozen: true,
      filterType: 'text',
      editable: true,
      editType: 'text',
    },
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    enableSorting: true,
    cell: ({ row }) => {
      const status = row.original.status;
      return (
        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
          {status}
        </Badge>
      );
    },
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
        { value: 'blocked', label: 'Blocked' },
      ],
      editable: true,
      editType: 'select',
    },
  },
  {
    id: 'primaryContact',
    accessorKey: 'primaryContact',
    header: 'Primary Contact',
    enableSorting: true,
    meta: {
      filterType: 'text',
    },
  },
  {
    id: 'email',
    accessorKey: 'email',
    header: 'Email',
    enableSorting: true,
    meta: {
      filterType: 'text',
    },
  },
  {
    id: 'city',
    accessorKey: 'city',
    header: 'City',
    enableSorting: true,
  },
  {
    id: 'state',
    accessorKey: 'state',
    header: 'State',
    enableSorting: true,
  },
  {
    id: 'portalAccess',
    accessorKey: 'portalAccess',
    header: 'Portal Access',
    cell: ({ row }) => (row.original.portalAccess ? 'Yes' : 'No'),
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ],
    },
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Created',
    enableSorting: true,
    cell: ({ row }) => {
      const date = row.original.createdAt;
      return date instanceof Date ? date.toLocaleDateString() : String(date);
    },
    meta: {
      filterType: 'date',
    },
  },
];
```

## Step 3: Create DataGrid Client Component

Create a client component that wraps DataGrid with your specific configuration:

```typescript
// app/(owner)/carrier/clients/ClientsDataGrid.tsx
'use client';

import { useRouter } from 'next/navigation';
import { DataGrid, GridShell, GridToolbar, GridBody } from '@/components/data-grid';
import { clientColumns } from './columns';
import type { ServerFetchResult } from '@/components/data-grid';
import type { CarrierClient } from '@/generated/prisma';
import { toast } from 'sonner';

interface ClientsDataGridProps {
  initialData: { items: CarrierClient[]; total: number };
}

export function ClientsDataGrid({ initialData }: ClientsDataGridProps) {
  const router = useRouter();

  // Server-side data fetcher
  const dataFetcher = async (params: {
    page: number;
    pageSize: number;
    sort: { field: string; direction: 'asc' | 'desc' } | null;
    filters: unknown[];
    search: string;
  }): Promise<ServerFetchResult<CarrierClient>> => {
    const queryParams = new URLSearchParams({
      page: String(params.page + 1), // DataGrid uses 0-indexed, API uses 1-indexed
      pageSize: String(params.pageSize),
      ...(params.search && { search: params.search }),
      ...(params.sort && { sort: `${params.sort.field}:${params.sort.direction}` }),
      ...(params.filters.length > 0 && { filters: JSON.stringify(params.filters) }),
    });

    const res = await fetch(`/api/v1/carrier/clients?${queryParams}`);
    if (!res.ok) throw new Error('Failed to fetch clients');

    const json = await res.json();
    return { rows: json.data.items, total: json.data.total };
  };

  // Handle inline edit
  const handleCellEdit = async (
    rowId: string,
    columnId: string,
    newValue: unknown,
    oldValue: unknown
  ) => {
    const res = await fetch(`/api/v1/carrier/clients/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [columnId]: newValue }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error ?? 'Failed to update client');
    }
  };

  // Handle row double-click
  const handleRowDoubleClick = (row: CarrierClient) => {
    router.push(`/carrier/clients/${row.id}`);
  };

  return (
    <DataGrid
      gridId="clients"
      columns={clientColumns}
      dataFetcher={dataFetcher}
      rowIdAccessor={(row) => row.id}
      enableSelection
      enableUrlSync
      enablePersistence
      onRowDoubleClick={handleRowDoubleClick}
      onCellEdit={handleCellEdit}
      refreshAfterEdit={true}
    >
      <GridShell>
        {/* Pass required GridToolbar props */}
        <GridToolbar
          showNew
          onNew={() => router.push('/carrier/clients/new')}
          searchPlaceholder="Search clients..."
          columns={clientColumns}
          dataFetcher={dataFetcher}
          filters={[]} // Will be managed by useGridUrlState
          onFiltersChange={() => {}}
          sort={null}
          search=""
          setDensity={() => {}}
        />
        <GridBody />
      </GridShell>
    </DataGrid>
  );
}
```

## Step 4: Update Page Component

Replace your existing page component:

**Before:**
```typescript
// app/(owner)/carrier/clients/page.tsx
import { ClientList } from '@/components/carrier/clients/ClientList';

export default async function ClientsPage() {
  const session = await getSession();
  const clients = await listClients(session.tenantId);

  return <ClientList clients={clients.items} />;
}
```

**After:**
```typescript
// app/(owner)/carrier/clients/page.tsx
import { ClientsDataGrid } from './ClientsDataGrid';

export default async function ClientsPage() {
  const session = await getSession();
  const initialData = await listClients(session.tenantId, { page: 1, pageSize: 25 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Clients</h1>
      </div>

      <ClientsDataGrid initialData={initialData} />
    </div>
  );
}
```

## Step 5: Test Checklist

Before deploying, verify all functionality works:

- [ ] **List renders** - Initial data loads correctly
- [ ] **Pagination** - Can navigate between pages
- [ ] **Sorting** - Click column headers to sort
- [ ] **Global search** - Search input filters results
- [ ] **Column filters** - Open filter panel, add filters, see results update
- [ ] **Filter chips** - Active filters shown as chips, can remove
- [ ] **Saved views** - Save view, switch between views, update/delete works
- [ ] **URL state** - Copy URL with filters/sort, paste in new tab, state persists
- [ ] **Inline edit** - Double-click editable cell, edit, save (green flash), error (red flash + revert)
- [ ] **Row selection** - Check checkboxes, select all, clear selection
- [ ] **Bulk actions** - Select rows, perform bulk action
- [ ] **Export visible** - Exports current page to CSV
- [ ] **Export selected** - Exports only selected rows
- [ ] **Export all** - Shows progress, exports with current filters applied
- [ ] **Row double-click** - Double-click navigates to detail page
- [ ] **Keyboard nav** - Tab through cells, arrow keys, Enter to edit
- [ ] **Column visibility** - Toggle columns on/off
- [ ] **Density modes** - Switch between compact/normal/comfortable
- [ ] **Empty state** - Shows when no data
- [ ] **Loading state** - Shows skeleton during fetch
- [ ] **Error state** - Shows error message on fetch failure

## Common Gotchas

### 1. Page Indexing Mismatch

DataGrid uses 0-indexed pages, but most APIs use 1-indexed. Convert in dataFetcher:

```typescript
page: String(params.page + 1)  // Add 1 for API
```

### 2. Column ID Must Match API Field

The `columnId` in filters must match the Prisma field name exactly:

```typescript
{ id: 'createdAt', accessorKey: 'createdAt' }  // Must match DB column
```

### 3. Filter URL Encoding

Filters are JSON-encoded in URL. Long filter arrays can hit URL length limits. Consider:
- Using saved views for complex filter combinations
- Server-side saved filters (future enhancement)

### 4. Inline Edit Type Mismatch

Ensure `editType` matches the column's data type:

```typescript
meta: {
  editable: true,
  editType: 'select',           // For enum/status fields
  filterOptions: [...],          // Required for select editType
}
```

### 5. Server-Side vs Client-Side Filtering

- **Server-side** (dataFetcher): Use for large datasets, filters run in database
- **Client-side** (data prop): Use for small datasets (<1000 rows), filters run in browser

Don't mix both - choose one approach.

## Performance Tips

1. **Add database indexes** for sortable/filterable columns
2. **Limit initial pageSize** to 25-50 rows
3. **Use select** in Prisma queries to only fetch needed fields
4. **Enable URL sync** to reduce client-side state
5. **Set export cap** at 50k rows max to prevent timeouts

## Migration Checklist

- [ ] API endpoint extended with sort/filter/page params
- [ ] Data access layer handles GridFilter[] conversion
- [ ] Column configuration created with proper meta
- [ ] DataGrid client component created
- [ ] Page component updated to use DataGrid
- [ ] All functionality tested (see Test Checklist)
- [ ] Database indexes added for sorted columns
- [ ] URL state is shareable (test in incognito)

## Example: Full Migration

See `apps/web/src/app/(owner)/carrier/clients/` for the canonical reference implementation.

## Need Help?

- Check existing implementations in `/app/(owner)/carrier/`
- Review DataGrid API docs in `/components/data-grid/README.md`
- Search codebase for `useDataGrid` usage examples
