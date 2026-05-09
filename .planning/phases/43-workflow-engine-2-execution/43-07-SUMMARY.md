---
phase: 43-workflow-engine-2-execution
plan: "07"
subsystem: workflow-engine
tags: [tests, vitest, jest, tap-targets, workflow-engine, phase-43]
dependency_graph:
  requires: [43-03, 43-06]
  provides: [phase-43-test-suite]
  affects: [apps/web/src/__tests__, apps/mobile/tests, apps/mobile/components/driver/workflows]
tech_stack:
  added: []
  patterns:
    - Vitest vi.mock for prisma + send-push (unit tests, no DB)
    - Static-analysis tap-target audit using Node.js fs/path in jest
    - TRPCError message assertion via expect.objectContaining
key_files:
  created:
    - apps/web/src/__tests__/workflows-instance.test.ts
    - apps/web/src/__tests__/workflows-complete-step.test.ts
    - apps/mobile/tests/workflows-tap-targets.test.ts
  modified:
    - apps/mobile/components/driver/workflows/DocumentUploadScreen.tsx
    - apps/mobile/components/driver/workflows/FormFillScreen.tsx
    - apps/mobile/components/driver/workflows/SignatureScreen.tsx
decisions:
  - Mobile test file placed in apps/mobile/tests/ (not apps/mobile/src/__tests__/) to match project structure — jest.config.js picks up tests/ by default via jest-expo preset
  - Tap-target SCREENS_DIR adjusted to components/driver/workflows/ (actual screen location, not src/screens/workflows/)
  - Added 'Btn' to touchable-context heuristic to catch backBtn/clearBtn style names
metrics:
  duration: 303s
  completed: 2026-04-24
  tasks: 2
  files: 6
---

# Phase 43 Plan 07: Phase 43 Test Suite Summary

Phase 43 test suite complete — snapshot immutability, zero-blocker readiness, all 7 completeStep validations, and mobile tap-target audit verified via automated tests.

## What Was Built

**Task 1: Snapshot immutability + readiness tests** (`a16c4da`)

`apps/web/src/__tests__/workflows-instance.test.ts` — 2 Vitest unit tests:

1. **Snapshot immutability**: Mocks `prisma.$transaction` to capture `playbookSnapshot` at create time, then mutates the source playbook object post-generation. Asserts the captured snapshot retains original values — proving `buildPlaybookSnapshot` produces a deep copy.

2. **Zero-blocker readiness**: Provides 3 stepInstances all with `isDispatchBlocker: false` in their snapshot, calls `computeDispatchReadiness`, asserts `isReady=true` and `blockers=[]`.

**Task 2: completeStep validation + mobile tap-target audit** (`29e8c6a`)

`apps/web/src/__tests__/workflows-complete-step.test.ts` — 7 Vitest unit tests, one per StepType:
- `DOCUMENT_UPLOAD` → `MISSING_FILES` when `fileUrls: []`
- `SIGNATURE` → `MISSING_SIGNATURE` when `signatureUrl` absent
- `FORM_FILL` → `INVALID_FORM` when `formData` absent
- `INSPECTION_ITEM` → `USE_FAIL_ENDPOINT` (always, Phase 44 endpoint)
- `TRAINING_ACK` → `MISSING_ACK` when neither `acknowledged` nor `note` provided
- `THIRD_PARTY` → `MISSING_EVIDENCE` when no `note` and no `fileUrls`
- `CUSTOM_NOTE` → `MISSING_NOTE` when `note` is whitespace-only

`apps/mobile/tests/workflows-tap-targets.test.ts` — 4 Jest static-analysis tests:
- Reads source of each workflow screen with Node.js `fs.readFileSync`
- Uses regex `height\s*:\s*(\d+)` + 500-char context heuristic to find touchable heights
- Heuristic detects: TouchableOpacity, Pressable, button, Button, action, Btn
- Asserts all values ≥ 56px

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tap-target violations in 3 action screens**
- **Found during:** Task 2, first run of `workflows-tap-targets.test.ts`
- **Issue:** `backBtn` was 44x44px in DocumentUploadScreen and FormFillScreen. `backBtn` and `clearBtn` were 44px in SignatureScreen. The spec mandates ≥56px for all touchable elements in task action screens.
- **Fix:** Updated `backBtn` width+height to 56px and `clearBtn` height to 56px across 3 files
- **Files modified:** `DocumentUploadScreen.tsx`, `FormFillScreen.tsx`, `SignatureScreen.tsx`
- **Commit:** `29e8c6a`

**2. [Rule 3 - Blocking] Adjusted test file paths to match actual project structure**
- **Found during:** Task 2 analysis of mobile project layout
- **Issue:** Plan specified `apps/mobile/src/__tests__/workflows-tap-targets.test.ts` and `../screens/workflows` as SCREENS_DIR, but mobile app uses `apps/mobile/tests/` (no `src/`) and screens are at `apps/mobile/components/driver/workflows/`
- **Fix:** Placed test at `apps/mobile/tests/workflows-tap-targets.test.ts`; set SCREENS_DIR to `../components/driver/workflows`; added `'Btn'` to touchable heuristic
- **Commit:** `29e8c6a`

## Test Results Summary

| Suite | Pass | Fail |
|-------|------|------|
| workflows-naming-lint.test.ts | 1 | 0 |
| workflows-instance.test.ts | 2 | 0 |
| workflows-complete-step.test.ts | 7 | 0 |
| workflows-tap-targets.test.ts (jest) | 4 | 0 |
| **Total** | **14** | **0** |

Note: 10 pre-existing failures in `tests/unit/auth/` (mockGetSession API mismatch) exist before and after this plan — not caused by this work.

## Self-Check: PASSED

- FOUND: apps/web/src/__tests__/workflows-instance.test.ts
- FOUND: apps/web/src/__tests__/workflows-complete-step.test.ts
- FOUND: apps/mobile/tests/workflows-tap-targets.test.ts
- FOUND commit: a16c4da (Task 1)
- FOUND commit: 29e8c6a (Task 2)
