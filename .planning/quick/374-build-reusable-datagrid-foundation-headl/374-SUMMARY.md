---
phase: quick-374
plan: 01
subsystem: data-grid
tags:
  - ui-infrastructure
  - tanstack-table
  - headless-component
dependency-graph:
  requires: []
  provides:
    - DataGrid headless component
    - useDataGrid orchestration hook
    - useGridPreferences hook
    - useGridUrlState hook
    - useGridSelection hook
    - GridPreference Prisma model
    - /api/user/grid-preferences/[gridId] API route
  affects:
    - Future list pages (Clients, Contracts, Dispatches)
tech-stack:
  added:
    - nuqs@2.8.9 (URL state management)
    - zustand@5.0.13 (lightweight state stores)
    - "@tanstack/react-virtual@3.13.24" (virtualization, future use)
  patterns:
    - Headless component with context + render props
    - Zustand store factory per gridId
    - Debounced preference persistence (500ms)
    - Server-first with localStorage fallback
key-files:
  created:
    - apps/web/src/components/data-grid/core/types.ts
    - apps/web/src/components/data-grid/core/useGridPreferences.ts
    - apps/web/src/components/data-grid/core/useGridUrlState.ts
    - apps/web/src/components/data-grid/core/useGridSelection.ts
    - apps/web/src/components/data-grid/core/useDataGrid.ts
    - apps/web/src/components/data-grid/core/DataGrid.tsx
    - apps/web/src/components/data-grid/index.ts
    - apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts
    - apps/web/src/components/data-grid/__tests__/useGridSelection.test.ts
  modified:
    - apps/web/package.json
    - apps/web/prisma/schema.prisma
    - apps/web/src/generated/prisma/*
decisions:
  - Extended ColumnDef via meta property (not interface extension) for TanStack Table compatibility
  - nuqs parseAsJson requires validator function for type safety
  - Zustand store factory pattern for per-grid state isolation
  - Array.from() for Set iteration to avoid downlevelIteration issues
metrics:
  duration: 1844s
  completed: 2026-05-19
---

# Quick Task 374: Build Reusable DataGrid Foundation Summary

Built headless TanStack Table-based DataGrid infrastructure with URL sync, user preferences, and multi-select.

## What Was Built

### 1. Type System (`types.ts`)
- **ExtendedColumnDef<TData>**: Column definition with meta (freezable, filterType, editable, exportable, width constraints)
- **GridPreferences**: Column order, widths, hidden/frozen columns, density, pageSize
- **ServerDataFetcher<TData>**: Type for server-side data fetching with sort/page/filters/search
- **DataGridProps/Ref**: Component props and imperative handle types
- Full generic support throughout with no `any` types

### 2. State Hooks
- **useGridPreferences**: Loads from DB first via `/api/user/grid-preferences/[gridId]`, falls back to localStorage for anonymous users. Debounced saves (500ms) to avoid API spam.
- **useGridUrlState**: nuqs-based URL sync for sort (`name:asc`), page (1-indexed in URL), pageSize, search (`q`), filters (JSON). Supports browser back/forward.
- **useGridSelection**: Zustand store per gridId. Supports shift-range selection, cmd/ctrl-toggle, select all, clear.

### 3. Orchestration Hook (`useDataGrid`)
- Composes all three state hooks with TanStack Table
- Handles both client-side data and server-side dataFetcher mode
- Applies preference overrides (column order, visibility, widths, frozen)
- Provides imperative methods: refresh(), resetPreferences(), clearSelection(), exportCsv()
- Manages server data fetching with fetch ID tracking to prevent stale updates

### 4. Headless Component (`DataGrid.tsx`)
- forwardRef with generic type preservation
- DataGridContext for compound component pattern
- Render props (renderHeader, renderRow, renderEmpty, renderLoading)
- Imperative ref API via useImperativeHandle
- Children support for composition

### 5. API Route
- `GET /api/user/grid-preferences/[gridId]`: Returns preferences or 404
- `PUT /api/user/grid-preferences/[gridId]`: Upsert with Zod validation
- Auth required (401 for anonymous)

### 6. Database
- `GridPreference` model with userId+gridId unique constraint
- Fields: columnOrder, columnWidths (JSON), hiddenColumns, frozenColumns, density, pageSize

## Key Design Decisions

1. **Headless by default**: No built-in UI; consumers compose their own tables/cards/lists
2. **Zustand store factory**: Each gridId gets isolated state; no cross-grid interference
3. **Server-first persistence**: DB for authenticated users, localStorage fallback for guests
4. **nuqs for URL state**: Native browser history integration, shareable URLs
5. **TanStack Table integration**: Standard column definitions extended via meta property

## Test Coverage

18 unit tests covering:
- `computeSelectionRange`: Range selection with forward/reverse/single/full cases
- `parseSortString` / `formatSortString`: URL sort parameter parsing
- `DEFAULT_GRID_PREFERENCES`: Default value verification and merge behavior

## Commits

| Hash | Description |
|------|-------------|
| a0c0712c | Install deps, create types.ts, add GridPreference Prisma model |
| f6cd82b8 | Create useGridPreferences, useGridUrlState, useGridSelection, API route |
| 4b9f0dd5 | Create useDataGrid, DataGrid.tsx, barrel export, unit tests |

## Deviations from Plan

None - plan executed exactly as written.

## Usage Example

```tsx
import { DataGrid, useDataGrid } from '@/components/data-grid';

// With render props
<DataGrid
  gridId="clients"
  columns={columns}
  data={clients}
  enableSelection
  enableUrlSync
  enablePersistence
  renderRow={(row) => <ClientRow row={row} />}
/>

// With hook for full control
const { table, selection, exportCsv } = useDataGrid({
  gridId: "clients",
  columns,
  dataFetcher: async (params) => {
    const res = await fetchClients(params);
    return { rows: res.data, total: res.total };
  },
  enableUrlSync: true,
});
```

## Self-Check: PASSED

All created files verified:
- apps/web/src/components/data-grid/core/types.ts: FOUND
- apps/web/src/components/data-grid/core/useGridPreferences.ts: FOUND
- apps/web/src/components/data-grid/core/useGridUrlState.ts: FOUND
- apps/web/src/components/data-grid/core/useGridSelection.ts: FOUND
- apps/web/src/components/data-grid/core/useDataGrid.ts: FOUND
- apps/web/src/components/data-grid/core/DataGrid.tsx: FOUND
- apps/web/src/components/data-grid/index.ts: FOUND
- apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts: FOUND

Commits verified:
- a0c0712c: FOUND
- f6cd82b8: FOUND
- 4b9f0dd5: FOUND

TypeScript: `npx tsc --noEmit` passes
Prisma: `npx prisma validate` passes
Tests: 18/18 passing
