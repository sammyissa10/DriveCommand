---
phase: quick-149
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/app/(driver)/documents.tsx
  - apps/mobile/app/(driver)/incidents/index.tsx
  - apps/mobile/app/(driver)/incidents/new.tsx
  - apps/mobile/app/(driver)/loads/[id].tsx
  - apps/mobile/app/(driver)/loads/index.tsx
  - apps/mobile/app/(driver)/loads/my-route.tsx
  - apps/mobile/app/(driver)/messages.tsx
  - apps/mobile/app/(owner)/loads/[id].tsx
  - apps/mobile/app/(owner)/loads/index.tsx
  - apps/mobile/app/(owner)/more/compliance.tsx
  - apps/mobile/app/(owner)/more/crm/index.tsx
  - apps/mobile/app/(owner)/more/crm/new.tsx
  - apps/mobile/app/(owner)/more/fleet.tsx
  - apps/mobile/app/(owner)/more/fuel.tsx
  - apps/mobile/app/(owner)/more/index.tsx
  - apps/mobile/app/(owner)/more/invoices/index.tsx
  - apps/mobile/app/(owner)/more/invoices/new.tsx
  - apps/mobile/app/(owner)/more/payroll.tsx
  - apps/mobile/app/(owner)/more/profit-predictor.tsx
  - apps/mobile/app/(owner)/more/trucks/[id].tsx
  - apps/mobile/app/(owner)/more/trucks/index.tsx
  - apps/mobile/app/(owner)/more/trucks/new.tsx
  - apps/mobile/app/(owner)/routes/[id].tsx
  - apps/mobile/app/(owner)/routes/index.tsx
  - apps/mobile/components/driver/DocumentUploadSheet.tsx
  - apps/mobile/components/driver/LoadCard.tsx
  - apps/mobile/components/driver/RouteCard.tsx
  - apps/mobile/components/driver/StatusUpdateButton.tsx
  - apps/mobile/components/ui/LoadingSpinner.tsx
autonomous: true
must_haves:
  truths:
    - "All 29 listed mobile screens use useThemeColors() instead of hardcoded dark color classes"
    - "Light mode renders correct light palette colors on every screen"
    - "Dark mode renders correct dark palette colors on every screen"
    - "No remaining hardcoded slate-* color classes in any of the 29 files"
  artifacts:
    - path: "apps/mobile/constants/tokens.ts"
      provides: "useThemeColors hook with dark/light palettes"
    - path: "apps/mobile/app/(driver)/documents.tsx"
      provides: "Theme-aware driver documents screen"
      contains: "useThemeColors"
    - path: "apps/mobile/app/(owner)/more/index.tsx"
      provides: "Theme-aware owner more screen"
      contains: "useThemeColors"
  key_links:
    - from: "all 29 screen files"
      to: "apps/mobile/constants/tokens.ts"
      via: "import { useThemeColors }"
      pattern: "useThemeColors"
---

<objective>
Migrate all 29 mobile screens from hardcoded dark-only Tailwind color classes to theme-aware inline styles using useThemeColors(), enabling full Light/Dark mode support across the entire mobile app.

Purpose: The app currently only renders correctly in dark mode because colors are hardcoded as slate-950/800/700 classes. This migration makes every screen respond to the system color scheme via the existing useThemeColors() hook.

Output: All 29 files updated with theme-aware colors; no hardcoded slate color classes remaining.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/constants/tokens.ts (useThemeColors hook + color palettes)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate driver portal screens (7 files)</name>
  <files>
    apps/mobile/app/(driver)/documents.tsx
    apps/mobile/app/(driver)/incidents/index.tsx
    apps/mobile/app/(driver)/incidents/new.tsx
    apps/mobile/app/(driver)/loads/[id].tsx
    apps/mobile/app/(driver)/loads/index.tsx
    apps/mobile/app/(driver)/loads/my-route.tsx
    apps/mobile/app/(driver)/messages.tsx
  </files>
  <action>
For each of the 7 driver portal screen files, apply this migration:

1. Add import: `import { useThemeColors } from '../../constants/tokens'` (adjust relative path for nested files like loads/[id].tsx to `../../../constants/tokens`)

2. Inside the default export component function, add at the top: `const c = useThemeColors()`

3. Replace hardcoded color classes with inline style props using this mapping:
   - `bg-slate-950` or `bg-slate-900` -> `style={{ backgroundColor: c.background }}`
   - `bg-slate-800` -> `style={{ backgroundColor: c.surfaceCard }}`
   - `bg-slate-700` (when used as surface/container bg) -> `style={{ backgroundColor: c.surfaceElevated }}`
   - `text-white` or `text-slate-100` -> `style={{ color: c.textPrimary }}`
   - `text-slate-400` -> `style={{ color: c.textSecondary }}`
   - `text-slate-500` -> `style={{ color: c.textTertiary }}`
   - `border-slate-700` or `border-slate-800` -> `style={{ borderColor: c.border }}`
   - `bg-slate-700` (when used as divider line) -> `style={{ backgroundColor: c.border }}`
   - `bg-sky-600` or hardcoded `#0ea5e9` -> `style={{ backgroundColor: c.brand }}`
   - `text-red-400` -> `style={{ color: c.danger }}`

4. KEEP all non-color classes in className: layout (flex-1, flex-row, items-center), sizing (w-10, h-10, h-px), spacing (px-4, py-3, mt-2, mr-3, gap-2), rounded corners (rounded-xl, rounded-lg), font styles (font-semibold, font-bold, text-sm, text-xs, text-2xl), and interaction (active:opacity-80).

5. When an element has both color and non-color classes, split them:
   - Before: `className="flex-1 bg-slate-900 items-center px-6"`
   - After: `className="flex-1 items-center px-6" style={{ backgroundColor: c.background }}`

6. When an element already has an inline style object, merge theme colors into it:
   - Before: `style={{ minHeight: 72 }}` with `className="bg-slate-800 ..."`
   - After: `style={{ minHeight: 72, backgroundColor: c.surfaceCard }}`

7. For hardcoded hex colors in inline styles (like `backgroundColor: '#334155'`), map to the appropriate theme token (e.g., `c.surfaceElevated` or `c.border`).

8. For icon color props using hardcoded hex values, replace with theme tokens where semantic (e.g., `color="#94a3b8"` -> `color={c.textSecondary}`). Leave brand/status icon colors (specific purples, greens used for icon identity) as-is since those are semantic, not theme-dependent.

9. RefreshControl tintColor/colors can stay as brand color `c.brand` instead of hardcoded `#0ea5e9`.
  </action>
  <verify>
Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "(driver)" | head -20`
Grep check: `grep -rn "bg-slate-\|text-slate-\|border-slate-\|text-white" apps/mobile/app/\(driver\)/documents.tsx apps/mobile/app/\(driver\)/incidents/ apps/mobile/app/\(driver\)/loads/ apps/mobile/app/\(driver\)/messages.tsx` should return zero results.
  </verify>
  <done>All 7 driver portal screens import and use useThemeColors(). No hardcoded slate/white color classes remain in any driver file. TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate owner portal screens (17 files)</name>
  <files>
    apps/mobile/app/(owner)/loads/[id].tsx
    apps/mobile/app/(owner)/loads/index.tsx
    apps/mobile/app/(owner)/more/compliance.tsx
    apps/mobile/app/(owner)/more/crm/index.tsx
    apps/mobile/app/(owner)/more/crm/new.tsx
    apps/mobile/app/(owner)/more/fleet.tsx
    apps/mobile/app/(owner)/more/fuel.tsx
    apps/mobile/app/(owner)/more/index.tsx
    apps/mobile/app/(owner)/more/invoices/index.tsx
    apps/mobile/app/(owner)/more/invoices/new.tsx
    apps/mobile/app/(owner)/more/payroll.tsx
    apps/mobile/app/(owner)/more/profit-predictor.tsx
    apps/mobile/app/(owner)/more/trucks/[id].tsx
    apps/mobile/app/(owner)/more/trucks/index.tsx
    apps/mobile/app/(owner)/more/trucks/new.tsx
    apps/mobile/app/(owner)/routes/[id].tsx
    apps/mobile/app/(owner)/routes/index.tsx
  </files>
  <action>
Apply the same migration pattern as Task 1 to all 17 owner portal screen files:

1. Add import: `import { useThemeColors } from '../../../constants/tokens'` (adjust relative path based on file depth — files in `more/crm/` or `more/trucks/` or `more/invoices/` need `../../../../constants/tokens`)

2. Add `const c = useThemeColors()` at the top of each component function.

3. Apply the same color class to inline style mapping from Task 1.

4. Special handling for `more/index.tsx` (the More menu screen):
   - The section header text uses `text-slate-500` -> `style={{ color: c.textTertiary }}`
   - Card containers use `bg-slate-800 border-slate-700` -> `style={{ backgroundColor: c.surfaceCard, borderColor: c.border }}`
   - Divider lines `bg-slate-700` -> `style={{ backgroundColor: c.border }}`
   - The ChevronRight icon color `#475569` -> `c.textMuted`
   - Row text: `text-slate-100` -> `c.textPrimary`, `text-slate-500` -> `c.textTertiary`

5. For form screens (crm/new.tsx, invoices/new.tsx, trucks/new.tsx, profit-predictor.tsx):
   - Input backgrounds `bg-slate-800` or similar -> `c.surfaceInput`
   - Input borders -> `c.border`
   - Label text -> `c.textSecondary`
   - Placeholder colors should use `c.textMuted`

6. Keep all non-color classes (layout, sizing, spacing, rounded, font) in className.

7. Merge theme colors into existing inline style objects where present.
  </action>
  <verify>
Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "(owner)" | head -20`
Grep check: `grep -rn "bg-slate-\|text-slate-\|border-slate-\|text-white" apps/mobile/app/\(owner\)/loads/ apps/mobile/app/\(owner\)/more/ apps/mobile/app/\(owner\)/routes/` should return zero results.
  </verify>
  <done>All 17 owner portal screens import and use useThemeColors(). No hardcoded slate/white color classes remain in any owner file. TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 3: Migrate shared components (5 files)</name>
  <files>
    apps/mobile/components/driver/DocumentUploadSheet.tsx
    apps/mobile/components/driver/LoadCard.tsx
    apps/mobile/components/driver/RouteCard.tsx
    apps/mobile/components/driver/StatusUpdateButton.tsx
    apps/mobile/components/ui/LoadingSpinner.tsx
  </files>
  <action>
Apply the same migration pattern to all 5 shared component files:

1. Add import: `import { useThemeColors } from '../../constants/tokens'` for components/driver/* files, and `import { useThemeColors } from '../../constants/tokens'` for components/ui/* files.

2. Add `const c = useThemeColors()` at the top of each component function.

3. Apply the same color mapping from Task 1.

4. For card components (LoadCard.tsx, RouteCard.tsx):
   - Card background `bg-slate-800` -> `c.surfaceCard`
   - Card border -> `c.border`
   - Primary text -> `c.textPrimary`
   - Secondary text -> `c.textSecondary`

5. For DocumentUploadSheet.tsx:
   - Sheet/modal background -> `c.surfaceElevated`
   - Input areas -> `c.surfaceInput`
   - Borders -> `c.border`

6. For StatusUpdateButton.tsx:
   - Keep status-specific colors (success green, warning amber, danger red) as-is since they are semantic status indicators, not theme colors. Only migrate background/text/border slate colors.

7. For LoadingSpinner.tsx:
   - Background -> `c.background`
   - Spinner color can use `c.brand`

8. Keep all non-color classes in className. Merge with existing inline styles.

After all 3 tasks complete, run a final comprehensive grep to confirm no hardcoded slate color classes remain across all 29 files.
  </action>
  <verify>
Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | head -20`
Final grep across ALL 29 files: `grep -rn "bg-slate-\|text-slate-\|border-slate-\|text-white" apps/mobile/app/\(driver\)/documents.tsx apps/mobile/app/\(driver\)/incidents/ apps/mobile/app/\(driver\)/loads/ apps/mobile/app/\(driver\)/messages.tsx apps/mobile/app/\(owner\)/loads/ apps/mobile/app/\(owner\)/more/ apps/mobile/app/\(owner\)/routes/ apps/mobile/components/driver/DocumentUploadSheet.tsx apps/mobile/components/driver/LoadCard.tsx apps/mobile/components/driver/RouteCard.tsx apps/mobile/components/driver/StatusUpdateButton.tsx apps/mobile/components/ui/LoadingSpinner.tsx` should return zero results.
  </verify>
  <done>All 5 shared components import and use useThemeColors(). Zero hardcoded slate/white color classes remain across all 29 migrated files. Full TypeScript compilation passes.</done>
</task>

</tasks>

<verification>
1. `cd apps/mobile && npx tsc --noEmit` — zero type errors
2. Grep all 29 files for `bg-slate-|text-slate-|border-slate-|text-white` — zero matches
3. Grep all 29 files for `useThemeColors` — 29 matches (one per file)
4. App builds and runs in both light and dark mode on Android emulator
</verification>

<success_criteria>
- All 29 files import and call useThemeColors()
- Zero hardcoded dark-only color classes (bg-slate-*, text-slate-*, border-slate-*, text-white) remain in migrated files
- Non-color Tailwind classes (layout, sizing, spacing, rounded, font) are preserved
- TypeScript compiles cleanly
- App renders correctly in both light and dark system themes
</success_criteria>

<output>
After completion, create `.planning/quick/149-migrate-all-mobile-screens-to-use-usethe/149-SUMMARY.md`
</output>
