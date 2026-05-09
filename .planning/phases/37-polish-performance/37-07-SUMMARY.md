---
phase: 37-polish-performance
plan: "07"
subsystem: ui
tags: [react-native, nativewind, form-validation, tailwind, mobile]

# Dependency graph
requires:
  - phase: 37-polish-performance
    provides: Polish and performance baseline; prior plans 01-06 establish conventions
provides:
  - Standardized form validation UI: border-red-500 + text-red-500 text-xs pattern across CreateLoadSheet, incidents/new.tsx, and DocumentUploadSheet
  - Zero inline borderColor style props for error states in DocumentUploadSheet file picker
  - Zero text-red-400 in validation contexts
affects:
  - 37-polish-performance future plans
  - Any future form components that follow the locked validation pattern

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Submit-only validation with border-red-500 conditional border + text-red-500 text-xs error text"
    - "NativeWind className for error-state borders (no inline borderColor for error states)"
    - "API errors go to Toast, field errors go to inline text + border change"

key-files:
  created: []
  modified:
    - apps/mobile/components/owner/CreateLoadSheet.tsx
    - apps/mobile/app/(driver)/incidents/new.tsx
    - apps/mobile/components/driver/DocumentUploadSheet.tsx

key-decisions:
  - "text-red-500 is the canonical error color (not text-red-400) for inline validation messages and required-field asterisks"
  - "borderStyle: dashed must remain as inline style (NativeWind does not support dashed borders); only borderColor migrated to className"
  - "expiryDate field in DocumentUploadSheet is optional — no error-state border needed"
  - "setField clears per-field errors onChange in CreateLoadSheet — this is acceptable; errors only SET on submit per convention"

patterns-established:
  - "Error color convention: text-red-500 text-xs for messages, border-red-500 for field borders"
  - "NativeWind className conditionals over inline style for error-state colors"

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 37 Plan 07: Form Validation Standardization Summary

**Validation UI unified across three forms: text-red-500 + border-red-500 on submit, Toast for API errors, zero inline borderColor error props**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-27T00:02:04Z
- **Completed:** 2026-03-27T00:03:56Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- CreateLoadSheet: all 8 `text-red-400` usages (asterisks + error messages) changed to `text-red-500`; all required fields already had conditional `border-red-500` borders; API onError already used Toast — no behavior changes
- incidents/new.tsx: description TextInput now shows `border-red-500` when `errors.description` is set; category Pressable now shows `border-red-500` when `errors.category` is set
- DocumentUploadSheet: file picker `borderColor: errors.file ? '#ef4444' : '#334155'` inline style migrated to NativeWind `border-red-500`/`border-slate-700` className; docName TextInput border now conditional on `errors.docName`

## Task Commits

Each task was committed atomically:

1. **Task 1: Standardize CreateLoadSheet validation to text-red-500** - `4e57ee9` (fix)
2. **Task 2: Add error-state borders to incidents/new.tsx and DocumentUploadSheet** - `a4acd77` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/mobile/components/owner/CreateLoadSheet.tsx` - text-red-400 → text-red-500 on all validation text (8 occurrences)
- `apps/mobile/app/(driver)/incidents/new.tsx` - conditional border-red-500 on category Pressable and description TextInput
- `apps/mobile/components/driver/DocumentUploadSheet.tsx` - file picker borderColor migrated to NativeWind; docName border made conditional

## Decisions Made
- `borderStyle: 'dashed'` must stay as inline style because NativeWind does not support dashed border styles; only the `borderColor` portion was migrated to className
- `expiryDate` TextInput in DocumentUploadSheet is optional — not flagged in the plan as requiring error-state border, left with hardcoded border
- The `setField` helper in CreateLoadSheet clears per-field errors `onChange` — this is by design (user can see errors clear as they fix input); the "submit-only" convention means errors are only SET on submit, not triggered onChange

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - pre-existing TypeScript errors in unrelated files (FlashList prop types, ExternalLink) — not introduced by this plan.

## Self-Check

**Files exist:**
- `apps/mobile/components/owner/CreateLoadSheet.tsx` — FOUND (modified)
- `apps/mobile/app/(driver)/incidents/new.tsx` — FOUND (modified)
- `apps/mobile/components/driver/DocumentUploadSheet.tsx` — FOUND (modified)

**Commits exist:**
- `4e57ee9` — FOUND
- `a4acd77` — FOUND

## Self-Check: PASSED

## Next Phase Readiness
- All three target forms now follow the locked validation pattern
- Phase 37 plan 07 complete — phase 37 is now fully complete (all 7 plans done)
- Ready to proceed to Phase 38

---
*Phase: 37-polish-performance*
*Completed: 2026-03-27*
