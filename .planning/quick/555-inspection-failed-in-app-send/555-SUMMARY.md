# quick-555 — inspection.failed IN_APP send logged FAILED

**Commits:** `39ed6a06`, `9f91bffc`, `26de451d` (pre-task HEAD `b0943896`)

---

## 1. Where IN_APP becomes FAILED

Exactly one place: [dispatcher.ts:441-476](../../../apps/web/src/lib/notifications/dispatcher.ts).

```
dispatchNotification()
  └─ per-recipient loop
      └─ Step 6b: if (r.userId !== null && r.inAppEnabled)
          ├─ wasSentWithinWindow(... channel:'IN_APP') → SKIPPED_IDEMPOTENT, continue
          └─ try  { await writeInAppNotification(db, {...}) → audit SENT }
             catch(inAppErr) { audit FAILED, errorMessage = err.message.slice(0,1000) }
```

`writeInAppNotification` was a single `prisma.inAppNotification.create` inside a
`$transaction`. **Every throw reached `FAILED`** with no discrimination. Failure
modes that land there:

1. **P2002 unique violation on `(org_id, entity_id, type)`** — this incident.
2. **Invalid UUID** — *live in production*: two `driver.invited` rows read
   `invalid input syntax for type uuid: "mmadieh1991@gmail.com"`.
3. FK violation on `org_id` → `Tenant` or `user_id` → `User`.
4. Enum coercion failure from `mapTriggerToType`.
5. Not-null / length violations (`title` is capped at 200, `message` is not).
6. Connection or transaction failure.

A fourth `FAILED` path exists outside the channel loop and the source guard found
it: the `!cachedHtml` short-circuit records one audit row against EMAIL and
**returns**, abandoning every channel including in-app.

## 2. Was it logged? No.

**The IN_APP catch had no `logger` call at all.** The reason reached
`NotificationSendLog.errorMessage` and nowhere else — that column is the only
reason the cause was recoverable. No Sentry event, no console line.

Inside one file:

| Channel | `logger.error` | `serializeError` |
|---|---|---|
| PUSH — dispatcher.ts:256 | yes, correct arity | yes |
| EMAIL — dispatcher.ts:368 | **none** | **none** |
| IN_APP — dispatcher.ts:463 | **none** | **none** |
| `!cachedHtml` — dispatcher.ts:155 | **none** | n/a |

The PUSH catch even carries the DEC-11 §3 comment explaining that the error goes
second. It was applied to one channel of three. The legacy `notifyDispatchOfBlock`
([inspection-service.ts:407](../../../apps/web/src/lib/carrier/inspection-service.ts)) does it
correctly — so the catalogue path is the one that opted out.

## 3. The ACTUAL error — reproduced, not guessed

Ran the real `writeInAppNotification` against production with the dispatcher's
exact arguments, IN_APP in isolation (no email, no push):

```
RESULT: THREW
  name    : PrismaClientKnownRequestError
  code    : P2002
  meta    : {"modelName":"InAppNotification","driverAdapterError":{...
             "originalCode":"23505",
             "originalMessage":"duplicate key value violates unique constraint
                                \"in_app_notifications_org_id_entity_id_type_key\"",
             "kind":"UniqueConstraintViolation",
             "constraint":{"fields":["org_id","entity_id","type"]}}}
```

Byte-identical to the `errorMessage` stored on the FAILED row, so the production
failure and the reproduction are the same event.

**The row holding the slot belongs to a different user, from a different trigger:**

| when | user | type | entity | title |
|---|---|---|---|---|
| 02:13:01 | `c0acb951` **(driver)** | `compliance_alert` | trip `45a84a80` | "New trip 45a84a80 — BOUCHER KIA…" ← `trip.assigned` |
| 02:22:58 | `a0a6fe40` (owner) | `dispatch_assigned` | trip `45a84a80` | "Trip blocked — inspection failed" ← `notifyDispatchOfBlock` |
| 02:23:01 | `a0a6fe40` (owner) | `compliance_alert` | trip `45a84a80` | **P2002 — collided with row 1** |

### Root cause — structural, not incidental

- `UNIQUE (org_id, entity_id, type)`, verified via `pg_constraint`, **omits
  `user_id`**. At most one in-app row can exist per (tenant, entity, type)
  **across all users**.
- `mapTriggerToType`'s catch-all swallows **all ten Phase 10 triggers** into
  `compliance_alert` — `trip.assigned/reminder/started/completed`,
  `inspection.passed/passed_with_defects/failed/overridden`,
  `import.needs_review/failed` — and every one is entity-scoped to a trip.

**Per trip, only the first of those ten can ever write an in-app row, and it
claims the slot for the entire tenant.** The earlier trip `9d247cb3` succeeded
only because no `trip.assigned` row preceded it. Any trip created through
Document Import will now hit this.

**Fan-out is broken by the same key:** the dispatcher loops recipients writing
identical `(orgId, entityId, type)`, so only the first recipient of any
multi-recipient in-app notification gets one.

## 4. The fix

**Delivery was not restored, because it cannot be without DDL.** Every free
dimension is closed: `user_id` is absent from the key; `InAppNotificationType`
has nine values and no inspection member; `entity_id` must stay the real trip
UUID because [notification-center.tsx:81](../../../apps/web/src/components/navigation/notification-center.tsx)
deep-links from it; `NotificationSendLog.status` is a Postgres enum so no new
status value. I did not fake delivery.

What changed:

1. **`writeInAppNotification` returns a discriminated result for P2002** with the
   occupant read back, and **throws for everything else**. A P2002 is two facts —
   a benign duplicate, or a notification lost — and collapsing them into a throw
   is what made this invisible.
2. **The dispatcher classifies:** `written` → `SENT`; same user *and* same title
   → `SKIPPED_IDEMPOTENT` with no error log; anything else → `FAILED` with an
   `errorMessage` naming the occupant and stating plainly that nothing was
   delivered, plus a loud log.
3. **Logging on all four silent paths** — IN_APP, EMAIL, and the `!cachedHtml`
   short-circuit — with `logger.error(message, error, context)`, error second.

Title equality is the discriminator because a genuine re-send renders the
identical subject from the identical template while a different trigger does not
— proven by this incident's own rows.

**Verified against production after the fix**, both cases, no rows written:

```
A (different user / different trigger): outcome slot_taken, isSameNotification false
   occupant c0acb951 "New trip 45a84a80 — BOUCHER KIA OF MILWAUKEE…"
B (same user / same title):             outcome slot_taken, isSameNotification true
```

### The migration that would restore delivery — NOT applied

```sql
-- Lets every recipient hold their own row for the same (entity, type).
ALTER TABLE in_app_notifications
  DROP CONSTRAINT in_app_notifications_org_id_entity_id_type_key;
CREATE UNIQUE INDEX in_app_notifications_org_user_entity_type_key
  ON in_app_notifications (org_id, user_id, entity_id, type);
```

**That alone is not sufficient.** It fixes the cross-user case and fan-out, but
the same user still cannot receive both `trip.assigned` and `inspection.failed`
for one trip, because both map to `compliance_alert`. Closing that needs either
new `InAppNotificationType` values per trigger family, or a trigger-discriminating
column in the key. Both are DDL and a product decision about how the notification
centre groups things.

## 5. The two in-app paths

They **do not collide with each other**, by accident of one field:
`notifyDispatchOfBlock` writes `type: 'dispatch_assigned'` / `entityType:
'dispatch'`; the catalogue writes `type: 'compliance_alert'` / `entityType:
'trip'`. Since `type` differs, the unique key differs. Note `entity_type` is **not**
in the key — only `type` saves them.

**So yes: a subscriber who is also the named dispatcher receives two in-app rows
for one blocked inspection** — "Trip blocked — inspection failed" from the legacy
path, and the catalogue's rendered subject from the trigger. Confirmed in the
data: for trip `45a84a80`, `a0a6fe40` holds the `dispatch_assigned` row and would
have held the `compliance_alert` row too but for the collision.

That overlap is the Phase 10 ruling working as intended — different mechanisms
with different guarantees, deliberately not deduplicated against each other,
because `notifyDispatchOfBlock` backs an on-screen promise while the catalogue
trigger is subscribers-only. It had simply never been written down. It is now.

**`notifyDispatchOfBlock` has the same fan-out defect**: its loop writes identical
`(orgId, dispatchId, 'dispatch_assigned')` for every recipient, so only the first
gets a row and the rest hit P2002. It logs correctly, but `notified` under-counts,
and that value is what `effects.dispatchNotified` reports. Reported, not fixed —
the function is out of bounds for this task and the cause is the same schema key.

## 6. The test, and how it fails

`src/lib/notifications/__tests__/in-app-failure-visibility.test.ts` — 6 tests.
The real dispatcher runs against a mock Prisma; only the database and the email
transport are stubbed, so the classification under test is real and the
assertions are on the audit rows it actually wrote.

- **Delete the `logger.error` from the IN_APP catch** → *"a real error is logged,
  not just recorded"* goes red with: *"IN_APP recorded FAILED and logger.error
  was never called. That is the silent failure quick-555 exists to remove."*
  It also asserts the error is the **second** argument — passing it as context
  collapses it to `Error: [object Object]` and is a different way of being silent.
- **Delete it from the slot-taken branch** → *"a dropped notification is loud"*
  goes red the same way.
- **Record FAILED for a genuine duplicate**, or `SKIPPED_IDEMPOTENT` for someone
  else's row → the two classification tests go red. The first would re-bury real
  losses among benign ones; the second would report a lost notification as fine.
- **Add a channel that records FAILED with no log** → the source guard names the
  line. That is the assertion covering code nobody has written yet, and it earned
  its place immediately: **it found the `!cachedHtml` short-circuit on its first
  run**, which the brief did not mention.

**Proven red by a VERIFIED mutation.** The first attempt to delete the IN_APP
`logger.error` silently did not match its regex, the suite stayed green, and that
briefly looked like proof of nothing. The removal now asserts the `logger.error`
count actually dropped before running the tests — a guard "passing" because the
mutation never landed is the same class of false green this whole task is about.

## Gates

- **tsc apps/web: 0 errors — PROBED** (`TS2322` reported in `in-app-writer.ts`,
  the file edited; removed, diffstat checked).
- **tsc apps/mobile: 0 errors — PROBED** (`TS2322` in `lib/api-with-queue.ts`;
  removed, `git status apps/mobile` clean).
- **vitest diffed against `b0943896`:** baseline `18 failed | 121 passed (147
  files)`, `66 failed | 1529 passed (1659)`. Final `18 failed | 124 passed (150)`,
  `66 failed | 1535 passed (1665)`. **+6 tests, all passing; identical 66
  failures. Zero regressions.**

## Files

```
apps/web/src/lib/notifications/in-app-writer.ts                        | 123 ++++++++---
apps/web/src/lib/notifications/dispatcher.ts                           | 101 ++++++++--
apps/web/src/lib/notifications/__tests__/in-app-failure-visibility.test.ts | NEW
```

No DDL. No data changes — both reproduction runs collided and wrote nothing.
Audience resolution, subscriptions, `defaultRecipients` and
`notifyDispatchOfBlock` untouched.

## Found, reported, NOT fixed

1. **The migration above** — the only thing that restores delivery, and it is DDL.
2. **`driver.invited` IN_APP fails with `invalid input syntax for type uuid:
   "<email>"`** — two production rows, 2026-05-26 and 2026-07-18. A *second* live
   defect in the same writer: an email address is reaching `userId`. The
   dispatcher only calls the writer when `r.userId !== null`, so the cause is in
   recipient resolution — which this task may not change.
3. **`notifyDispatchOfBlock`'s fan-out P2002 and the resulting under-count** of
   `dispatchNotified` (section 5).
4. **The ten-triggers-one-type collapse** in `mapTriggerToType`. Even with the
   migration, one user cannot receive two differently-triggered notifications
   about one trip. Needs new enum values — DDL, and a product decision.
5. **Every `FAILED` row in production history was recoverable** only because
   `errorMessage` is populated. ~~Nothing queries it. A periodic check on
   `NotificationSendLog WHERE status='FAILED'` would have surfaced all eleven
   instances of this defect class years earlier; there is no such check.~~

   > **CORRECTED by quick-556 — the claim above was wrong.** Two surfaces *do*
   > read that column, and both were reachable the whole time: the SysAdmin
   > send log at `/notifications` (filter by status, tenant, trigger, recipient
   > and date; click a FAILED row to expand its `errorMessage`) and a
   > tenant-scoped equivalent on the owner's own `/settings/notifications` page.
   >
   > The real defect was narrower and less obvious: **both surfaces are
   > pull-only**, and the one push-ish signal — the sysadmin health tile — had a
   > **24-hour window** and a **`failureRate > 5%` gate** on its warning banner.
   > 8 failures across 357 sends is 2.24%, so the gate suppressed every failure
   > this system has ever had, and the window made each one invisible the day
   > after it happened. Nobody looked because there was nothing telling them to.
   >
   > quick-556 fixed the tile rather than building anything new. Details in
   > `.planning/quick/556-surface-notification-failures/556-SUMMARY.md`.
