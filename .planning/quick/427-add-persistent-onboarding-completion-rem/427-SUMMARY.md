---
phase: quick-427
plan: 427
subsystem: ui
tags: [onboarding, owner-portal, ribbon, layout, prisma, activation-progress]

requires: []
provides:
  - Fixed top-right onboarding reminder ribbon on all owner-portal pages
  - Server-side ActivationProgress.isActivated fetch in owner layout
affects:
  - owner-portal
  - onboarding

tech-stack:
  added: []
  patterns:
    - "Non-dismissible UI state driven solely by server-fetched DB flag — no local dismiss state"
    - "Raw SQL query in layout for lightweight single-field reads — no Prisma Client model call"

key-files:
  created:
    - apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx
  modified:
    - apps/web/src/app/(owner)/layout.tsx

key-decisions:
  - "No dismiss button — visibility is controlled entirely by ActivationProgress.isActivated"
  - "Default onboardingComplete=false (show ribbon) when row is missing or query errors, so brand-new tenants always see the ribbon"
  - "Raw SQL ($queryRaw) reused to match existing layout pattern rather than adding a Prisma Client call"
  - "Ribbon mounted as sibling before OwnerShell so fixed positioning works without touching the client shell"

patterns-established:
  - "Server component layout fetches lightweight flag then passes as prop to client UI — no client-side data fetching in ribbon"

duration: 8min
completed: 2026-06-07
---

# Quick-427: Add Persistent Onboarding-Completion Reminder Ribbon — Summary

**Fixed top-right ribbon on every owner-portal page links incomplete tenants to /onboarding/welcome, disappears automatically when ActivationProgress.isActivated becomes true**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-07T00:00:00Z
- **Completed:** 2026-06-07T00:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `OnboardingReminderRibbon` — "use client" component, fixed top-right (z-1100), Rocket icon + "Finish setup" label, renders null when `onboardingComplete=true`, zero dismiss controls
- Modified owner layout to query `ActivationProgress.isActivated` via raw SQL scoped to `session.tenantId`, defaulting to `false` on missing row or error
- Mounted ribbon as sibling before `<OwnerShell>` inside `<TRPCReactProvider>` — covers all owner pages without touching OwnerShell

## Task Commits

1. **Task 1 + Task 2: Create ribbon component + wire into owner layout** — `3e6dcf8a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx` — Client component: fixed ribbon, renders null on complete, links to /onboarding/welcome
- `apps/web/src/app/(owner)/layout.tsx` — Added ActivationProgress query + OnboardingReminderRibbon mount

## Decisions Made

- No dismiss button — visibility is driven entirely by the server-fetched `isActivated` flag to prevent owners from hiding an incomplete state permanently
- Default to `false` (show ribbon) when the `ActivationProgress` row is missing; brand-new tenants who haven't touched the model yet should always see the prompt
- Reused `$queryRaw` pattern already present in the layout (tenant name query) — no new Prisma Client abstraction needed for a single boolean field

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript check (`npx tsc --noEmit`) produced only a pre-existing `.next/types/validator.ts` error unrelated to the touched files.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Ribbon is live on all owner pages as of this commit
- To hide the ribbon permanently for a tenant, set `ActivationProgress.isActivated = true` via the existing onboarding completion flow
- No blockers

---
*Phase: quick-427*
*Completed: 2026-06-07*
