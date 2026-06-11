---
phase: quick-434
plan: 434
subsystem: onboarding
tags: [activation, congrats, dialog, ux, schema]
dependency_graph:
  requires: [ActivationProgress.isActivated, owner layout session, getTenantPrisma, sonner, shadcn alert-dialog]
  provides: [one-time congrats moment, congratsShownAt column, markCongratsShown action, CongratsDialog component]
  affects: [apps/web/prisma/schema.prisma, apps/web/src/app/(owner)/layout.tsx, apps/web/src/components/navigation/owner-shell.tsx]
tech_stack:
  added: []
  patterns: [set-once idempotent updateMany, useRef guard for useEffect, serialized prop across server/client boundary]
key_files:
  created:
    - apps/web/src/app/(owner)/actions/activation-congrats.ts
    - apps/web/src/components/onboarding/CongratsDialog.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/(owner)/layout.tsx
    - apps/web/src/components/navigation/owner-shell.tsx
    - apps/web/src/generated/prisma/* (regenerated)
decisions:
  - Applied DB migration directly via Node pg client (postgres role, DIRECT_URL) because psql is unavailable and Supabase CLI --project-ref flag was unrecognized
  - Used timestamptz (not Timestamptz(3)) to match Supabase native type; confirmed as "timestamp with time zone" in information_schema
  - Serialized congratsShownAt as toISOString() string prop on OwnerShell to safely cross the RSC server/client boundary
  - Used updateMany with WHERE isActivated=true AND congratsShownAt IS NULL for true idempotent set-once (no overwrite on race/double-call)
metrics:
  duration: ~12 minutes
  completed: 2026-06-11
  tasks_completed: 3
  files_changed: 7
---

# Phase quick-434: Activation-Complete Congrats Moment Summary

**One-liner:** One-time AlertDialog + sonner toast celebration when owner activation completes, gated by a new `congratsShownAt` DB column that stamps now() exactly once via an idempotent server action.

## What Was Built

Three-layer change that wires a completion celebration from DB through server to client:

1. **DB + Prisma schema** — Added `congratsShownAt DateTime? @db.Timestamptz` to `ActivationProgress`. Column applied via ALTER TABLE (confirmed in `information_schema`). `prisma generate` regenerated client with 44 occurrences of the field.

2. **Server action** (`activation-congrats.ts`) — `markCongratsShown()` uses `getTenantPrisma()` for tenant scope, then `updateMany({ where: { isActivated: true, congratsShownAt: null }, data: { congratsShownAt: new Date() } })`. The compound WHERE guard ensures it writes once even under concurrent calls. Returns `{ ok: boolean }`, never throws.

3. **CongratsDialog component** — Controlled `AlertDialog` with `open/onOpenChange` props. Shows PartyPopper icon, "Your fleet is all set!" title, warm description, and a single "Go to Dashboard" `AlertDialogAction` CTA that routes to `/carrier/dashboard` via `useRouter`.

4. **OwnerShell + layout wiring** — Layout's `$queryRaw` extended to also select `congratsShownAt`, serialized to ISO string (or null) and passed as a prop. OwnerShell `useEffect` fires once when `onboardingComplete === true && congratsShownAt == null && !firedRef.current`: sets `firedRef.current = true` (double-fire guard), opens dialog, fires `toast.success`, and calls `void markCongratsShown()`. `<CongratsDialog>` rendered once inside `CommandPaletteProvider`.

## Verification

- `next build` completed with exit code 0 — TypeScript clean, 216 pages generated
- `congratsShownAt` column confirmed in Supabase (`information_schema.columns` query returned `timestamp with time zone`)
- All 5 required files present
- All 3 task commits present: `4ebd271b`, `f08736d4`, `b24e694a`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied migration via Node pg client instead of Supabase MCP**
- **Found during:** Task 1 — `mcp__claude_ai_Supabase__apply_migration` is not directly callable from Bash; Supabase CLI `--project-ref` flag unrecognized; psql not installed
- **Fix:** Used `node -e` with the `pg` package (already installed in web app) and `DIRECT_URL` (postgres credentials) to run the DDL directly
- **Files modified:** None — DB-only change
- **Result:** Column confirmed present via information_schema query before proceeding

## Self-Check: PASSED

All files exist. All commits verified in git log.
