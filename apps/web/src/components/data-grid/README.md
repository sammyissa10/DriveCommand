# DataGrid Component System

Production-ready DataGrid with filters, saved views, inline editing, CSV export, and keyboard navigation.

## Features

✅ **Server-side pagination, sorting, and filtering** - Handles datasets of any size
✅ **4 filter types** - Text, select, number range, date range with 15+ operators
✅ **Saved views** - Save filter/sort/column configurations per user
✅ **Inline editing** - Text, select, and date variants with optimistic updates
✅ **CSV export** - Three modes: visible, selected, all (with progress tracking)
✅ **URL state sync** - Shareable links with filters, sort, and page state
✅ **Keyboard navigation** - Full keyboard accessibility (Tab, arrows, Enter to edit)
✅ **Column management** - Freeze, reorder, hide/show, resize columns
✅ **Density modes** - Compact, normal, comfortable row spacing
✅ **Dark mode** - Full theme support
✅ **TypeScript** - Fully typed with comprehensive interfaces

## Quick Start

```tsx
'use client';

import { DataGrid, GridShell, GridToolbar, GridBody } from '@/components/data-grid';
import type { ExtendedColumnDef } from '@/components/data-grid';

const columns: ExtendedColumnDef<User>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    enableSorting: true,
    meta: {
      filterType: 'text',
      editable: true,
      editType: 'text',
    },
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    meta: {
      filterType: 'select',
      filterOptions: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
      editable: true,
      editType: 'select',
    },
  },
];

export function UsersDataGrid() {
  const dataFetcher = async (params) => {
    const res = await fetch(`/api/users?${buildQueryString(params)}`);
    const json = await res.json();
    return { rows: json.data, total: json.total };
  };

  const handleCellEdit = async (rowId, columnId, newValue) => {
    await fetch(`/api/users/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ [columnId]: newValue }),
    });
  };

  return (
    <DataGrid
      gridId="users"
      columns={columns}
      dataFetcher={dataFetcher}
      enableUrlSync
      enablePersistence
      onCellEdit={handleCellEdit}
    >
      <GridShell>
        <GridToolbar showNew onNew={() => {}} {...toolbarProps} />
        <GridBody />
      </GridShell>
    </DataGrid>
  );
}
```

## Architecture

### Components

```
data-grid/
├── core/               # Headless logic (no UI)
│   ├── DataGrid.tsx    # Main orchestrator
│   ├── useDataGrid.ts  # Composed hook
│   ├── types.ts        # TypeScript definitions
│   ├── useGridPreferences.ts
│   ├── useGridUrlState.ts
│   └── useGridSelection.ts
├── shell/              # Visual layer
│   ├── GridShell.tsx   # Container with frozen panes
│   ├── GridToolbar.tsx # Search, filters, export, etc.
│   ├── GridHeader.tsx  # Column headers
│   ├── GridBody.tsx    # Virtualized rows
│   ├── GridRow.tsx     # Individual row
│   ├── GridCell.tsx    # Cell renderer
│   └── GridFooter.tsx  # Pagination
├── filters/            # Filter system
│   ├── FilterPanel.tsx # Slide-out panel
│   ├── FilterChip.tsx  # Active filter pills
│   └── filterTypes/    # Text, select, date, number
├── views/              # Saved views
│   ├── SavedViewsMenu.tsx
│   └── useSavedViews.ts
├── inline-edit/        # Inline editing
│   └── InlineEditCell.tsx
└── export/             # CSV export
    └── exportToCsv.ts
```

### Data Flow

```
User Action → URL State → useDataGrid → dataFetcher → API → Database
                ↓
         preferences → GridShell → GridBody → GridCell → InlineEditCell
```

## API Reference

### DataGrid Props

```typescript
interface DataGridProps<TData> {
  gridId: string;                    // Unique ID (for preferences)
  columns: ExtendedColumnDef<TData>[];
  data?: TData[];                    // Static data (mutually exclusive with dataFetcher)
  dataFetcher?: ServerDataFetcher<TData>; // Server-side fetcher
  rowIdAccessor?: (row: TData) => string;
  initialPageSize?: number;          // Default: 25
  enableSelection?: boolean;
  enableUrlSync?: boolean;           // Sync state to URL
  enablePersistence?: boolean;       // Save preferences to DB
  onSelectionChange?: (ids: Set<string>) => void;
  onRowDoubleClick?: (row: TData) => void;
  onCellEdit?: (rowId, columnId, newValue, oldValue) => Promise<void>;
  refreshAfterEdit?: boolean;        // Default: true
}
```

### Column Definition

```typescript
interface ExtendedColumnDef<TData> extends ColumnDef<TData> {
  meta?: {
    freezable?: boolean;             // Can be frozen (pinned left)
    defaultFrozen?: boolean;         // Frozen by default
    filterType?: 'text' | 'number' | 'date' | 'select' | 'boolean';
    filterOptions?: Array<{ value: string; label: string }>;
    editable?: boolean;              // Inline editable
    editType?: 'text' | 'select' | 'date';
    exportable?: boolean;            // Include in CSV export
    exportValue?: (row: TData) => string;  // Custom export formatter
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
  };
}
```

### Server Data Fetcher

```typescript
type ServerDataFetcher<TData> = (params: {
  sort: { field: string; direction: 'asc' | 'desc' } | null;
  page: number;                      // 0-indexed
  pageSize: number;
  filters: GridFilter[];
  search: string;
}) => Promise<{
  rows: TData[];
  total: number;
}>;
```

### Filter Types

```typescript
type GridFilter = {
  columnId: string;
  operator: FilterOperator;
  value: unknown;
  valueTo?: unknown;  // For 'between' operator
};

// Text operators
type TextFilterOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty';

// Select operators
type SelectFilterOperator = 'anyOf' | 'noneOf' | 'isEmpty';

// Number operators
type NumberFilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'between' | 'isEmpty';

// Date operators
type DateFilterOperator = 'is' | 'before' | 'after' | 'between' | 'inLastNDays' | 'isEmpty';
```

## Usage Patterns

### Pattern 1: Server-Side Data (Recommended for large datasets)

```tsx
const dataFetcher = async (params) => {
  const queryString = new URLSearchParams({
    page: String(params.page + 1),  // API uses 1-indexed
    pageSize: String(params.pageSize),
    ...(params.sort && { sort: `${params.sort.field}:${params.sort.direction}` }),
    ...(params.filters.length && { filters: JSON.stringify(params.filters) }),
    ...(params.search && { search: params.search }),
  });

  const res = await fetch(`/api/data?${queryString}`);
  const json = await res.json();
  return { rows: json.data, total: json.total };
};

<DataGrid dataFetcher={dataFetcher} ... />
```

### Pattern 2: Client-Side Data (For <1000 rows)

```tsx
<DataGrid data={staticData} ... />
```

### Pattern 3: Inline Editing

```tsx
const handleCellEdit = async (rowId, columnId, newValue, oldValue) => {
  // Call API
  const res = await fetch(`/api/items/${rowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [columnId]: newValue }),
  });

  if (!res.ok) throw new Error('Update failed');
};

<DataGrid onCellEdit={handleCellEdit} refreshAfterEdit={true} ... />
```

### Pattern 4: Saved Views

Saved views are automatic - just enable persistence:

```tsx
<DataGrid enablePersistence ... />
```

Users can save current filter/sort/column state via the SavedViewsMenu in the toolbar.

### Pattern 5: CSV Export

Export is built into GridToolbar. Three modes:
1. **Export visible** - Current page
2. **Export selected** - Selected rows only
3. **Export all** - All rows matching current filters (with progress)

```tsx
// Customize export format
{
  id: 'revenue',
  accessorKey: 'revenue',
  header: 'Revenue',
  meta: {
    exportValue: (row) => `$${row.revenue.toFixed(2)}`,
  },
}
```

## Keyboard Shortcuts

- **Tab** - Move to next cell
- **Shift+Tab** - Move to previous cell
- **Arrow keys** - Navigate cells
- **Enter** - Start editing (if editable)
- **Escape** - Cancel editing
- **Ctrl/Cmd+A** - Select all rows
- **Space** - Toggle row selection

## Performance

- **Virtualization** - Only renders visible rows
- **Server-side operations** - Filters/sort/page run in database
- **Optimistic updates** - Inline edits show immediately
- **URL debouncing** - Search input debounced 300ms
- **Export streaming** - CSV generated in chunks to avoid memory issues
- **Export cap** - Hard limit of 50k rows to prevent timeouts

## Accessibility

- **ARIA roles** - Proper grid/row/cell semantics
- **Keyboard navigation** - Full keyboard support
- **Screen reader** - Meaningful labels and descriptions
- **Focus management** - Visible focus indicators
- **Color contrast** - WCAG AA compliant

## Migration Guide

See [MIGRATION.md](./MIGRATION.md) for step-by-step instructions on migrating existing list pages.

## Examples

- **Reference implementation**: `app/(owner)/carrier/clients/`
- **Demo page**: `app/(dev)/data-grid-demo/`

## Troubleshooting

### Filters not working

Check that:
1. Column `id` matches database field name exactly
2. Filter operator is supported for that data type
3. API endpoint parses and applies filters correctly

### Inline edit reverts immediately

Check that:
1. `onCellEdit` returns a Promise
2. API returns success (200-299 status)
3. Error handling doesn't swallow exceptions

### Export all times out

Check that:
1. Dataset is under 50k rows
2. Database has indexes on filtered/sorted columns
3. API pagination works correctly

### URL state not persisting

Check that:
1. `enableUrlSync={true}` is set
2. Component is client-side (`'use client'`)
3. No conflicting URL state management

## License

Internal use only - part of DriveCommand v5.0
