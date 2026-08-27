# quick-555 — inspection.failed IN_APP logged FAILED

## The captured error (step 3 — reproduced, not guessed)

Ran the real `writeInAppNotification` against production with the dispatcher's
exact arguments, IN_APP in isolation (no email, no push):

    name   : PrismaClientKnownRequestError
    code   : P2002
    pg     : 23505 duplicate key value violates unique constraint
             "in_app_notifications_org_id_entity_id_type_key"
    fields : (org_id, entity_id, type)

Identical to the `errorMessage` stored on the FAILED row, so the production
failure and the reproduction are the same event.

## Root cause — structural

`UNIQUE (org_id, entity_id, type)` (verified via pg_constraint) **omits
`user_id`**, and `mapTriggerToType`'s catch-all swallows ALL TEN Phase 10
triggers into `compliance_alert` — trip.assigned/reminder/started/completed,
inspection.passed/passed_with_defects/failed/overridden, import.needs_review/failed.
All ten are entity-scoped to the same trip.

Therefore: per trip, only the FIRST of those ten can ever write an in-app row,
and it claims the slot for the ENTIRE TENANT.

Here the occupant was the DRIVER's `trip.assigned` row at 02:13; the owner's
`inspection.failed` at 02:23 collided with it. The earlier trip 9d247cb3
succeeded only because no trip.assigned row preceded it.

Same mechanism breaks FAN-OUT: the dispatcher loops recipients writing identical
(orgId, entityId, type), so only the first recipient of any multi-recipient
in-app notification gets one. `notifyDispatchOfBlock` has the same defect in its
own loop, which under-counts the `notified` value feeding `dispatchNotified`.

## Step 2 finding — nothing watches

The IN_APP catch has NO logger call. The reason is persisted to
NotificationSendLog.errorMessage and nothing else. Inside one file:

  PUSH   dispatcher.ts:256  logger.error + serializeError  (carries the DEC-11 note)
  EMAIL  dispatcher.ts:368  NOTHING
  IN_APP dispatcher.ts:463  NOTHING

The legacy `notifyDispatchOfBlock` does it correctly. The catalogue path opted out.

## What a code-only fix CANNOT do

Delivery cannot be restored without DDL. Every free dimension is closed:
- user_id absent from the unique key -> DDL
- `type` is a 9-value Postgres enum with no inspection member -> DDL
- `entity_id` must stay the real trip UUID (notification-center.tsx:81 deep-links
  from it; a synthetic id ships a broken link)
- NotificationSendLog.status is a Postgres enum -> no new status value

Do NOT fake delivery. Fix the silence and the misclassification; report the
migration.

## Tasks

### Task 1 — stop the silence
`logger.error(msg, err, { ..., error: serializeError(err) })` in the IN_APP and
EMAIL catches, matching PUSH exactly. Error SECOND (DEC-11 §3).

### Task 2 — classify the collision truthfully
`writeInAppNotification` returns a discriminated result for P2002 instead of
throwing; every other error still throws.

Dispatcher decides:
- existing row has the SAME userId AND the SAME title -> genuine duplicate, which
  is what the constraint was built for. Record SKIPPED_IDEMPOTENT (existing enum
  value, no DDL), no error log.
- anything else (different user, or same user + different notification) -> a REAL
  LOSS. Keep FAILED, replace the Prisma stack with a plain-language errorMessage
  naming the occupant, and log loudly.

Title equality is the discriminator because a re-send renders the identical
subject while a different trigger does not — proven by this incident's own rows
("New trip 45a84a80 — …" vs "Trip blocked — …").

### Task 3 — the test
Must fail if an IN_APP send records FAILED without surfacing a reason.

## Constraints honoured
Audience resolution, subscriptions and defaultRecipients untouched.
notifyDispatchOfBlock untouched. No DDL. No data changes beyond the repro.

## Report-only
- The migration that would restore delivery.
- `driver.invited` IN_APP fails with `invalid input syntax for type uuid:
  "<email>"` — 2 production rows, a SECOND live defect in the same writer, whose
  cause is in recipient resolution (out of bounds for this task).
- notifyDispatchOfBlock's own fan-out P2002 and the resulting under-count.
