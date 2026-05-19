---
phase: quick-374
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
  - apps/web/src/components/data-grid/core/types.ts
  - apps/web/src/components/data-grid/core/useGridPreferences.ts
  - apps/web/src/components/data-grid/core/useGridUrlState.ts
  - apps/web/src/components/data-grid/core/useGridSelection.ts
  - apps/web/src/components/data-grid/core/useDataGrid.ts
  - apps/web/src/components/data-grid/core/DataGrid.tsx
  - apps/web/src/components/data-grid/index.ts
  - apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts
  - apps/web/prisma/schema.prisma
autonomous: true

must_haves:
  truths:
    - "DataGrid<TData> component accepts columns, data/dataFetcher, and gridId"
    - "Column preferences (order, width, visibility, frozen, density, pageSize) persist per gridId+userId"
    - "Sort, page, search, filters sync to URL via nuqs for shareable views"
    - "Multi-select supports shift-range and cmd/ctrl-toggle"
    - "Server-side and client-side data modes both work"
    - "Imperative ref API exposes refresh(), resetPreferences(), clearSelection(), exportCsv()"
  artifacts:
    - path: "apps/web/src/components/data-grid/core/types.ts"
      provides: "DataGridProps, ExtendedColumnDef, GridState types"
    - path: "apps/web/src/components/data-grid/core/useDataGrid.ts"
      provides: "Orchestration hook composing TanStack Table + preferences + URL + selection"
    - path: "apps/web/src/components/data-grid/core/DataGrid.tsx"
      provides: "Headless wrapper with render slots via context"
    - path: "apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts"
      provides: "GET/PUT API for persisting user grid preferences"
  key_links:
    - from: "useDataGrid"
      to: "useGridPreferences + useGridUrlState + useGridSelection"
      via: "hook composition"
    - from: "useGridPreferences"
      to: "/api/user/grid-preferences/[gridId]"
      via: "fetch/PUT with debounce"
    - from: "useGridUrlState"
      to: "nuqs"
      via: "useQueryState hooks"
---

<objective>
Build reusable DataGrid foundation with headless TanStack Table integration, Zustand state management, nuqs URL sync, and user preference persistence.

Purpose: Create a flexible, headless DataGrid infrastructure that can power all list pages (Clients, Contracts, Dispatches, etc.) with consistent behavior for sorting, filtering, selection, column customization, and URL state.

Output: Complete headless DataGrid component with hooks, types, API route, and Prisma model.
</objective>

<context>
@apps/web/package.json
@apps/web/src/components/trucks/truck-list.tsx (existing TanStack Table pattern)
@apps/web/src/lib/auth/supabase.ts (auth pattern for API route)
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dependencies and create types + Prisma model</name>
  <files>
    apps/web/package.json
    apps/web/src/components/data-grid/core/types.ts
    apps/web/prisma/schema.prisma
  </files>
  <action>
1. Install required packages:
   ```bash
   cd apps/web && npm install nuqs zustand @tanstack/react-virtual
   ```

2. Add GridPreference model to prisma/schema.prisma:
   ```prisma
   model GridPreference {
     id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     userId       String   @db.Uuid
     gridId       String   @db.VarChar(100)
     columnOrder  String[] @default([])
     columnWidths Json     @default("{}")
     hiddenColumns String[] @default([])
     frozenColumns String[] @default([])
     density      String   @default("normal")
     pageSize     Int      @default(25)
     updatedAt    DateTime @updatedAt @db.Timestamptz
     createdAt    DateTime @default(now()) @db.Timestamptz

     @@unique([userId, gridId])
     @@index([userId])
   }
   ```
   Run `npx prisma db push` after adding the model.

3. Create types.ts with comprehensive type definitions:
   - FilterType enum: 'text' | 'number' | 'date' | 'select' | 'boolean'
   - DensityMode: 'compact' | 'normal' | 'comfortable'
   - ExtendedColumnDef<TData> extending TanStack ColumnDef with: freezable?, defaultFrozen?, filterType?, editable?, exportable?, minWidth?, maxWidth?
   - GridFilter type: { columnId: string; operator: string; value: unknown }
   - GridState type: { sorting, pagination, filters, search, selection }
   - ServerDataFetcher<TData> function type accepting { sort, page, pageSize, filters, search } returning Promise<{ rows: TData[]; total: number }>
   - DataGridProps<TData> with: columns, data?, dataFetcher?, gridId, rowIdAccessor?, initialPageSize?, enableSelection?, enableUrlSync?, enablePersistence?, onSelectionChange?, onRowDoubleClick?, className?, renderHeader?, renderRow?, renderEmpty?, renderLoading?
   - DataGridRef type: { refresh(), resetPreferences(), clearSelection(), exportCsv() }
   - GridPreferences type matching DB model shape for client use

Use generics properly. No `any` types. Export all types from barrel.
  </action>
  <verify>
    - `npm list nuqs zustand @tanstack/react-virtual` shows all installed
    - `npx prisma validate` passes
    - `npx tsc --noEmit apps/web/src/components/data-grid/core/types.ts` passes (no type errors)
  </verify>
  <done>
    - Dependencies installed in package.json
    - GridPreference model added to schema and pushed to DB
    - types.ts exports all DataGrid types with proper generics, no `any`
  </done>
</task>

<task type="auto">
  <name>Task 2: Create state management hooks (preferences, URL, selection)</name>
  <files>
    apps/web/src/components/data-grid/core/useGridPreferences.ts
    apps/web/src/components/data-grid/core/useGridUrlState.ts
    apps/web/src/components/data-grid/core/useGridSelection.ts
    apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts
  </files>
  <action>
1. Create useGridPreferences.ts:
   - Accepts gridId, enabled flag
   - On mount: fetch from `/api/user/grid-preferences/[gridId]` (DB first)
   - If API returns 404 or user not logged in: fallback to localStorage key `grid-prefs-${gridId}`
   - Return { preferences, setColumnOrder, setColumnWidth, setHiddenColumns, setFrozenColumns, setDensity, setPageSize, resetPreferences, isLoading }
   - setters use debounced save (500ms) - PUT to API if authenticated, else localStorage
   - SSR-safe: check `typeof window !== 'undefined'` before localStorage access
   - Use zustand store scoped by gridId for cross-component reactivity

2. Create useGridUrlState.ts:
   - Uses nuqs: useQueryState for sort (string: "field:asc" or "field:desc"), page (number), pageSize (number), search (string)
   - Uses nuqs: useQueryState with JSON serializer for filters array
   - Return { sort, setSort, page, setPage, pageSize, setPageSize, search, setSearch, filters, setFilters }
   - All state changes reflect immediately in URL for shareable views and back/forward navigation
   - Parse sort string into { field, direction } helper

3. Create useGridSelection.ts:
   - Uses zustand store scoped by gridId
   - Maintains Set<string> of selected row IDs
   - selectRow(id, event): if shift + lastSelectedId exists, select range; if cmd/ctrl, toggle single; else replace selection
   - selectRange(startId, endId, allRowIds): select all IDs between start and end inclusive
   - selectAll(allRowIds): select all
   - clearSelection(): empty set
   - isSelected(id): check if in set
   - Return { selectedIds, selectRow, selectAll, clearSelection, isSelected, selectedCount }

4. Create API route at /api/user/grid-preferences/[gridId]/route.ts:
   - GET: getSession(), if no session return 401; prisma.gridPreference.findUnique({ where: { userId_gridId } }); return JSON or 404
   - PUT: getSession(), validate body with zod schema (columnOrder, columnWidths, hiddenColumns, frozenColumns, density, pageSize all optional), prisma.gridPreference.upsert({ where: { userId_gridId }, create: {..., userId, gridId }, update: {...} }); return updated record
   - Use Zod for request validation
   - Include updatedAt tracking for last-write-wins
  </action>
  <verify>
    - `npx tsc --noEmit` passes for all hook files
    - API route responds to GET/PUT (manual curl test or unit test)
  </verify>
  <done>
    - useGridPreferences loads from DB first, localStorage fallback, debounced save
    - useGridUrlState syncs sort/page/search/filters to URL via nuqs
    - useGridSelection implements shift-range and cmd/ctrl-toggle multi-select
    - API route handles GET/PUT with zod validation and auth check
  </done>
</task>

<task type="auto">
  <name>Task 3: Create useDataGrid orchestration hook and DataGrid component</name>
  <files>
    apps/web/src/components/data-grid/core/useDataGrid.ts
    apps/web/src/components/data-grid/core/DataGrid.tsx
    apps/web/src/components/data-grid/index.ts
  </files>
  <action>
1. Create useDataGrid.ts orchestration hook:
   - Generic: useDataGrid<TData>(props: DataGridProps<TData>)
   - Compose: useGridPreferences (if enablePersistence), useGridUrlState (if enableUrlSync), useGridSelection (if enableSelection)
   - Create TanStack Table instance with useReactTable:
     - data: props.data or fetched via props.dataFetcher
     - columns: props.columns mapped to apply preference overrides (order, visibility, widths)
     - state: { sorting, pagination, rowSelection } derived from composed hooks
     - manualPagination: true if dataFetcher provided
     - manualSorting: true if dataFetcher provided
     - pageCount: calculated from total / pageSize if server-side
   - If dataFetcher provided: useEffect to call dataFetcher when sort/page/filters/search change, manage loading state
   - Compute columnOrder from preferences or column definition order
   - Apply frozen columns by sorting them to start
   - Expose imperative methods via returned object: refresh (refetch data), resetPreferences, clearSelection, exportCsv (generate CSV from visible columns and current data)
   - Return: { table, isLoading, preferences, selection, urlState, refresh, resetPreferences, clearSelection, exportCsv }

2. Create DataGrid.tsx as headless wrapper:
   - forwardRef component with DataGridRef
   - Accept DataGridProps<TData>
   - Call useDataGrid internally
   - Create DataGridContext providing: table, isLoading, preferences, selection, density
   - useImperativeHandle to expose ref methods
   - Render children via render props or slots: props.renderHeader?.(table), props.renderRow?.(row), etc.
   - If no render props provided, render nothing (truly headless) - consumers compose their own UI
   - Export DataGridContext and useDataGridContext hook for child components to access state

3. Create index.ts barrel export:
   - Export DataGrid component
   - Export useDataGrid hook
   - Export useDataGridContext hook
   - Export all types from types.ts
   - Export individual hooks (useGridPreferences, useGridUrlState, useGridSelection) for advanced use

4. Write unit tests for:
   - selectRange function: given allRowIds = ['a','b','c','d','e'], selectRange('b', 'd', allRowIds) should return Set(['b','c','d'])
   - URL serialization: sort string parsing and formatting
   - Preferences merge: default values + saved preferences
  </action>
  <verify>
    - `npx tsc --noEmit` passes for all files
    - `npm test -- --grep "DataGrid"` runs unit tests (if test file created)
    - Import from `@/components/data-grid` works correctly
  </verify>
  <done>
    - useDataGrid composes all hooks and TanStack Table into single orchestration hook
    - DataGrid.tsx is headless wrapper exposing context and ref API
    - Barrel export provides clean public API
    - Unit tests cover selectRange, URL serialization, preferences merge
  </done>
</task>

</tasks>

<verification>
1. TypeScript: `cd apps/web && npx tsc --noEmit` passes with no errors
2. Prisma: `npx prisma validate` passes
3. Import test: Create temp file importing `import { DataGrid, useDataGrid } from '@/components/data-grid'` - compiles
4. API route: `curl -X GET http://localhost:3000/api/user/grid-preferences/test-grid` returns 401 (unauthenticated) or 404 (no prefs)
</verification>

<success_criteria>
- DataGrid<TData> generic component exists and is importable
- All hooks (useDataGrid, useGridPreferences, useGridUrlState, useGridSelection) work standalone
- GridPreference model in DB with migration applied
- API route handles authenticated GET/PUT for preferences
- No `any` types in codebase (TypeScript strict)
- selectRange correctly handles shift-click range selection
- URL state reflects current sort/page/search/filters
- localStorage fallback works for anonymous users
</success_criteria>

<output>
After completion, create `.planning/quick/374-build-reusable-datagrid-foundation-headl/374-SUMMARY.md`
</output>
