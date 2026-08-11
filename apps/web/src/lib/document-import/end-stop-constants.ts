/**
 * Every vocabulary and tuned value the end-stop policy uses, in one file.
 *
 * Same construction as `facility-constants.ts` (Phase 4) and
 * `template-constants.ts` (Phase 6), and for the same reason: a value restated
 * in a second place is a value that will disagree with itself the first time one
 * of the two is changed. Tests import from here rather than re-typing a literal.
 *
 * ---------------------------------------------------------------------------
 * THE DATABASE'S VOCABULARIES — READ FROM `pg_constraint`, NOT INFERRED
 * ---------------------------------------------------------------------------
 * Read off production on 2026-08-10, before a line of this phase was written.
 * This is DEC-14's standing rule: these columns are plain `text` with CHECK
 * constraints that TypeScript cannot see, so a value that reads perfectly well
 * in English is a Postgres 23514 at write time and nothing catches it earlier.
 *
 * ```
 * Tenant_defaultEndStopPolicy_check
 *   CHECK ("defaultEndStopPolicy" IN
 *     ('RETURN_TO_ORIGIN','HOME_BASE','DESIGNATED_PARKING','DRIVER_RESIDENCE','NONE'))
 *
 * route_templates_end_stop_policy_check
 *   CHECK (end_stop_policy IS NULL OR end_stop_policy IN (…same five…))
 *
 * dispatches_end_stop_policy_check
 *   CHECK (end_stop_policy IS NULL OR end_stop_policy IN (…same five…))
 *
 * facilities_facility_type_check
 *   CHECK (facility_type IN
 *     ('terminal','yard','warehouse','drop_yard','customer_site','driver_residence'))
 *
 * stops_stop_type_check
 *   CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover','relay_handoff'))
 * ```
 *
 * Note the asymmetry the tenant column carries and the other two do not:
 * `Tenant."defaultEndStopPolicy"` is `NOT NULL DEFAULT 'NONE'`, while the
 * template and trip columns are nullable. That is the resolution order encoded
 * in the schema — there is always a tenant answer, and the two layers above it
 * either override it or say nothing.
 */

// ---------------------------------------------------------------------------
// The five policies
// ---------------------------------------------------------------------------

/**
 * Spec Section 9's table, in the order it prints them.
 *
 * | Policy               | Resolves to            |
 * |----------------------|------------------------|
 * | `RETURN_TO_ORIGIN`   | the pickup facility    |
 * | `HOME_BASE`          | the tenant's home base |
 * | `DESIGNATED_PARKING` | per template or trip   |
 * | `DRIVER_RESIDENCE`   | the driver's address   |
 * | `NONE`               | no end stop            |
 */
export const END_STOP_POLICIES = [
  'RETURN_TO_ORIGIN',
  'HOME_BASE',
  'DESIGNATED_PARKING',
  'DRIVER_RESIDENCE',
  'NONE',
] as const;

export type EndStopPolicy = (typeof END_STOP_POLICIES)[number];

/** The tenant column's own default, and therefore the answer when nothing is configured. */
export const END_STOP_DEFAULT_POLICY: EndStopPolicy = 'NONE';

export function isEndStopPolicy(value: unknown): value is EndStopPolicy {
  return typeof value === 'string' && (END_STOP_POLICIES as readonly string[]).includes(value);
}

/** Short labels, so the two surfaces cannot name the same policy differently. */
export const END_STOP_POLICY_LABELS: Record<EndStopPolicy, string> = {
  RETURN_TO_ORIGIN: 'Back to the pickup',
  HOME_BASE: 'Home base',
  DESIGNATED_PARKING: 'Designated parking',
  DRIVER_RESIDENCE: 'Driver’s home',
  NONE: 'No end stop',
};

// ---------------------------------------------------------------------------
// What the end stop becomes on `stops`
// ---------------------------------------------------------------------------

/**
 * The `stop_type` an end stop is written with. **`layover`, and the choice is
 * forced rather than preferred.**
 *
 * `stops_stop_type_check` admits five values and none of them means "return to
 * base" (audit finding B5). Of the five, `layover` is the one that already means
 * "a stop where no freight changes hands", which is exactly what a return leg
 * is; `pickup` and `delivery` would put an end stop into freight rollups, and
 * `fuel_stop` and `relay_handoff` are claims about what happens there that
 * nobody made.
 *
 * The end stop is told apart from a genuine layover by `stops.is_end_stop`, a
 * real boolean column added in Phase 1 — not by its type, and not by its
 * position. Reading "the last row" as "the end stop" would break the first time
 * a dispatcher appended a stop after it.
 */
export const END_STOP_STOP_TYPE = 'layover' as const;

/**
 * The facility type a driver residence carries.
 *
 * **This value already exists in the live CHECK** — it was added by Phase 1
 * alongside `is_driver_residence` and `resident_driver_id`, and it is used here
 * exactly as the constraint spells it. No type is invented and none is added:
 * the audit's B1 finding (that `shipper` and `receiver` were deliberately
 * deleted by TKT-0016 and writing either is a 23514) is the standing warning
 * against reaching for a word that merely sounds right.
 *
 * The other four policies resolve to facilities that already exist with whatever
 * type their tenant gave them — a home base is normally a `terminal`, designated
 * parking is normally a `yard`, and the pickup is whatever the shipper is. This
 * phase never changes a facility's type.
 */
export const DRIVER_RESIDENCE_FACILITY_TYPE = 'driver_residence' as const;

/**
 * Facility types offered when a person is choosing designated parking.
 *
 * Deliberately narrower than the full picker: parking a tractor overnight is a
 * yard or a terminal, and offering `customer_site` here would invite a
 * dispatcher to pin the working day's close to a dock that is locked at 18:00.
 * A tenant that genuinely parks somewhere else can still pick it — this filters
 * the *suggestion* list, not the accepted value, and the accepted value is
 * checked for tenant ownership rather than for type.
 */
export const DESIGNATED_PARKING_FACILITY_TYPES = ['yard', 'terminal', 'drop_yard'] as const;
