# quick-542 — The inspection gate cannot see UI-created inspection playbooks

**Read-only diagnostic.** No code changed, no DDL, no Supabase writes. `lib/carrier/inspection-*` untouched.
Date: 2026-08-25. Tenant under examination: `7e9eca25-1f97-46ed-9365-e67be49436d5` ("DriveCommand Demo").

---

## Headline

**The hypothesis is confirmed as to mechanism and refuted as to attribution.**

The gate requires `Playbook.category = 'VEHICLE_INSPECTION'`. It is the sole discriminator in all three lookups. This tenant's two inspection playbooks are `SAFETY`, so the gate finds nothing and returns `NO_INSPECTION_CHECKLIST`. That much is exactly as described.

But **the UI playbook builder did not create them.** The builder writes `createdById`, and all eight `SAFETY`/`VEHICLE` playbooks in the database have `createdById = NULL`. Seven of them were inserted within **sixteen seconds of each other** on 2026-04-24. That is a script, not seven owners independently typing the same name. The builder's inability to select `VEHICLE_INSPECTION` is real and is the reason a user *cannot* fix this themselves — but it is not how these rows got here.

**And there is a bigger finding than the one reported.** Fixing the category alone moves the driver from *"no checklist exists"* to *"a checklist they cannot finish"*. Three independent defects sit behind the category mismatch, one of which is a hard dead end. Section 6 covers them; they change the recommendation.

---

## Q1 — Where the category is set

### seedStarterPlaybooks — `VEHICLE_INSPECTION`

`src/server/services/workflows/seedStarterPlaybooks.ts:283-291`:

```ts
  const playbook = await tx.playbook.create({
    data: {
      tenantId,
      name: 'Pre-Trip Inspection (DVIR)',
      description: 'Required vehicle inspection checklist before every dispatch.',
      entityType: 'DISPATCH',
      category: 'VEHICLE_INSPECTION',
    },
  });
```

This is the only place in the repository that writes `category: 'VEHICLE_INSPECTION'`, and it matches the database exactly: 16 tenants, 16 playbooks, all `entityType = DISPATCH`, all named "Pre-Trip Inspection (DVIR)".

### The UI builder — cannot choose it

`src/app/(owner)/checklists/_components/CreatePlaybookDialog.tsx:40-47`, quoted in full:

```ts
const CATEGORY_OPTIONS: Array<{ value: PlaybookCategory; label: string }> = [
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'CUSTOM', label: 'Custom' },
];
```

**Six of the enum's seven values. `VEHICLE_INSPECTION` is absent.** The field is required (`:96` — `if (!category) newErrors.category = 'Category is required'`) and rendered as a `<Select>` over that array (`:184`), so there is no free-text escape. `PlaybookCard.tsx:20-53` carries the same six in its icon, colour and label maps, so a `VEHICLE_INSPECTION` playbook renders with fallback styling on the dashboard.

**The API is not restricted the same way.** `packages/validation/src/workflows/enums.ts:37-45` accepts all seven:

```ts
export const playbookCategorySchema = z.enum([
  'ONBOARDING', 'SAFETY', 'OPERATIONS', 'COMPLIANCE',
  'PARTNER', 'CUSTOM', 'VEHICLE_INSPECTION',
]);
```

and `playbook.create` (`src/server/api/routers/workflows/playbook.ts:64-74`) spreads the input straight through. So the value is reachable over tRPC and unreachable in the dropdown. **The gap is presentational only** — which is what makes the fix cheap.

### Attribution — refuted

`getTenantPrisma()` forwards the session user to the audit-columns extension (`src/lib/context/tenant-context.ts:47-59`), which injects `createdById` whenever `userId` is non-null. A builder-created playbook therefore carries it. Live data:

| name | category | entityType | createdAt | createdById |
|---|---|---|---|---|
| Pre-Trip Inspection | SAFETY | VEHICLE | 2026-04-24 02:23:24 | **null** |
| Pre-Trip Inspection | SAFETY | VEHICLE | 2026-04-24 02:23:29 | **null** |
| Pre-Trip Inspection | SAFETY | VEHICLE | 2026-04-24 02:23:32 | **null** |
| Pre-Trip Inspection | SAFETY | VEHICLE | 2026-04-24 02:23:33 | **null** |
| Pre-Trip Inspection | SAFETY | VEHICLE | 2026-04-24 02:23:35 | **null** |
| Pre-Trip Inspection | SAFETY | VEHICLE | 2026-04-24 02:23:37 | **null** |
| Pre-Trip Inspection | SAFETY | VEHICLE | 2026-04-24 02:23:39 | **null** |
| Pre-Trip Inspection v2 | SAFETY | VEHICLE | 2026-04-24 03:56:44 | **null** |
| Vehicle Check | SAFETY | DRIVER | 2026-07-18 00:59:32 | `f3fdec5d…` (OWNER, mmadieh1991@gmail.com) |

One per tenant, 1.7–5 seconds apart, across the seven tenants that existed on 2026-04-24 (DriveCommand Demo, Demo Member, QA Test Org, QA Test Org B, SAMMY ISSA, Nadeem User, Nadeem's Testing). `updatedAt == createdAt` on all eight — never edited since. The only `SAFETY` row with a real author is "Vehicle Check", which came through the builder and has **zero steps**.

**No file in the repository creates a playbook with `category: 'SAFETY'`** — a repo-wide grep for `category: 'SAFETY'` returns nothing (confirmed a second time over all `.ts/.js/.mjs/.sql`, including `prisma/migrations`; the only hits are the enum's own `CREATE TYPE` and an unrelated driver-pay bonus type). So the creating script is not checked in.

### Why `SAFETY`, resolved: the data predates the category

Added 2026-08-25 after checking `_prisma_migrations`. This section originally
implied the script *chose* `SAFETY` where the seed chose `VEHICLE_INSPECTION` —
a divergence. It was not a choice.

| Time (UTC, 2026-04-24) | Event |
|---|---|
| **02:21:59** | `20260423100001_add_workflow_engine_foundation` applied. `CREATE TYPE "PlaybookCategory" AS ENUM ('ONBOARDING','SAFETY','OPERATIONS','COMPLIANCE','PARTNER','CUSTOM')` — **six values, no `VEHICLE_INSPECTION`** |
| **02:23:24 → 02:23:39** | the seven `SAFETY`/`VEHICLE` playbooks created — **85 seconds after that migration finished** |
| 03:56:44 | "Pre-Trip Inspection v2" created |
| **18:06:45** | `20260424100001_workflow_engine_inspection_mode` applied: `ALTER TYPE "PlaybookCategory" ADD VALUE ... 'VEHICLE_INSPECTION'` |

**`VEHICLE_INSPECTION` did not exist in the database until 15.7 hours after those
rows were written.** The script could not have used it — Postgres would have
rejected the insert. `SAFETY` was the only defensible option available, and it
was correct at the time.

So the defect is not that anyone picked the wrong category. It is that
`workflow_engine_inspection_mode` introduced a seventh value and did **two**
things that should have accompanied it and did neither: it did not backfill the
rows created before it, and it did not add the value to the builder's dropdown.
Both omissions surfaced together, sixteen months later, as one driver seeing
"no vehicle inspection checklist exists".

The 85-second gap also narrows the culprit: whatever ran immediately after the
foundation migration, as part of bringing the workflow engine up. **Still not
identified** — it is not in the repository — but it is a setup step of that
deployment rather than something someone typed later.

> **Stated as ambiguity, not resolved:** I cannot identify the script. `createdById = NULL` proves *not the builder while logged in*; it does not name what it was. A seeder run with a null actor and a hand-written SQL insert are indistinguishable from here.

**Why this still matters even though it was a script:** every one of these eight rows is in an internal or test tenant. No paying customer has hit this yet. But the builder gap means the first customer who turns `requirePreTripInspection` on and builds their own checklist **will** hit it, and will have no way out of it from the UI.

---

## Q2 — Every lookup the gate uses

Three, and **`category` is the only discriminator in all three**. `entityType` is used as an *additional narrowing* in two of them, never as an alternative.

### 1. `findTripInspection` — `inspection-lookup.ts:163-179`

```ts
  const instance = await tenantPrisma.playbookInstance.findFirst({
    where: {
      tenantId: orgId,
      entityType: 'DISPATCH',
      entityId: dispatchId,
      playbook: { category: 'VEHICLE_INSPECTION', deletedAt: null },
    },
```

`entityType` here is the **instance's**, not the playbook's, and it is pinned to `DISPATCH`.

### 2. `findValidPriorInspection` — `inspection-lookup.ts:224-238`

```ts
    where: {
      tenantId: orgId,
      playbook: { category: 'VEHICLE_INSPECTION', deletedAt: null },
      OR: [
        ...(tripIds.length > 0
          ? [{ entityType: 'DISPATCH' as const, entityId: { in: tripIds } }]
          : []),
        { entityType: 'VEHICLE' as const, entityId: truckId },
      ],
```

Accepts either instance shape — but still only under a `VEHICLE_INSPECTION` playbook.

### 3. `ensureTripInspection` — `inspection-service.ts:172-181`

The one that produces the driver's error:

```ts
  const playbook = await tenantPrisma.playbook.findFirst({
    where: {
      tenantId: orgId,
      category: 'VEHICLE_INSPECTION',
      isActive: true,
      deletedAt: null,
      entityType: { in: ['DISPATCH', 'VEHICLE'] },
    },
```

This is the only lookup that filters on the **playbook's** `entityType`, and it already accepts both `DISPATCH` and `VEHICLE`. On no match, `inspection-service.ts:188-192`:

```ts
    return {
      code: 'NO_INSPECTION_CHECKLIST',
      error:
        'Pre-trip inspections are required, but no vehicle inspection checklist exists. Create one in Checklists & Workflows.',
    };
```

**That is verbatim the message the driver reported.** Confirmed source.

**So: `entityType = VEHICLE` is already tolerated. Category is the sole thing standing in the way.** Change the category filter and lookup 3 finds "Pre-Trip Inspection" (created first, and `orderBy: { createdAt: 'asc' }` picks it over v2 — see Q6, that matters).

### A fourth place, outside the gate

`RecipeCard.tsx:76-79` filters the automation picker by the recipe's `suggestedCategory`:

```ts
  const filteredPlaybooks = recipe.suggestedCategory
    ? playbooks.filter(
        (p) => !p.category || p.category === recipe.suggestedCategory || p.category === 'CUSTOM'
      )
    : playbooks;
```

`recipes.ts:59-66` sets `suggestedCategory: 'VEHICLE_INSPECTION'` for `pre_trip_inspection`. **A `SAFETY` playbook is filtered out of the picker for the pre-trip-inspection recipe.** The same assumption, in a second place, invisible from the gate. This tenant nonetheless has an active `ON_DISPATCH_CREATE` trigger bound to "Pre-Trip Inspection v2" — so it was bound some other way (custom rule dialog), not through the recipe card.

---

## Q3 — `PlaybookCategory`, live from `pg_enum`

```sql
SELECT e.enumlabel, e.enumsortorder FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'PlaybookCategory' ORDER BY e.enumsortorder;
```

| # | Value | In builder dropdown | Accepted by gate |
|---|---|---|---|
| 1 | `ONBOARDING` | ✅ | ❌ |
| 2 | `SAFETY` | ✅ | ❌ |
| 3 | `OPERATIONS` | ✅ | ❌ |
| 4 | `COMPLIANCE` | ✅ | ❌ |
| 5 | `PARTNER` | ✅ | ❌ |
| 6 | `CUSTOM` | ✅ | ❌ |
| 7 | `VEHICLE_INSPECTION` | ❌ | ✅ (the only one) |

The live enum matches `schema.prisma:1577-1585` and `packages/validation/src/workflows/enums.ts:37-45` exactly — no drift at any of the three layers. **The intersection of "what a user can pick" and "what the gate accepts" is empty.** That is the defect, stated as a set.

`VEHICLE_INSPECTION` sorts last, consistent with having been appended after the original six — which is also consistent with the builder's list simply never being updated when it was added.

---

## Q4 — Is `SAFETY` general-purpose? **Yes. Matching on it alone would over-select.**

Full breakdown of live, non-deleted playbooks:

| category | entityType | playbooks | tenants | active |
|---|---|---|---|---|
| ONBOARDING | DRIVER | 24 | 23 | 24 |
| **SAFETY** | **DRIVER** | **1** | **1** | **1** |
| **SAFETY** | **VEHICLE** | **8** | **7** | **8** |
| OPERATIONS | DRIVER | 1 | 1 | 1 |
| PARTNER | PARTNER | 24 | 23 | 24 |
| VEHICLE_INSPECTION | DISPATCH | 16 | 16 | 16 |

**Today, every `SAFETY` + `VEHICLE` row is a genuine pre-trip inspection** — all eight are named "Pre-Trip Inspection" or "Pre-Trip Inspection v2", all have five steps, all but one step across both are `INSPECTION_ITEM`. So a `SAFETY` + `entityType IN (VEHICLE, DISPATCH)` match would not currently over-select anything.

**But `SAFETY` is unambiguously a general-purpose bucket, not an inspection marker.** The evidence:

- The enum offers it alongside `ONBOARDING`, `OPERATIONS`, `COMPLIANCE`, `PARTNER` and `CUSTOM`. It is the "safety stuff" tab, and `VEHICLE_INSPECTION` exists *separately* precisely because inspection is a narrower thing.
- `PlaybookCard.tsx:32` paints `SAFETY` red and `:23` gives it a shield — it is presented to owners as a broad label.
- The one `SAFETY` row an actual human created through the builder — "Vehicle Check", `entityType = DRIVER`, zero steps — is already not a runnable inspection. If it had been typed as `VEHICLE`, a category-only match would have selected an empty checklist for the gate.

Accident reporting, incident review, winter-driving policy, load-securement training, hours-of-service coaching — all are `SAFETY`, all are plausible next additions, and several would sensibly be scoped to a vehicle. **The over-selection risk is not present today and is close to certain over time**, and the consequence is not cosmetic: it decides whether a truck rolls.

---

## Q5 — The fix

### Option A — widen the gate's lookup

Add `SAFETY` to the category filter, keep/add `entityType IN ('DISPATCH','VEHICLE')`.

**For:** one change, three call sites, fixes every affected tenant at once including the 20 existing instances. No data migration, no user action.

**Against:** permanently couples the safety gate to a label users can pick for anything (Q4). The `entityType` narrowing helps but does not save it — `entityType` is chosen from a dropdown too, and "Vehicle Check" shows an owner will pick `SAFETY` for a vehicle-ish thing that is not an inspection. It also entrenches the ambiguity: after this, *nothing* in the schema distinguishes "the DVIR" from "a safety checklist", and the next feature that needs to find the DVIR has no better field to use. **A widened lookup fails silently and in the dangerous direction** — it selects a wrong checklist rather than reporting none.

### Option B — add `VEHICLE_INSPECTION` to the builder's options

One line in `CATEGORY_OPTIONS`, plus the three `Record` maps in `PlaybookCard.tsx` for icon, colour and label.

**For:** fixes the actual cause. The enum, the zod schema and Postgres all already accept it — this is purely a dropdown that was never updated when the seventh value was added. Keeps `VEHICLE_INSPECTION` meaning exactly one thing. Makes the gate's error message *true and actionable*: "Create one in Checklists & Workflows" currently sends the owner to a screen where the required category cannot be selected.

**Against:** does nothing for the eight existing playbooks or the 20 live instances. On its own the demo tenant stays broken.

### Option C — migrate the existing `SAFETY`/`VEHICLE` rows

`UPDATE "Playbook" SET category='VEHICLE_INSPECTION' WHERE category='SAFETY' AND "entityType"='VEHICLE' AND "deletedAt" IS NULL` — eight rows.

**For:** every affected row is demonstrably a pre-trip inspection by name and step content, and **all seven tenants are internal or test** (Demo, Demo Member, QA Test Org, QA Test Org B, SAMMY ISSA, Nadeem User, Nadeem's Testing). No paying customer is touched. Existing instances keep working because they join through `playbookId`, and `findTripInspection` reads the category off the live playbook, not the snapshot.

**Against:** it is a production write, and a tenant who genuinely meant `SAFETY` would silently lose that label. Reversible in principle (the eight ids are known) but nobody records the before-state unless the migration does.

### Recommendation: **B + C. Not A.**

Do **B** because it is the cause — the intersection of pickable and acceptable categories is empty, and no amount of gate-widening makes that not a bug. Do **C** because it repairs the eight existing rows, is confined to internal tenants, and every row is unambiguously an inspection. Skip **A** because `SAFETY` is a general-purpose label (Q4) and the gate's failure mode under over-selection is *running the wrong checklist before a truck moves*, which is worse than the honest refusal it gives today.

Two conditions on C, both worth stating before anyone runs it:

1. **Scope it to `entityType = 'VEHICLE'`.** `SAFETY`/`DRIVER` ("Vehicle Check", 0 steps) must not be swept in — it would become the gate's chosen playbook in that tenant via `orderBy createdAt asc` and produce an empty walkaround.
2. **Record the eight ids in the migration comment.** A category change is invisible afterwards.

If B+C is judged too slow because a demo is imminent, **C alone unblocks the demo tenant today** and B can follow. A remains the wrong shape at any speed.

---

## Q6 — Three further defects the category fix does NOT resolve

**This is the part that changes the plan.** Reported because a category-only fix would move the driver from a clear error to a stuck screen, which reads as a worse regression.

All three were read off this tenant's actual step rows.

### 6.1 — Nothing is critical. `blockTripStartOnFailedInspection` is inert.

Every step in both playbooks has `isDispatchBlocker = false`. The gate reads criticality from that flag (`inspection-gate.ts` — `isCritical: snap.isDispatchBlocker === true`). This tenant has `blockTripStartOnFailedInspection = true`, and **it would have no effect**: with no critical items, the worst verdict reachable is `PASSED_WITH_DEFECTS`. A failed brake check would log a defect and start the trip.

For contrast, `seedStarterPlaybooks` sets `isDispatchBlocker: true` on every seeded step. The script that made these set it false on all ten.

### 6.2 — A third spelling of the photo key: `require_photo_on_fail`

Both playbooks' step templates carry `defaultConfig: { "require_photo_on_fail": true }` — snake_case. Phase 9-web declared `requiresPhotoOnFail` canonical and made `requiresPhotoOnFail()` read it **plus** the older `requiresPhoto`. It does not read this third form, so the photo requirement is inert on every one of these steps.

Database-wide, across `INSPECTION_ITEM` step templates:

| config key | step templates | tenants |
|---|---|---|
| `requiresPhotoOnFail` | 176 | 16 |
| `require_photo_on_fail` | **35** | **7** |

The 35 are the same seven script-seeded tenants. Same family as DEC-14: a key spelling inferred from convention rather than read off production.

### 6.3 — v2 contains a DISPATCHER-assigned `FORM_FILL`. It renders unanswerable.

> **CORRECTED 2026-08-25 by quick-543.** This section originally claimed the gate
> counts the `FORM_FILL` as unanswered, so `isInspectionComplete` never returns
> true and *"the driver would be permanently unable to start the trip"*. **That
> was wrong.** `buildSnapshot` (`inspection-lookup.ts`) has always filtered its
> outcomes to `stepType === 'INSPECTION_ITEM'`, so the `FORM_FILL` — and the
> ad-hoc MECHANIC `APPROVAL` step `failInspectionItem` creates — never reached
> the gate at all. The walkaround did complete.
>
> The real defect is narrower and is what quick-543 fixed: the step **rendered**
> in the driver's checklist with Pass / Fail / N-A buttons that the server
> refused, and it sat in the screen's own progress denominator so the bar never
> reached full. Severity: a confusing dead control and a stuck progress bar, not
> a blocked trip. The section below is left in place with its original reasoning
> so the correction is legible.

"Pre-Trip Inspection v2" step 2 is **"Contact & Billing Details"**, `stepType = FORM_FILL`, `assigneeRole = DISPATCHER`, four required text fields.

`buildChecklistView` skips only `SIGNATURE` steps, so this renders in the driver's walkaround as an item with Pass / Fail / N-A. All three verbs fail:

- **Pass** → `completeDriverTask` → `completeStep` → `validateStepResult('FORM_FILL', { passOrFail: 'pass' })` → rejects, `INVALID_FORM`.
- **Fail** → `recordDriverInspectionFailure` → `findOwnStep({ expectStepType: 'INSPECTION_ITEM' })` → "That action does not apply to this kind of task".
- **N/A** → same guard, same refusal.

And `findOwnStep`'s ownership arm (`assignedUserId = driver` OR `assigneeRole = 'DRIVER' AND assignedUserId IS NULL`) does not match a `DISPATCHER` step either, so it fails on assignment before it fails on type.

The gate counts the step as unanswered, so `isInspectionComplete` never returns true and the verdict stays `INSPECTION_REQUIRED` forever. **The driver would be permanently unable to start the trip, with no error explaining why.** Strictly worse than today's honest refusal.

> Derived by reading the code against the real step rows, **not executed in a browser.** High confidence, but it is an inference from three files and should be confirmed by walking it once the category is fixed.

### 6.4 — Two cosmetic consequences, noted not argued

- v2's steps carry `playbookPhase` of `PRE_START` / `DAY_1`, so `sectionOf`'s third rung fires and the walkaround renders sections titled **"Pre start"** and **"Day 1"** — meaningless for a DVIR, and exactly the "a boundary that means nothing is read as meaning something" case Phase 9 rejected chunking for.
- Neither playbook has a `SIGNATURE` step, so `signature.required = false`. Phase 9-web's signature screen still gates its submit button on `hasInk`, so the driver must draw a mark that is then **not uploaded and not recorded**. Harmless but dishonest; worth a follow-up.

### What this means for sequencing

A complete fix for *this tenant* is B + C **plus** repairing the two playbooks: set `isDispatchBlocker` on the critical items, normalise the photo key, and move or remove the `FORM_FILL` step. Items 6.1–6.3 are data, not code — except 6.2, which is arguably a third spelling `requiresPhotoOnFail()` should read, and 6.3, which is arguably `buildChecklistView` filtering to answerable step types rather than only skipping `SIGNATURE`. **Both of those are `lib/carrier/inspection-*` changes and are out of scope for this task by instruction.**

---

## Per-item audit

| Q | Question | Status |
|---|---|---|
| 1 | Confirm/refute the hypothesis; quote both category sites; can the builder choose `VEHICLE_INSPECTION`; quote the options | **ANSWERED** — mechanism confirmed, attribution **refuted**: the builder writes `createdById` and all eight rows have it null, seven inserted in 16 seconds. Both sites quoted; the dropdown's six options quoted in full; the zod schema accepts all seven, so the gap is presentational |
| 2 | Quote every gate lookup; is category the only discriminator, or is `entityType = VEHICLE` also considered | **ANSWERED** — three lookups quoted. Category is the sole discriminator in all three; `entityType` narrows in two and `ensureTripInspection` **already accepts `VEHICLE`**. A fourth category assumption found outside the gate, in `RecipeCard.tsx` |
| 3 | Full `PlaybookCategory` enum, live from `pg_enum`; builder-exposed vs gate-accepted | **ANSWERED** — seven values read live, matching Prisma and zod with no drift. Builder exposes 6, gate accepts 1, **intersection empty** |
| 4 | Is `SAFETY` used for anything other than vehicle inspections; would matching on it over-select | **ANSWERED** — full breakdown given. Today all 8 `SAFETY`/`VEHICLE` rows are inspections, so no present over-selection; but `SAFETY` is a general-purpose bucket and a `SAFETY`/`DRIVER` non-inspection already exists. **Yes, it would over-select** |
| 5 | Correct fix and trade-offs across the three options; recommend one | **ANSWERED** — all three assessed; **B + C recommended, A rejected**, with two conditions on C and a fallback if the demo is urgent |
| — | (unprompted) Defects a category fix does not resolve | **REPORTED** — no criticals, a third photo-key spelling, and a `FORM_FILL` that makes the walkaround uncompletable |

## What I did not determine

- **Which script created the eight `SAFETY` playbooks.** `createdById = NULL` rules out the builder-while-logged-in; it does not identify the writer, and nothing in the repository matches. Narrowed but not closed: it ran 85 seconds after the workflow-engine foundation migration, so it is a setup step of that deployment. **Why it used `SAFETY` is now fully answered** — see the timeline above; the alternative did not exist yet.
- **Whether any tenant intends `SAFETY` to mean something other than inspection.** All eight current rows are inspections by name and content; intent is not in the data.
- **Whether 6.3 reproduces in a browser.** Derived from code against real rows, not walked.
- **Whether the demo tenant's playbooks should be repaired or replaced.** Replacing them with the seeded DVIR would lose 20 instances; repairing keeps them. That is a product call.
