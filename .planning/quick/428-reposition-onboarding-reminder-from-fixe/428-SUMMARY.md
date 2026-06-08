---
phase: quick-428
plan: 428
subsystem: onboarding-ui
tags: [onboarding, banner, layout, owner-shell]
dependency_graph:
  requires: []
  provides: [full-width-onboarding-banner]
  affects: [apps/web/src/app/(owner)/layout.tsx, apps/web/src/components/navigation/owner-shell.tsx]
tech_stack:
  added: []
  patterns: [full-width-inline-banner, prop-threading]
key_files:
  created: []
  modified:
    - apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx
    - apps/web/src/app/(owner)/layout.tsx
    - apps/web/src/components/navigation/owner-shell.tsx
decisions:
  - "Mount point moved from layout.tsx sibling into OwnerShell main — user approved option-b at checkpoint"
  - "Desktop main padding restructured: removed p-6 from main, wrapped children in div.p-6 so banner sits flush at top"
metrics:
  duration: ~10min
  completed: 2026-06-08
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-428: Onboarding Reminder Ribbon — Restyle and Reposition Summary

**One-liner:** Replaced fixed top-right floating pill with a full-width navy/yellow inline banner rendered below the top bar inside OwnerShell on both desktop and mobile.

## What Was Built

The `OnboardingReminderRibbon` component was fully restyled from a `position: fixed` floating pill at `top-3 right-3 z-[1100]` to a full-width in-flow horizontal banner using the DriveCommand navy/yellow brand palette. Structure mirrors the sample-data-banner pattern: flex row, icon left (`shrink-0`), message middle (`flex-1`), CTA right (`shrink-0`).

Mount point was moved from `(owner)/layout.tsx` (where it was a sibling of `<OwnerShell>` and would have rendered above the entire shell when in-flow) into `owner-shell.tsx`, positioned at the top of `<main>` in both desktop and mobile branches. The `onboardingComplete` prop is now threaded through `OwnerShell`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restyle OnboardingReminderRibbon to inline navy/yellow banner | 15eef981 | OnboardingReminderRibbon.tsx |
| 2 | Move mount point into OwnerShell (layout.tsx + owner-shell.tsx) | 15eef981 | layout.tsx, owner-shell.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Desktop main lost padding after banner injection**
- **Found during:** Task 2
- **Issue:** The desktop `<main>` had `p-6` applied directly. Placing the banner before `{children}` while keeping `p-6` on `<main>` would indent the banner — it needs to span full width flush with the card edges.
- **Fix:** Removed `p-6` from `<main>`, wrapped `{children}` in `<div className="p-6">` so page content retains padding while the banner renders edge-to-edge.
- **Files modified:** apps/web/src/components/navigation/owner-shell.tsx
- **Commit:** 15eef981

## Self-Check: PASSED

Files verified:
- `apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx` — FOUND, contains `Finish Setup`, `href="/onboarding/welcome"`, no `fixed`/`top-3`/`right-3`/`z-[1100]`
- `apps/web/src/app/(owner)/layout.tsx` — FOUND, `onboardingComplete` passed to `<OwnerShell>`, no sibling `<OnboardingReminderRibbon>`
- `apps/web/src/components/navigation/owner-shell.tsx` — FOUND, `onboardingComplete` prop added, `<OnboardingReminderRibbon>` in both desktop and mobile `<main>`
- Commit `15eef981` — FOUND

TypeScript: `tsc --noEmit` shows 0 errors in touched files. 1 pre-existing `.next/types/validator.ts` error (generated cache file, not a regression).
