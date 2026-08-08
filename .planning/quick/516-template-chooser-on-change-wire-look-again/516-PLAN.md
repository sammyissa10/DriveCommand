# Quick-516 — Template chooser on Change, wire Look again

**Status:** planned
**Date:** 2026-08-08
**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` §8, §4.1/4.2, §15

---

## What is actually wrong (read off the code, not re-diagnosed)

**1. "Change" is a decline.** `TemplateDecision.tsx:168` — `onClick={() => void decline()}`.
`ImportTemplate.tsx:136` — `onPress={() => void decline()}`. The control labelled *Change*
calls `declineTemplate`, which writes `template = { via: 'NONE', … }` on the spot. A lower
scoring candidate is unreachable because `buildTemplateSlot` returns `candidates: []` in every
state except `CANDIDATES`, so the ranked list the mid band renders does not exist on a resolved
row for a chooser to draw.

**2. "Look again" was WIRED, and wired to a READ.** `TemplateDecision.tsx:229` —
`onClick={() => void refreshResolution()}`; `ImportTemplate.tsx:226` — `onPress={onChanged}`.
Nothing was unwired and nothing was swallowed: the handler fires, the GET succeeds, and it
re-fetches a view whose **first branch** (`template-lookup.ts:394`, `if (stored?.via === 'NONE')`)
returns `DECLINED` before any matching runs. It refetched the state it was trying to leave.
That branch is correct and must stay — it is what stops a changed stop list overruling a person.
The missing piece is a *mutation* that clears the decision, because only a person may unmake it.

---

## Tasks

### Task 1 — server: alternatives on the slot + a clear mutation + the action

- `template-lookup.ts`
  - `TemplateSlotView.alternatives: TemplateCandidateView[]` — every candidate whose
    `band !== 'NONE'`, ranked, **uncapped** (`topCandidates` caps at 3 and stays untouched;
    the chooser must list *every* candidate ≥ 0.45). Filtered on `band`, so no threshold
    literal appears outside `template-constants.ts`.
  - Populated in `RESOLVED` (selected and auto-collapsed), `CANDIDATES` and `NONE`.
    **Not** in `DECLINED` — that branch returns before matching runs, by design.
  - `candidates` keeps its meaning (the mid band's capped list). Not widened.
- `resolution.ts` — `blockedTemplateSlot` gains `alternatives: []`.
- `template-service.ts`
  - `writeTemplate` provenance param becomes `TemplateProvenance | null`; `null` deletes the
    `template` key instead of writing one.
  - `clearTemplateDecision(orgId, userId, importId)` — `assertEditable`, drop the key, null
    `routeTemplateId`, return the fresh slot (so matching re-runs on the way out).
- `handlers.ts` — `handleSetTemplate` accepts `action: 'reset'`; error copy lists four actions.
- No DDL. No new column. No writes on any GET.

### Task 2 — api-client + both surfaces

- `packages/api-client/src/owner-imports.ts` — `alternatives` on the mirrored
  `TemplateSlotView`, `resetTemplate()` posting `{ action: 'reset' }`. **Rebuild `dist/`.**
- `TemplateDecision.tsx`
  - `Change` opens a chooser dialog. **Opening writes nothing.**
  - The chooser reuses the mid band's candidate row (extracted to one `CandidateRow`), lists
    `slot.alternatives` with the current one chipped `Current` and disabled, and offers
    `No template` explicitly. Picking a template → `select` → the existing `ApplyConfirm`.
    Picking `No template` → `decline`, exactly as today.
  - `Look again` → POST `reset` → refresh → a notice saying what the fresh look found,
    including when it found nothing.
- `ImportTemplate.tsx` — the same, in a `BottomSheet`. Arrows/Pressables only; nothing installed.

### Task 3 — tests

`__tests__/template-chooser.test.ts` — `buildTemplateSlot` alternatives (present on a resolved
row, uncapped past 3, excludes < 0.45, absent on `DECLINED`), and the handler's `reset` action.
Thresholds imported from `template-constants.ts`, never restated.

---

## Constraints honoured

- Not touched: the scorer (`template-matching.ts`), the thresholds, `mergeTemplateStop`, the diff.
- §15: no borders, 8/12/16/20/24 spacing, one accent, words never colour alone, 44px targets.
- quick-513: every actionable thing is a real `<button>` / `Pressable`, no nested interactives.
- No install, no DDL, no write on a GET.

## Verification

`npx tsc --noEmit` in `apps/web` and `apps/mobile`; `npx vitest run src/lib/document-import`.
