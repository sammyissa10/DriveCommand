---
id: quick-380
title: Rebuild DataGrid Visual Shell — Vercel/Apple Crisp-Minimal Aesthetic
type: quick
status: planned
created: 2025-05-20
files_modified:
  - apps/web/src/components/data-grid/tokens/grid-tokens.css
  - apps/web/src/components/data-grid/hooks/useBreakpoint.ts
  - apps/web/src/components/data-grid/hooks/useSwipeGesture.ts
  - apps/web/src/components/data-grid/hooks/useLongPress.ts
  - apps/web/src/components/data-grid/shell/shared/StatusBadge.tsx
  - apps/web/src/components/data-grid/shell/shared/EmptyState.tsx
  - apps/web/src/components/data-grid/shell/shared/LoadingSkeleton.tsx
  - apps/web/src/components/data-grid/shell/shared/ErrorState.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridHeader.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridCell.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridRow.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridBody.tsx
  - apps/web/src/components/data-grid/shell/desktop/GridFooter.tsx
  - apps/web/src/components/data-grid/shell/shared/ColumnDragHandle.tsx
  - apps/web/src/components/data-grid/shell/shared/QuickActions.tsx
  - apps/web/src/components/data-grid/shell/mobile/GridCard.tsx
  - apps/web/src/components/data-grid/shell/mobile/GridCardList.tsx
  - apps/web/src/components/data-grid/shell/mobile/MobileToolbar.tsx
  - apps/web/src/components/data-grid/shell/mobile/MobileFAB.tsx
  - apps/web/src/components/data-grid/shell/mobile/MobileActionSheet.tsx
  - apps/web/src/components/data-grid/shell/shared/GridToolbar.tsx
  - apps/web/src/components/data-grid/shell/shared/BulkActionsBar.tsx
  - apps/web/src/components/data-grid/shell/GridShell.tsx
  - apps/web/src/components/data-grid/shell/index.ts
  - apps/web/src/components/data-grid/DESIGN.md
  - apps/web/src/app/(dev)/data-grid-demo/page.tsx
---

<objective>
Rebuild the DataGrid visual shell with a Vercel/Apple-inspired crisp-minimal aesthetic. This is a VISUAL-ONLY rebuild — the existing engine (useDataGrid, useGridSelection, useGridPreferences, useGridUrlState) remains untouched.

Purpose: Transform the DataGrid from a generic data table into a premium, mobile-first component that matches Vercel's design language — near-monochrome with refined blue accents, Inter 400/500 typography, zero visual noise.

Output: New shell directory structure with desktop table view (>=768px), mobile card list (<768px), shared components, design tokens, and a demo page.
</objective>

<context>
@apps/web/src/components/data-grid/core/types.ts
@apps/web/src/components/data-grid/core/DataGrid.tsx
@apps/web/src/components/data-grid/core/useDataGrid.ts
@apps/web/tailwind.config.ts
@apps/web/src/app/globals.css
</context>

<design_constraints>
## NON-NEGOTIABLE Design Language

1. **COLOR**: Near-monochrome with single refined blue accent
   - Primary blue: Vercel #0070F3 (mapped to existing b-500 #0066CC)
   - Semantic colors at <=60% saturation (use existing status-* tokens)
   - ZERO colored backgrounds for rows (no zebra striping)

2. **TYPOGRAPHY**: Inter 400/500 ONLY
   - Headers: text-xs uppercase tracking-wider font-medium (500)
   - Body: text-sm font-normal (400)
   - NO font-semibold (600) or font-bold (700) anywhere in the grid

3. **BORDERS**: Ultra-minimal
   - ZERO vertical cell borders
   - ZERO alternating row backgrounds
   - Horizontal separators: border-border/40 (40% opacity)
   - Container: single border border-border rounded-lg

4. **ROW HEIGHT**: 48px fixed
   - NO density toggle (remove from toolbar)
   - Consistent 48px for all rows

5. **ICONS**: Lucide with stroke-width 1.5
   - NEVER use default stroke-width 2
   - Add `strokeWidth={1.5}` to all Lucide icons

6. **MOTION**: Respect prefers-reduced-motion
   - All animations wrapped in motion-safe:
   - Transitions: 150ms for micro, 200ms for state changes

7. **BADGES (StatusBadge)**: Tinted background + full-color text
   - NEVER solid fill badges
   - Pattern: bg-status-{type}-bg text-status-{type}-foreground
   - Subtle rounded-md pill shape
</design_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Design Tokens and Utility Hooks</name>
  <files>
    apps/web/src/components/data-grid/tokens/grid-tokens.css
    apps/web/src/components/data-grid/hooks/useBreakpoint.ts
    apps/web/src/components/data-grid/hooks/useSwipeGesture.ts
    apps/web/src/components/data-grid/hooks/useLongPress.ts
  </files>
  <action>
    Create design tokens CSS file with DataGrid-specific variables:
    - `--grid-row-height: 48px` (fixed, no density)
    - `--grid-header-height: 40px`
    - `--grid-cell-padding-x: 16px`
    - `--grid-cell-padding-y: 12px`
    - `--grid-border-opacity: 0.4` (40% for horizontal separators)
    - `--grid-accent: var(--color-b-500)` (brand blue)
    - `--grid-accent-subtle: var(--color-b-050)` (selected row bg)
    - `--grid-transition-fast: 150ms`
    - `--grid-transition-base: 200ms`

    Import this CSS file in the shell/index.ts barrel.

    Create useBreakpoint hook:
    - Returns `{ isMobile, isDesktop, breakpoint }` based on 768px threshold
    - Uses matchMedia with SSR safety (default to desktop)
    - Memoized for performance

    Create useSwipeGesture hook:
    - Detects horizontal swipe on touch devices
    - Props: `{ onSwipeLeft, onSwipeRight, threshold?: number }`
    - Returns ref to attach to element
    - Threshold default: 50px

    Create useLongPress hook:
    - Detects long-press (500ms default) for multi-select mode
    - Props: `{ onLongPress, delay?: number }`
    - Returns `{ onTouchStart, onTouchEnd, onTouchMove }` handlers
    - Cancels on move (>10px)
  </action>
  <verify>
    Files exist at specified paths. TypeScript compiles without errors.
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
  </verify>
  <done>
    Design tokens CSS created with all grid-specific variables.
    Three utility hooks created and exported.
    No TypeScript errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Shared State Components (StatusBadge, EmptyState, LoadingSkeleton, ErrorState)</name>
  <files>
    apps/web/src/components/data-grid/shell/shared/StatusBadge.tsx
    apps/web/src/components/data-grid/shell/shared/EmptyState.tsx
    apps/web/src/components/data-grid/shell/shared/LoadingSkeleton.tsx
    apps/web/src/components/data-grid/shell/shared/ErrorState.tsx
  </files>
  <action>
    Create StatusBadge — THE SINGLE source of truth for all grid badges:
    ```tsx
    interface StatusBadgeProps {
      variant: 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';
      children: React.ReactNode;
      className?: string;
    }
    ```
    - Styling: `bg-status-{variant}-bg text-status-{variant}-foreground text-xs font-medium px-2 py-0.5 rounded-md`
    - For 'neutral': use `bg-muted text-muted-foreground`
    - NO solid fill, NO borders — just tinted bg + colored text

    Create EmptyState (redesign existing):
    - Clean, minimal illustration using Lucide icons (Inbox for no-data, Search for filtered)
    - Icon: 40x40 in muted container, strokeWidth={1.5}
    - Title: text-sm font-medium text-foreground
    - Description: text-sm text-muted-foreground
    - Optional CTA button for "Clear filters"
    - Centered layout, py-16

    Create LoadingSkeleton:
    - Props: `{ rows?: number; columns?: number; showHeader?: boolean }`
    - Header skeleton: single bar h-10
    - Row skeletons: varying widths (40%, 60%, 30%, 50%) for organic feel
    - Use animate-pulse with motion-safe wrapper
    - Skeleton bars: bg-muted rounded-md

    Create ErrorState:
    - AlertCircle icon (strokeWidth={1.5})
    - Title: "Something went wrong"
    - Description from error.message or generic
    - "Try again" button with onRetry callback
    - Red accent via status-danger tokens
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    Components render correctly in isolation.
  </verify>
  <done>
    StatusBadge is the single badge component with tinted-bg pattern.
    EmptyState, LoadingSkeleton, ErrorState redesigned with crisp-minimal aesthetic.
    All icons use strokeWidth={1.5}.
  </done>
</task>

<task type="auto">
  <name>Task 3: Desktop Grid Core (GridHeader, GridCell, GridRow)</name>
  <files>
    apps/web/src/components/data-grid/shell/desktop/GridHeader.tsx
    apps/web/src/components/data-grid/shell/desktop/GridCell.tsx
    apps/web/src/components/data-grid/shell/desktop/GridRow.tsx
  </files>
  <action>
    Create desktop/GridHeader.tsx:
    - Renders column headers in a flex row
    - Header text: text-xs uppercase tracking-wider font-medium text-muted-foreground
    - Height: 40px (--grid-header-height)
    - Bottom border: border-b border-border/40
    - Sortable columns show ChevronUp/ChevronDown (strokeWidth={1.5})
    - Sort indicators: small, subtle (h-3.5 w-3.5)
    - NO vertical borders between columns
    - Checkbox column for selection: w-12 centered
    - Sticky header support with bg-background

    Create desktop/GridCell.tsx:
    - Renders individual cell content
    - Padding: px-4 py-3 (--grid-cell-padding-*)
    - Text: text-sm text-foreground
    - Truncate with ellipsis for overflow
    - NO vertical borders
    - Accepts cell prop from TanStack Table flexRender
    - Support for custom cell renderers

    Create desktop/GridRow.tsx:
    - Renders full row with cells
    - Height: 48px fixed (--grid-row-height)
    - Bottom border: border-b border-border/40 (last row no border)
    - Hover: bg-muted/50 (very subtle)
    - Selected: bg-b-050 (--grid-accent-subtle) + left border accent
    - Focus: ring-2 ring-primary ring-inset
    - Checkbox cell for selection
    - QuickActions slot (rendered in last cell, opacity-0 group-hover:opacity-100)
    - onClick for selection, onDoubleClick for detail view
    - ARIA: role="row", aria-selected, aria-rowindex
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    Components follow design constraints (no vertical borders, 48px height, Inter 400/500).
  </verify>
  <done>
    Desktop GridHeader, GridCell, GridRow created.
    Headers use uppercase text-xs tracking-wider.
    Rows are 48px fixed height with minimal borders.
    Selection and hover states implemented.
  </done>
</task>

<task type="auto">
  <name>Task 4: Desktop GridBody and GridFooter</name>
  <files>
    apps/web/src/components/data-grid/shell/desktop/GridBody.tsx
    apps/web/src/components/data-grid/shell/desktop/GridFooter.tsx
  </files>
  <action>
    Create desktop/GridBody.tsx:
    - Wraps rows with virtualization via @tanstack/react-virtual
    - Props: `{ rows: Row<TData>[]; virtualizer: Virtualizer }`
    - Scrollable container with overflow-auto
    - Renders only visible rows via virtualizer
    - Empty state when rows.length === 0
    - Loading skeleton when isLoading
    - Error state when error
    - ARIA: role="rowgroup"

    Create desktop/GridFooter.tsx:
    - Pagination controls with page info
    - Text: "Page X of Y" + "Showing X-Y of Z results"
    - Typography: text-sm text-muted-foreground
    - Navigation: Previous/Next buttons with ChevronLeft/ChevronRight (strokeWidth={1.5})
    - Page size selector: dropdown with 10/25/50/100 options
    - Compact layout with gap-4 between elements
    - Height: 48px, border-t border-border/40
    - Buttons: variant="ghost" size="sm"
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    GridBody integrates with TanStack Virtual.
    GridFooter shows pagination controls.
  </verify>
  <done>
    GridBody wraps virtualized rows with empty/loading/error states.
    GridFooter provides pagination with crisp typography.
    All icons use strokeWidth={1.5}.
  </done>
</task>

<task type="auto">
  <name>Task 5: Shared QuickActions and ColumnDragHandle</name>
  <files>
    apps/web/src/components/data-grid/shell/shared/ColumnDragHandle.tsx
    apps/web/src/components/data-grid/shell/shared/QuickActions.tsx
  </files>
  <action>
    Create shared/ColumnDragHandle.tsx (redesign):
    - GripVertical icon with strokeWidth={1.5}
    - Size: h-4 w-4, color: text-muted-foreground/50
    - Hover: text-muted-foreground
    - Cursor: grab (grabbing when dragging)
    - Used for column reordering in header
    - Minimal visual presence until hover

    Create shared/QuickActions.tsx (redesign existing):
    - Floating pill container on row hover
    - Background: bg-background border border-border shadow-sm
    - Appears on right side of row
    - Icons: Eye, Pencil, Trash2 (all strokeWidth={1.5})
    - Icon buttons: h-7 w-7, variant="ghost"
    - Gap between icons: gap-0.5
    - Transition: opacity-0 group-hover:opacity-100, motion-safe:transition-opacity
    - Delete triggers confirmation dialog
    - Tooltip on each action
    - Supports custom actions array
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    QuickActions appears as floating pill on hover.
    All icons use strokeWidth={1.5}.
  </verify>
  <done>
    ColumnDragHandle minimal and subtle.
    QuickActions redesigned as floating pill with crisp icons.
    Motion respects prefers-reduced-motion.
  </done>
</task>

<task type="auto">
  <name>Task 6: Mobile GridCard and GridCardList</name>
  <files>
    apps/web/src/components/data-grid/shell/mobile/GridCard.tsx
    apps/web/src/components/data-grid/shell/mobile/GridCardList.tsx
  </files>
  <action>
    Create mobile/GridCard.tsx:
    - Card-based display for single row on mobile
    - Uses data-grid tokens for spacing
    - Title row: primary column value, text-sm font-medium
    - Metadata rows: label-value pairs, text-xs text-muted-foreground
    - StatusBadge integration for status columns
    - Swipe-left reveals action drawer (3 icons max)
    - Selection: checkbox in top-right, visible in multi-select mode
    - Tap: navigate to detail view
    - Long-press: enter multi-select mode (uses useLongPress)
    - Card styling: bg-card border border-border rounded-lg p-4 mb-2
    - Selected state: ring-2 ring-primary bg-b-050

    Create mobile/GridCardList.tsx:
    - Virtualized list of GridCard using @tanstack/react-virtual
    - Props: `{ rows: Row<TData>[]; onCardPress; onCardLongPress; selectedIds }`
    - Uses useVirtualizer with estimateSize: 100
    - Renders EmptyState when rows.length === 0
    - Renders LoadingSkeleton when loading
    - Pull-to-refresh support (optional, via onRefresh callback)
    - Padding: px-4 for card list container
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    GridCard shows card layout with swipe actions.
    GridCardList virtualizes card rendering.
  </verify>
  <done>
    GridCard displays row data as card with swipe-to-reveal actions.
    GridCardList virtualized with @tanstack/react-virtual.
    Long-press enters multi-select mode.
  </done>
</task>

<task type="auto">
  <name>Task 7: Mobile Toolbar, FAB, and ActionSheet</name>
  <files>
    apps/web/src/components/data-grid/shell/mobile/MobileToolbar.tsx
    apps/web/src/components/data-grid/shell/mobile/MobileFAB.tsx
    apps/web/src/components/data-grid/shell/mobile/MobileActionSheet.tsx
  </files>
  <action>
    Create mobile/MobileToolbar.tsx:
    - Compact toolbar for mobile (<768px)
    - Search input: full width, h-10, rounded-lg
    - Filter/Sort/Columns buttons as icon buttons below search
    - Active filter count badge (if filters > 0)
    - Typography: text-sm
    - Layout: vertical stack with gap-2
    - Buttons open MobileActionSheet for their respective actions

    Create mobile/MobileFAB.tsx:
    - Floating action button for "+ New"
    - Position: fixed bottom-6 right-6
    - Size: h-14 w-14 rounded-full
    - Background: bg-primary text-primary-foreground
    - Shadow: shadow-lg
    - Icon: Plus with strokeWidth={1.5}
    - Hidden when bulk selection is active (selectedCount > 0)
    - Transition: scale-95 on press, motion-safe animation

    Create mobile/MobileActionSheet.tsx:
    - Bottom sheet for Filter/Sort/Columns on mobile
    - Uses Radix Dialog or custom bottom sheet
    - Slide-up animation from bottom
    - Backdrop: bg-black/50
    - Sheet: bg-background rounded-t-2xl max-h-[80vh]
    - Header with title + close button
    - Scrollable content area
    - Variants: 'filter' | 'sort' | 'columns'
    - Filter variant: list of filterable columns with controls
    - Sort variant: radio list of sortable columns + direction
    - Columns variant: checkbox list of toggleable columns
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    MobileToolbar provides compact controls.
    MobileFAB floats and hides during selection.
    MobileActionSheet slides up for filter/sort/columns.
  </verify>
  <done>
    Mobile toolbar, FAB, and action sheets created.
    FAB hides during bulk selection.
    Action sheets provide filter/sort/columns controls.
  </done>
</task>

<task type="auto">
  <name>Task 8: Shared GridToolbar (Responsive)</name>
  <files>
    apps/web/src/components/data-grid/shell/shared/GridToolbar.tsx
  </files>
  <action>
    Create shared/GridToolbar.tsx (redesign existing):
    - Responsive: renders desktop toolbar >=768px, mobile toolbar <768px
    - Uses useBreakpoint hook for responsive detection

    Desktop layout:
    - Search input: w-64, left side
    - Spacer (flex-1)
    - Filter button with count badge
    - Columns toggle dropdown
    - Export dropdown (Visible/Selected/All)
    - New button (if showNew)
    - NO density toggle (removed per design)

    Mobile layout:
    - Delegates to MobileToolbar component

    Styling:
    - Border-b border-border/40
    - Padding: p-3
    - Buttons: variant="ghost" size="sm"
    - All icons: strokeWidth={1.5}
    - Search icon: text-muted-foreground

    Props interface (maintain compatibility with existing):
    - onNew, showNew, searchPlaceholder, exportFilename
    - columns, dataFetcher, filters, onFiltersChange
    - NO setDensity prop (removed)
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    GridToolbar renders desktop/mobile variants based on breakpoint.
    Density toggle removed.
    All icons use strokeWidth={1.5}.
  </verify>
  <done>
    Responsive GridToolbar created.
    Density toggle removed.
    Desktop shows inline controls, mobile delegates to MobileToolbar.
  </done>
</task>

<task type="auto">
  <name>Task 9: Shared BulkActionsBar (Responsive)</name>
  <files>
    apps/web/src/components/data-grid/shell/shared/BulkActionsBar.tsx
  </files>
  <action>
    Create shared/BulkActionsBar.tsx (redesign existing):

    Desktop (>=768px):
    - Slides down from below toolbar (not fixed to bottom)
    - Position: relative, inside grid container
    - Background: bg-muted/50 border-y border-border/40
    - Height: 48px
    - Selection count: text-sm font-medium
    - Action buttons: inline, variant="ghost" size="sm"
    - Delete button: text-destructive
    - Clear selection: X icon button on right

    Mobile (<768px):
    - Fixed to bottom of viewport
    - Full width, p-4
    - Background: bg-background border-t shadow-lg
    - Selection count centered
    - Action buttons in row below count
    - Clear as icon button top-right

    Common:
    - Transition: slide in/out with motion-safe
    - Visible when selectedCount > 0
    - ARIA: role="toolbar", aria-label="Bulk actions"
    - All icons: strokeWidth={1.5}
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    BulkActionsBar slides in when selection active.
    Desktop: below toolbar. Mobile: fixed bottom.
  </verify>
  <done>
    BulkActionsBar responsive with desktop/mobile layouts.
    Desktop slides down from toolbar.
    Mobile fixed to bottom.
  </done>
</task>

<task type="auto">
  <name>Task 10: Main GridShell (Responsive Container)</name>
  <files>
    apps/web/src/components/data-grid/shell/GridShell.tsx
  </files>
  <action>
    Create shell/GridShell.tsx (replace existing):
    - Main container that switches between desktop table and mobile cards
    - Uses useBreakpoint to determine layout

    Structure:
    ```tsx
    <div role="grid" className="...">
      <GridToolbar ... />
      {selectedCount > 0 && !isMobile && <BulkActionsBar ... />}
      {isMobile ? <GridCardList ... /> : <DesktopTable ... />}
      {!isMobile && <GridFooter ... />}
      {selectedCount > 0 && isMobile && <BulkActionsBar ... />}
      {showNew && isMobile && selectedCount === 0 && <MobileFAB ... />}
    </div>
    ```

    Container styling:
    - bg-background border border-border rounded-lg overflow-hidden
    - Focus: focus:outline-none focus-visible:ring-2 ring-primary

    Desktop table wrapper:
    - Renders GridHeader + GridBody + GridFooter

    Mobile card wrapper:
    - Renders MobileToolbar (via GridToolbar) + GridCardList
    - MobileFAB absolutely positioned

    Keyboard navigation:
    - Roving tabindex for desktop table
    - Arrow keys navigate cells
    - Space toggles selection
    - Escape clears selection

    Context:
    - Provides GridShellContext with focusedCell, density (always 'normal'), gridId
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    GridShell switches between table (desktop) and cards (mobile).
    Keyboard navigation works on desktop.
  </verify>
  <done>
    GridShell responsive container created.
    Desktop: table with header/body/footer.
    Mobile: card list with FAB.
    Keyboard navigation implemented.
  </done>
</task>

<task type="auto">
  <name>Task 11: Barrel Export and DESIGN.md</name>
  <files>
    apps/web/src/components/data-grid/shell/index.ts
    apps/web/src/components/data-grid/DESIGN.md
  </files>
  <action>
    Update shell/index.ts barrel export:
    - Export all shell components from new structure
    - Export from desktop/, mobile/, shared/ subdirectories
    - Import grid-tokens.css

    ```ts
    import '../tokens/grid-tokens.css';

    // Shared
    export { StatusBadge } from './shared/StatusBadge';
    export { EmptyState } from './shared/EmptyState';
    export { LoadingSkeleton } from './shared/LoadingSkeleton';
    export { ErrorState } from './shared/ErrorState';
    export { GridToolbar } from './shared/GridToolbar';
    export { BulkActionsBar, type BulkAction } from './shared/BulkActionsBar';
    export { QuickActions, type QuickAction } from './shared/QuickActions';
    export { ColumnDragHandle } from './shared/ColumnDragHandle';

    // Desktop
    export { GridHeader } from './desktop/GridHeader';
    export { GridCell } from './desktop/GridCell';
    export { GridRow } from './desktop/GridRow';
    export { GridBody } from './desktop/GridBody';
    export { GridFooter } from './desktop/GridFooter';

    // Mobile
    export { GridCard } from './mobile/GridCard';
    export { GridCardList } from './mobile/GridCardList';
    export { MobileToolbar } from './mobile/MobileToolbar';
    export { MobileFAB } from './mobile/MobileFAB';
    export { MobileActionSheet } from './mobile/MobileActionSheet';

    // Main
    export { GridShell, useGridShellContext } from './GridShell';
    ```

    Create DESIGN.md documenting:
    - Design philosophy (Vercel/Apple crisp-minimal)
    - Color usage (monochrome + blue accent)
    - Typography rules (Inter 400/500 only)
    - Border rules (no vertical, 40% horizontal)
    - Row height (48px fixed)
    - Icon rules (Lucide strokeWidth={1.5})
    - Badge rules (StatusBadge tinted pattern)
    - Responsive breakpoints (768px)
    - Motion rules (prefers-reduced-motion)
    - Component hierarchy diagram
  </action>
  <verify>
    ```bash
    cd apps/web && npx tsc --noEmit
    ```
    All exports resolve correctly.
    DESIGN.md documents all design decisions.
  </verify>
  <done>
    Barrel exports all shell components.
    DESIGN.md provides design system documentation.
    CSS tokens imported automatically.
  </done>
</task>

<task type="auto">
  <name>Task 12: Demo Page</name>
  <files>
    apps/web/src/app/(dev)/data-grid-demo/page.tsx
  </files>
  <action>
    Create demo page at (dev)/data-grid-demo/page.tsx:

    Purpose: Visual testing ground for the new DataGrid shell.

    Content:
    - Page title: "DataGrid Shell Demo"
    - Three demo sections:

    1. **Basic Table** (desktop view)
       - 10 mock rows with varied data
       - Columns: ID, Name, Status, Email, Created
       - Status uses StatusBadge component
       - Shows sorting, selection, QuickActions

    2. **Empty State**
       - Grid with no data
       - Shows EmptyState component

    3. **Loading State**
       - Grid with isLoading=true
       - Shows LoadingSkeleton

    4. **Mobile Preview**
       - Iframe or viewport wrapper at 375px width
       - Shows card layout with MobileFAB

    Mock data generator:
    - Use faker or hand-coded data
    - Include varied statuses (success/warning/danger/info)

    Styling:
    - Page: max-w-6xl mx-auto py-8 px-4
    - Sections: space-y-12
    - Section headers: text-lg font-medium mb-4

    Note: This is a dev-only page (in (dev) route group).
  </action>
  <verify>
    ```bash
    cd apps/web && npm run dev
    # Visit http://localhost:3000/data-grid-demo
    ```
    Demo page renders all grid states.
    Visual inspection confirms design constraints.
  </verify>
  <done>
    Demo page created with basic, empty, loading, and mobile previews.
    All design constraints visually verifiable.
    Page accessible at /data-grid-demo during development.
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `cd apps/web && npx tsc --noEmit` — zero TypeScript errors
2. `cd apps/web && npm run dev` — dev server starts
3. Visit `/data-grid-demo` — demo page renders correctly
4. Visual audit:
   - [ ] No vertical cell borders
   - [ ] Row height is exactly 48px
   - [ ] Headers are text-xs uppercase tracking-wider
   - [ ] All icons have strokeWidth={1.5}
   - [ ] StatusBadges use tinted bg pattern
   - [ ] Mobile (<768px) shows cards, not squished table
   - [ ] FAB visible on mobile, hidden during selection
   - [ ] Hover states are subtle (bg-muted/50)
   - [ ] Focus rings are visible and use brand blue
5. Accessibility:
   - [ ] Keyboard navigation works (arrows, space, escape)
   - [ ] ARIA attributes present (role, aria-selected, etc.)
   - [ ] Reduced motion respected
</verification>

<success_criteria>
- All 12 tasks completed without TypeScript errors
- Demo page renders and demonstrates all grid states
- Design constraints strictly followed (no violations)
- Mobile card view works with long-press and swipe gestures
- Desktop table view works with keyboard navigation
- No regressions to existing DataGrid engine (hooks untouched)
</success_criteria>

<output>
After completion, update this plan status to "complete" and document any deviations.
</output>
