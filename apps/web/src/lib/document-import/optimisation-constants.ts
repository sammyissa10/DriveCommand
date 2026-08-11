/**
 * Every tuned number in route optimisation, in one file.
 *
 * Spec Section 9: *"Below a configurable floor, do not offer it at all — noise
 * erodes trust."* The floor is the load-bearing number in Part B and it is
 * defined here once. **Nothing below may be restated as a literal anywhere else,
 * tests included** — the tests import these names, the same discipline
 * `template-constants.ts` and `facility-constants.ts` carry, and for the same
 * reason: a threshold that appears twice is a threshold that will disagree with
 * itself the first time one of the two is tuned.
 */

// ---------------------------------------------------------------------------
// The floor — the number that decides whether a dispatcher is interrupted
// ---------------------------------------------------------------------------

/**
 * Miles saved, below which no suggestion is shown at all.
 *
 * **5, and it is a statement about what a dispatcher can act on rather than
 * about the optimiser.** Two things pin it:
 *
 *  - *Below it, the number is not real.* The matrix is road distance from a
 *    routing engine against facility centroids — a dock on the far side of a
 *    yard, a geocode that landed on the street rather than the gate, and a
 *    round-trip is a mile or two out before anyone has driven anything. A
 *    suggestion to save 2 miles is a suggestion to trust a difference smaller
 *    than the measurement's own error, and the first time a driver runs it and
 *    the odometer disagrees, every future suggestion is noise.
 *  - *Above it, the saving survives a bad day.* At a working cost in the region
 *    of $2/mile plus the driver's hour, five miles a run on a route that repeats
 *    daily is real money, and it is enough that a dispatcher reordering twelve
 *    stops by hand feels repaid for the twenty seconds.
 *
 * Paired with the minutes floor by OR, not AND — see below.
 */
export const OPTIMISATION_MIN_SAVED_MILES = 5;

/**
 * Minutes saved, below which no suggestion is shown — the OTHER half of the
 * floor, and the reason it is `OR` rather than `AND`.
 *
 * **20, and the case it exists for is the one the miles floor gets wrong.** Two
 * orders can cover almost identical distance and differ sharply in time: a
 * left turn across four lanes at 16:30, a river with two crossings, a delivery
 * that has to happen before a receiving office shuts. The routing engine's
 * duration already carries that; the distance does not. Requiring BOTH floors
 * would suppress exactly the suggestion with the clearest justification —
 * "same miles, half an hour earlier home" — and requiring only miles would
 * mean the optimiser could never speak about time at all.
 *
 * 20 minutes because that is about the smallest interval a dispatcher can plan
 * against: it is the difference between making a 17:00 appointment and not.
 * Below it the honest description is "about the same", and a system that
 * interrupts someone to say "about the same" gets ignored when it matters.
 */
export const OPTIMISATION_MIN_SAVED_MINUTES = 20;

// ---------------------------------------------------------------------------
// How hard the solver tries
// ---------------------------------------------------------------------------

/**
 * At or below this many movable stops, every order is enumerated exactly.
 *
 * 8 movable stops is 40,320 permutations, each costed by summing at most nine
 * matrix lookups — a few million array reads, comfortably under a tenth of a
 * second, and the answer is provably optimal rather than nearly so. 9 would be
 * 362,880 and 10 would be 3.6 million; the curve stops being free precisely
 * here, which is why the line is here.
 */
export const OPTIMISATION_EXACT_MAX_STOPS = 8;

/**
 * Fewer stops than this and no suggestion is computed at all.
 *
 * With two movable stops the only alternative order is the reverse, and on a
 * manifest that means putting the delivery before the pickup — which the
 * precedence constraint rejects anyway. Computing it would spend a routing call
 * to prove there is nothing to say.
 */
export const OPTIMISATION_MIN_STOPS = 3;

/**
 * Passes 2-opt may make before it stops, above the exact threshold.
 *
 * 2-opt converges in far fewer than this on real stop counts — the cap exists so
 * a pathological matrix (all-equal durations, where every swap ties and nothing
 * strictly improves) terminates rather than oscillating. A cap that is hit is a
 * suggestion that is merely good rather than best, which is the correct failure
 * for something a human is about to approve or reject.
 */
export const OPTIMISATION_TWO_OPT_MAX_PASSES = 50;

/**
 * Minutes charged per soft-window inversion in the objective.
 *
 * Spec Section 9: *"firm windows are hard, soft windows are penalties."* A soft
 * window that ends up out of order is not illegal — it is a stop the customer
 * would rather have had earlier — so it is priced instead of forbidden. 30
 * minutes is roughly what a wasted arrival costs when a dock is not ready:
 * enough that the optimiser will not trade a customer's stated preference for
 * a two-minute drive saving, small enough that a genuinely large routing win
 * still overrides it.
 *
 * **Charged to the objective only, never to the reported saving.** The line a
 * dispatcher reads says real miles and real minutes; a penalty is how the
 * solver chose, not something anyone drives.
 */
export const OPTIMISATION_SOFT_WINDOW_PENALTY_MINUTES = 30;

// ---------------------------------------------------------------------------
// The matrix cache
// ---------------------------------------------------------------------------

/**
 * How long a cached distance matrix stays usable.
 *
 * Spec Section 9: *"Cache the matrix per ordered facility set"*, so that an
 * unchanged template does not re-bill daily. 24 hours because roads do not move
 * and a template's facility set does not either — the cache is invalidated by
 * the SET CHANGING, which is structural (a different set is a different key),
 * not by time. The TTL is only a backstop against a matrix that went stale for a
 * reason the key cannot see, such as a facility being re-geocoded.
 */
export const MATRIX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How long a matrix row in `route_matrix_cache` (L2) stays usable.
 *
 * **30 days, and it is deliberately a DIFFERENT number from the 24-hour L1 TTL
 * above.** Copying that value here would quietly defeat the feature, so the
 * difference is the point rather than an oversight:
 *
 *  - *L1's 24 hours is a backstop inside ONE PROCESS'S LIFETIME*, and a serverless
 *    process rarely lives long enough to reach it. It costs nothing because the
 *    whole cache dies with the process anyway.
 *  - *L2's entire purpose is to survive a deploy, a cold start and a second
 *    instance.* A template that runs weekly rather than daily would miss on every
 *    single run under a 24-hour ceiling — which is precisely the "optimise once,
 *    reuse daily" case Section 9 asks for, and precisely the case an in-process
 *    cache could never serve.
 *
 * There is a ceiling at all for the one thing the structural key cannot see: a
 * facility that gets **re-geocoded**. The key is the sorted id list, and an id
 * whose coordinates were corrected is the same id, so nothing about the key
 * changes and the stale matrix would otherwise be served forever. Time is the
 * only thing that retires it. 30 days bounds how long a corrected geocode can be
 * masked while still letting a daily or weekly set hit indefinitely.
 *
 * Because a HIT deliberately does not refresh `computed_at` (that would be a
 * write on a read path — see `optimisation-matrix.ts`), a set is recomputed once
 * every 30 days and no more, rather than being kept alive by its own popularity.
 *
 * **Known gap, recorded rather than built:** re-geocoding a facility should
 * ideally delete that org's cache rows naming it. No such hook exists.
 */
export const MATRIX_L2_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Most matrices held at once **in L1**.
 *
 * A bound rather than a tuning: the in-process layer lives in the server's own
 * memory, so it must not be able to grow without limit on a long-lived process.
 * 200 matrices of a dozen stops each is a few hundred kilobytes.
 *
 * Says nothing about L2. `route_matrix_cache` is a table with one row per
 * `(org_id, facility_key)` pair; it is bounded by how many distinct facility sets
 * a tenant actually optimises, not by anything here.
 */
export const MATRIX_CACHE_MAX_ENTRIES = 200;

/**
 * Most facilities in one matrix request.
 *
 * The routing engine's table service is quadratic in the coordinate count and
 * the public host caps it. 25 stops is far beyond any real trip and keeps a
 * single request small; past it, no suggestion is offered rather than a slow one.
 */
export const MATRIX_MAX_POINTS = 25;
