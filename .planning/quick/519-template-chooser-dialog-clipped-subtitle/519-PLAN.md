---
phase: quick-519
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/imports/TemplateDecision.tsx
  - apps/mobile/components/imports/ImportTemplate.tsx
autonomous: true

must_haves:
  truths:
    - "The chooser dialog subtitle wraps fully inside the dialog — no word is cut at the right edge."
    - "No horizontal scrollbar renders on the chooser dialog at any viewport down to 360px."
    - "A single over-long facility chip ellipsises inside the card and reveals its full value on hover (web) / is truncated to one line (mobile) rather than widening the dialog."
    - "Diff chips wrap to multiple lines before any one of them truncates."
    - "Candidate cards read as separate objects with breathing room on the 8/12/16/20/24 scale; the No template option stays visually distinct and is separated by a hairline divider."
    - "No copy string, handler, fetch, prop shape or scoring behaviour changed."
  artifacts:
    - path: "apps/web/src/components/carrier/imports/TemplateDecision.tsx"
      provides: "Chooser DialogContent with a zero-min grid track, truncating+titled diff chips, on-scale card density"
      contains: "grid-cols-[minmax(0,1fr)]"
    - path: "apps/mobile/components/imports/ImportTemplate.tsx"
      provides: "Shrinkable single-line Chip, on-scale card density, hairline divider above No template"
      contains: "numberOfLines={1}"
  key_links:
    - from: "TemplateChooser DialogContent className"
      to: "the grid track that DialogHeader and the candidate <ul> both stretch to"
      via: "explicit grid-cols-[minmax(0,1fr)] replacing the implicit auto track"
      pattern: "grid-cols-\\[minmax\\(0,1fr\\)\\]"
    - from: "StopDiff Badge"
      to: "its own text"
      via: "min-w-0 + max-w-full + inner truncate + title attribute"
      pattern: "title=\\{row\\.name"
---

<objective>
Fix three screenshot-verified layout defects in the template chooser dialog that quick-516 added ("Which saved route is this?"): a subtitle that clips mid-word, a horizontal scrollbar across the dialog bottom, and crowded candidate cards. Web dialog plus its mobile bottom-sheet twin.

Purpose: Section 15 of `docs/specs/DocumentImport_TechnicalSpec_v1.md` (line 864) states "text never clips" and "spacing on 8/12/16/20/24" as standing constraints. The chooser breaks both.

Output: two modified components. Visual only — no logic, no scorer, no handlers, no copy.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/components/carrier/imports/TemplateDecision.tsx
@apps/mobile/components/imports/ImportTemplate.tsx
@apps/mobile/constants/tokens.ts
</context>

<diagnosis>
**Carried forward, already verified against the files. Do not re-derive this — it is subtle and easy to get wrong. Verify if you like; do not weaken or contradict it without evidence.**

**Defects 1 and 2 are ONE bug on web.**

`DialogContent` (`apps/web/src/components/ui/dialog.tsx:41`) is `fixed ... grid w-full max-w-lg ... gap-4 border ... p-6`. Confirmed by reading. It is a **grid container with an implicit `auto` column**.

An `auto` grid track's base size is the MAX of its items' min-content contributions, and is never reduced below that. So any grid item with a large min-content width blows the track wider than the dialog's own `max-w-lg` box.

The item with the large min-content is the candidate list. Inside `StopDiff`, each `<Badge variant="outline" className="max-w-full">` wraps `<span className="truncate">`. `truncate` sets `white-space: nowrap`, and **for nowrap text min-content equals max-content — the whole string**. `max-w-full` does NOT save it: **percentage max-widths are ignored during intrinsic (min/max-content) sizing**. So a 54-character facility name contributes its full rendered width to the grid track's minimum.

Both observed consequences follow:
- The track exceeds the dialog's padding box, and the chooser's `DialogContent` carries `overflow-y-auto`. `overflow-y: auto` with `overflow-x: visible` **computes overflow-x to `auto`**, so a horizontal scrollbar renders. **That is defect 2.**
- `DialogHeader` is a sibling grid item, stretched to that same over-wide track. `DialogDescription` therefore wraps at the over-wide width and the tail of the sentence sits beyond the dialog's visible right edge — reading exactly as "clipped mid-word". **That is defect 1. The subtitle is NOT independently broken; fix the track and it reflows.**

**The lever:** give the grid an **explicit** column whose minimum is zero. `grid-cols-[minmax(0,1fr)]` on the chooser's `DialogContent` className replaces the `auto` track (min = max of item min-contents) with a `minmax(0, 1fr)` track (min = 0), so no descendant's min-content can force the dialog wider. Once the track is capped, layout-time sizing takes over and `max-w-full` + `truncate` on the badge DO work (percentages resolve normally during layout), so a single over-long chip ellipsises instead of overflowing.

This is a one-class, **local** change to the chooser. It does **not** touch the shared `ui/dialog.tsx` primitive, which is used app-wide.

Verified supporting facts:
- `Badge` (`apps/web/src/components/ui/badge.tsx:35-39`) renders a plain `<div>` and spreads `...props`, so a `title` attribute passes straight through to the DOM. Confirmed.
- Mobile `spacing = { xs:4, sm:8, md:12, lg:16, xl:20, xxl:24 }` and `useThemeColors()` returns a palette with a `border` key (`#2d3d53` dark / `#cbd5e1` light). Both confirmed in `apps/mobile/constants/tokens.ts`.
- `apps/web/src/components/carrier/imports/__tests__/TemplateDecision.test.tsx` exists and makes **no className/snapshot assertions** (grep for `className|space-y|gap-|toMatchSnapshot|querySelector` returns nothing across its 118 lines), so the density changes cannot break it. It lives **outside** `src/lib/document-import`, so it needs its own vitest invocation.
</diagnosis>

<tasks>

<task type="auto">
  <name>Task 1: Cap the web dialog's grid track, make the diff chip shrinkable, and put the cards on the Section 15 scale</name>
  <files>apps/web/src/components/carrier/imports/TemplateDecision.tsx</files>
  <action>
Edit ONLY this file. Do NOT edit `apps/web/src/components/ui/dialog.tsx` or `badge.tsx` — shared primitives, app-wide blast radius.

**A. The overflow fix (closes defects 1 AND 2).** In `TemplateChooser`, the `DialogContent` className is currently `"max-h-[85vh] overflow-y-auto sm:max-w-lg"`. Add `grid-cols-[minmax(0,1fr)]` and `overflow-x-hidden`:

    className="grid-cols-[minmax(0,1fr)] max-h-[85vh] overflow-y-auto overflow-x-hidden sm:max-w-lg"

`grid-cols-[minmax(0,1fr)]` is the actual fix — see the diagnosis block above for why the implicit `auto` track is what widens the dialog. `overflow-x-hidden` is belt-and-braces so no horizontal scrollbar can ever render; it is applied only AFTER the layout fix, so it is never hiding real content.

Add a short comment above `DialogContent` recording WHY the grid-cols class is there, in the style of this file's existing comments — something a future reader cannot delete as noise. State: the implicit `auto` track sizes to the max of its items' min-content, `truncate` makes a chip's min-content its full string, `max-w-full` is ignored during intrinsic sizing, so an explicit zero-minimum track is what lets the dialog keep its own width.

**B. The diff chip.** In `StopDiff`, the mapped `<Badge>`:
  - add `title={row.name || 'Unnamed stop'}` (full value on hover — Badge spreads props onto a `div`, verified)
  - add `min-w-0` to the className alongside the existing `max-w-full` so it can shrink as a flex item during layout
  - keep the inner `<span className="truncate">` exactly as is
  - keep the row's `flex-wrap` so chips wrap to multiple lines FIRST and only truncate when a single chip alone exceeds the row

**C. Density on `CandidateRow` (Section 15 admits 8/12/16/20/24 only — `space-y-1` is 4px and `gap-1.5` is 6px, both off-scale):**
  - the inner content span: `className="min-w-0 flex-1 space-y-1"` -> `className="flex min-w-0 flex-1 flex-col gap-2"`
  - the title/badge wrap row: keep `flex flex-wrap items-center gap-2` (8px, on scale) — unchanged
  - `StopDiff`'s chip row: `gap-1.5` -> `gap-2`, and DROP its `mt-1` (the parent's `gap-2` now supplies that space)
  - card padding stays `p-4` (16px). Verify the "No template" button in `TemplateChooser` is also `p-4` — it is; do not drift it.

**D. Spacing between cards.** `space-y-2` (8px) -> `space-y-3` (12px) on BOTH `<ul>`s that hold `CandidateRow`: the one in `TemplateChooser` and the one in the `CANDIDATES` branch. Same component, same list, same spacing. Change nothing else in the CANDIDATES branch.

**E. Separate "No template" from the candidates.** It already reads as distinct (Ban icon, no arrow, no score badge) — keep that. Add a hairline divider on the wrapper `div` that holds the No-template button and Cancel: `className="space-y-3 border-t border-border pt-4"` (was `space-y-2`). Section 15 forbids borders ON cards, but this file's own header comment says rows separate by a hairline divider and `TemplateWhy` already uses `border-t border-border pt-2`, so this is the established pattern here.

**HARD CONSTRAINTS — visual only.** No handler, no fetch, no state, no prop shape, no scorer change. **Every user-facing string stays byte-identical.** If a change would require touching `template-copy.ts`, `template-matching.ts`, `template-lookup.ts`, or any route/service, it is out of scope — stop and report instead.
  </action>
  <verify>
Read the diff back. Confirm: `grid-cols-[minmax(0,1fr)]` appears exactly once (on the chooser's DialogContent); `ui/dialog.tsx` and `ui/badge.tsx` are untouched (`git status`); no string literal inside JSX text changed (`git diff` shows no altered quoted copy); every added spacing value is one of 8/12/16/20/24 (`gap-2`, `space-y-3`, `pt-4`, `p-4`).
  </verify>
  <done>
`TemplateDecision.tsx` is the only web file changed. The chooser's DialogContent has an explicit zero-minimum grid track plus overflow-x-hidden; the diff Badge carries `title` + `min-w-0` + `max-w-full` + inner `truncate`; all card spacing is on the 8/12/16/20/24 scale; both candidate lists are `space-y-3`; the No-template block sits under a `border-t border-border pt-4` divider.
  </done>
</task>

<task type="auto">
  <name>Task 2: Mirror the fix on the mobile bottom sheet at 360pt</name>
  <files>apps/mobile/components/imports/ImportTemplate.tsx</files>
  <action>
Edit ONLY this file. The two surfaces are twins by design (quick-516/517) — keep them in step conceptually.

Tokens (verified): `spacing = { xs:4, sm:8, md:12, lg:16, xl:20, xxl:24 }`; `useThemeColors()` exposes `border`.

**F. `Chip` must not force its row wider than 360pt.** On the Chip's `View` style add `maxWidth: '100%'` and `flexShrink: 1`. On its `Text` add `numberOfLines={1}` and `flexShrink: 1` to the style. RN truncates a `numberOfLines={1}` Text with an ellipsis natively — that is the mobile equivalent of web's `truncate` + hover `title`. **Keep the existing `flexWrap: 'wrap'` on every chip row** so chips wrap to multiple lines first and only truncate when a single chip alone exceeds the row.

**G. `CandidateRow` density (Section 15 scale — `spacing.xs` is 4 and is off it):**
  - inner `<View style={{ flex: 1, gap: spacing.xs }}>` -> `gap: spacing.sm` (8)
  - the chip wrap row inside it: `gap: spacing.xs` -> `gap: spacing.sm`
  - `StopDiff`'s wrap `View`: `gap: spacing.xs, marginTop: 2` -> `gap: spacing.sm`, and DROP `marginTop: 2` (the parent gap supplies it)
  - card `padding: spacing.md` (12) is on-scale — keep it, and verify the "No template" `Pressable` uses the same `padding: spacing.md` (it does — do not drift it)

**H. Chooser list spacing and divider.**
  - the `ScrollView`'s `contentContainerStyle={{ gap: spacing.sm }}` -> `gap: spacing.md` (12), matching web's `space-y-3`
  - the "No template" inner `<View style={{ flex: 1, gap: 2 }}>`: **decision made — use `gap: spacing.xs` (4)**, and write a one-line comment saying why: these two lines are a title and its own caption inside ONE card, so this is intra-label leading, not inter-element spacing, and 4 is deliberate rather than a scale violation. (Web stacks the same two lines as plain `block` spans with no gap at all.) Do not silently change it without the comment.
  - add a hairline divider directly ABOVE the "No template" `Pressable`, mirroring web's `border-t`: `<View style={{ height: 1, backgroundColor: c.border }} />`. `border` is confirmed present on `useThemeColors()` — if that ever fails to typecheck, fall back to `c.divider`, do not invent a token.

**I. Mobile subtitle.** The `<Text>` under the BottomSheet title already wraps and carries no `numberOfLines`. Confirm that and LEAVE IT.

**HARD CONSTRAINTS — visual only.** No handler, no api-client call, no state, no prop shape change. Every string byte-identical.
  </action>
  <verify>
Read the diff back. Confirm: no `spacing.xs` remains on an inter-element gap in `CandidateRow` / `StopDiff` / the chooser list; the one surviving `spacing.xs` (No-template label block) carries its explanatory comment; `numberOfLines={1}` is on the Chip's Text; `marginTop: 2` is gone from `StopDiff`; no string literal changed.
  </verify>
  <done>
`ImportTemplate.tsx` is the only mobile file changed. Chips shrink and truncate rather than widening the sheet; card internals are on the 8/12/16/20/24 scale; the chooser list gaps at 12; a hairline `c.border` divider sits above the No-template option.
  </done>
</task>

<task type="auto">
  <name>Task 3: Probe the tsc gate, run both typechecks and both test paths, self-audit, commit</name>
  <files>(no source edits — verification and commit only)</files>
  <action>
Paste REAL terminal output for every step. Do not report success on a gate you did not actually see pass.

**1. PROBE THE TSC GATE FIRST.** CLAUDE.md documents that a corrupt file under `apps/web/.next/dev/types/` makes tsc report only that file and **silently skip semantic checking of all source** — a green run is then blind, not clean.
  - delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` if present
  - run `npx tsc --noEmit` in `apps/web`
  - if the result is suspiciously clean, PROVE the gate is live: temporarily inject `const __probe: number = 'y'` into `TemplateDecision.tsx`, re-run tsc, confirm it reports THAT error, then remove it and re-run. **Paste the probe output.**
  - if the only errors are inside `.next/`, the gate is blind — clean and re-run, do not proceed on it

**2.** `npx tsc --noEmit` in `apps/web` AND in `apps/mobile`. Real output, both.

**3.** `npx vitest run src/lib/document-import` in `apps/web`. Real output.
  Then, because `TemplateDecision.test.tsx` lives at `apps/web/src/components/carrier/imports/__tests__/TemplateDecision.test.tsx` — **outside** that path — also run `npx vitest run src/components/carrier/imports` and say explicitly that you ran it separately and why.

**4. SELF-AUDIT.** Re-read both diffs and state, for each of the three defects, the SPECIFIC line that fixes it:
  - defect 1 (clipped subtitle) — name the line, and state that the subtitle itself was not edited because it was never independently broken
  - defect 2 (horizontal scrollbar) — name the line, and distinguish the layout fix from the belt-and-braces `overflow-x-hidden`
  - defect 3 (crowded cards) — list every spacing value changed, web and mobile, and confirm each landed on 8/12/16/20/24 (naming the one deliberate 4px exception and its justification)
  Also confirm: no shared primitive edited, no dependency added, no string changed, no logic touched.

**5. COMMIT** (do NOT push — the orchestrator pushes once at the end):

    git add apps/web/src/components/carrier/imports/TemplateDecision.tsx apps/mobile/components/imports/ImportTemplate.tsx
    git commit -m "fix: template chooser layout and overflow (quick-519)"
  </action>
  <verify>Real pasted output for: the tsc probe, both `tsc --noEmit` runs, both vitest runs, and `git show --stat HEAD` showing exactly two changed files.</verify>
  <done>The tsc gate is demonstrably live and green in both apps; both vitest paths pass; the self-audit maps each of the three defects to a specific line; one commit exists touching exactly the two component files.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean in `apps/web` and `apps/mobile`, with the web gate PROVEN live by an injected-error probe.
- `npx vitest run src/lib/document-import` passes in `apps/web`.
- `npx vitest run src/components/carrier/imports` passes (TemplateDecision.test.tsx lives there, not under lib).
- `git show --stat HEAD` lists exactly two files.
- `git diff HEAD~1` contains no changed user-facing string, no handler, no `ui/dialog.tsx`, no `ui/badge.tsx`, no `package.json`.
</verification>

<success_criteria>
- Chooser subtitle wraps fully inside the dialog; no word cut at the right edge.
- No horizontal scrollbar on the chooser at any viewport down to 360px.
- A 54-char facility chip ellipsises inside the card, full value on hover (web) / one-line truncation (mobile); chips wrap to multiple lines before any one truncates.
- Candidate cards have consistent `p-4`/`spacing.md` padding with 8px internal gaps and 12px between cards; "No template" stays distinct and is separated by a hairline divider on both surfaces.
- Every spacing value touched is on 8/12/16/20/24, except one documented 4px intra-label leading on mobile.
- Zero logic, copy, dependency or shared-primitive change.
</success_criteria>

<output>
After completion, create `.planning/quick/519-template-chooser-dialog-clipped-subtitle/519-SUMMARY.md`
</output>
</content>
</invoke>
