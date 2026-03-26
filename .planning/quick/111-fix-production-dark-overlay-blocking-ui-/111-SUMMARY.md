---
phase: quick-111
plan: "01"
subsystem: web/auth
tags: [bug-fix, css, pointer-events, production, auth]
dependency_graph:
  requires: []
  provides: [interactive-auth-pages]
  affects: [sign-in, sign-up, accept-invitation]
tech_stack:
  added: []
  patterns: [pointer-events-none overlay pattern]
key_files:
  modified:
    - apps/web/src/app/(auth)/layout.tsx
decisions:
  - "Added pointer-events-none to auth overlay div — eliminates pointer event blocking regardless of CSS ordering or stacking context in production builds"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-26T05:03:34Z"
  tasks_completed: 2
  files_modified: 1
---

# Quick 111: Fix Production Dark Overlay Blocking UI — Summary

## One-liner

Added `pointer-events-none` to the auth layout's `bg-black/40` overlay div, which was intercepting all click/touch events on the sign-in page in production.

## What Was Done

The auth layout at `apps/web/src/app/(auth)/layout.tsx` renders a full-viewport `absolute inset-0 bg-black/40` overlay for background readability. The overlay lacked `pointer-events-none`, meaning it sat on top of the form content and intercepted all pointer events. While `z-10` on the sibling content div works to visually stack the form above the overlay in most environments, CSS ordering differences and stacking context edge cases in production builds caused the overlay to block all interaction.

The fix is a single class addition: `pointer-events-none` on the overlay div. This makes the overlay purely visual — it can never intercept clicks regardless of z-index, CSS ordering, or hydration timing.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Fix auth layout overlay to not block pointer events | 7118f9b | apps/web/src/app/(auth)/layout.tsx |
| 2 | Deploy to Vercel production and verify | (deploy) | — |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx next build` completed successfully (53 pages, 0 errors)
- Vercel production deployment completed: https://drive-command.vercel.app
- Deployment ID: `dpl_EjKufKMSkUsceCmXFUrz36wrw3kr`
- Auth layout overlay now has `pointer-events-none` — sign-in page is fully interactive

## Self-Check: PASSED

- `apps/web/src/app/(auth)/layout.tsx` — modified, contains `pointer-events-none`
- Commit `7118f9b` — exists in git log
- Vercel deployment — aliased to https://drive-command.vercel.app, status READY
