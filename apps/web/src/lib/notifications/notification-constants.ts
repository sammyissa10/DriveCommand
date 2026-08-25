/**
 * Document Import Phase 10 — the notification system's tuneable numbers.
 *
 * Same discipline as `inspection-constants.ts`, `template-constants.ts` and
 * `optimisation-constants.ts`: one occurrence each, grep-verifiable, imported by
 * the tests rather than restated in them. A window written down twice is a
 * window that will disagree with itself.
 */

/**
 * How long a Phase 10 trigger suppresses a repeat for the same
 * (trigger, entity, recipient, channel).
 *
 * FIVE MINUTES, and it is a **rolling lookback**, not a bucket.
 *
 * Why a lookback and not `floor(now / WINDOW)`: a bucket has edges, and two
 * emits 10 ms apart on either side of an edge both send. That is the same defect
 * class as quick-541's UTC-midnight comparisons — an arithmetic boundary that
 * has nothing to do with the thing being measured. The lookback asks the only
 * question that matters, "did we send this in the last five minutes", and has no
 * edge to land on.
 *
 * Why five minutes specifically — the floor and the ceiling are set by different
 * things and both were checked:
 *
 *   FLOOR. The duplicates this exists to absorb are a driver double-tapping
 *   submit, a retried mobile request, and `applyVerdictSideEffects` running
 *   twice because a blocked screen was re-navigated. Those cluster within
 *   seconds — but a 5xx retry with backoff can land 30–60 s later, and the
 *   pre-existing event scope (`buildIdempotencyKey`, same ISO second) misses
 *   every one of them. One second is not a window; it is a coincidence detector.
 *
 *   CEILING. Set by the fastest LEGITIMATE repeat for the same triple. For that
 *   to be under five minutes, a driver would have to fail an inspection, have it
 *   resolved, and fail it again on the same trip, inside five minutes. That is
 *   not a real sequence. The first genuinely repeatable case is
 *   override-then-re-fail, which requires a dispatcher to type a reason of at
 *   least `OVERRIDE_REASON_MIN_LENGTH` characters and is minutes long at best.
 *
 * Deliberately NOT the pre-existing calendar-day scope in
 * `notification-deduplication.ts` (`{type}:{entityId}:{YYYY-MM-DD}`): that is far
 * too coarse for a trip that starts and completes on one shift, and it is a UTC
 * calendar boundary, which is the quick-541 trap again.
 *
 * Applied ONLY to the ten Phase 10 triggers, by passing `dedupWindowMs` at the
 * call site. Every pre-existing trigger omits it and keeps the exact behaviour
 * it had — "do not change the behaviour of any existing trigger".
 */
export const NOTIFICATION_DEDUP_WINDOW_MS = 5 * 60_000;
