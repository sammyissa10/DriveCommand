# quick-548 — `inspection.failed` fires no notification, while the blocked screen tells the driver dispatch was told

**Type:** READ-ONLY diagnostic. No code changed, no DDL, no writes. Every database statement was a `SELECT`.
**Date:** 2026-08-26
**Subject:** tenant `7e9eca25-1f97-46ed-9365-e67be49436d5`, trip `9d247cb3-83fc-4691-b25b-da48ac9fb428`, PlaybookInstance `1fad0b34-7a13-469e-a94d-145332c198b1`

---

## Verdict in one line

**The emit is not swallowed and the notification is not broken. `applyVerdictSideEffects` was never called at all** — the driver was redirected to the blocked screen by `page.tsx` the instant the last item was answered, and therefore never reached the submit that runs every side effect. **quick-547 turned this from a rare path into the default one.**

The blocked screen's claim is a **second, independent defect**: the sentence is an unconditional string literal, and the page cannot know whether a notification was sent even in the intended flow.

---

## Decisive evidence

`recordInspectionDefects` is the **first** statement in `applyVerdictSideEffects`'s `BLOCKED` branch, ahead of both notification paths:

```ts
if (verdict.kind === 'BLOCKED') {
  const { written } = await recordInspectionDefects({ … });   // ← first
  const { notified } = await notifyDispatchOfBlock({ … });     // ← second
  await emitInspectionNotification('inspection.failed', { … }); // ← third
```

```sql
SELECT count(*) FROM carrier_truck_defects;   -- 0  (ALL tenants, not just this one)
```

**Zero defect rows.** If the branch had run and only the notifications had failed, a defect row would exist. It does not. The branch never executed.

Caveat stated rather than glossed: an empty table across all tenants is also consistent with the table having never been exercised since Phase 9 shipped it. That does not weaken the conclusion — it corroborates it, and the per-instance evidence below is independent of it.

### Supporting production reads

| Query | Result |
|---|---|
| `carrier_truck_defects` where org = tenant | **0 rows** |
| `carrier_truck_defects` all tenants | **0 rows** |
| `NotificationSendLog` last 3h, this tenant | **0** |
| `in_app_notifications` last 3h, this tenant | **0** |
| `NotificationSubscription` for `inspection.failed` | **1** — recipients WERE available |
| `dispatches.status` | `planned` |
| `dispatches.dispatcher_id` | **NULL** |

The subscription row matters: this is **not** a "nobody was subscribed" case. Had the catalogue emit run, it had a recipient.

`dispatcher_id` being NULL matters too: `notifyDispatchOfBlock` would have fallen back to **every active owner/manager**, so it had recipients as well.

### The instance, step by step

| Step | Type | Blocker | Status | completedAt |
|---|---|---|---|---|
| Check brakes and brake lights | INSPECTION_ITEM | **true** | **FAILED** | 16:53:17 |
| Check tire pressure and tread | INSPECTION_ITEM | false | COMPLETE | 16:53:31 |
| Check headlights, tail lights, turn signals | INSPECTION_ITEM | false | COMPLETE | 16:53:36 |
| Check fluid levels | INSPECTION_ITEM | false | COMPLETE | 16:53:42 |
| Inspect cargo securement | INSPECTION_ITEM | false | COMPLETE | 16:53:51 |
| Repair sign-off: Check brakes… | APPROVAL | true | NOT_STARTED | — |

Instance created 16:51:57, `status = BLOCKED`, `isDispatchReady = false`.

**Two facts from this table that the analysis turns on:**

1. **There is no SIGNATURE step in this playbook.** It is the 5-step VEHICLE-authored "Pre-Trip Inspection v2" from the 2026-04-24 script. The sixth row is an `APPROVAL` step auto-created by `failInspectionItem`'s mechanic sign-off, not a signature.
2. **All five inspection items were answered by 16:53:51**, which is the moment the gate first becomes computable as `BLOCKED`.

---

## Q1 — Where is `inspection.failed` emitted? Is it reached on the web path? — **ANSWERED**

One emit site, `inspection-service.ts:495`, inside `applyVerdictSideEffects`'s `BLOCKED` branch:

```ts
    await emitInspectionNotification('inspection.failed', {
      orgId,
      trip,
      failures: verdict.criticalFailures,
    });
```

which reaches the catalogue at `inspection-service.ts:608`:

```ts
    if (triggerKey === 'inspection.failed') {
      await emitNotification('inspection.failed', {
        tenantId: orgId,
        relatedEntity,
        payload: { ...base, failedCount: String(failures.length), failedItems: itemNames },
      });
      return;
    }
```

**It is surface-neutral.** `applyVerdictSideEffects` has exactly three call sites, all in `inspection-handlers.ts` — the transport-neutral handler layer that serves *both* the web server actions and `/api/mobile/*`:

- `:479` — `handleSubmitInspection`
- `:532` — `handleStartTrip`, blocked path
- `:546` — `handleStartTrip`, allowed path

So there is no web-versus-mobile asymmetry in the emit itself. **It was not reached here because none of those three handlers ran** — see Q3.

---

## Q2 — Where is `notifyDispatchOfBlock` called? Did it run? — **ANSWERED**

One call site, `inspection-service.ts:473`, in the same `BLOCKED` branch, immediately after the defect write:

```ts
    const { notified } = await notifyDispatchOfBlock({
      orgId,
      dispatchId: trip.dispatchId,
      truckUnitNumber: trip.truckUnitNumber,
      criticalFailures: verdict.criticalFailures,
    });
```

**It did not run.** Not because it failed, and not because it had no recipients — `dispatcher_id` is NULL, so it would have addressed every active owner/manager, and it writes an in-app row per recipient via `createNotification`. `in_app_notifications` has zero rows.

**Why it did not run:** it is unreachable except through `applyVerdictSideEffects`, and that function was never invoked on this walkaround.

This is the path quick-546/Phase 10 deliberately kept as the *guaranteed* dispatcher-of-record channel, precisely so the blocked screen's sentence would be backed by something that does not depend on subscriptions. **That guarantee is only as strong as the call site, and the call site was bypassed.**

---

## Q3 — Does this path invoke `applyVerdictSideEffects`? — **ANSWERED: no**

### The trace, from last answered item to the blocked screen

1. **16:53:51** — driver answers the fifth and final inspection item. The server action writes it and returns `{success: true}`.
2. `InspectionRunner.submitAnswer` calls **`router.refresh()` inside the transition** — added by quick-547 yesterday to fix the frozen-screen defect.
3. The refresh re-renders `/inspection/[dispatchId]/page.tsx`, a `force-dynamic` server component.
4. That page calls **`handleGetGate`**, which calls `evaluateTripGate` → `evaluateTripStartGate`. **`handleGetGate` is a pure read. It never calls `applyVerdictSideEffects`** — by explicit design, documented at the function: *"Deliberately NOT called from `evaluateTripGate` — that is a read, and reads must not write."*
5. The gate now returns `BLOCKED`, because all five items are answered so `isInspectionComplete` is true, there is one `isCritical` failure, and `blockTripStartOnFailedInspection` is on:

```ts
  if (criticalFailures.length > 0 && tenantBlocksOnFailure) {
    return { kind: 'BLOCKED', playbookInstanceId: …, failures, criticalFailures };
  }
```

6. `page.tsx:88-90` then does, on **render**:

```ts
  if (view.outcome === 'BLOCKED') {
    redirect(`/inspection/${dispatchId}/blocked`);
  }
```

7. The driver is navigated to the blocked screen **without ever reaching the review/sign step**, so `submitInspectionChecklist` → `handleSubmitInspection` → `applyVerdictSideEffects` is never called.

**Note the signature is irrelevant here.** `isInspectionComplete` counts only `INSPECTION_ITEM` outcomes — the snapshot builder filters `stepType === INSPECTION_ITEM` — so the gate reaches `BLOCKED` on the last *item*, not on signing. And this playbook has no signature step at all.

### How the instance became `BLOCKED` with no side effects

`PlaybookInstance.status = 'BLOCKED'` is written by **`failInspectionItem.ts:116`** (`data: { status: 'BLOCKED' }`) — the pre-existing workflow-engine function that runs when the driver fails the item, entirely independent of the gate verdict and of `applyVerdictSideEffects`. That is why every symptom of "blocked" is present while none of the consequences are.

### Every side effect that should have fired, and did not

| # | Side effect | Where | Observable that is missing |
|---|---|---|---|
| 1 | `recordInspectionDefects` — one row per failed item | `inspection-service.ts:466` | `carrier_truck_defects`: **0 rows** |
| 2 | `notifyDispatchOfBlock` — in-app to dispatcher, or all owners/managers when NULL | `:473` | `in_app_notifications`: **0 rows** |
| 3 | Push to each of those recipients (deferred via `after()`) | inside `notifyDispatchOfBlock` | no push, no log |
| 4 | `emitNotification('inspection.failed')` — catalogue, subscribers, in-app + email + push | `:495` | `NotificationSendLog`: **0 rows** |

### Regression attribution — stated plainly

**The redirect bypass predates quick-547, but quick-547 made it the normal path.**

Before quick-547 the walkaround never re-rendered mid-checklist — that was the defect quick-547 fixed. The `BLOCKED` redirect on `page.tsx` could therefore only fire if the driver manually reloaded. After quick-547, `router.refresh()` runs after **every successful answer**, so the redirect now fires automatically the moment the last item is answered, on every blocked walkaround.

Timing is consistent with this: quick-547's fix commit `6818b6df` landed **2026-08-26 04:56 UTC**; this instance was created **16:51 UTC**, roughly twelve hours later.

I did not execute the pre-quick-547 build to confirm the counterfactual, so the "before" behaviour is established by reading rather than by observation. The "after" behaviour is established by the code plus the production evidence above.

---

## Q4 — Is the emit swallowed? — **ANSWERED**

**Nothing was swallowed, because nothing ran.** But the full catch inventory on the path matters, because it is what makes the empty log *informative* rather than merely uninformative:

| Location | Shape | Logs? | Would a failure surface? |
|---|---|---|---|
| `emitInspectionNotification` | outer `try/catch` around the whole body | `logger.error(msg, err, ctx)` — **correct arity**, plus `serializeError` | **Yes** |
| `emitNotification` (`emit.ts`) | `try/catch` around `dispatchNotification` | `logger.error(msg, err, ctx)` | **Yes** |
| `notifyDispatchOfBlock` | outer `try/catch`, returns `{ notified: 0 }` | `logger.error` | **Yes** |
| `notifyDispatchOfBlock`, per recipient | inner `try/catch` around `createNotification` | `logger.error` | **Yes** |
| `notifyDispatchOfBlock`, push | **`after()`** with `.catch(err => logger.error(...))` | yes | **Yes**, though after the response |
| `recordInspectionDefects`, per failure | `try/catch` | `logger.error` | **Yes** |

The only `after()` on this path is the push send; the only detached promise is that same `after()` callback's `.catch`. Both log. `emitNotificationAfterResponse` — the `after()`-then-detached fallback wrapper — is **not** used by the inspection path at all; it is used by `document-import` only.

**Conclusion:** every failure mode on this path writes a `logger.error`. An empty dev-server log is therefore *inconsistent* with "invoked and failed" and *consistent* with "never invoked". That is independent corroboration of the zero-defect-rows finding, not a restatement of it.

---

## Q5 — Is this the `getTenantPrisma` out-of-request-scope trap again? — **ANSWERED: no**

The emit site resolves its client explicitly:

```ts
    const tenantPrisma = await getTenantPrismaForOrg(orgId);
```

`getTenantPrismaForOrg(tenantId)` takes the tenant id as an argument and reads no headers. The header-reading `getTenantPrisma()` — the E251 path — does not appear anywhere on this trace. `dispatchNotification` is likewise already header-free by construction (Phase 10 Step 0a), and `emitInspectionNotification`'s own doc comment states the rule and the reason.

So the trap is ruled out **by code shape**. Ambiguity stated explicitly: because the path never executed, there is no runtime evidence either way — no log line, no thrown E251. The ruling-out rests on reading, not on observation. It is also moot: the function containing the emit was never entered.

---

## Q6 — Is the blocked screen's claim conditional? — **ANSWERED: unconditional. Separate defect.**

`blocked/page.tsx:145-147`:

```tsx
        {/* 2 — Dispatch has been told */}
        <p className="rounded-2xl bg-muted/60 p-4 text-sm leading-relaxed text-foreground">
          {inspectionCopy.dispatchNotified}
        </p>
```

and `inspection-handlers.ts:153`:

```ts
  dispatchNotified: 'Your dispatcher has been notified and can clear this.',
```

A bare string constant. **No guard, no prop, no count, no state.** It renders on every visit to the page.

**It is worse than unguarded — as written it *cannot* be guarded.** The page's only data call is `handleGetGate`, a pure read that never runs side effects and returns no notified count. The page has no channel through which the notification's outcome could reach it, even in the intended flow.

Three ways the sentence is false today, only one of which is the bypass:

1. **The bypass** — the page is reached by redirect, so nothing was ever sent. This incident.
2. **`notifyDispatchOfBlock` returns `{ notified: 0 }` from its catch**, and nothing inspects the number. Zero is representable, reachable, and unreported.
3. **The page is reachable by reload, by direct URL, and by its own "re-check" link.** Every such render re-asserts the claim with no reference to whether anything was ever sent — so even fixing the bypass would not make the sentence reliably true.

The file's own header comment states the assumption that has failed:

> *2. THAT DISPATCH HAS BEEN TOLD. `notifyDispatchOfBlock` has already run inside `handleSubmitInspection` by the time this page renders, so this is a statement of fact rather than a promise.*

That is exactly the class of error quick-547 recorded: **a design comment asserting an invariant is not evidence the invariant holds.** Here the invariant is false whenever the page is reached by any route other than a completed submit — which, since quick-547, is the usual route.

---

## Per-item audit

| # | Question | Verdict |
|---|---|---|
| 1 | Where is `inspection.failed` emitted; reached on the web path? | **ANSWERED** — `inspection-service.ts:495`; surface-neutral; not reached |
| 2 | Where is `notifyDispatchOfBlock` called; did it run? | **ANSWERED** — `:473`; did not run; unreachable except via `applyVerdictSideEffects` |
| 3 | Does this path invoke `applyVerdictSideEffects`? | **ANSWERED** — no; full trace and all four missed side effects named |
| 4 | Is the emit swallowed? | **ANSWERED** — no; full catch/`after()` inventory; empty log corroborates "never invoked" |
| 5 | Is this the `getTenantPrisma` scope trap? | **ANSWERED** — no; `getTenantPrismaForOrg(orgId)`; ruled out by code shape, moot in any case |
| 6 | Is the "dispatch notified" claim conditional? | **ANSWERED** — unconditional; separate defect; cannot be guarded as currently structured |

---

## Recommendations — reported, not implemented

Read-only task; nothing below was built.

1. **The bypass is the primary defect.** `page.tsx`'s `redirect` on `BLOCKED` fires on a *read*, and the side effects hang off a *submit* the redirect prevents the driver from reaching. Two shapes are worth weighing, and the choice is a product decision, not an obvious one:
   - Do not redirect mid-checklist — let the driver finish and submit, and keep the redirect only for a page entered already-blocked.
   - Or move the side effects so they cannot be skipped. **They must not move into `evaluateTripGate`** — reads must not write, and that separation is load-bearing elsewhere in this module.
2. **The screen's claim should be conditional on something the page can actually observe**, or should be reworded to a promise it can keep ("dispatch will be told" is not better — it is a different unverifiable claim). The honest options are to have the page read whether a notification exists for this trip, or to state only what is verifiable.
3. **Item 2 is worth fixing even if item 1 is fixed**, because reload and re-check re-assert the claim independently of history.
4. Not investigated, flagged for whoever picks this up: whether `handleStartTrip`'s blocked path (`:532`) would fire the side effects late — the driver on the blocked screen has no "start" affordance, so this may be unreachable for them, but an owner override path might reach it. Stated as unknown rather than guessed.
