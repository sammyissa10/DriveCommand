/**
 * Every tuned number in the facility resolution ladder, in one file.
 *
 * Spec Section 7 / Phase 4: "Threshold in a single constants file with a
 * comment explaining the value." The verification for this phase is literally
 * "grep the threshold number — it appears in one file", so nothing below may be
 * restated as a literal anywhere else, tests included. Import from here.
 */

/**
 * The T3 threshold: at or above it a candidate is worth showing to a human; below
 * it, the candidate is not offered at all and the stop falls to T4.
 *
 * **0.70, and here is where it comes from.** The score is a weighted sum of four
 * components (below), so the value is not a feel — it is fixed by two real pairs
 * that must land on opposite sides of it:
 *
 * ```
 *   8900 Indianapolis Blvd  vs  8900 US-41,  Highland IN 46322
 *      street name shares nothing, everything else agrees
 *      -> NUMBER + POSTAL + LOCALITY = 0.40 + 0.20 + 0.15 = 0.75   MUST PROPOSE
 *
 *   2200 S Ashland Ave      vs  2800 S Ashland Ave, Chicago IL 60608
 *      street name identical, house number differs
 *      -> STREET + POSTAL + LOCALITY = 0.25 + 0.20 + 0.15 = 0.60   MUST NOT
 * ```
 *
 * The first is a highway alias for a local street — the same dock under two
 * names, and refusing to offer it costs a dispatcher a full manual create. The
 * second is six blocks away on the same street, and offering it is how a
 * facility table gets poisoned. Any threshold in `(0.60, 0.75]` separates them;
 * 0.70 sits in the middle of that window rather than on either edge.
 *
 * It is a threshold for *proposing*, never for linking. Nothing in this module
 * links on a fuzzy score at any value — T3 requires a human tap, and raising
 * this number cannot make a silent link happen, only make the ladder quieter.
 */
export const FACILITY_FUZZY_THRESHOLD = 0.7;

/**
 * Component weights. They sum to 1, so a score is directly readable as a
 * percentage in the "why" affordance.
 *
 * THE STREET NUMBER OUTWEIGHS THE STREET NAME, which looks backwards until you
 * read it as: given a city and a postcode that already agree, the house number
 * is the thing that says *which building*. A shared street name across
 * different numbers is the commonest near-miss on a real manifest and the one
 * that must not clear the threshold; a differing name across an identical
 * number is usually an alias for the same place. The two pairs in the threshold
 * comment above are exactly that trade, and they are what fixes these values.
 */
export const FACILITY_SCORE_WEIGHTS = {
  /** Token overlap + character similarity over the street name (spec: "name token overlap"). */
  street: 0.25,
  /** Street numbers intersect (spec: "plus street number"). */
  number: 0.4,
  /** Postcodes agree (spec: "plus postal code"). */
  postal: 0.2,
  /** City and state agree. */
  locality: 0.15,
} as const;

/**
 * Conflict penalties, subtracted from the weighted sum.
 *
 * "Unit and directional conflicts scored as strong negatives" is the phase's
 * wording; a state conflict, a PO-box-versus-street conflict and two different
 * numbered streets are the same kind of fact and are penalised the same way.
 * Each of these is a positive statement that the two addresses are different
 * places, not merely an absence of evidence that they are the same — which is
 * why they subtract rather than simply failing to add.
 *
 * Each penalty is large enough to pull a component-perfect 1.0 below the
 * threshold on its own: `3300 N Kimball` and `3300 W Kimball` agree on
 * everything a weighted sum can see, and the directional is the only thing
 * standing between a dispatcher and the wrong dock.
 */
export const FACILITY_SCORE_PENALTIES = {
  /** Two different suite / dock / building designations at one street address. */
  unit: 0.4,
  /** N versus W on a grid city. Miles apart. */
  directional: 0.4,
  /** One side names a directional and the other does not — weak, not a conflict. */
  directionalMissing: 0.05,
  /** Different states are different places, full stop. */
  state: 0.4,
  /** A PO box is not a place freight can be delivered to. */
  poBox: 0.4,
  /** `95th St` versus `93rd St` — a numbered street name IS an identifier. */
  numberedStreet: 0.45,
} as const;

/**
 * What a component scores when one side simply does not have it — no house
 * number printed, no postcode printed.
 *
 * Neither agreement nor conflict: a document that printed no house number is
 * missing evidence, and scoring it as either would be a claim. Half.
 */
export const FACILITY_COMPONENT_UNKNOWN = 0.5;

/** Most T3 candidates offered for one stop. More than this is a list, not a choice. */
export const FACILITY_MAX_CANDIDATES = 3;

/**
 * Facility types, from the live `facilities_facility_type_check` constraint.
 *
 * Spec Section 7 says "consignees to receiver, origin to shipper" and those two
 * values **do not exist in this database** — they were in the original catalog
 * and were deliberately deleted by `20260518000001_tkt0016_align_facility_type_catalog`,
 * whose own comment reads "replaces stale (shipper, receiver, …) with canonical
 * (terminal, yard, warehouse, drop_yard, customer_site)". Writing either one
 * today throws a Postgres 23514. Audit finding B1 and DEC-1 recorded the
 * mapping below instead, and the phase instruction "do not invent new types" is
 * what makes that the right reading: the roles are the spec's, the vocabulary is
 * the database's.
 */
export const FACILITY_TYPE_FOR_ROLE = {
  /** A consignee — where the freight is dropped. The spec's "receiver". */
  consignee: 'customer_site',
  /** The origin block — where the freight is collected. The spec's "shipper". */
  origin: 'warehouse',
} as const;

export type FacilityRole = keyof typeof FACILITY_TYPE_FOR_ROLE;
