# Quick Task 361: Fix broken app shell layout — COMPLETE

## Summary

Reverted the floating sidebar design and applied the correct single rounded corner pattern to match the Flow reference.

## Changes Made

### Files Modified

1. **`apps/web/src/components/navigation/owner-shell.tsx`**
2. **`apps/web/src/components/Sidebar/index.tsx`**

### Classes Removed (from broken floating design)

| File | Removed |
|------|---------|
| owner-shell.tsx | `shell-bg p-3` on outer div |
| owner-shell.tsx | `rounded-2xl shadow-lg` on content panel |
| Sidebar/index.tsx | `left-3 top-3` offset |
| Sidebar/index.tsx | `h-[calc(100vh-24px)]` height calculation |
| Sidebar/index.tsx | `rounded-2xl` on sidebar and peek overlay |

### Classes Added (for flush + single corner design)

| File | Added |
|------|-------|
| owner-shell.tsx | `lg:flex` (was `lg:block`) for proper flexbox |
| owner-shell.tsx | `min-w-0` on right column (flex child overflow fix) |
| owner-shell.tsx | `bg-card` on topbar header |
| owner-shell.tsx | `rounded-tl-2xl bg-card` on content main |
| Sidebar/index.tsx | `left-0 top-0` (flush to viewport) |
| Sidebar/index.tsx | `h-screen` (full viewport height) |

## Final DOM Structure

```
Root (hidden lg:flex h-screen)
├── Sidebar container (shrink-0, width: var(--sidebar-width))
│   └── AnimatedSidebar (fixed left-0 top-0 h-screen, no rounded corners)
└── Right column (flex-1 flex flex-col min-w-0)
    ├── Topbar (h-14 bg-card border-b) — flush to viewport top
    └── Content (flex-1 bg-card rounded-tl-2xl overflow-auto p-6)
```

## Visual Result

- ✅ Sidebar flush to top/left/bottom of viewport (no rounded corners)
- ✅ Topbar flush to viewport top with light background
- ✅ Content panel has ONLY `rounded-tl-2xl` (top-left corner)
- ✅ No dark background visible around the chrome
- ✅ No floating card aesthetic — clean flush layout

## Verification

- ✅ No TypeScript errors (`tsc --noEmit` passes)
- ✅ Mobile layout unchanged (still uses `lg:hidden` branch)
- ✅ Sidebar internal contents unchanged
- ✅ Topbar internal contents unchanged
- ✅ No page files modified
