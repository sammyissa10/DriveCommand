# quick-548 — SUMMARY

**Read-only diagnostic. No code changed, no DDL, no writes.**
Report: `.planning/document-import/diagnostics/inspection-failed-no-notification.md`

## Outcome

All six questions **ANSWERED**.

**The emit is not swallowed and the notification is not broken.
`applyVerdictSideEffects` was never called.** The driver was redirected to the
blocked screen by `page.tsx:88-90` the instant the last inspection item was
answered, and so never reached the submit that runs every side effect.

**Discriminator:** `recordInspectionDefects` runs FIRST in the BLOCKED branch,
ahead of both notification paths. `carrier_truck_defects` holds **zero rows —
across all tenants**. Had the branch run and only the notifications failed, a
defect row would exist.

**quick-547 made this the default path.** The redirect predates it, but before
quick-547 the page never re-rendered mid-checklist, so it could only fire on a
manual reload. quick-547's `router.refresh()` after every answer now triggers it
automatically. Fix commit `6818b6df` landed 04:56 UTC; the instance was created
16:51 UTC.

**Second, independent defect:** the blocked screen's "Your dispatcher has been
notified and can clear this" is a bare string constant with no guard — and as
structured it *cannot* be guarded, because the page's only data call is
`handleGetGate`, a pure read that returns no notified count.

## Evidence (all SELECT)

| Query | Result |
|---|---|
| `carrier_truck_defects`, this tenant | 0 |
| `carrier_truck_defects`, all tenants | 0 |
| `NotificationSendLog` 3h | 0 |
| `in_app_notifications` 3h | 0 |
| `NotificationSubscription` `inspection.failed` | 1 — recipients WERE available |
| `dispatches.dispatcher_id` | NULL — fallback would address all owners/managers |

Instance `1fad0b34`: 5 INSPECTION_ITEMs all answered by 16:53:51, 1 FAILED and
critical; 6th step is an APPROVAL from `failInspectionItem`, **not a signature** —
this playbook has none. `PlaybookInstance.status = BLOCKED` is written by
`failInspectionItem.ts:116`, independent of the gate, which is why every symptom
of "blocked" is present while none of the consequences are.

## Ruled out, with reasons
- **Swallowed emit** — every catch on the path logs via `logger.error(msg, err, ctx)`
  with correct arity. An empty log is inconsistent with "invoked and failed".
- **`getTenantPrisma` scope trap** — the emit site uses `getTenantPrismaForOrg(orgId)`.
  Ruled out by code shape; moot, since the function was never entered.
- **No subscribers** — a subscription row exists.

## Not done
Read-only by constraint. Recommendations are in the report and were not built.
The choice between "do not redirect mid-checklist" and "move the side effects"
is a product decision; side effects must NOT move into `evaluateTripGate`
(reads must not write).
