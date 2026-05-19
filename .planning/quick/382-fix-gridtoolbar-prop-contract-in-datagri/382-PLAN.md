---
phase: quick-382
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx
autonomous: true

must_haves:
  truths:
    - "Vercel build succeeds (TypeScript compilation passes)"
    - "GridToolbar receives all 6 required props in DataGridDemoClient"
    - "No `as any` is used anywhere in the change"
    - "GridToolbar.tsx and all production pages remain untouched"
  artifacts:
    - path: "apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx"
      provides: "Demo client passing complete GridToolbar prop contract"
      contains: "filters={filters}"
  key_links:
    - from: "DataGridDemoClient.tsx"
      to: "GridToolbar"
      via: "props: columns, filters, onFiltersChange, sort, search, setDensity"
      pattern: "filters=\\{filters\\}"
---

<objective>
Fix Vercel build failure caused by missing required GridToolbar props in the
data-grid demo page. Add minimal stubs only — no real filter/sort/density
logic. This is a build unblock, not a feature implementation.

Purpose: Unblock Vercel deployment by satisfying GridToolbar's TypeScript prop
contract in the demo page.
Output: Compilable DataGridDemoClient.tsx with zero TypeScript errors.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx
@apps/web/src/components/data-grid/index.ts
@apps/web/src/components/data-grid/shell/GridToolbar.tsx

# Verified facts
# - GridToolbar prop contract (GridToolbar.tsx lines 51-81) requires:
#     columns: ExtendedColumnDef<TData>[]
#     filters: GridFilter[]
#     onFiltersChange: (filters: GridFilter[]) => void
#     sort: { field: string; direction: 'asc' | 'desc' } | null
#     search: string
#     setDensity: (density: DensityMode) => void
# - Types GridFilter, ExtendedColumnDef, DensityMode are all exported from
#   '@/components/data-grid' (index.ts lines 22-58).
# - Current GridToolbar usage is at lines 262-269 of DataGridDemoClient.tsx
#   and only passes: showNew, onNew, searchPlaceholder, exportFilename,
#   onSearch, searchValue.
# - searchQuery local state already exists in the file (passed as searchValue).
# - columns variable already exists (typed ColumnDef<User>[]).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missing imports, stub state, and pass full GridToolbar prop contract</name>
  <files>apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx</files>
  <action>
    1. Extend the existing import from '@/components/data-grid' (currently
       lines 13-26) to also import the three missing type-only members:
         - GridFilter
         - ExtendedColumnDef
         - DensityMode
       Add them alongside the existing `type DataGridColumnMeta` and
       `type BulkAction` imports, e.g.:
         type GridFilter,
         type ExtendedColumnDef,
         type DensityMode,

    2. Inside the DataGridDemoClient component (after the existing
       searchQuery state, before the JSX `return`), add three stub state /
       callback declarations:
         const [filters, setFilters] = React.useState<GridFilter[]>([]);
         const [sort] = React.useState<{ field: string; direction: 'asc' | 'desc' } | null>(null);
         const handleSetDensity = React.useCallback((_d: DensityMode) => {}, []);

       These are intentional stubs — DO NOT wire them to any real
       filtering/sorting/density logic.

    3. Update the GridToolbar usage (currently at lines ~262-269) to pass
       all 6 previously-missing props in addition to the existing props:
         <GridToolbar
           showNew
           onNew={handleNew}
           searchPlaceholder="Search users..."
           exportFilename="users-export"
           onSearch={setSearchQuery}
           searchValue={searchQuery}
           columns={columns as ExtendedColumnDef<User>[]}
           filters={filters}
           onFiltersChange={setFilters}
           sort={sort}
           search={searchQuery}
           setDensity={handleSetDensity}
         />

       Constraints (CRITICAL):
       - Do NOT use `as any` anywhere. The single cast allowed is
         `columns as ExtendedColumnDef<User>[]` because the demo declares
         columns as ColumnDef<User>[] (TanStack base type) but GridToolbar
         requires the extended variant — this is a safe widening cast at a
         narrow surface, NOT an `any`.
       - Do NOT modify apps/web/src/components/data-grid/shell/GridToolbar.tsx.
       - Do NOT modify any production page (anything outside the
         (dev)/data-grid-demo directory).
       - Do NOT add real filter/sort/density logic.
       - Leave all other props (showNew, onNew, etc.) intact.
  </action>
  <verify>
    From the apps/web directory, run:
      npx tsc --noEmit

    Expected: command completes with zero errors. In particular, the
    previous error at DataGridDemoClient.tsx:262 about missing GridToolbar
    props must be gone.

    Also grep the file to confirm no `as any` was introduced:
      grep -n "as any" apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx
    Expected: no matches.
  </verify>
  <done>
    - DataGridDemoClient.tsx imports GridFilter, ExtendedColumnDef, DensityMode
      from '@/components/data-grid'.
    - Stub state for `filters`/`setFilters`, `sort`, and `handleSetDensity`
      exists inside the component.
    - GridToolbar usage passes all 6 previously-missing props.
    - No `as any` appears in the file.
    - `npx tsc --noEmit` from apps/web reports zero errors.
    - GridToolbar.tsx and every file outside the
      (dev)/data-grid-demo directory are unchanged.
  </done>
</task>

</tasks>

<verification>
1. Run `npx tsc --noEmit` from apps/web — must report zero errors.
2. `git diff --name-only` must show ONLY
   `apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx`.
3. `grep -n "as any" apps/web/src/app/(dev)/data-grid-demo/DataGridDemoClient.tsx`
   must return no matches.
</verification>

<success_criteria>
- TypeScript build (`npx tsc --noEmit` from apps/web) passes.
- Only DataGridDemoClient.tsx was modified.
- No `as any` introduced.
- GridToolbar prop contract fully satisfied in the demo.
- Vercel deploy is unblocked.
</success_criteria>

<output>
After completion, create
`.planning/quick/382-fix-gridtoolbar-prop-contract-in-datagri/382-SUMMARY.md`
</output>
