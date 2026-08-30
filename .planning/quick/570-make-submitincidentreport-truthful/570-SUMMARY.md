# quick-570 — SUMMARY

**Date:** 2026-08-30 · **Branch:** `master` · **Pre-task HEAD:** `d12b5a5c`
**Commits:** `5f4f94e6` (the fix), `53bde890` (the guard)
**tsc:** 0 in both apps, **probed in both** · **Suite:** 1730 → 1734, 1600 → 1604 passed, **identical 66-test / 18-file failing set** · **No DDL**

---

## Step 1 — The action, quoted, and what it did

All 35 lines of the old [`driver-incidents.ts`](<../../../apps/web/src/app/(driver)/actions/driver-incidents.ts>). The body of `submitIncidentReport` in full:

```ts
await requireRole([UserRole.DRIVER]);

const type = formData.get('type') as string;
const description = formData.get('description') as string;
const location = formData.get('location') as string;

if (!type) return { error: { type: ['Incident type is required'] } };
if (!description || description.trim().length < 10) {
  return { error: { description: ['Please provide at least 10 characters of detail'] } };
}

// In production, this would create a safety event record with optional photo uploads
return { success: true, message: 'Incident report submitted successfully. Dispatch has been notified.' };
```

| | |
|---|---|
| **Validates** | `type` non-empty; `description` ≥ 10 chars after `trim()` |
| **Returns** | a hardcoded success object with that message |
| **Writes** | **nothing.** The file's only imports were `requireRole` and `UserRole` — no prisma, no repository, no tenant context |
| **Notifies** | **nothing.** No `emitNotification`, no `dispatchNotification`, no email, no push |
| **`location`** | read into a variable on line 16 and **never used again** |
| **`getMyIncidentReports`** | returned `[]` under a *"Feature scaffold"* comment |

**Confirmed no write and no notification anywhere on the path** — by import list, not by reading the body alone. Production corroborates: `DriverIncident` held **0 rows**. Reachable from `(driver)/more/page.tsx:33` and from `driver-quick-actions.tsx:55` — a **quick action**.

## Step 2 — Schema verdict: **sufficient, no DDL**, with two mismatches that had to be settled first

Enum values read off **production `pg_enum`**, not inferred from `schema.prisma` (DEC-14):

```
IncidentCategory = ACCIDENT | VIOLATION | MECHANICAL | HAZARD | OTHER
IncidentSeverity = LOW | MEDIUM | HIGH
```

| Form collects | Model holds | Verdict |
|---|---|---|
| `type` — 8 options | `category` — 5 values | **Mismatch.** Only `ACCIDENT`/`OTHER` overlap; the other six are a Postgres **22P02** written raw |
| — | `severity` — **NOT NULL** | **Mismatch.** The form did not collect it |
| `description` | `description String` | fits |
| `location` — free text | *(no column)* | `latitude`/`longitude` are `Decimal?`, not an address. Preserved in `notes` |
| photos | `photoS3Key String?` | column exists; the form still says *"Photo upload coming soon"* and submits nothing. Unchanged |

**Both resolved without DDL:**

**(a) The category map.** `INCIDENT_CATEGORY_MAP` is the whole mapping, in one place. It is **lossy by construction** — `CARGO_DAMAGE`, `THEFT` and `MEDICAL` all collapse to `OTHER` — so the driver's own selection is written verbatim into `notes` rather than discarded, together with the `location` string. An un-mapped future type falls back to `OTHER` rather than reaching Postgres, so it degrades to *recorded, less well categorised* instead of *rejected*. Narrowing the form to the five enum values was the alternative and was rejected: at a roadside a driver is looking for "Vehicle Breakdown", not "MECHANICAL".

**(b) Severity is asked, not invented.** Deriving it from the category, or defaulting to `MEDIUM`, would have the product **state a safety-critical value the driver never gave** — this exact defect, one field to the left. The form now has a required Severity select. Mobile's `SeverityToggle` has always asked, so this **ends a surface disagreement rather than creating one**.

**One thing checked that could have forced DDL and did not:** `DriverIncident` has RLS **enabled and forced, 2 policies, and `app_user` INSERT granted** — the identical posture to `DriverHOSEntry`, which writes through this same `getTenantPrisma()` path today. So this write survives the RLS Phase 2 cutover, unlike `carrier_documents` (DEC-13).

## Step 3 — The trigger already existed: **`driver.incident_reported`**

Declared in [`types.ts:103`](../../../apps/web/src/lib/notifications/types.ts#L103) with payload `{ driverId, driverName, incidentType, severity, reportUrl }`, and fully authored in [`notification-template-data/driver.ts:78`](../../../apps/web/prisma/seeds/notification-template-data/driver.ts#L78). **Nothing emitted it.** Nothing was added.

Verified **live in production**, because Phase 10's rule is that a seeded template is not a deliverable one — `dispatchNotification` short-circuits to a FAILED audit row on a null `defaultHtmlCache`:

| | |
|---|---|
| `isActive` / `inAppEnabled` | true / true |
| `defaultHtmlCache` | **present, 278 chars** |
| `defaultRecipients` | `[{type:'role',role:'OWNER'}, {type:'role',role:'MANAGER'}]` |

Those are **role rules**, and `recipient-resolver.ts:18-21` states what that means: they address *"every matching active user WITHOUT CONSULTING SUBSCRIPTION AT ALL"*, with `UserNotificationPreference` applied afterwards and defaulting to true. So every owner and manager receives an incident report whether or not they ever opened a settings screen. Correct for this trigger, and the same posture as `driver.hos_violation`.

## Step 4 — Decision: **write and notify.** Reported before implementing.

Not "stop claiming it". Everything needed to back the sentence already existed and only the wiring was missing — the model, a complete working precedent (`/api/mobile/driver/incidents` POST), and a live deliverable trigger. Deleting the claim would have left a driver with a form that records nothing, which is the worse of the two truthful states.

No third state: the action either writes and returns success, or returns an error and writes nothing. **A write failure returns an error state, never a success message** — and its wording says so plainly: *"We could not save your report. Nothing has been recorded — please try again, and contact dispatch directly if this is urgent."*

## Step 5 — Ordering, per Section 11

```
row committed  →  payload gathered  →  emitNotificationAfterResponse
```

The `create` returns before anything notification-shaped happens. The payload — including `getCurrentUser()` for `driverName`, which reads headers — is built **before** the deferral, because everything inside that closure runs where there is no header to read. That is Phase 10's rule 1, and `commit-service.ts` shipped a notification that threw on every commit for a whole phase by getting it backwards.

**The emit is wrapped in try/catch even though `emitNotificationAfterResponse` is documented never to throw.** That makes the guarantee **structural** rather than resting on another module's promise — the same reasoning as the T3/T4 verdict union and `useOptimistic` elsewhere in this codebase. If a later edit makes it throwable, a saved report would otherwise be reported to the driver as a failure, which is the precise inversion Section 11 forbids. Case 2 of the guard proves the wrap works.

`serializeError` in all four catches, with `logger.error(msg, err, ctx)` in the real three-argument arity. The sibling HOS action's bare `catch {}` was deliberately not copied.

## Step 6 — The guard, and how it fails

`apps/web/tests/carrier/driver-incident-report-persists.test.ts` — 4 cases, real rows, disposable tenant, following `document-import-commit-rollback.test.ts` (no local database, DEC-3).

**Proven red by reinstating the defect, not by reasoning.** With the pre-fix early return injected above the create:

```
× records a DriverIncident row — success is never reported without one
  AssertionError: submitIncidentReport reported success but wrote no
  DriverIncident row: expected [] to have a length of 1 but got +0
× keeps the incident when the notification fails — Section 11 ordering
× maps a form type the enum cannot hold, and keeps the reported wording
✓ rejects a missing severity without writing anything
```

**3 of 4 red.** The point worth keeping: **under that probe the action still returned `success: true`** — the stub's exact response — so an assertion on the return value would have passed. That is why there is none, and why `result.success` is only checked *after* the row has been found. Row assertions and response assertions catch different classes, and this stub was invisible to the second for as long as it existed.

| Case | Pins |
|---|---|
| 1 | the row exists and carries driver, tenant, category, severity, description, and the location preserved in `notes`; the emit fires once with `relatedEntity` = the new row's id |
| 2 | a **thrown** notification leaves the incident recorded and still returns success — Section 11 |
| 3 | `BREAKDOWN` → `MECHANICAL` with *"Vehicle Breakdown"* kept in `notes`. Without this, a map that silently regressed to `OTHER` for everything would still write a row and still pass case 1 |
| 4 | a missing severity writes nothing and emits nothing |

Cleanup is **verified, not assumed**: children before the tenant, then a re-count that throws on any survivor — the quick-546 shape where every assertion passes and the file fails afterwards on a foreign key.

## Diff summary

```
 apps/web/src/app/(driver)/actions/driver-incidents.ts    | 271 ++++++++-  (35 -> 297 lines)
 apps/web/src/components/driver/incident-report-form.tsx  |  19 ++        (severity select)
 apps/web/tests/carrier/driver-incident-report-persists.test.ts | 367 +   (new)
```

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` (`apps/web`) | **0 errors, PROBED.** `const __probe570: number = 'not a number'` in the edited action → tsc reported **exactly one error, mine**, at `driver-incidents.ts(105,7)`. Probe removed, grep-confirmed 0 occurrences, clean re-run |
| `tsc --noEmit` (`apps/mobile`) | **0 errors, PROBED** in `app/index.tsx` per quick-567/568's precedent, since no mobile file was touched. Reported `app/index.tsx(1,7)`. Probe removed, clean re-run |
| Suite before | 1730 total · 1600 passed · 66 failed · 61 pending (quick-569, same `--reporter=json`) |
| Suite after | **1734 · 1604 · 66 · 61** |
| Delta | **+4 total, +4 passed, 0 failed, 0 pending.** The +4 is exactly this task's guard. **Identical 18-file / 66-test failing set** — zero regressions |
| Baseline method | The published quick-569 figure from the same tree and the same reporter. **No `git worktree`** — quick-567 established it does not carry `.env.local` and the baseline lies |
| DDL | **None.** Both mismatches resolved by mapping and by asking |
| Production after | 0 leftover `ZZ-THROWAWAY-QUICK570%` tenants, 0 tenants created in 2h, 0 leftover users, 0 orphan `in_app_notifications`, `DriverIncident` back to 0 |
| Lint | **Unavailable**, not claimed passing — `apps/web` has no working entry point (quick-569 §5) |

## Per-item audit

| Step | Status | Note |
|---|---|---|
| 1 — quote the action, confirm no write and no notification | **IMPLEMENTED** | Quoted in full; absence established from the import list, not just the body; corroborated by 0 production rows |
| 2 — schema verdict, say so *before* building | **IMPLEMENTED** | Reported before any code was written. Sufficient, no DDL; two mismatches named and both resolved (map + preserve in `notes`; ask for severity) |
| 3 — trigger finding, report before adding | **IMPLEMENTED** | `driver.incident_reported` **exists**, seeded, live, deliverable, role-addressed. Nothing added |
| 4 — make it truthful, report the decision first | **IMPLEMENTED** | Decision reported before implementing: write **and** notify. No half-state — success implies a row, failure returns an error and writes nothing |
| 5 — notify after the transaction; a failing notify must not roll back | **IMPLEMENTED** | Row first, payload gathered before the deferral, `emitNotificationAfterResponse` after the response, and the call wrapped so the guarantee is structural. Proven by guard case 2 |
| 6 — a test that fails on success-without-a-row, asserting the real row | **IMPLEMENTED** | 4 real-row cases; proven red by reinstating the stub — 3 of 4 fail while `success: true` is still returned, which is the whole point |

## Follow-up — reported, not silently fixed

1. **No web page renders a `DriverIncident`.** `/safety` does not, the carrier driver detail does not; only mobile owner driver-detail does. The seeded template's CTA is **"View Incident Report"** → `{{reportUrl}}`, so I pass `/carrier/fleet/drivers` — a page that resolves and identifies the driver rather than a 404 — but **the label overpromises until an owner incident view exists.** Rewriting `defaultBlockJson` / `defaultHtmlCache` would be a production data write on a template a SysAdmin may have edited; out of scope here and worth its own task.
2. **`getMyIncidentReports` now returns real rows and still has no consumer.** It was already unimported; this task made it correct rather than wiring a screen that does not exist.
3. **Photo upload is still a placeholder.** The `photoS3Key` column exists and the form submits nothing. The label says "coming soon", which is honest — unchanged deliberately.
4. **One pre-existing orphan tenant in production**, `ZZ-THROWAWAY-PHASE8-ROLLBACK-1787861997834`, created 2026-08-27 — not from this task (mine are stamped `QUICK570` and today) and left alone. Its `afterAll` verification should have thrown; it is worth finding out why it did not.
