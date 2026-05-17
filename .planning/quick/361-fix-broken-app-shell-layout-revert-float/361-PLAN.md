# Quick Task 361: Fix broken app shell layout

## Problem Analysis

The current layout has these issues:
1. Root shell uses `shell-bg p-3` — adds dark background + 12px padding around everything
2. Sidebar is `fixed left-3 top-3 rounded-2xl` — floats as a rounded card, detached from viewport edges
3. Content panel uses `rounded-2xl` — rounded on ALL corners instead of just top-left
4. Topbar is inside content panel but doesn't align with viewport top edge

## Desired State (Flow reference)

1. **Sidebar**: Flush to top/left/bottom of viewport, NO rounded corners, NO margins
2. **Right column**: Contains topbar + content panel
3. **Topbar**: Flush to viewport top, light background (`bg-card`)
4. **Content panel**: Only `rounded-tl-2xl` (top-left corner where it meets sidebar junction)
5. **No outer dark gutter** — sidebar and topbar touch viewport edges

## Files to Modify

1. `apps/web/src/components/navigation/owner-shell.tsx` — Root shell layout
2. `apps/web/src/components/Sidebar/index.tsx` — Remove rounded corners and floating offset

## Tasks

### Task 1: Fix OwnerShell layout structure

**Changes to `owner-shell.tsx`:**

- Remove `shell-bg p-3` from outer div — no dark background, no padding
- Change outer div to `flex h-screen` (flexbox fills viewport)
- Sidebar container: `shrink-0` with CSS variable width (unchanged)
- Right column: `flex-1 flex flex-col` (fills remaining space)
- Topbar: Keep `h-14 bg-card border-b` but it's now flush to viewport top
- Content panel: Change from `rounded-2xl` to `rounded-tl-2xl bg-card`

**DOM structure:**
```
Root (flex h-screen)
├── Sidebar container (shrink-0, width from CSS var)
│   └── AnimatedSidebar
└── Right column (flex-1 flex flex-col)
    ├── Topbar (h-14 bg-card border-b)
    └── Content panel (flex-1 rounded-tl-2xl bg-card overflow-auto)
```

### Task 2: Fix AnimatedSidebar positioning

**Changes to `Sidebar/index.tsx`:**

- Remove `left-3 top-3` offset — sidebar is flush to left edge
- Remove `rounded-2xl` — no rounded corners
- Change height from `h-[calc(100vh-24px)]` to `h-screen` (full viewport height)
- Keep `fixed left-0 top-0` positioning
- Update hydration placeholder to match

### Task 3: Verify no TypeScript errors

Run `tsc --noEmit` to confirm no type errors.

## What NOT to Change

- Sidebar internal contents (logo, search, nav items, footer)
- Topbar internal contents (tenant name, search, actions)
- Mobile layout (stays unchanged)
- Page-level files
- Business logic, hooks, data fetching
- tailwind.config.ts
