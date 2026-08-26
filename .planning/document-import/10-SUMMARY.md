# Document Import Phase 10 — Notification triggers (spec Section 13)

**Pre-task commit:** `9efc4a07`. Date: 2026-08-25.
**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 13.

---

## Step 0 findings, as reported and ruled on

### 0a — The emit-outside-transaction trap

| Path | How it gets tenant context | Safe outside a request? |
|---|---|---|
| `getTenantPrisma()` | reads `x-tenant-id` header + session cookie | **No** — E251 |
| `getTenantPrismaForOrg(orgId)` | explicit orgId, sets the GUC directly | Yes |
| **`dispatchNotification()`** | **bare client + explicit `tenantId` argument** | **Yes** |
| `sendPushToUser()` | bare client + `bypass_rls` | Yes |

**The catalogue was already safe.** The dispatcher never calls `getTenantPrisma()`. The rule
therefore binds the code that *gathers the payload*, which must run before any deferred closure.

**The trap was live and shipping.** `commit-service.ts:1155` ran
`sendDispatchAssignedNotification` inside `afterResponse` → `after()`, and that function's first
statement is `await getTenantPrisma()`. **The Phase 8 driver notification has therefore thrown on
every single commit since Phase 8 shipped**, swallowed by the guard around it. Phase 9's own file
header recorded the function "still has that shape and still throws" — a known defect with no
owner. Replaced, per ruling 4.

### 0b — Audience resolution and subscription are TWO mechanisms, unioned

`resolveRecipients` expands `template.defaultRecipients` **and** unions
`NotificationSubscription`. A `tenant_owners` or `role` rule addresses every matching active user
without consulting subscription at all, and `UserNotificationPreference` is a *channel* preference
applied afterwards that defaults to **true**.

**Fix, with no resolver change:** the six Subscribers triggers ship `defaultRecipients: []`. With
no rules to expand, subscription is the only source of recipients and an unsubscribed owner
receives nothing **by construction**. Verified in production: all six have `rule_count = 0`.

### 0c — Dedup existed; neither window was usable

`buildIdempotencyKey` dedupes within the **same ISO second** (misses a 1.1 s double-tap);
`notification-deduplication.ts` dedupes per **UTC calendar day** (far too coarse, and the quick-541
boundary trap). Chose a **5-minute rolling lookback**, per ruling 5 — not a bucket, because
`floor(now/300000)` has an edge and two emits 10 ms either side of it both send.

`NOTIFICATION_DEDUP_WINDOW_MS` in `notification-constants.ts`, grep-verified single definition,
imported by the tests.

### 0d — The ten triggers

Section 13's table has **seven rows**; three are compound (`·`).

| # | Trigger | Audience | Channels | Emit point | Was it there? |
|---|---|---|---|---|---|
| 1 | `trip.assigned` | Driver | push, in-app | `commit-service.ts` step 8 | existed, **broken** |
| 2 | `trip.reminder` | Driver | push, in-app | **new cron route** | **did not exist** |
| 3 | `inspection.passed` | Subscribers | in-app | `applyVerdictSideEffects` | branch existed, no emit |
| 4 | `inspection.passed_with_defects` | Subscribers | in-app, email | `applyVerdictSideEffects` | branch existed, no emit |
| 5 | `inspection.failed` | Subscribers | in-app, email, push | `applyVerdictSideEffects` | parallel path existed |
| 6 | `inspection.overridden` | Subscribers | in-app, email | `overrideInspection` | **no emit at all** |
| 7 | `trip.started` | Subscribers | in-app | `transitionTripStatus` | driver-only emit existed |
| 8 | `trip.completed` | Subscribers | in-app | `transitionTripStatus` | branch existed, no emit |
| 9 | `import.needs_review` | Uploader | in-app | `transitionImport` | transition existed, no emit |
| 10 | `import.failed` | Uploader | in-app + email | `transitionImport` | transition existed, no emit |

---

## Build items 1–5

### 1. The ten triggers registered · IMPLEMENTED

Two new seed files, `trip.ts` (8) and `import.ts` (2), registered in `seed-notifications.ts`.
`TriggerKey` and `NotificationPayload` widened in lockstep. Seed run: **inserted 10, updated 37**.

**A silent failure caught by running the seed rather than reading it.** `dispatchNotification`
reads `defaultHtmlCache` and, when null, records a FAILED audit row and sends nothing. The only
writer of that column was ever the SysAdmin block editor — a human opening each template in a
browser and pressing Save. Seeding ten templates without it would have produced ten triggers that
look perfectly configured and deliver nothing. The seed now renders the Tiptap doc via
`@tiptap/html/server` + `@tiptap/starter-kit` (**both already dependencies — nothing installed**).
`template-renderer.ts`'s "Tiptap is NOT invoked on the server" still holds for the *request path*;
quick-335 moved it out of the RSC graph, and a standalone Node seed script is not in that graph.

*(The default `@tiptap/html` entry throws "can only be used in a browser environment" under Node
and names the `/server` export in the error. Found by running the seed; the types resolve
identically, so this was invisible to tsc.)*

### 2. Emit points wired, outside the transaction · IMPLEMENTED

All ten go through `lib/notifications/emit.ts`, which never calls `getTenantPrisma()`, never
throws, and passes the dedup window. `emitNotificationAfterResponse` uses the same try-`after()`-
else-detached shape as `commit-service.ts`'s own `afterResponse`, because `after()` throws outside
a request and a throw there would surface as a failed commit for a trip that already exists.

Every payload is gathered **before** the deferred closure, with an already-resolved client.

**`trip.assigned` fixed the broken call site** (ruling 4). The E251 path is gone, not left beside
the new one.

### 3. Self-service subscription · IMPLEMENTED

`updateMySubscription` added to `my-notifications.ts`; a **Subscribe** checkbox added to
`/settings/my-notifications`, rendered only on triggers where subscription *is* the whole audience
(`subscriptionOnly`). On a trigger with a `role`/`related` rule an unticked box would falsely
suggest opting out, so it is not shown — two situations, two treatments.

Unsubscribing **deletes** the row. Presence in `NotificationSubscription` *is* the subscription;
same shape as quick-516's stored template decision, where "undo" is a delete and never another
write.

**A second latent bug fixed here.** `updateMyPreference`'s create branch omitted
`UserNotificationPreference.tenantId`, which is `NOT NULL`. Every first-ever preference write for
any (user, trigger) pair threw *"Argument `tenantId` is missing"* and was returned as a generic
error string. **Production carries zero rows in that table** — what a create path that has never
once succeeded looks like. Phase 10 depends on it for per-user channel control, so the
notification the brief asks an owner to switch off could not be switched off.

**Navigation.** `/settings/my-notifications` was already linked; no new nav needed. Click path
from cold start: **sign in → avatar menu (top right) → "My Notifications"**, or **sidebar →
Settings → My Notifications**. Either lands on the accordion; open **Trips** or **Document
imports** and the ten new rows are there. File edited for the controls:
`src/app/(shared)/settings/my-notifications/preferences-form.tsx`.

### 4. Content actionable at a glance · IMPLEMENTED

`inspection.failed` carries `driverName`, `truckUnit`, `tripNumber`, `failedItems` — all four in
the subject or first sentence. `inspection.overridden` carries `overriddenBy` and `reason`, the
reason **verbatim**, never summarised: it is the permanent record of why a truck with a failed
critical item left the yard.

`overriddenBy` falls back name → email → "An owner or manager", never to an empty string — an
override notification naming nobody is the one thing it exists to prevent.

**Dates.** Every date rendered here is `@db.Timestamptz` (`scheduled_departure`,
`actual_departure`, `actual_arrival`) — real instants, so `formatDateInTenantTimezone` is correct.
quick-541's date-only helpers would be the **inverse** bug on a timestamptz, and that is noted at
each site. No inline date formatting anywhere.

### 5. Deduplication · IMPLEMENTED

`wasSentWithinWindow` — a rolling lookback on `(triggerKey, relatedEntity, recipient, channel)`
over `NotificationSendLog`, filtered to `status: 'SENT'`. Applied **in addition** to the existing
key check, and **opt-in**: only the ten new emits pass `dedupWindowMs`, so all 37 pre-existing
triggers keep exactly the behaviour they had.

Channel is part of the match, because Section 13 gives some triggers three channels and
suppressing an email must not suppress the push beside it.

**Fails open** on a DB error. Failing open duplicates a notification; failing closed loses one —
and the one it would lose is "your brakes failed and the trip is blocked".

---

## Rulings, honoured

**Scope (ruling 1).** Both in. `trip.reminder` has a new cron route
(`/api/cron/trip-reminders`) and a `vercel.json` entry at `0 13 * * *`.

> **The Hobby-plan constraint, stated rather than shipped broken.** This account permits only
> once-daily cron schedules (Phase 52 already hit this). A reminder that fires once a day is
> genuinely coarser than the feature wants — the ideal is "a couple of hours before departure",
> which needs hourly at minimum. The route's 24-hour lookback window is sized to the schedule that
> can actually run, so every planned trip is covered by exactly one run with no gap and none
> reminded twice. On an upgraded plan, narrow `REMINDER_WINDOW_HOURS` and the cron interval
> together — they are two halves of one decision.

`notifyDispatchOfBlock` **kept** as the dispatcher-of-record path for `inspection.failed`. It backs
the driver-facing "dispatch has been told" promise, and it addresses the named dispatcher (or all
owners/managers) unconditionally. The catalogue emit runs alongside it.

> **The overlap, reported as required.** A subscriber who is also the named dispatcher receives
> **two** notifications for one blocked inspection: one from `notifyDispatchOfBlock`
> (`createNotification` + direct push) and one from `inspection.failed` (catalogue). They are not
> deduplicated against each other, because they are different mechanisms with different
> guarantees — collapsing them would cost one of the two its guarantee. Deleting the guaranteed
> path to avoid a duplicate is what ruling 1 forbids.

**DDL (ruling 2).** All three applied via Supabase MCP, mirrored resolved-not-run per DEC-3 in
`20260825140000_notification_push_channel_and_categories`. `pg_constraint` read first (DEC-14) —
**zero CHECK constraints** on any of the four notification tables.

> **The resolve step was initially MISSED and is now done.** The DDL went in via `execute_sql`
> rather than `apply_migration`, so the migration FILE was written and committed but no row was
> written to `_prisma_migrations` — the newest row was still
> `20260825120000_add_carrier_truck_defects`. DEC-3 is two halves, and only one of them had been
> done. Corrected: the row now exists, matching the convention every other manually-resolved row
> in this table uses — real SHA-256 of `migration.sql`
> (`70bdfdd9…ecb28eff`), `applied_steps_count = 0`, `logs = ''`,
> `started_at = finished_at` (2026-08-26 02:53:55 UTC). Note `applied_steps_count = 0` is the
> signature that distinguishes a resolved row from one `scripts/migrate.mjs` actually ran, which
> writes `1`.
>
> **Fresh-environment path verified, not assumed.** `scripts/migrate.mjs` wraps each migration in
> `BEGIN`/`COMMIT`, and `ALTER TYPE … ADD VALUE` was forbidden inside a transaction block before
> PostgreSQL 12. Tested on this database (17.6) with a throwaway enum: `ADD VALUE` inside an
> explicit transaction succeeds, and the probe type was dropped afterwards. So a fresh environment
> built from migrations gets both enum values and both columns.

**DEC-16, all three changes:**

1. **The type** — `ALTER TYPE "NotificationCategory" ADD VALUE 'TRIP' / 'IMPORT'`.
2. **The existing rows** — **VACUOUS, and stated rather than omitted.** All ten Phase 10 keys are
   new rows seeded after the migration. There is no pre-existing row that "would have used" TRIP
   or IMPORT and had to settle for something else. Nothing to backfill. *Saying so is the point:
   a deferred backfill nobody records is indistinguishable from one nobody thought of, which is
   exactly what produced the sixteen-month `PlaybookCategory` gap.*
3. **Every place a user picks from it** — **three** hand-written maps, not the two named in the
   brief. tsc found the third:

   | File | Type | Caught by tsc? |
   |---|---|---|
   | `(admin)/notifications/templates-tab.tsx:51` | `Record<NotificationCategory, string>` | **Yes** — build failed until fixed |
   | `(shared)/settings/my-notifications/preferences-form.tsx:29` | string-literal array + label map | No |
   | `(owner)/settings/notifications/notifications-tab.tsx:44` | string-literal array + colour map | No |

   Only one of the three is type-checked. That asymmetry is precisely how an enum value ends up
   unpickable, and it is worth knowing which one will warn you.

**`defaultRecipients: []` (ruling 3)** — approved and applied to all six. Verified in production.

**Dedup (ruling 5)** — rolling lookback, single constant, imported by the tests.

**Driver-cannot-fully-unsubscribe (ruling 6)** — kept and stated here rather than buried:

> A driver cannot fully unsubscribe from `trip.assigned` or `trip.reminder`. Those two use a
> `related` rule targeting the driver by `User.id`, so they can turn off channels via
> `UserNotificationPreference` but cannot remove themselves from the audience. It is the subject's
> own trip and Section 13 names the audience as **Driver**, not Subscribers. Same shape as
> `load.assigned` has always had.

---

## Binding patterns

- **`EXEMPT_MODELS`** — no new models this phase (two columns and two enum values only), so no
  change was needed. Checked rather than assumed.
- **All DB access** through `getTenantPrismaForOrg` / the dispatcher's explicit-`tenantId` bare
  client. `getTenantPrisma()` appears in no new code path.
- **No catch swallows into a generic string.** Every new catch uses
  `logger.error(message, error, context)` with the error in the **second** slot and
  `serializeError` in the context.
- **`packages/validation` / `packages/api-client`** — no new exports this phase, so no rebuild was
  required. Both `dist/` are untouched.
- **No existing trigger changed.** Verified in production after the seed: 37 pre-Phase-10
  templates, **0 with `pushEnabled`**, **0 missing HTML**.
- **Nothing installed.** `@tiptap/html`, `@tiptap/starter-kit`, `expo-server-sdk` all pre-existing.

---

## Live schema diff against Section 13

| Item | Live | Matches `schema.prisma` |
|---|---|---|
| `NotificationCategory` | `USER,LOAD,DRIVER,TRUCK,MESSAGE,FINANCE,ROUTE,CUSTOMER,DIGEST,TRIP,IMPORT` | yes |
| `NotificationChannel` | `EMAIL,IN_APP,PUSH` | yes (unchanged) |
| `NotificationTemplate.pushEnabled` | `boolean NOT NULL default false` | yes |
| `UserNotificationPreference.pushEnabled` | `boolean NOT NULL default true` | yes |
| Templates total / Phase 10 | 47 / 10 | — |
| CHECK constraints on the 4 tables | **0** | — |

Per-trigger, against Section 13's table:

| Trigger | Category | rules | push | HTML |
|---|---|---|---|---|
| `trip.assigned` | TRIP | 1 `related` | **true** | yes |
| `trip.reminder` | TRIP | 1 `related` | **true** | yes |
| `trip.started` | TRIP | **0** | false | yes |
| `trip.completed` | TRIP | **0** | false | yes |
| `inspection.passed` | TRIP | **0** | false | yes |
| `inspection.passed_with_defects` | TRIP | **0** | false | yes |
| `inspection.failed` | TRIP | **0** | **true** | yes |
| `inspection.overridden` | TRIP | **0** | false | yes |
| `import.needs_review` | IMPORT | 1 `related` | false | yes |
| `import.failed` | IMPORT | 1 `related` | false | yes |

Push is true on exactly the three rows whose Channels column names it. Six subscriber triggers
carry zero rules.

**One honest gap in the schema's expressiveness.** `NotificationTemplate` has `inAppEnabled` and
now `pushEnabled`, but **no per-template email switch** — email is driven entirely by the
recipient's preference. So Section 13's rows that omit Email (e.g. `inspection.passed`, in-app
only) cannot be enforced at the template layer: a subscriber who leaves `emailEnabled` on will
receive an email for them. Recorded in each template's `description` rather than silently ignored.
Closing it would need a third column and was not this phase's to invent.

---

## Diff summary

```
NEW  src/lib/notifications/notification-constants.ts      the 5-minute window, one occurrence
NEW  src/lib/notifications/emit.ts                        the only way the ten are emitted
NEW  src/lib/notifications/__tests__/phase10-triggers.test.ts   22 tests
NEW  prisma/seeds/notification-template-data/trip.ts      8 triggers
NEW  prisma/seeds/notification-template-data/import.ts    2 triggers
NEW  src/app/api/cron/trip-reminders/route.ts             trigger 2's missing scheduler
NEW  prisma/migrations/20260825140000_.../migration.sql   mirrored, resolved-not-run

     src/lib/notifications/dispatcher.ts        PUSH branch + opt-in dedupWindowMs
     src/lib/notifications/idempotency.ts       wasSentWithinWindow
     src/lib/notifications/recipient-resolver.ts  pushEnabled + the union warning
     src/lib/notifications/audit-log.ts         channel type widened to PUSH
     src/lib/document-import/commit-service.ts  trip.assigned; E251 call site removed
     src/lib/document-import/persistence.ts     import.needs_review / import.failed
     src/lib/carrier/inspection-service.ts      the four inspection triggers
     src/lib/carrier/trips.ts                   trip.started / trip.completed
     src/app/(owner)/actions/my-notifications.ts  subscription + push + the tenantId fix
     src/app/(shared)/settings/my-notifications/preferences-form.tsx  Subscribe + Push controls
     prisma/seeds/seed-notifications.ts         HTML generation + the two new arrays
     prisma/schema.prisma                       2 columns, 2 enum values
     vercel.json                                the daily cron entry
     3 × category picker                        DEC-16 change 3
```

## Gates

**TypeScript — probed in both apps, then clean.**
- `apps/web`: `const __probeP10: number = 'y'` injected into `emit.ts`, reported as the **sole**
  error — gate live, not blind. Removed; `tsc --noEmit` exit **0**.
- `apps/mobile`: probed in the tracked `lib/inspection-copy.ts`, sole error, removed, exit **0**,
  file restored byte-for-byte via `git checkout --`.

**Test suite — diffed against `9efc4a07`** in an in-repo worktree (`.baseline-p10`), removed with
`git worktree remove`.

| | Baseline `9efc4a07` | After |
|---|---|---|
| Test files failed | 18 | **18** |
| Tests failed | 66 | **66** |
| Tests passed | 1316 | 1358 |
| Tests skipped | 81 | 61 |
| Total | 1466 | 1488 |

**The failing FILE SET is byte-identical** (`diff` reports no change). All 18 are pre-existing and
unrelated — workflows router/instance mocks, driver-pay golden exporters, notification dispatcher,
auth unit tests, validation schemas.

*Caveat, stated rather than glossed:* the baseline worktree has no `.env.local`, so ~20
DB-dependent tests skipped there that run in the main tree. That accounts for the +42 passed /
−20 skipped, and is an artefact of the worktree rather than of this change. **The identical failed
count (66) and identical failing file set are the meaningful signal**; the +22 total is the new
`phase10-triggers.test.ts`.

### Three regressions found and fixed before commit

The first full run showed **21** failing files, not 18. All three additions were Phase 8 commit
suites, and in all three **every assertion passed** — the failure was elsewhere.

1. **`document-import-commit-windows` / `document-import-commit-rollback`** — failed in `afterAll`
   teardown with `Foreign key constraint violated: in_app_notifications_org_id_fkey`. The new
   `import.needs_review` emit writes an `InAppNotification` row, and `in_app_notifications.org_id`
   is a real FK to the tenant the teardown then tries to delete. The tests were not wrong; the
   cleanup list simply predates that table ever having rows in these fixtures. Added
   `inAppNotification.deleteMany` to all three teardowns.

2. **`document-import-commit-notification-isolation`** — mocked
   `sendDispatchAssignedNotification` and asserted it fired once. Phase 10 removed that call site,
   so the mock was never reached and `notif.calls` stayed 0.

   **This one mattered more than a broken assertion.** Left alone, retargeting nothing, the suite
   would have gone green forever while injecting a failure into a function the commit no longer
   calls — a test passing because it asserts on nothing. The mock now targets
   `emitNotificationAfterResponse`, filtered to `trip.assigned` so the *other* new emit through
   that module (`import.needs_review`) is not accidentally the thing being forced to throw. Every
   row assertion is unchanged, and the throw is now **synchronous**, which is the only failure mode
   that could actually escape a `void`-returning call into `commitImport`'s try block.

No test's assertions were weakened to reach green.

---

## Per-item audit

| Item | Verdict | Evidence |
|---|---|---|
| **1** — register the ten triggers with Section 13's audiences and channels | **IMPLEMENTED** | Seed inserted 10; production shows 10 rows across TRIP/IMPORT with rule counts and push flags matching the table exactly |
| **2** — wire each to its emit point, outside the commit transaction | **IMPLEMENTED** | All ten wired; `emit.ts` never calls `getTenantPrisma()`; the Phase 8 E251 call site replaced; isolation test proves a throwing emit cannot roll back a committed trip |
| **3** — per-user, per-trigger, self-service subscription; nothing forced | **IMPLEMENTED** | `updateMySubscription` + Subscribe control on `/settings/my-notifications`; six subscriber triggers carry `defaultRecipients: []`, verified in production; `UserNotificationPreference.tenantId` create bug fixed so channel prefs can persist at all |
| **4** — content actionable at a glance | **IMPLEMENTED** | `inspection.failed` names driver, truck, trip, failed items; `inspection.overridden` names the overriding user and the verbatim reason; asserted in tests |
| **5** — deduplicate a repeat within a short window | **IMPLEMENTED** | `wasSentWithinWindow`, 5-minute rolling lookback, opt-in per call site, matched on trigger + entity + recipient + channel; 12 tests |
| **6** *(step 0 reporting)* | **REPORTED** | 0a–0e delivered before any code was written; all five rulings applied |

## Known limitations, none of them silent

1. **`trip.reminder` fires once daily**, not hours-before-departure. Vercel Hobby plan. The
   24-hour window is matched to it so coverage is complete, but the timing is coarse.
2. **A subscriber who is also the named dispatcher gets two notifications** for a blocked
   inspection — the catalogue trigger and `notifyDispatchOfBlock`. Kept deliberately per ruling 1.
3. **No per-template email switch exists**, so Section 13's in-app-only rows cannot be enforced at
   the template layer; they are recorded in each `description`.
4. **Not browser-tested.** The Subscribe and Push controls are conditional renders behind a server
   read. Verifying the acceptance test end to end needs two owner accounts, one subscribed and one
   not, and a failed inspection — the "before you run it" setup the spec asks for.
