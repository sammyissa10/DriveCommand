---
task: quick-550
title: The typed-name signature path submits; the two collapsed conditions are un-collapsed
subsystem: carrier / driver inspection (Phase 9 web walkaround)
tags: [inspection, dvir, signature, driver, copy-honesty, pure-core]
requires: [inspection-handlers, inspection-optimistic, SignaturePad]
provides: [inspection-signature.ts, planSignatureSubmission, resolveRasterisedSignature]
affects:
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
  - apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
key-files:
  created:
    - apps/web/src/lib/carrier/inspection-signature.ts
    - apps/web/src/lib/carrier/__tests__/inspection-signature.test.ts
  modified:
    - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
    - apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
commits:
  - 7789cd95 fix(quick-550) un-collapse the signature validator's two conditions
  - a7eda547 fix(quick-550) the typed-name walkaround no longer claims a record it does not keep
ddl: none
completed: 2026-08-26
---

# quick-550: the typed-name signature path submits

A driver on a checklist with no SIGNATURE step can now type their name and submit
the walkaround. The validator's single `if (!blob)` — which stood for two
different conditions — is now a two-stage plan, and the typed-name screen no
longer claims to store something it does not store.

## Root cause, in one sentence

`SignatureScreen.submit()` rasterised the canvas unconditionally, above the guard
that correctly skips the upload on a no-SIGNATURE-step playbook, so the OPTIONAL
CHAIN on a null `handleRef.current` yielded `undefined` and one `if (!blob)`
reported "the driver drew nothing" for what was actually "no pad was ever
mounted" — leaving the variant-aware enable-guard `canSign` and the
variant-blind validator disagreeing, with the button enabled and the submission
refused on a screen showing no canvas to sign on.

## What shipped

**`apps/web/src/lib/carrier/inspection-signature.ts`** (new, pure — no React, no
Prisma, no I/O, no `'use client'`, so both a client component and a `'use server'`
module can import it). Two stages, deliberately:

- `planSignatureSubmission({ signatureNeeded, name })` → `REJECT` | `RASTERISE` |
  `SUBMIT_ONLY`. Blank/whitespace name is checked **first and for both variants**;
  then the variant split.
- `resolveRasterisedSignature({ hasPad, hasBlob })` → `REJECT` |
  `UPLOAD_THEN_SUBMIT`. Missing pad checked before empty blob, because with no
  pad the blob's absence says nothing about the driver.

Two stages rather than one predicate because `planSignatureSubmission` **cannot
be handed a blob** — it is pure, and a blob only exists after an `await` on the
DOM. The caller can therefore only obtain one inside the `RASTERISE` branch, so
the canvas call sits *structurally* inside the branch instead of on a line a
later edit can drift back above the guard. A boolean return would have left the
rasterise exactly where it was and merely added a condition beside it. Same
shape as `autoLinkTarget()` and the T3/T4 verdict union: make the wrong state
unrepresentable rather than guarded.

**The runner** now consults the plan, calls `toBlob()` only under `RASTERISE`,
and everything from `requestSignatureUpload` through the PUT, the `!put.ok`
check and `signInspection` is byte-identical — same order, same messages, s3Key
still written only after a 2xx (quick-533). `canSign` was already correct and is
untouched.

**`signInspection`** imports `SIGNATURE_BLANK_NAME_ERROR` instead of repeating
the literal. Value, behaviour and signature identical; the diff is one import
line and one expression.

## `SIGNATURE_PAD_MISSING_ERROR` — the wording, and why

> `The signature pad did not load. Reload this page and try again.`

Distinct from both siblings, and distinct in the way that matters: **it names the
component, not the person.** Telling someone to "sign again" when there is no
canvas in front of them is precisely the dead end this task removes — it accuses
the driver of an omission they cannot correct and points at a remedy that does
not exist on their screen. This sentence describes a component that failed to
mount and offers the remedy that actually applies to one (reload), not the one
that applies to a blank canvas (draw). A test pins the wording and asserts it
does not contain "sign again".

After the fix the condition is unreachable through the normal variants —
`signatureNeeded` *is* `view.signature.required`, which is what decides whether
`<SignaturePad>` renders — so it survives as the honest report for the residual
case: a required pad that failed to mount or never called `onHandle`. That case
previously masqueraded as an empty signature, which is the whole bug in
miniature.

## The redundant re-test in the upload branch

The branch changed from `if (view.signature.required && view.signature.stepInstanceId)`
to `if (blob && view.signature.stepInstanceId)`.

- `view.signature.required` became **redundant**: it is exactly the condition
  that selected `RASTERISE`, so re-asking it here would be a second statement of
  one fact — the kind of duplication that later disagrees with itself.
- `view.signature.stepInstanceId` is **not** redundant. It is the narrowing that
  turns `string | null` into the `string` the `signInspection` call requires, and
  removing it would be a type error, not a simplification.
- `blob &&` is likewise **not** redundant: it narrows `Blob | null` to `Blob` for
  `blob.size` and the PUT body, and it is what keeps the branch unreachable on
  the `SUBMIT_ONLY` path.

## How each of the four cases fails if the fix is undone

Each test asserts on **both** the outcome `kind` and the exact sentence, so a
refactor returning a bare boolean nobody reads cannot keep them green.

1. **`typed name with content submits`** — `{ signatureNeeded: false, name: 'Sam Vance' }`
   must be `{ kind: 'SUBMIT_ONLY' }`, with `expect(plan.kind).not.toBe('RASTERISE')`
   asserted explicitly because "never touches the canvas" is the property under
   test. **Fails** the moment the variant split is dropped and every submission
   is routed through the rasterise path: the outcome becomes `RASTERISE` and the
   `.not.toBe('RASTERISE')` assertion breaks — this is the original bug, caught
   at the branch that caused it.

2. **`typed name blank rejects`** — `{ signatureNeeded: false, name: '   ' }`
   must be `{ kind: 'REJECT', error: SIGNATURE_BLANK_NAME_ERROR }`, plus a
   by-value pin to `'Type the name you are signing under.'`. **This is one of the
   two that catch the tempting wrong fix.** Skip the name check in the
   typed-name branch — an easy "the typed variant just submits" simplification —
   and the outcome becomes `SUBMIT_ONLY`: `expect(plan.kind).toBe('REJECT')`
   breaks first, and the `toEqual` on the error breaks with it. Test 6 breaks in
   the same edit, since it asserts both variants reject with the *same* string.

3. **`drawn canvas with strokes submits`** — `{ signatureNeeded: true, name: 'Sam Vance' }`
   must be `RASTERISE`, then `{ hasPad: true, hasBlob: true }` must be
   `UPLOAD_THEN_SUBMIT`. **Fails** if the variant split is inverted or if the
   drawn path is made to bypass rasterisation — the first assertion returns
   `SUBMIT_ONLY` and the upload would silently stop happening, which is the
   quick-533 artifact (a signed DVIR with no signature object) arriving from the
   opposite direction.

4. **`drawn canvas empty rejects`** — `{ hasPad: true, hasBlob: false }` must be
   `{ kind: 'REJECT', error: SIGNATURE_EMPTY_CANVAS_ERROR }`, pinned by value to
   `'The signature came out empty. Sign again.'`. **This is the other one that
   catches the tempting wrong fix:** "simplify" by DELETING the `!blob` check
   rather than making it conditional — the fastest way to make the typed-name
   variant submit — and this case goes red immediately, because the outcome
   becomes `UPLOAD_THEN_SUBMIT` and `expect(outcome.kind).toBe('REJECT')`
   breaks. `SignaturePad.toBlob()` returning `null` on `!hasInkRef.current` is
   the empty-canvas detector; this test is what stops it being thrown away.

Plus the regression test for the collapse itself: **`a missing pad is not
reported as an empty signature`** — `{ hasPad: false, hasBlob: false }` must
reject with `SIGNATURE_PAD_MISSING_ERROR`, and the test asserts
`SIGNATURE_PAD_MISSING_ERROR !== SIGNATURE_EMPTY_CANVAS_ERROR`. Re-collapse the
two conditions into one message — by any route, including deleting the third
constant and reusing the second — and this fails on the inequality even if every
other assertion is satisfied.

## Nothing is persisted for the typed-name variant — a real gap

**This is a genuine defect that this task reports rather than fixes.** On the
typed-name variant `signature.required` is false and `signature.stepInstanceId`
is null, so the entire grant/PUT/`signInspection` block is skipped and only
`submitInspectionChecklist` runs. **The driver's name and the signing time are
not written anywhere.** The screen said they were "recorded against it"; that
sentence was false, of the same class as quick-548/549, and is now replaced with
the approved copy:

> This checklist does not ask for a drawn signature. Your name is your
> attestation that you completed this walkaround.

The result is a DVIR with **no attestation record at all** — the walkaround is
submitted and its verdict is taken, but nothing identifies who signed it or
when. For a document a roadside inspection asks for, that is a gap worth closing.

**Recommended follow-up (requires a column — deliberately not built here, DDL is
forbidden by this task).** Verified against `schema.prisma`: there is no
DDL-free store.
- `StepInstance.result` is unavailable **by definition** — it needs a SIGNATURE
  step, and this variant is exactly the case where none exists.
- `Trip` carries only `inspectionRequired` and the three `inspectionOverridden*`
  fields; none is suitable and reusing an override column would misreport an
  ordinary inspection as an overridden one.
- `PlaybookInstance` has no signature or result field, and per the Phase 9
  header its `completedAt`/`startedAt` are never written by anything in the repo.

A follow-up should add explicit columns (e.g. `Trip.inspectionAttestedByName` +
`inspectionAttestedAt`, `@db.Timestamptz` — a real instant, so `toLocaleString`
stays the correct rendering and the quick-541 date-only helpers would be the
inverse bug), written at `submitInspectionChecklist` on the typed-name path. No
record was fabricated in the meantime.

## Mobile defect — reported, not fixed, nothing under `apps/mobile` changed

`apps/mobile/components/driver/workflows/TripInspectionScreen.tsx` has **no
typed-name variant at all**. It always renders `SignaturePad`, and:

- `:334` — `if (!token || !checklist || !hasSignature) return` demands ink
  **unconditionally**;
- `:600` — `disabled={!hasSignature || isSubmitting || unansweredCount > 0}`
  demands ink **unconditionally**;
- `:339` — `if (checklist.signature.required && checklist.signature.stepInstanceId)`
  uploads **conditionally**, and correctly.

So on a no-SIGNATURE-step playbook a mobile driver is forced to draw a signature
that is then **discarded** — exactly the theatre the web comment at
`InspectionRunner.tsx:925-933` records quick-543 removing from web. Note this is
a *different* defect from the one fixed here: mobile is not blocked (the button
enables once ink exists), it is dishonest. Fixing it means **building the
typed-name variant on mobile** — a conditional pad, a name-only footer guard and
the same copy — which is out of this task's scope.

## Verification

| Gate | Result |
| --- | --- |
| Vitest `src/lib/carrier/__tests__` BEFORE | **11 files / 127 tests / 0 failures** |
| Vitest `src/lib/carrier/__tests__` AFTER | **12 files / 139 tests / 0 failures** |
| Delta | **+1 file, +12 tests, 0 failures, no existing test weakened or deleted** (127 + 12 = 139) |
| `npx tsc --noEmit` — `apps/web` | clean, **probed** |
| `npx tsc --noEmit` — `apps/mobile` | clean, **probed** |

**The probes were observed to fail, so neither clean run is being taken on
trust.** `const __probe: number = 'x';` was injected into both files actually
edited in `apps/web` and tsc reported exactly those two:

```
src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx(1170,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/lib/carrier/inspection-signature.ts(168,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

For `apps/mobile` — where nothing was edited — the probe went into
`components/driver/workflows/TripInspectionScreen.tsx` and was reported at
`(940,7)`, then removed with `git checkout --`, which makes the restoration
byte-for-byte by construction. Removal in `apps/web` initially left one stray
trailing newline in each file; both were normalised and confirmed against
`git diff` before committing. A repo-wide scan for `__probe` across all `.ts`/`.tsx`
returns **nothing**, and `git status --porcelain` is clean.

`tests/carrier/inspection-blocked-side-effects.test.ts` was **not run** — it hits
real Postgres on a disposable tenant. Nothing in production was touched.

Stray tool-output scan (`</content>`, `</invoke>`, `</antml`) over every written
file: **no matches.**

## One deviation worth stating

Task 1's verify block asks that
`'Type the name you are signing under.'` return **exactly one** hit across
`src`. It returns **three**: once in `inspection-signature.ts` (the constant),
and twice in the new test file — which is unavoidable, because the same plan
requires the copy be pinned **"by value, not only by constant identity"**. The
two demands are only compatible if the scan is read as covering non-test source,
which is how the plan's own test 7 scopes it (it reads exactly
`inspection-signature.ts` and `actions.ts` from disk). So:

- non-test source: **exactly one** occurrence, in `inspection-signature.ts`;
- `actions.ts`: contains `SIGNATURE_BLANK_NAME_ERROR`, does **not** contain the
  literal — asserted by a test, not just grepped;
- the test file's two occurrences are the by-value pin, i.e. the guard against
  drift rather than an instance of it.

`recorded against it` returns 0 hits in `InspectionRunner.tsx` and `attestation`
exactly 1 (the rendered sentence) — the comment explaining the change was
reworded so neither grep is satisfied by prose about the fix.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/inspection-signature.ts` — FOUND
- `apps/web/src/lib/carrier/__tests__/inspection-signature.test.ts` — FOUND
- `apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx` — FOUND, modified
- `apps/web/src/app/(driver-fullscreen)/inspection/actions.ts` — FOUND, modified
- commit `7789cd95` — FOUND
- commit `a7eda547` — FOUND
- `apps/mobile` — unmodified, confirmed by `git status`
- no DDL, no migration, no data change
- nothing pushed
