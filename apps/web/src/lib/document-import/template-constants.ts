/**
 * Every tuned number in route-template matching, in one file.
 *
 * Spec Section 8: *"Both thresholds in one constants file."* The verification for
 * this phase is literally "grep 0.75 and 0.45 — one file", so nothing below may
 * be restated as a literal anywhere else, **tests included**. Import from here.
 *
 * Same construction as `facility-constants.ts` (Phase 4) and for the same reason:
 * a threshold that appears twice is a threshold that will disagree with itself
 * the first time one of the two is tuned.
 */

// ---------------------------------------------------------------------------
// The two thresholds
// ---------------------------------------------------------------------------

/**
 * At or above this, the template collapses into the summary card — one row with
 * a "why", not a list to choose from (spec Sections 8 and 4.2).
 *
 * **0.75, and the spec's own worked example is what fixes it.** Section 8 draws
 * a 7-stop template against an 8-stop import sharing 6 facilities:
 *
 * ```
 *   matched 6, union 8  ->  6/8 = 0.75  ->  collapse
 * ```
 *
 * That picture is the *loosest* case anyone wants collapsed: two stops out of
 * eight differ and the system still says "this is last week's run". One more
 * difference (5/8 = 0.625) is a route that changed enough that a dispatcher
 * should be asked, and the diagram deliberately sits on the boundary rather than
 * comfortably inside it. The comparison is `>=`, so the drawn case collapses.
 *
 * Collapsing is a claim about *which* template, never an instruction to rewrite
 * the stop list: application is a separate, explicit mutation (see
 * `template-service.ts`). Raising this number cannot cause a silent reorder, only
 * make the card ask more often.
 */
export const TEMPLATE_AUTO_APPLY_THRESHOLD = 0.75;

/**
 * Below this, no template is offered at all — the only affordance is
 * "Continue without a template" (spec Section 8).
 *
 * **0.45, and it is a statement about halves.** Jaccard is bounded above by
 * `min(a,b) / max(a,b)`, so a score below 0.45 means the two stop sets cannot
 * overlap on as much as half of the larger one however generously you read them.
 * At that point the honest description is "a different run that happens to visit
 * some of the same buildings", and a ranked list of three of those is worse than
 * no list: it invites a dispatcher to apply an order that was never for today.
 *
 * The gap between the two numbers is where the product actually lives — a real
 * choice, made by a person, with the stop differences shown.
 */
export const TEMPLATE_CANDIDATE_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// The stop-count downweight
// ---------------------------------------------------------------------------

/**
 * How far the stop counts may differ before the score is weighted down.
 *
 * Spec Section 8: *"Weight down when stop counts differ by more than 30
 * percent."* Measured against the LARGER count, so it is symmetric — a 7-stop
 * template against a 10-stop run and a 10-stop template against a 7-stop run are
 * the same fact about the same pair, and a denominator that changed with
 * argument order would make the ranking depend on which side you asked from.
 *
 * The spec's own example sits comfortably inside it: |7 - 8| / 8 = 0.125.
 */
export const TEMPLATE_STOP_COUNT_TOLERANCE = 0.3;

/**
 * What the raw Jaccard is multiplied by once the counts differ by more than the
 * tolerance above.
 *
 * **0.8, and the value is pinned by what it has to be able to do and what it
 * must never do.**
 *
 * *It can never reach the collapse threshold, and that is arithmetic rather than
 * care.* Exceeding the tolerance means `min/max < 0.7`, and Jaccard is bounded
 * by `min/max`, so a downweighted pair scores below 0.7 before the multiplier is
 * applied at all — no factor in `(0,1]` can push it back over 0.75. A template
 * with a materially different number of stops therefore **cannot** auto-collapse,
 * whatever this number is. That property is asserted by a test.
 *
 * *So its only real job is the 0.45 line, and there it has to split two cases:*
 *
 * ```
 *   template 6 stops, today 10, all 6 present   J = 0.60  ->  0.48   OFFER
 *       four new stops on a known run: exactly the "append, badged New" case
 *
 *   template 5 stops, today 10, all 5 present   J = 0.50  ->  0.40   DO NOT
 *       half of today is unaccounted for; that is a different run
 * ```
 *
 * Any factor in `(0.75, 0.9)` separates those two; 0.8 sits in the middle rather
 * than on either edge. Applied as a multiplier rather than a subtraction so it
 * degrades proportionally — a strong match with a count mismatch stays ahead of
 * a weak one, which is what makes the ranked list an ordering rather than a
 * shuffle.
 */
export const TEMPLATE_COUNT_MISMATCH_FACTOR = 0.8;

/**
 * Most candidates shown in the middle band.
 *
 * Spec Section 8: *"show top 3 with stop diffs"*. Three fits on a phone with the
 * diff visible under each; a longer list is a search result, and the whole point
 * of this screen is that the dispatcher is not searching.
 */
export const TEMPLATE_MAX_CANDIDATES = 3;

// ---------------------------------------------------------------------------
// The database's vocabularies — READ FROM `pg_constraint`, NOT INFERRED
// ---------------------------------------------------------------------------

/**
 * Stop types a `route_template_stops` row may hold. **Four, not five.**
 *
 * ```
 * route_template_stops_stop_type_check
 *   CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover'))
 *
 * stops_stop_type_check
 *   CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover','relay_handoff'))
 * ```
 *
 * **`relay_handoff` is legal on `stops` and illegal on `route_template_stops`.**
 * Both constraints were read off production on 2026-08-07 before a line of this
 * phase was written. A dispatcher may set `relay_handoff` on a stop in review
 * (Phase 5 admits all five, correctly, because `stops` does) — and saving that
 * stop list as a template would then be a Postgres 23514 on the one row that
 * carried it.
 *
 * This is DEC-14's lesson in its purest form: two tables, one obviously-related
 * pair of columns, two different vocabularies, and no way to know without asking
 * the database. `stopTypeForTemplate()` in `template-matching.ts` is the guard,
 * and a unit test pins the two lists apart so a future edit cannot quietly
 * unify them.
 */
export const ROUTE_TEMPLATE_STOP_TYPES = ['pickup', 'delivery', 'fuel_stop', 'layover'] as const;
export type RouteTemplateStopType = (typeof ROUTE_TEMPLATE_STOP_TYPES)[number];

/**
 * `route_templates_schedule_type_check` — `fixed_days | frequency | on_call`.
 *
 * A template created from one day's manifest has no recurrence: nobody said this
 * run repeats, and inventing `fixed_days` would put it into the dispatch
 * generator's rotation on the strength of a single document. `on_call` is the
 * one value that claims nothing.
 */
export const ROUTE_TEMPLATE_SCHEDULE_TYPES = ['fixed_days', 'frequency', 'on_call'] as const;
export const TEMPLATE_DEFAULT_SCHEDULE_TYPE = 'on_call';

/**
 * `route_templates_equipment_type_check` —
 * `dry_van | flatbed | reefer | tanker | step_deck | other`.
 *
 * Nothing in the canonical extraction carries an equipment type: a consignee
 * manifest describes freight, not trailers. `other` is therefore the honest
 * default — `dry_van` is the commonest answer and would be right most of the
 * time, which is exactly what makes it dangerous, because a reefer load
 * defaulted to a dry van is a claim nobody checked. A person edits the template
 * once and it is right forever after.
 */
export const ROUTE_TEMPLATE_EQUIPMENT_TYPES = [
  'dry_van',
  'flatbed',
  'reefer',
  'tanker',
  'step_deck',
  'other',
] as const;
export const TEMPLATE_DEFAULT_EQUIPMENT_TYPE = 'other';

/**
 * What a stop with no type set becomes on a saved template.
 *
 * `stopType` is nullish on a consignment and deliberately so (Phase 5: "a
 * default that looks like an answer is how a fuel stop reaches a customer's
 * dock"). `route_template_stops.stop_type` is NOT NULL, so the null has to
 * become something at the boundary. `delivery` is what a consignment on a
 * consignee manifest is — the document's whole subject is where freight goes —
 * and unlike the review screen there is no third state available to represent
 * "nobody said".
 */
export const TEMPLATE_DEFAULT_STOP_TYPE: RouteTemplateStopType = 'delivery';
