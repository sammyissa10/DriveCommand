# Quick-516 — Template chooser on Change, wire Look again

**Status:** complete
**Date:** 2026-08-08
**Commit:** `bb978188`
**Branch:** `feature/document-import`

---

## Which was it? — "Look again" was WIRED, and neither swallowing nor failing

The brief offered two possibilities (unwired, or a mutation failing silently).
It was a third, and it is the more interesting one:

**The handler was wired all along — to a read.**

```tsx
// web,  TemplateDecision.tsx:229 (before)
onClick={() => void refreshResolution()}
// mobile, ImportTemplate.tsx:226 (before)
onPress={onChanged}
```

Both fire. Both succeed. Neither could ever change the answer, because
`buildTemplateSlot` opens with:

```ts
if (stored?.via === 'NONE') {
  return { ...empty('DECLINED'), why: …, persisted: true };   // template-lookup.ts:394
}
```

— it returns **before a single template is scored**. So "Look again" re-fetched the
exact state it was trying to leave, forever, while behaving precisely as written.
No error was thrown, nothing was logged, and no mutation was attempted, which is
why nothing looked wrong anywhere except on screen.

That branch is right and stays. A stored decision must outrank anything computed,
or a stop-review edit would quietly overrule a person (the same rule
`buildClientSlot` follows). What was missing was the only thing entitled to clear
it: **a person asking**. That is a write, so it is now a POST.

---

## What changed

### `Change` opens a chooser (nothing is written by opening it)

`Change` called `declineTemplate`. One tap, `via: 'NONE'` on the row, and the only
reachable answer was "no template at all" — a 0.50 template was unreachable
whenever a 0.80 one existed, because the ranked list was not on the payload
outside the middle band.

- **`TemplateSlotView.alternatives`** (`template-lookup.ts`) — every candidate the
  ranker put above the candidate band, ranked, **uncapped**. Attached to `RESOLVED`,
  `CANDIDATES` and `NONE`; empty on `DECLINED` by design.
  - Uncapped on purpose: `candidates` is capped at `TEMPLATE_MAX_CANDIDATES` for the
    middle band, and a chooser that inherited the cap would hide the row this
    ticket is about behind the three the system already preferred.
  - Filtered on `band !== 'NONE'`, never on a number, so `0.45` and `0.75` still
    appear in `template-constants.ts` and nowhere else (grep-verified: every other
    occurrence in the module is prose).
- **`CandidateRow`** — the middle band's row, lifted out and used by both the band
  and the chooser, so a dispatcher sees one picture of the comparison: name, score,
  stop count, diff note, count-mismatch caveat, per-stop diff.
- **The chooser** — `Dialog` on web, `BottomSheet` + `ScrollView` on mobile. Lists
  `slot.alternatives` with the selected one chipped `Current` and not pickable,
  plus **`No template`** as an explicit option, plus Cancel. When there is nothing
  else it says so, and `No template` is still offered — a dialog that could only be
  cancelled would be a dead end dressed as a choice.
- **Picking** → `select` (the existing mutation) → the existing `ApplyConfirm`.
  Cancelling the confirm leaves the selection written and unapplied with
  "Use this template" on the row, so no merge happens without a tap.
  Picking `No template` → `decline`, writing the NONE provenance exactly as today.

### `Look again` became the mutation it was pretending to be

- **`clearTemplateDecision`** (`template-service.ts`) — `assertEditable`, then
  **removes** the `template` key and nulls `routeTemplateId`, then returns the
  freshly matched slot.
  - *Removes*, not overwrites: the view short-circuits on the key's **presence**, so
    writing any record — including `via: 'NONE'` again — would leave the row as
    stuck as before. `writeTemplate` now takes `TemplateProvenance | null` and
    deletes on null.
  - The stops are **not** touched. Un-choosing a template is not a claim that a
    merge that already ran was wrong, and reverting twelve stops off a link that
    says "Look again" would be the largest unrequested write in the module.
  - `assertEditable` confines it to `NEEDS_REVIEW`/`READY`, which is also why
    dropping the key cannot lose a post-commit `offer` — an offer is only written
    against a `COMMITTED` row, which cannot reach this function. "Offered once"
    survives.
- **`action: 'reset'`** on the existing template route, both surfaces, one handler.
- **The row now reports what the fresh look found** — the matched template and its
  score, the number of candidates, the blocked reason, or
  *"Looked again — nothing saved matches today's run."* Silence was the second half
  of the bug.

---

## Files

| File | What |
|---|---|
| `apps/web/src/lib/document-import/template-lookup.ts` | `alternatives` on the slot, computed once from the existing ranking |
| `apps/web/src/lib/document-import/template-service.ts` | `clearTemplateDecision`; `writeTemplate` deletes on a null provenance |
| `apps/web/src/lib/document-import/handlers.ts` | `action: 'reset'`, error copy lists four actions |
| `apps/web/src/lib/document-import/resolution.ts` | `blockedTemplateSlot` gains `alternatives: []` |
| `apps/web/src/app/api/v1/…/[id]/template/route.ts` | doc comment (4 actions) |
| `apps/web/src/app/api/mobile/…/[id]/template/route.ts` | doc comment |
| `apps/web/src/components/carrier/imports/TemplateDecision.tsx` | chooser, `CandidateRow`, `NoticeLine`, `lookAgain` |
| `apps/mobile/components/imports/ImportTemplate.tsx` | the same, in a `BottomSheet` |
| `packages/api-client/src/owner-imports.ts` | `alternatives`, `resetTemplate()` — **`dist/` rebuilt** |
| `apps/web/src/lib/document-import/__tests__/template-chooser.test.ts` | new, 9 tests |

---

## Verification — real output

```
$ cd apps/web && npx tsc --noEmit
WEB tsc exit: 0

$ cd apps/mobile && npx tsc --noEmit
MOBILE tsc exit: 0

$ cd apps/web && npx vitest run src/lib/document-import
 Test Files  23 passed (23)
      Tests  406 passed (406)
```

The 9 new tests, and what each pins:

| Test | Pins |
|---|---|
| present on an auto-collapsed row | the chooser has a list where "Change" actually lives; `candidates` still `[]` |
| the SAME presentation as the middle band | score, stop count, `diffNote`, diff rows — a chooser of bare names would make "the 0.50 one" a guess |
| **not capped at three** | 5 candidates ≥ threshold all returned, `> TEMPLATE_MAX_CANDIDATES`, ranked best-first |
| leaves out anything under the threshold | asserted against `TEMPLATE_CANDIDATE_THRESHOLD`, imported |
| empty on `DECLINED` | the early return is deliberate, not an oversight |
| **REMOVES the template key** | `'template' in written === false` — the distinction the fix rests on |
| leaves the other slots alone | `client` provenance carried across (quick-509 merge pattern) |
| returns a row that is no longer `DECLINED` | matching really ran; the fresh look is visible |
| refuses on a `COMMITTED` import | `assertEditable`, and no write attempted |

Real Prisma is faked at the tenant-client boundary (the `facility-commit.test.ts`
pattern), so the functions under test are the real ones and the assertions are
about the arguments the module would have sent.

---

## Self-audit

**Held to.** Section 15 — no borders (`bg-muted/40` / `surfaceElevated`), 8/12/16/20/24
spacing, one accent on the one primary action, words never colour alone (`Current`,
`Suggested`, `Other contract` are chips with text), 44px targets throughout.
quick-513 — every actionable thing is a real `<button>` / `Pressable`; the chooser's
rows and its `No template` option are childless buttons with inert badges, no
interactive descendants. No DDL, nothing installed, nothing written on a GET
(opening the chooser is component state; `reset` is a POST). The scorer,
`template-constants.ts`, `mergeTemplateStop` and the diff are untouched.

**Not verified.** Nothing was clicked. There is no dev server in this session and
the Dealer Tire manifest repro that Phase 3 left outstanding is still outstanding,
so "the chooser lists the 0.50 template" is derived from the payload and the tests,
not observed in a browser or an emulator. The mobile chooser's `ScrollView` inside
`BottomSheet`'s `KeyboardAvoidingView` is capped at 380pt and is the one thing most
worth looking at on a real 360pt screen.

**Deliberate asymmetry, stated.** Picking from the chooser continues to the apply
confirmation; picking from the middle band still does not. In the middle band the
person is answering "which of these?" and the row is the answer. In the chooser
they were looking at a template the system chose and said "not that one", and the
next thing they want is the new one in place. Cancelling the confirm is safe in both
cases — the selection is written, nothing is merged.

**Pre-existing, found, not fixed.** `TemplateDecision.tsx` renders `dl > div > div >
dt` in the `RESOLVED` and `CANDIDATES` branches: an `<dl>`'s `<div>` child must
itself hold the `dt`/`dd` group. The new `DECLINED` branch matches its neighbours
rather than diverging. It is the same class as the `ul > div > li` quick-513 fixed,
but unlike nested buttons the parser relocates nothing, so it is a validator finding
with no behavioural effect. Fixing it means restructuring three verified branches
and belongs in its own task.

**Numbering.** `gsd-tools init` returned `next_num: 514`; 513 exists on disk and 515
shipped as a commit without a directory, so the counter is stale. Used 516 as
specified.

Not deployed. Not pushed.
