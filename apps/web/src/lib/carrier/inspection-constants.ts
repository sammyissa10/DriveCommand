/**
 * Phase 9 — the inspection gate's tuneable numbers, in one file.
 *
 * Same discipline as `template-constants.ts` and `optimisation-constants.ts`:
 * one occurrence each, grep-verifiable, imported by the tests rather than
 * restated in them. A threshold written down twice is a threshold that will
 * disagree with itself.
 */

/**
 * How long a completed pre-trip inspection stays valid, in hours.
 *
 * ROLLING, deliberately — not "the current calendar day", which is the literal
 * reading of Section 12's *"valid one already today, this truck?"*. A calendar
 * day expires a 23:50 walkaround at 00:00, ten minutes later, and the driver it
 * hits hardest is the night driver who has just done everything right. The
 * drawing's "today" is colloquial; a rolling window is what it means in practice
 * and what a DVIR is worth.
 *
 * If a tenant ever needs this configurable it becomes a `Tenant` column and this
 * constant becomes its default. It is not one today, and inventing the column
 * before anyone has asked for it would be a fourth settings rung nobody reads.
 */
export const INSPECTION_VALIDITY_HOURS = 24;

/**
 * The scope of a trip's inspection `PlaybookInstance`: one instance per TRIP.
 *
 * quick-546. Both the writer (`ensureTripInspection`) and the current-instance
 * reader (`findTripInspection`) take their `entityType` from here, and neither
 * may carry a string literal again.
 *
 * THE ASYMMETRY THIS REPLACES. `ensureTripInspection` used to pass
 * `entityType: playbook.entityType` with `entityId` switching between
 * `dispatchId` and `truckId`, while `findTripInspection` read a fixed
 * `'DISPATCH'` / `dispatchId`. On the eight tenants whose inspection playbook is
 * authored `entityType: 'VEHICLE'` (the 2026-04-24 script), the writer therefore
 * produced a truck-keyed row the reader could never see. The driver's evidence
 * of that was a button that did nothing.
 *
 * WHY VEHICLE SCOPE IS IMPOSSIBLE HERE, not merely undesirable.
 * `generatePlaybookInstance` refuses a duplicate on
 * `(playbookId, entityId, tenantId, status != COMPLETED)`, and **nothing in this
 * repo ever sets an inspection instance to COMPLETED** — `PlaybookInstance`
 * carries no `deletedAt` and `InstanceStatus` has no CANCELLED either, so there
 * is no state that retires one. A truck-keyed instance is thus created once and
 * can never be superseded: the second trip in that truck gets a `TRPCError`
 * CONFLICT forever. One instance per TRIP is the only scope under which a
 * per-trip inspection can be answered twice, which is the whole premise of a
 * pre-trip inspection.
 *
 * THE PLAYBOOK'S OWN `entityType` REMAINS A SELECTION FILTER. The candidate
 * query in `ensureTripInspection` still says `entityType: { in: ['DISPATCH',
 * 'VEHICLE'] }`, so a VEHICLE-authored checklist is still eligible to RUN — it
 * simply does not get to choose the instance's scope. Safe because
 * `verifyEntity` has an explicit "DISPATCH and OTHER: no entity verification
 * required" branch, and `resolveAssignee` returns the same thing for a
 * DRIVER-role step under either scope. Nothing about assignment changes.
 *
 * Flipping this to `'VEHICLE'` re-creates the dead button. `inspection-scope.test.ts`
 * fails if you do.
 */
export const TRIP_INSPECTION_ENTITY_TYPE = 'DISPATCH' as const;

/**
 * `DispatchOverrideAudit.entityType` value for an inspection override.
 *
 * That column is a plain `String` with **no** CHECK constraint — verified
 * against production via `pg_get_constraintdef`, per DEC-14, before this value
 * was chosen. The existing values are "DRIVER" and "VEHICLE"; this is the third.
 * Reusing that table rather than building a second override audit is the audit's
 * B10 recommendation and avoids the parallel mechanism this phase forbids.
 */
export const INSPECTION_OVERRIDE_ENTITY_TYPE = 'INSPECTION';

/**
 * Minimum length of a typed override reason, after trimming.
 *
 * Item 5 requires a typed reason. A required field that accepts "." is a
 * required field in name only, and this reason is the permanent record of why a
 * truck with a failed brake check left the yard.
 */
export const OVERRIDE_REASON_MIN_LENGTH = 10;

/**
 * Minimum length of the note a driver must write when failing an item.
 *
 * RAISED from 3 to 8 in Phase 9-web. Three was not a considered number: the
 * comment that shipped with it argued only that the driver should be held to a
 * LOWER bar than the owner typing an override reason, and cited "left rear tire
 * flat" — twenty characters — as its example of a complete answer. Nothing in
 * that reasoning produces 3, and 3 accepts "abc", "n/a", "ok" and "...", which
 * is the same as no minimum at all.
 *
 * This note is the record a mechanic works from and, on a critical item, the
 * sentence a dispatcher reads on the blocked screen before deciding whether to
 * override a safety stop. Eight characters rejects every filler above while
 * accepting the terse real answers this domain actually produces — "air leak"
 * (8), "flat tire" (9), "brake leak" (10), "lights out" (10).
 *
 * It is not free: "no horn" (7) is a genuine answer this rejects. That is why
 * the web checklist renders a live character counter beside the field rather
 * than failing the driver at submit — the bar is visible while they type, not
 * sprung on them afterwards. Still lower than `OVERRIDE_REASON_MIN_LENGTH`,
 * which keeps the asymmetry the earlier comment was reaching for.
 *
 * Enforced SERVER-SIDE from Phase 9-web (`recordDriverInspectionFailure`).
 * Before that it was a client-side check in one React Native component and
 * nothing else, so every other caller could write an empty note.
 */
export const FAIL_NOTE_MIN_LENGTH = 8;
