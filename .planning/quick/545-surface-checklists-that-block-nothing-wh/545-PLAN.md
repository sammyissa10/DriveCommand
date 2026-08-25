# quick-545 — Surface checklists that block nothing while blocking is on

**Pre-task commit:** `e5232725`
**Predecessor:** quick-544 step 5, which recommended exactly these two surfaces and did not build them.
**Date:** 2026-08-25

## Problem

`blockTripStartOnFailedInspection` reads as protection. On a tenant whose inspection
checklist has no item marked `isDispatchBlocker`, `evaluateTripStartGate` can never
reach its `BLOCKED` branch: every failure falls through to `PASSED_WITH_DEFECTS` and
the trip starts. A driver can fail the brake check and roll.

## Constraints

- No DDL, no data writes, no migration.
- Do not change `evaluateTripStartGate` or `computeDispatchReadiness`.
- Do not auto-fix, auto-migrate, or default any step to blocking. Which items stop a
  truck is the carrier's judgement.
- Report the gap condition and both pieces of copy before implementing.

## Tasks

### 1. Establish the exact condition (report first)

Trace the gate, the lookup and `ensureTripInspection`. Determine precisely which of
these are required: an ACTIVE playbook, `category = VEHICLE_INSPECTION`, a particular
`entityType`, at least one `INSPECTION_ITEM` step, and both tenant settings.

Verify against production rather than inferring.

### 2. Shared predicate + read

- New pure module `lib/carrier/inspection-coverage.ts` — `checklistBlocksNothing`
  (per checklist) and `tenantInspectionsBlockNothing` (tenant aggregate). Pure so the
  same rule runs client-side in the builder and server-side on the settings page.
- `getInspectionBlockerCoverage` in the existing read-only `inspection-lookup.ts`,
  its `where` mirroring `ensureTripInspection`'s playbook selection exactly.
- Unit tests pinning the two clauses most likely to be "simplified" away.

### 3. `/settings/operations` (copy reported first)

Line beside "Block the trip when a critical item fails", matching the existing
contextual line's placement and tone. Mutually exclusive with it by construction.
Both tenant toggles read from LIVE state so the warning appears on flip, not on save.

### 4. Playbook builder (copy reported first)

Strip beneath the header on a `VEHICLE_INSPECTION` checklist with inspection items
but no blockers. Client-side only — the builder already holds every input.

### 5. Report only, do not build

Whether the same gap class exists for driver ONBOARDING playbooks and
`User.isDispatchReady`.

## Gates

- `tsc --noEmit` clean in **both** apps, each **probed** (inject a deliberate type
  error, confirm tsc reports it, delete it) per CLAUDE.md's blind-gate rule.
- Full vitest suite diffed against `e5232725` via a worktree **inside** the repo,
  removed with `git worktree remove`.
