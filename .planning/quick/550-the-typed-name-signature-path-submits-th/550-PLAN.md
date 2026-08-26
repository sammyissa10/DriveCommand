---
phase: quick-550
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/inspection-signature.ts
  - apps/web/src/lib/carrier/__tests__/inspection-signature.test.ts
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
  - apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
autonomous: true

must_haves:
  truths:
    - "A driver on a checklist with NO SIGNATURE step types a name and taps Sign and submit, and the walkaround submits. No canvas is consulted and no canvas error appears."
    - "A driver on that same checklist with a blank name is rejected with 'Type the name you are signing under.' — the same wording the server action already uses."
    - "A driver on a checklist WITH a SIGNATURE step who has drawn strokes still rasterises, still uploads, and still gets an s3Key only after a 2xx, then signs, then submits."
    - "A driver on a checklist WITH a SIGNATURE step and an untouched canvas is STILL rejected with 'The signature came out empty. Sign again.'"
    - "The typed-name screen no longer claims the name and time are recorded against the checklist, because nothing is recorded."
  artifacts:
    - path: "apps/web/src/lib/carrier/inspection-signature.ts"
      provides: "Pure two-stage submission decision + the three error strings, single source"
      exports: ["planSignatureSubmission", "resolveRasterisedSignature", "SIGNATURE_BLANK_NAME_ERROR", "SIGNATURE_EMPTY_CANVAS_ERROR", "SIGNATURE_PAD_MISSING_ERROR"]
    - path: "apps/web/src/lib/carrier/__tests__/inspection-signature.test.ts"
      provides: "The four named cases as real assertions, plus pad-missing and copy pinning"
    - path: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx"
      provides: "SignatureScreen.submit() consulting the plan; typed-name copy corrected"
  key_links:
    - from: "InspectionRunner.tsx"
      to: "src/lib/carrier/inspection-signature.ts"
      via: "import { planSignatureSubmission, resolveRasterisedSignature }"
      pattern: "planSignatureSubmission"
    - from: "actions.ts (signInspection)"
      to: "src/lib/carrier/inspection-signature.ts"
      via: "import { SIGNATURE_BLANK_NAME_ERROR }"
      pattern: "SIGNATURE_BLANK_NAME_ERROR"
---

<objective>
`SignatureScreen.submit()` in the full-screen driver walkaround rasterises the
signature canvas UNCONDITIONALLY, above the guard that correctly skips the
upload when the playbook has no SIGNATURE step. In that typed-name variant
`<SignaturePad>` never mounts, `handleRef.current` stays null,
`(await handleRef.current?.toBlob())` short-circuits to `undefined`, `!blob` is
true, and the driver is told **"The signature came out empty. Sign again."**
beside a screen that shows no canvas to sign on. The enable-guard `canSign` is
already variant-aware and enables the button; the validator then refuses it.

**The defect is one check standing for two different conditions** — "no pad
exists" and "the pad is blank". Un-collapsing them is the whole fix.

Purpose: an inspection on a no-SIGNATURE-step playbook is currently
unsubmittable from the web walkaround. That is a dead end in front of
`Trip.start`.
Output: a pure decision module, the runner wired to it, honest typed-name copy,
and four real tests.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Under repair:
@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/SignaturePad.tsx
@apps/web/src/app/(driver-fullscreen)/inspection/actions.ts

Shape to copy — the repo's pure-core precedent, three files down the same path
(decide / read / write). Read the header comments; the SAME register of comment
is expected on the new module:
@apps/web/src/lib/carrier/inspection-optimistic.ts
@apps/web/src/lib/carrier/__tests__/inspection-optimistic.test.ts
@apps/web/src/lib/carrier/inspection-coverage.ts
</context>

<settled_findings>
These were investigated by the orchestrator. **Do not re-derive them.** They are
inputs, not questions.

**The fall-through (step 1).** `InspectionRunner.tsx:935-947`:
```ts
const signatureNeeded = view.signature.required;
const canSign = remaining === 0 && (!signatureNeeded || hasInk) && name.trim().length > 0 && !busy;
...
  // 1. Rasterise.
  const blob = await handleRef.current?.toBlob();
  if (!blob) {
    setError('The signature came out empty. Sign again.');
    return;
  }
```
`canSign` is correct. The rasterise-and-check runs above the correct
`if (view.signature.required && view.signature.stepInstanceId)` upload guard at
`:950`. The optional chain on a null `handleRef.current` is the fall-through.

**Blank-name copy (step 2) — APPROVED VERBATIM:**
`Type the name you are signing under.`
It already exists at `actions.ts:352` inside `signInspection`. One condition,
one wording.

**Persistence (step 3) — and a second defect.**
- Drawn variant: blob → presigned R2 PUT → `signInspection` →
  `completeDriverTask(stepInstanceId, { signatureUrl: s3Key, ... })`. The
  `s3Key` is written **only after a 2xx**. That is the quick-533 guarantee.
  **Do not disturb the ordering.**
- Typed-name variant: **NOTHING is persisted.** `signature.required` is false
  and `signature.stepInstanceId` is null, so the entire block is skipped and
  only `submitInspectionChecklist` runs.
- Therefore the on-screen sentence *"Your name and the time below are recorded
  against it"* is FALSE — an independent defect of the quick-548/549 class.
- There is **no DDL-free store**. Verified against `schema.prisma`: `Trip` has
  only `inspectionRequired` + the three `inspectionOverridden*` columns;
  `PlaybookInstance` has no signature/result field; `StepInstance.result`
  requires a SIGNATURE step that by definition does not exist here. **DDL is
  forbidden by this task.**
- **APPROVED replacement copy, VERBATIM:**
  `This checklist does not ask for a drawn signature. Your name is your attestation that you completed this walkaround.`
- Persisting a typed attestation needs a column. **REPORT it in the SUMMARY as
  a recommended follow-up. Do not build it.**

**Mobile (step 6) — report only, DO NOT EDIT.**
`apps/mobile/components/driver/workflows/TripInspectionScreen.tsx` has no
typed-name variant at all. It always renders `SignaturePad`; the guard at `:334`
(`if (!token || !checklist || !hasSignature) return`) and the button at `:600`
(`disabled={!hasSignature || ...}`) both demand ink **unconditionally**, while
the upload IS correctly conditional at `:339`. So on a no-SIGNATURE-step
playbook a mobile driver must DRAW a signature that is then discarded — exactly
the theatre the web comment at `:925-933` records quick-543 removing from web.
Different defect. Fixing it means building the typed-name variant on mobile,
which is out of scope. **Report in the SUMMARY.**
</settled_findings>

<constraints>
- Do NOT change `evaluateTripStartGate` (`inspection-gate.ts`), `handleGetGate`'s
  purity, or `applyVerdictSideEffects` (`inspection-service.ts`).
- Do NOT change the drawn path's upload ordering — `s3Key` only after a 2xx.
- Do NOT change any server action's **behaviour or signature**, including
  `signInspection`. Swapping one string literal for an imported constant of
  byte-identical value changes neither, and is required by Task 1.
- Do NOT edit anything under `apps/mobile`.
- NO DDL. NO data migration.
- Do NOT weaken or delete any existing test.
- `SignaturePad.toBlob()` returns `null` when `!hasInkRef.current`
  (`SignaturePad.tsx:104-107`). **That is what catches an empty canvas.
  Preserve it. Do not weaken it.** quick-533 exists because an
  empty-signature DVIR is the artifact to prevent.
- PowerShell has no `&&` / `||`. Use `;` or `if ($?) { }`.
- Any source-scanning test must normalise line endings
  (`.replace(/\r\n/g,'\n')`) — the repo has no `.gitattributes` and
  `core.autocrlf=true`.
- After writing each file, check it for stray tool-output text appended after
  the real content (`</content>`, `</invoke>`). A parse error in ANY file in the
  program blinds tsc for the whole program.
- Commit only. Do NOT push.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Pure decision module + exhaustive tests</name>
  <files>
apps/web/src/lib/carrier/inspection-signature.ts (new)
apps/web/src/lib/carrier/__tests__/inspection-signature.test.ts (new)
apps/web/src/app/(driver-fullscreen)/inspection/actions.ts (one literal → import)
  </files>
  <action>
**Why a pure module and not a component test.** `submit()` is a closure inside a
React component. The two honest options are (a) extract the decision into a pure
exported helper and unit-test it exhaustively, or (b) a jsdom component test.
**Take (a).** It is the shape the repo already prefers — `inspection-optimistic.ts`,
`inspection-gate.ts`, `inspection-coverage.ts`, `template-matching.ts` are all
pure cores with thin wrappers. Option (b) is a trap here: quick-547 wrote a
jsdom-style component test and deliberately did NOT commit it, because
`jsdom` and `react-dom/client` are hoisted transitive deps and **not declared
devDependencies of `apps/web`**. Do not reach for them without declaring the
dependency, and do not declare one for this.

Create `apps/web/src/lib/carrier/inspection-signature.ts`. **PURE** — no React,
no Prisma, no `'use client'`, no I/O. It must be importable by both a client
component and a `'use server'` file.

Export three error strings as constants (single source; the module is where
they live and nowhere else):
- `SIGNATURE_BLANK_NAME_ERROR = 'Type the name you are signing under.'`
- `SIGNATURE_EMPTY_CANVAS_ERROR = 'The signature came out empty. Sign again.'`
- `SIGNATURE_PAD_MISSING_ERROR` — **you choose the wording.** It must be
  DISTINCT from the other two and must describe the pad failing to load, not
  the driver failing to sign. This constant is the whole point of the task:
  "no pad exists" and "the pad is blank" stop being one message. State your
  wording and your reason in the SUMMARY.

Export a **two-stage** decision, so that touching the canvas is structurally
inside a branch rather than a line someone can hoist:

```ts
export type SignaturePlan =
  | { kind: 'REJECT'; error: string }
  | { kind: 'RASTERISE' }
  | { kind: 'SUBMIT_ONLY' };

export function planSignatureSubmission(input: {
  signatureNeeded: boolean;
  name: string;
}): SignaturePlan;

export type RasterisedOutcome =
  | { kind: 'REJECT'; error: string }
  | { kind: 'UPLOAD_THEN_SUBMIT' };

export function resolveRasterisedSignature(input: {
  hasPad: boolean;
  hasBlob: boolean;
}): RasterisedOutcome;
```

Required behaviour, exhaustive:
- `planSignatureSubmission`: blank/whitespace-only `name` → `REJECT` with
  `SIGNATURE_BLANK_NAME_ERROR`, **checked first and regardless of variant**.
  Then `signatureNeeded === true` → `RASTERISE`; otherwise → `SUBMIT_ONLY`.
- `resolveRasterisedSignature`: `!hasPad` → `REJECT` with
  `SIGNATURE_PAD_MISSING_ERROR`. Else `!hasBlob` → `REJECT` with
  `SIGNATURE_EMPTY_CANVAS_ERROR`. Else → `UPLOAD_THEN_SUBMIT`.

The file header comment must explain, in the register of
`inspection-optimistic.ts`'s header, **the two-conditions-collapsed trap**:
that a single `if (!blob)` above the upload guard was standing for both "the
playbook has no pad" and "the driver drew nothing", that the first is not a
driver error at all, and that returning a plan rather than a boolean is what
stops the canvas call being hoisted back out of its branch. Name the shape:
same reasoning as `autoLinkTarget()` and the T3/T4 verdict union — make the
wrong state unrepresentable rather than guarded.

**Then de-duplicate the blank-name wording.** In
`apps/web/src/app/(driver-fullscreen)/inspection/actions.ts:352`, replace the
literal `'Type the name you are signing under.'` with
`SIGNATURE_BLANK_NAME_ERROR` imported from the new module. Value identical,
behaviour identical, signature identical. Confirm afterwards with a grep that
the literal string now appears in exactly ONE file (`inspection-signature.ts`).

Create `apps/web/src/lib/carrier/__tests__/inspection-signature.test.ts`.
Pure, no mocks, no DB, no React — same discipline as
`inspection-optimistic.test.ts` next door.

**The four cases the user named must each be a real assertion on BOTH the
outcome `kind` AND the exact error string** (a test that only asserts a
truthy/falsy would pass under a refactor that returns a bare boolean nobody
reads — that is the vacuity to avoid):

1. `typed name with content submits` —
   `planSignatureSubmission({ signatureNeeded: false, name: 'Sam Vance' })`
   → `{ kind: 'SUBMIT_ONLY' }`. Assert it is NOT `RASTERISE` explicitly, since
   "never touches the canvas" is the property under test.
2. `typed name blank rejects` — same with `name: '   '` →
   `{ kind: 'REJECT', error: SIGNATURE_BLANK_NAME_ERROR }`, and assert the
   error equals the literal `'Type the name you are signing under.'` so the
   copy is pinned by value, not only by constant identity.
3. `drawn canvas with strokes submits` —
   `planSignatureSubmission({ signatureNeeded: true, name: 'Sam Vance' })`
   → `{ kind: 'RASTERISE' }`, then
   `resolveRasterisedSignature({ hasPad: true, hasBlob: true })`
   → `{ kind: 'UPLOAD_THEN_SUBMIT' }`.
4. `drawn canvas empty rejects` — `RASTERISE`, then
   `resolveRasterisedSignature({ hasPad: true, hasBlob: false })`
   → `{ kind: 'REJECT', error: SIGNATURE_EMPTY_CANVAS_ERROR }`, pinned to the
   literal `'The signature came out empty. Sign again.'`.

Plus:
5. `a missing pad is not reported as an empty signature` —
   `resolveRasterisedSignature({ hasPad: false, hasBlob: false })` → `REJECT`
   with `SIGNATURE_PAD_MISSING_ERROR`, and assert
   `SIGNATURE_PAD_MISSING_ERROR !== SIGNATURE_EMPTY_CANVAS_ERROR`. **This is
   the regression test for the collapse itself.**
6. `the blank name check runs before the variant split` — assert BOTH
   `{ signatureNeeded: true, name: '' }` and
   `{ signatureNeeded: false, name: '' }` reject with the same string.
7. `the blank-name wording exists in one place` — read
   `inspection-signature.ts` and `actions.ts` from disk with
   `readFileSync(..., 'utf8').replace(/\r\n/g, '\n')`, assert `actions.ts`
   contains `SIGNATURE_BLANK_NAME_ERROR` and does NOT contain the raw literal,
   and that `inspection-signature.ts` contains the literal exactly once.
   Resolve the paths from `import.meta.url` / `__dirname`, not from cwd.
  </action>
  <verify>
```powershell
cd C:\Users\sammy\Projects\DriveCommand\apps\web
npx vitest run src/lib/carrier/__tests__/inspection-signature.test.ts
Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx -Path src | ForEach-Object FullName) -Pattern 'Type the name you are signing under\.' -SimpleMatch:$false | Select-Object Path,LineNumber
```
The Select-String must return exactly ONE hit, in `inspection-signature.ts`.
Then re-check each new file for stray tool-output text:
```powershell
Select-String -Path src\lib\carrier\inspection-signature.ts,src\lib\carrier\__tests__\inspection-signature.test.ts -Pattern '</content>|</invoke>|</antml'
```
Must return nothing.
  </verify>
  <done>
`inspection-signature.ts` exists, is pure, exports the three constants and the
two decision functions. Its test file passes with at least 7 real assertions
covering the four named cases plus pad-missing, ordering, and the single-source
copy scan. `actions.ts` imports the constant and no longer carries the literal.
`signInspection`'s behaviour and signature are unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire the runner and correct the typed-name copy</name>
  <files>
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
  </files>
  <action>
**A — the validator.** Rewrite `SignatureScreen.submit()` (`:938-999`) to consult
the module. Required shape:

```ts
async function submit() {
  setBusy(true);
  setError(null);
  try {
    /**
     * ONE CHECK MUST NOT STAND FOR TWO CONDITIONS.
     *
     * This used to open with an unconditional
     * `const blob = await handleRef.current?.toBlob()` and a bare `if (!blob)`
     * reporting "The signature came out empty." Above a guard that already
     * skipped the upload when the playbook has no SIGNATURE step — so on such a
     * playbook `<SignaturePad>` never mounts, `handleRef.current` is null, the
     * optional chain yields `undefined`, and the driver was told to sign again
     * on a screen with no canvas on it. `canSign` enabled the button and the
     * validator then refused it.
     *
     * "There is no pad" and "the pad is blank" are different facts with
     * different remedies. `planSignatureSubmission` returns a PLAN rather than
     * a boolean so the canvas call lives inside the RASTERISE branch and
     * cannot be hoisted back above it by a later edit.
     */
    const plan = planSignatureSubmission({ signatureNeeded, name });
    if (plan.kind === 'REJECT') {
      setError(plan.error);
      return;
    }

    // 1. Rasterise — ONLY when a pad exists to rasterise.
    let blob: Blob | null = null;
    if (plan.kind === 'RASTERISE') {
      blob = (await handleRef.current?.toBlob()) ?? null;
      const outcome = resolveRasterisedSignature({
        hasPad: handleRef.current !== null,
        hasBlob: blob !== null,
      });
      if (outcome.kind === 'REJECT') {
        setError(outcome.error);
        return;
      }
    }
    ...
```

Then the upload branch. `blob` must remain in scope for it. **Change the
condition to `if (blob && view.signature.stepInstanceId)`** and record the
reasoning in the SUMMARY: after the fix, `view.signature.required` is exactly
what put us in the RASTERISE branch, so re-testing it there is **redundant**,
whereas `view.signature.stepInstanceId` is **not** — it is the narrowing that
makes `stepInstanceId` a `string` for the `signInspection` call, and `blob &&`
is what narrows `Blob | null` to `Blob` for `blob.size` and the PUT body.

Everything from `requestSignatureUpload` down through the PUT, the `!put.ok`
check and `signInspection` is **unchanged** — same order, same messages, s3Key
still only after a 2xx.

Do not touch `canSign` (`:936`). It is already correct.

**B — the copy.** Replace the typed-name `<p>` body at `:1056-1059`:
```
This checklist does not ask for a drawn signature. Your name and the time below are
recorded against it.
```
with, verbatim:
```
This checklist does not ask for a drawn signature. Your name is your attestation that you completed this walkaround.
```
Nothing is persisted for this variant — no SIGNATURE `StepInstance` exists to
carry it and there is no other column — so the old sentence was a false
storage claim. Add a short comment above the `<p>` saying so, and that a stored
typed attestation would need a column (out of scope here, DDL forbidden).

Leave the `sig-name` input and the timestamp exactly as they are. The name is
still a real gate: `canSign` requires it, and `planSignatureSubmission` now
requires it too, as defence in depth so the guard and the validator cannot
drift apart.
  </action>
  <verify>
```powershell
cd C:\Users\sammy\Projects\DriveCommand\apps\web
Select-String -Path 'src\app\(driver-fullscreen)\inspection\[dispatchId]\InspectionRunner.tsx' -Pattern 'planSignatureSubmission|resolveRasterisedSignature|recorded against it|attestation'
```
Both function names must appear; `recorded against it` must NOT; `attestation`
must appear once. Then:
```powershell
Select-String -Path 'src\app\(driver-fullscreen)\inspection\[dispatchId]\InspectionRunner.tsx' -Pattern '</content>|</invoke>|</antml'
```
Must return nothing.
  </verify>
  <done>
`submit()` consults `planSignatureSubmission` first and calls `toBlob()` only
inside the RASTERISE branch. The upload branch is `if (blob && view.signature.stepInstanceId)`
and its body is byte-identical to before. The typed-name `<p>` carries the
approved sentence. `canSign` is untouched.
  </done>
</task>

<task type="auto">
  <name>Task 3: Probed typecheck, diffed suites, commits, SUMMARY</name>
  <files>
.planning/quick/550-the-typed-name-signature-path-submits-th/550-SUMMARY.md
  </files>
  <action>
**1 — Vitest BEFORE and AFTER, counts diffed.**
The recorded baseline is **11 files / 127 tests / 0 failures**. Capture the
AFTER run and diff explicitly; report both numbers and the delta. The new file
adds one file and its tests; **no existing count may drop.**
```powershell
cd C:\Users\sammy\Projects\DriveCommand\apps\web
npx vitest run src/lib/carrier/__tests__
```
Do NOT run `tests/carrier/inspection-blocked-side-effects.test.ts` — it hits
real Postgres with a disposable tenant. If you run it anyway, verify production
is left clean afterwards.

**2 — `npx tsc --noEmit`, PROBED, in BOTH apps.**
An unprobed clean run does not count.
```powershell
cd C:\Users\sammy\Projects\DriveCommand\apps\web
npx tsc --noEmit
```
Then probe: inject `const __probe: number = 'x';` into
`src/lib/carrier/inspection-signature.ts` (a file you actually edited), re-run,
and **confirm tsc reports THAT error at THAT line**. Delete the probe, re-run,
confirm clean, and confirm with `git diff --stat` / `git status` that removal
restored the file byte-for-byte.

**If the reported errors are all syntax errors, or all in files you did not
touch, the gate is BLIND, not green.** Delete
`apps\web\.next\dev\types\validator.ts` and `apps\web\tsconfig.tsbuildinfo`,
then re-run. Also sweep the whole tree for leftover probes from earlier
sessions:
```powershell
cd C:\Users\sammy\Projects\DriveCommand
git status --porcelain
Get-ChildItem -Recurse -Include *.ts,*.tsx -Path apps\web\src,apps\mobile | Select-String -Pattern '__probe' | Select-Object Path,LineNumber
```
Then mobile — a regression check only, nothing there was edited:
```powershell
cd C:\Users\sammy\Projects\DriveCommand\apps\mobile
npx tsc --noEmit
```

**3 — Commits.** Two atomic commits matching Tasks 1 and 2, e.g.
`fix(quick-550): un-collapse the signature validator's two conditions` and
`fix(quick-550): the typed-name walkaround no longer claims a record it does not keep`.
**Commit only. Do NOT push.**

**4 — SUMMARY** at
`.planning/quick/550-the-typed-name-signature-path-submits-th/550-SUMMARY.md`.
It must state, plainly:

- **The root cause in one sentence:** the optional chain on a null
  `handleRef.current` meant one `if (!blob)` stood for two different
  conditions, and the enable-guard and the validator disagreed about the
  typed-name variant.
- **HOW EACH OF THE FOUR TESTS WOULD FAIL.** Specifically: the
  `typed name blank rejects` and `drawn canvas empty rejects` cases are the two
  that catch the tempting wrong fix — "simplify" by DELETING the `!blob` check
  rather than making it conditional, and case 4 goes red; skip the name check
  in the typed-name branch and case 2 goes red. Say which assertion breaks in
  each, not just that one would.
- **`SIGNATURE_PAD_MISSING_ERROR`** — your wording and why it is distinct.
- **The redundant re-test:** that `view.signature.required` in the upload
  branch became redundant after the fix while `view.signature.stepInstanceId`
  did not, and why.
- **Nothing is persisted for the typed-name variant.** Name it as a real gap:
  a DVIR with no attestation record. **Recommend a follow-up that adds a
  column** (`StepInstance.result` is unavailable because no SIGNATURE step
  exists by definition; `Trip` and `PlaybookInstance` carry nothing suitable —
  verified against `schema.prisma`). **Do not build it here.**
- **The mobile defect, reported not fixed:** `TripInspectionScreen.tsx` has no
  typed-name variant, so on a no-SIGNATURE-step playbook a mobile driver must
  draw a signature that is then discarded — the theatre quick-543 removed from
  web, still live on mobile. Cite `:334`, `:339`, `:600`. Say that fixing it
  means building the variant on mobile, which was out of this task's scope.
- Both vitest counts and the diff; the probed tsc result for both apps,
  including the probe's observed error.
  </action>
  <verify>
Vitest AFTER >= 11 files / 127 tests with 0 failures, plus the new file.
Both `tsc --noEmit` runs clean AND the probe was observed to fail first.
`git status --porcelain` clean after the commits. `git log --oneline -2` shows
the two commits. No `__probe` anywhere. No commit pushed.
  </verify>
  <done>
Suites diffed and reported, typecheck probed in both apps, two atomic commits
landed and unpushed, SUMMARY written covering all seven bullets above.
  </done>
</task>

</tasks>

<verification>
1. `npx vitest run src/lib/carrier/__tests__` — 0 failures; counts diffed
   against the 11 files / 127 tests baseline; no existing test weakened or
   deleted.
2. `npx tsc --noEmit` clean in `apps/web` AND `apps/mobile`, each with a probe
   observed to fail and then removed byte-for-byte.
3. `'Type the name you are signing under.'` appears in exactly one file.
4. `recorded against it` no longer appears in `InspectionRunner.tsx`.
5. No stray tool-output text in any written file.
6. `git status` clean; two commits; nothing pushed.
</verification>

<success_criteria>
- Typed-name variant + non-empty name: submits, no canvas consulted, no canvas
  error.
- Typed-name variant + blank name: rejected with
  `Type the name you are signing under.`
- Drawn variant + strokes: rasterises, uploads, s3Key only after a 2xx, then
  `signInspection`, then submit — behaviour unchanged.
- Drawn variant + empty canvas: still rejected with
  `The signature came out empty. Sign again.`
- Missing pad on a drawn playbook: rejected with a DISTINCT message.
- Typed-name copy makes no false storage claim.
- Nothing under `apps/mobile` changed; the mobile defect is reported.
- No DDL, no data migration, no server-action behaviour change.
</success_criteria>

<output>
After completion, create
`.planning/quick/550-the-typed-name-signature-path-submits-th/550-SUMMARY.md`
</output>
