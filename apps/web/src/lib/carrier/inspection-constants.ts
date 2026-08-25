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
