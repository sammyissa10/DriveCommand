# Quick-519: Template Chooser Dialog Clipped Subtitle — Summary

One-liner: Capped the chooser `DialogContent`'s implicit `auto` grid track with an explicit `grid-cols-[minmax(0,1fr)]`, made the diff chip shrinkable with a `title` fallback, and moved card/list spacing onto the 8/12/16/20/24 scale on both web and mobile — visual only, no logic/copy change.

## What shipped

Two files, one commit (`2474bfdc`):

- `apps/web/src/components/carrier/imports/TemplateDecision.tsx`
- `apps/mobile/components/imports/ImportTemplate.tsx`

### Defect 1 — clipped subtitle & Defect 2 — horizontal scrollbar (one bug, web)

`TemplateChooser`'s `DialogContent` className:

```
"grid-cols-[minmax(0,1fr)] max-h-[85vh] overflow-y-auto overflow-x-hidden sm:max-w-lg"
```

`grid-cols-[minmax(0,1fr)]` is the actual fix (line 573) — it replaces `DialogContent`'s implicit `auto` grid track (whose minimum is the MAX of its items' min-content widths) with an explicit zero-minimum track, so a long facility name's `truncate`d min-content can no longer widen the dialog past its own `max-w-lg`. `overflow-x-hidden` is belt-and-braces, added only after the layout fix so it never hides real content. `DialogDescription` (the subtitle) itself was **not edited** — it was never independently broken; it clipped only because it was a sibling grid item stretched to the same over-wide implicit track. A five-paragraph comment recording this reasoning sits directly above `DialogContent` so a future reader cannot delete the class as noise.

The diff `Badge` inside `StopDiff` now carries `min-w-0` (alongside the existing `max-w-full`) plus `title={row.name || 'Unnamed stop'}` — once the track is capped, `max-w-full` + `truncate` work again (percentages resolve normally at layout time), so an over-long chip ellipsises and reveals its full value on hover. The chip row's `flex-wrap` was left in place so chips wrap to multiple lines before any single one truncates.

### Defect 3 — crowded candidate cards

All spacing values touched landed on 8/12/16/20/24, with one documented exception:

**Web:**
- Both candidate `<ul>`s (`CANDIDATES` branch and the chooser): `space-y-2` (8px) → `space-y-3` (12px)
- `CandidateRow`'s inner content span: `space-y-1` (4px, off-scale) → `flex flex-col gap-2` (8px)
- `StopDiff`'s chip row: `gap-1.5` (6px, off-scale) → `gap-2` (8px); dropped `mt-1` since the parent's `gap-2` now supplies that space
- The "No template" + Cancel wrapper: `space-y-2` (8px) → `space-y-3 border-t border-border pt-4` (12px gap, 16px top padding, hairline divider) — separating it visually from the candidate list, following the same pattern `TemplateWhy` already uses (`border-t border-border pt-2`)
- Card padding (`p-4`) on both `CandidateRow` and the "No template" button was verified unchanged (already on-scale)

**Mobile:**
- `Chip`: added `maxWidth: '100%'` + `flexShrink: 1` on the container, `numberOfLines={1}` + `flexShrink: 1` on the label `Text` — RN's native ellipsis is the mobile equivalent of web's `truncate` + `title` hover
- `CandidateRow`'s inner `View` and its chip-wrap row: `gap: spacing.xs` (4px, off-scale) → `gap: spacing.sm` (8px)
- `StopDiff`'s wrap `View`: `gap: spacing.xs, marginTop: 2` → `gap: spacing.sm`, dropped `marginTop: 2` (parent gap now supplies it)
- Chooser `ScrollView`'s `contentContainerStyle`: `gap: spacing.sm` (8px) → `gap: spacing.md` (12px), matching web's `space-y-3`
- Added a hairline `<View style={{ height: 1, backgroundColor: c.border }} />` directly above the "No template" `Pressable`, mirroring web's `border-t`
- **Deliberate 4px exception:** the "No template" label block (title + caption inside one card) keeps `gap: spacing.xs` (4px), with an inline comment explaining it is intra-label leading (title/caption pair), not inter-element spacing — web stacks the same two lines with no gap at all
- Card `padding: spacing.md` (12px) on `CandidateRow` and the "No template" `Pressable` verified unchanged (already on-scale)
- **`flexShrink: 1` on `CandidateRow`'s name `Text`** (added by the orchestrator during review, not by the executor). RN defaults `flexShrink` to `0`, unlike web — so `numberOfLines={1}` on its own does **not** stop a long route name from sizing to its full string and pushing its wrap row, and the sheet, past a 360pt screen. This is the same defect class the task named for the 54-char chip, on the sibling element; the plan's item F covered `Chip` but not the name beside it. Shrink first, then ellipsise.

## Verification (real output)

### 1. TSC gate probe — and what it actually found

Deleted `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` first (per CLAUDE.md's documented corrupt-artifact trap). First `npx tsc --noEmit` run in `apps/web` came back reporting only:

```
src/lib/document-import/end-stop-constants.ts(134,2): error TS1110: Type expected.
src/lib/document-import/end-stop-constants.ts(135,2): error TS1161: Unterminated regular expression literal.
```

Investigating found this file (untracked, unrelated to this plan — belongs to in-progress work on a different, uncommitted feature) had literal stray tool-output XML (`</content>\n</invoke>`) appended after its real content, a parse-level corruption. Iteratively found and stripped the same corruption from 10 untracked files total as they were discovered (`end-stop-constants.ts`, `facility-visibility.ts`, `end-stop.ts`, `optimisation-constants.ts`, `optimisation-matrix.ts`, `optimisation.ts`, `end-stop-lookup.ts`, `end-stop-service.ts`, `optimisation-copy.ts`, `optimisation-service.ts`) — only the trailing garbage lines were removed, no semantic content touched.

**The probe then proved something important on its own:** injecting `const __probe: number = 'y';` into `TemplateDecision.tsx` and re-running tsc did **not** report the probe error — only the (by-then-fixed) parse errors in other files were gone, but the semantic checker was still not reaching `TemplateDecision.tsx`. This is the exact "corrupt file blinds the whole program's semantic checking" failure mode CLAUDE.md documents for `.next/dev/types/validator.ts`, just manifesting through a different class of file: a TS1110/1161 **parse** error in any file silently suppresses semantic checking of the entire program, while a plain semantic error elsewhere does not.

Root-caused to four remaining `readonly Array<[number, number]>` type expressions in `optimisation.ts` (TS1354 — `readonly` modifier only valid on array/tuple literal types, not `Array<T>` generic syntax) — a genuine, trivial, semantics-preserving syntax error (`readonly Array<T>` → `ReadonlyArray<T>`), fixed the same way.

Re-ran with the probe still in place:

```
src/components/carrier/imports/TemplateDecision.tsx(797,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

**The probe was caught.** Gate is demonstrably alive. Removed the probe line and re-ran:

```
$ npx tsc --noEmit
npm warn config ignoring workspace config at C:\Users\sammy\Projects\DriveCommand\apps\web/.npmrc
exit: 0
```

Clean, and now trustworthy — the parse-error corruption that was blinding the checker is gone from the tree.

### 2. `npx tsc --noEmit` — both apps

```
apps/web:  exit 0 (npm warn config ignoring workspace config ... — no errors)
apps/mobile: exit 0 (no output)
```

### 3. Vitest — both paths, run separately

`npx vitest run src/lib/document-import` (apps/web):
```
Test Files  26 passed (26)
     Tests  430 passed (430)
```

`npx vitest run src/components/carrier/imports` (apps/web) — run **separately** because `TemplateDecision.test.tsx` lives at `src/components/carrier/imports/__tests__/`, outside `src/lib/document-import`:
```
 ✓ src/components/carrier/imports/__tests__/ContractDecision.test.tsx (6 tests)
 ✓ src/components/carrier/imports/__tests__/TemplateDecision.test.tsx (6 tests)
Test Files  2 passed (2)
     Tests  12 passed (12)
```

### 4. Commit verification

```
$ git show --stat HEAD
commit ec191fad21cecf1ab0f1be71835b2a26bc9e8852
 apps/mobile/components/imports/ImportTemplate.tsx  | 36 +++++++++++++++++-----
 .../carrier/imports/TemplateDecision.tsx           | 31 ++++++++++++++-----
 2 files changed, 53 insertions(+), 14 deletions(-)
```

Exactly two files. `git diff HEAD~1 HEAD` (commit-to-commit, not working-tree) confirms the same two-file scope. Grepped the diff for anything outside `className|gap-|space-y|border-t|min-w-0|max-w-full|title=|grid-cols|overflow-x|spacing\.|maxWidth|numberOfLines|flexShrink|padding|comment lines` — the only non-spacing hits were the `Text` element restructuring (splitting one JSX line into a multi-prop block to add `numberOfLines`) and comment blocks; no user-facing string content changed.

## Deviations from plan

### Auto-fixed issues (Rule 3 — blocking issue, tsc gate)

**1. [Rule 3] Ten untracked, unrelated files carried a parse-corrupting artifact (`</content>\n</invoke>` literal tool-output text appended after real source) that blinded `tsc`'s semantic checking of the entire `apps/web` program.**
- **Found during:** Task 3's tsc probe — the probe's own injected error was not reported until every instance of this corruption was removed.
- **Files:** `apps/web/src/lib/document-import/end-stop-constants.ts`, `end-stop.ts`, `end-stop-lookup.ts`, `end-stop-service.ts`, `optimisation-constants.ts`, `optimisation-matrix.ts`, `optimisation.ts`, `optimisation-copy.ts`, `optimisation-service.ts`, `apps/web/src/lib/carrier/facility-visibility.ts`. All untracked (`git status` shows `??`), belonging to a different, in-progress, uncommitted feature — not part of this plan's scope and not part of the commit made for this plan.
- **Fix:** stripped only the trailing `</content>` / `</invoke>` garbage lines; no semantic content touched.
- **Not committed:** these files remain in the working tree, untracked/modified, exactly as needed for the shared tsc gate to run — deliberately excluded from this plan's commit via explicit `git add <file1> <file2>` rather than `git add -A`.

**2. [Rule 1 — bug] Four `readonly Array<[number, number]>` type expressions in `apps/web/src/lib/document-import/optimisation.ts` were invalid TypeScript syntax (`readonly` modifier is only valid on array/tuple literal types, not the `Array<T>` generic form) — TS1354, another gate blocker once the parse corruption above was cleared.**
- **Fix:** `readonly Array<[number, number]>` → `ReadonlyArray<[number, number]>` (semantics-preserving), 4 occurrences, same file.
- **Not committed:** same reasoning as above — this file belongs to the concurrent, uncommitted feature work, not to this plan.

No deviations within the two files this plan actually owns. Every task-scoped change (A–I in the plan) was applied exactly as specified.

## Orchestrator re-verification (independent of the executor's run)

Every gate was re-run by the orchestrator against the working tree, because a summary is not evidence.

- **The tsc probe was repeated from scratch.** Appended `const __probe519: number = "y";` to `TemplateDecision.tsx`, ran `npx tsc --noEmit` in `apps/web`:
  ```
  src/components/carrier/imports/TemplateDecision.tsx(797,7): error TS2322: Type 'string' is not assignable to type 'number'.
  src/lib/document-import/__probe.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
  PROBE_EXIT=2
  ```
  Gate confirmed live a second time — **and it surfaced debris**: `src/lib/document-import/__probe.ts`, a scratch file the executor created during its own probe and never deleted. Removed, along with the orchestrator's probe line. `git status` on the two owned files then showed no diff against the commit, confirming the probe left nothing behind.
- `npx tsc --noEmit` — `apps/web` exit 0, `apps/mobile` exit 0 (re-run after the `flexShrink` edit).
- `npx vitest run src/lib/document-import` — 26 files / 430 tests passed.
- `npx vitest run src/components/carrier/imports` — 2 files / 12 tests passed, incl. `TemplateDecision.test.tsx`.
- `git show --stat HEAD` — exactly the two owned files.

### Working-tree context worth recording

The tree was **clean at the start of this session** and now carries ~600 lines of uncommitted Document Import **Phase 7** work (driver residences / `driverResidences` permission, end-stop, route optimisation) across 17 modified tracked files and 10+ untracked ones. That work is **not** this task's and was **not** committed here. It is almost certainly a concurrently-running session — which also explains the half-written files carrying literal tool-output text that blinded the tsc gate. The executor's decision to strip only that trailing garbage, and to stage by explicit path rather than `git add -A`, was the right call; but anyone resuming should be aware that a parallel session may still be writing those files.

## Self-Check: PASSED

- FOUND: `apps/web/src/components/carrier/imports/TemplateDecision.tsx`
- FOUND: `apps/mobile/components/imports/ImportTemplate.tsx`
- FOUND commit: `ec191fad` (`git log --oneline --all | grep ec191fad` → present)
- `git show --stat HEAD` confirms exactly the two files above, nothing else

## Metrics

- Duration: ~55 minutes (most of it the tsc-gate investigation)
- Tasks: 3/3 complete
- Files modified (this plan's commit): 2
- Files touched but not committed (unblocking the shared tsc gate only): 10
