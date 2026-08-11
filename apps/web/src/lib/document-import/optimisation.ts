/**
 * Route optimisation — the PURE half. Spec Section 9, Part B.
 *
 * No Prisma, no network, no clock. Given a distance matrix and a list of stops
 * it returns a *suggestion*: a better order, what it saves, and whether that is
 * enough to be worth showing. `optimisation-matrix.ts` fetches and caches the
 * matrix; `optimisation-service.ts` assembles the inputs and owns the one write.
 *
 * ---------------------------------------------------------------------------
 * A SUGGESTION, NEVER A MUTATION
 * ---------------------------------------------------------------------------
 * Spec Section 9, and it is the governing constraint of the whole of Part B:
 * *"Optimisation is a suggestion, never a mutation."* Sequence is the source of
 * truth and a human sets it. Nothing in this file writes, and the one function
 * that produces an order returns it as data for a person to accept — the accept
 * path is Phase 5's existing reorder endpoint, unchanged, because a reorder a
 * dispatcher approved and a reorder they dragged are the same event and should
 * take the same code.
 *
 * That is also why the output is shaped as a permutation in exactly the form
 * `reorderConsignments` already takes (`order[newPosition] = oldIndex`): had it
 * been anything else, some adapter would have had to translate, and an adapter
 * between an optimiser and a stop list is where a stop goes missing.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS AND IS NOT ON THE RUN
 * ---------------------------------------------------------------------------
 * The caller excludes skipped stops and template-inserted ghosts, the same way
 * quick-517 and quick-518 exclude them from template scoring, and for the same
 * reason: a stop nobody is driving to must not pull the running order toward it.
 * Unresolved stops are treated differently from BOTH — an unresolved stop is on
 * today's run with an unknown location, so there is no leg that can be costed
 * and no suggestion is offered at all. (quick-517 keeps unresolved stops in the
 * SCORER as synthetic members precisely because dropping them inflates a score.
 * Here the honest answer is not a synthetic member but silence: an optimiser
 * that quietly optimised the half of the trip it could see would reorder a
 * dispatcher's stops around a gap.)
 */

import {
  OPTIMISATION_EXACT_MAX_STOPS,
  OPTIMISATION_MIN_SAVED_MILES,
  OPTIMISATION_MIN_SAVED_MINUTES,
  OPTIMISATION_MIN_STOPS,
  OPTIMISATION_SOFT_WINDOW_PENALTY_MINUTES,
  OPTIMISATION_TWO_OPT_MAX_PASSES,
} from './optimisation-constants';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** An N×N road matrix over a set of facilities. Index i is `ids[i]`. */
export interface DistanceMatrix {
  ids: string[];
  miles: number[][];
  minutes: number[][];
}

export interface OptimisableStop {
  /** Position in the full consignment array. Carried through untouched. */
  position: number;
  facilityId: string;
  /** `pickup` / `delivery` / … or null when nobody has said (Phase 5). */
  stopType: string | null;
  /**
   * Normalised reference values (BOL, shipment, order …) that link a pickup to
   * the deliveries it feeds. See `precedencePairs`.
   */
  referenceKeys: string[];
  /** Appointment start as epoch milliseconds, or null. */
  appointmentStartMs: number | null;
  /** Section 9: firm windows are hard, soft ones are penalties. */
  appointmentIsFirm: boolean;
}

export interface OptimisationInput {
  /** The stops that are actually being driven, in the CURRENT running order. */
  stops: OptimisableStop[];
  matrix: DistanceMatrix;
  /**
   * Where the truck starts, when that is known.
   *
   * Set for a closed loop — Section 9's diagram is `yard -> o -> o -> o -> yard`
   * — which is the shape `HOME_BASE` and `RETURN_TO_ORIGIN` produce. Null for an
   * open route (`DESIGNATED_PARKING`, `DRIVER_RESIDENCE`, `NONE`), where the
   * first leg genuinely has no cost anyone can state, and pretending otherwise
   * would let an invented origin decide the order.
   */
  startFacilityId: string | null;
  /**
   * The end stop's facility, or null.
   *
   * A FIXED TERMINAL NODE, never a member of `stops`. That is what "end stop
   * pinned last" means arithmetically: it contributes the return leg to every
   * candidate order's cost — so the suggestion accounts for getting home, which
   * is the entire point of Part A — and no permutation can move it, because it
   * was never in the array being permuted.
   */
  endFacilityId: string | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type OptimisationDeclineReason =
  /** Fewer movable stops than there is any point reordering. */
  | 'NOT_ENOUGH_STOPS'
  /** At least one stop has no facility, so at least one leg cannot be costed. */
  | 'UNRESOLVED_STOPS'
  /** The routing engine gave nothing usable. */
  | 'NO_MATRIX'
  /** The current order is already the best feasible one. */
  | 'ALREADY_BEST'
  /** There is a better order, but the saving is below the floor. */
  | 'BELOW_FLOOR';

export interface OptimisationSuggestion {
  /** True only when there is something worth a dispatcher's attention. */
  offered: boolean;
  declineReason: OptimisationDeclineReason | null;

  /**
   * The suggested order of the MOVABLE stops, as positions in the full array:
   * `movedOrder[newSlot] = position`. Empty when nothing is offered.
   *
   * Positions rather than ids, because the accept path is a permutation of the
   * consignment array and the caller splices these into the slots the movable
   * stops already occupy — leaving skipped stops and ghosts exactly where they
   * are. Moving a row nobody asked about would be a second, unrequested change
   * riding along with the one that was approved.
   */
  movedOrder: number[];

  currentMiles: number;
  currentMinutes: number;
  suggestedMiles: number;
  suggestedMinutes: number;
  /** Always the REAL difference — never net of the soft-window penalty. */
  savedMiles: number;
  savedMinutes: number;

  /** Both floors, so a UI can explain the silence without restating a number. */
  floors: { miles: number; minutes: number };
}

const emptySuggestion = (reason: OptimisationDeclineReason): OptimisationSuggestion => ({
  offered: false,
  declineReason: reason,
  movedOrder: [],
  currentMiles: 0,
  currentMinutes: 0,
  suggestedMiles: 0,
  suggestedMinutes: 0,
  savedMiles: 0,
  savedMinutes: 0,
  floors: { miles: OPTIMISATION_MIN_SAVED_MILES, minutes: OPTIMISATION_MIN_SAVED_MINUTES },
});

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

/**
 * Ordered pairs `[before, after]` over indexes into the movable-stop array.
 *
 * Two rules, and the fallback in the second is the one worth reading:
 *
 *  1. **A pickup precedes the deliveries it feeds.** Section 9 states it as a
 *     hard constraint. Freight that has not been collected cannot be delivered,
 *     so this is physics rather than preference.
 *  2. **Which deliveries does a given pickup feed?** The import has no load
 *     table yet — loads are created at commit (Phase 8) — so the only link
 *     available is a shared reference value: the same BOL, shipment or order
 *     number printed on both. Where such a link exists it is used exactly. Where
 *     a pickup shares no reference with any delivery, it is constrained against
 *     **every** delivery.
 *
 * The fallback is deliberately the strict direction. A run whose paperwork does
 * not link its stops is a run where we cannot tell which delivery depends on
 * which pickup — and the two readings are "assume none of them do", which lets
 * the optimiser propose delivering before collecting, and "assume all of them
 * do", which at worst declines to propose a reorder that was legal. One of those
 * failures is a suggestion a dispatcher will laugh at and stop trusting; the
 * other is a suggestion that never appears.
 */
export function precedencePairs(stops: readonly OptimisableStop[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];

  const pickups: number[] = [];
  const deliveries: number[] = [];
  stops.forEach((stop, i) => {
    if (stop.stopType === 'pickup') pickups.push(i);
    else if (stop.stopType === 'delivery') deliveries.push(i);
  });

  for (const p of pickups) {
    const keys = new Set(stops[p].referenceKeys);
    const linked = keys.size
      ? deliveries.filter((d) => stops[d].referenceKeys.some((k) => keys.has(k)))
      : [];

    const targets = linked.length > 0 ? linked : deliveries;
    for (const d of targets) pairs.push([p, d]);
  }

  // ---- Firm appointment windows, as ordering ------------------------------
  // Section 9: "firm appointment windows are hard". They are enforced here as an
  // ORDER rather than as arrival times, and that is the strongest true statement
  // available: the trip's departure time does not exist yet — it is chosen on
  // Phase 8's finish screen — so no candidate order can be checked against a
  // clock. What CAN be checked without a departure time is that two firm windows
  // are visited in the order they open, which is necessary for feasibility
  // whatever time the truck leaves. Inventing a departure time to check absolute
  // arrivals would make the suggestion depend on a number nobody supplied.
  const firm = stops
    .map((stop, i) => ({ i, at: stop.appointmentStartMs }))
    .filter((s): s is { i: number; at: number } => s.at !== null && stops[s.i].appointmentIsFirm)
    .sort((a, b) => a.at - b.at);

  for (let a = 0; a < firm.length; a++) {
    for (let b = a + 1; b < firm.length; b++) {
      if (firm[a].at < firm[b].at) pairs.push([firm[a].i, firm[b].i]);
    }
  }

  return pairs;
}

/** Does this order respect every `[before, after]` pair? */
export function respectsPrecedence(
  order: readonly number[],
  pairs: ReadonlyArray<[number, number]>,
): boolean {
  const slot = new Map<number, number>();
  order.forEach((stopIndex, position) => slot.set(stopIndex, position));
  for (const [before, after] of pairs) {
    const a = slot.get(before);
    const b = slot.get(after);
    if (a === undefined || b === undefined) continue;
    if (a > b) return false;
  }
  return true;
}

/**
 * Soft-window inversions: pairs visited in the opposite order to the one the
 * customer asked for.
 *
 * Counted, not forbidden. A soft window is a preference, and Section 9 prices
 * preferences rather than enforcing them.
 */
export function softWindowInversions(
  order: readonly number[],
  stops: readonly OptimisableStop[],
): number {
  let inversions = 0;
  for (let a = 0; a < order.length; a++) {
    for (let b = a + 1; b < order.length; b++) {
      const first = stops[order[a]];
      const second = stops[order[b]];
      if (first.appointmentIsFirm || second.appointmentIsFirm) continue;
      if (first.appointmentStartMs === null || second.appointmentStartMs === null) continue;
      if (first.appointmentStartMs > second.appointmentStartMs) inversions++;
    }
  }
  return inversions;
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface OrderCost {
  miles: number;
  minutes: number;
  /** What the solver minimises: minutes plus the soft-window penalty. */
  objective: number;
}

/**
 * What one order costs.
 *
 * `start -> s0 -> s1 -> … -> sN -> end`, with the first and last legs present
 * only when there is a start and an end facility. The end leg is why a
 * suggestion can honestly say "saves 18 miles": without it, an order that
 * finishes far from the yard looks cheap right up until the truck has to drive
 * home, which is Section 9's left-hand diagram exactly.
 */
export function costOrder(
  order: readonly number[],
  stops: readonly OptimisableStop[],
  matrix: DistanceMatrix,
  startFacilityId: string | null,
  endFacilityId: string | null,
): OrderCost | null {
  const indexOf = new Map<string, number>();
  matrix.ids.forEach((id, i) => indexOf.set(id, i));

  const leg = (fromFacility: string, toFacility: string): { miles: number; minutes: number } | null => {
    const i = indexOf.get(fromFacility);
    const j = indexOf.get(toFacility);
    if (i === undefined || j === undefined) return null;
    const miles = matrix.miles[i]?.[j];
    const minutes = matrix.minutes[i]?.[j];
    if (typeof miles !== 'number' || typeof minutes !== 'number') return null;
    return { miles, minutes };
  };

  let miles = 0;
  let minutes = 0;

  let previous = startFacilityId;
  for (const stopIndex of order) {
    const facility = stops[stopIndex].facilityId;
    if (previous) {
      const l = leg(previous, facility);
      if (!l) return null;
      miles += l.miles;
      minutes += l.minutes;
    }
    previous = facility;
  }

  if (endFacilityId && previous) {
    const l = leg(previous, endFacilityId);
    if (!l) return null;
    miles += l.miles;
    minutes += l.minutes;
  }

  const penalty = softWindowInversions(order, stops) * OPTIMISATION_SOFT_WINDOW_PENALTY_MINUTES;
  return { miles, minutes, objective: minutes + penalty };
}

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

/** Every permutation of `0..n-1` that respects the precedence pairs. */
function* feasibleOrders(n: number, pairs: ReadonlyArray<[number, number]>): Generator<number[]> {
  const current: number[] = [];
  const used = new Array<boolean>(n).fill(false);

  // Prune as we build: a partial order that already violates a pair cannot be
  // repaired by anything appended to it, so whole subtrees are skipped rather
  // than enumerated and rejected. This is what keeps n=8 cheap on a run with
  // real pickup/delivery structure.
  const blockedBy = new Map<number, number[]>();
  for (const [before, after] of pairs) {
    const list = blockedBy.get(after) ?? [];
    list.push(before);
    blockedBy.set(after, list);
  }

  function* step(): Generator<number[]> {
    if (current.length === n) {
      yield [...current];
      return;
    }
    for (let candidate = 0; candidate < n; candidate++) {
      if (used[candidate]) continue;
      const prerequisites = blockedBy.get(candidate);
      if (prerequisites && prerequisites.some((p) => !used[p])) continue;
      used[candidate] = true;
      current.push(candidate);
      yield* step();
      current.pop();
      used[candidate] = false;
    }
  }

  yield* step();
}

/**
 * Best order, exactly, by enumeration. Used at or below
 * `OPTIMISATION_EXACT_MAX_STOPS`.
 */
function solveExact(
  stops: readonly OptimisableStop[],
  matrix: DistanceMatrix,
  pairs: ReadonlyArray<[number, number]>,
  startFacilityId: string | null,
  endFacilityId: string | null,
): { order: number[]; cost: OrderCost } | null {
  let best: { order: number[]; cost: OrderCost } | null = null;

  for (const order of feasibleOrders(stops.length, pairs)) {
    const cost = costOrder(order, stops, matrix, startFacilityId, endFacilityId);
    if (!cost) return null;
    if (!best || cost.objective < best.cost.objective) best = { order, cost };
  }

  return best;
}

/**
 * Nearest-neighbour seed, then 2-opt, keeping every intermediate order feasible.
 * Used above the exact threshold.
 *
 * Not globally optimal, and that is acceptable here in a way it would not be in
 * a dispatch engine: the output is a suggestion a human accepts or declines, and
 * the floor means a merely-good answer either clears a bar worth showing or is
 * not shown. A suboptimal suggestion costs a dispatcher nothing; a wrong one
 * costs their trust, which is why feasibility is checked on every swap rather
 * than repaired afterwards.
 */
function solveHeuristic(
  stops: readonly OptimisableStop[],
  matrix: DistanceMatrix,
  pairs: ReadonlyArray<[number, number]>,
  startFacilityId: string | null,
  endFacilityId: string | null,
  currentOrder: readonly number[],
): { order: number[]; cost: OrderCost } | null {
  const n = stops.length;

  // ---- Seed: nearest neighbour, honouring precedence ----------------------
  const indexOf = new Map<string, number>();
  matrix.ids.forEach((id, i) => indexOf.set(id, i));

  const blockedBy = new Map<number, number[]>();
  for (const [before, after] of pairs) {
    const list = blockedBy.get(after) ?? [];
    list.push(before);
    blockedBy.set(after, list);
  }

  const used = new Array<boolean>(n).fill(false);
  const seed: number[] = [];
  let previousFacility = startFacilityId;

  for (let step = 0; step < n; step++) {
    let bestCandidate = -1;
    let bestMinutes = Infinity;

    for (let candidate = 0; candidate < n; candidate++) {
      if (used[candidate]) continue;
      const prerequisites = blockedBy.get(candidate);
      if (prerequisites && prerequisites.some((p) => !used[p])) continue;

      let minutes = 0;
      if (previousFacility) {
        const i = indexOf.get(previousFacility);
        const j = indexOf.get(stops[candidate].facilityId);
        if (i === undefined || j === undefined) return null;
        minutes = matrix.minutes[i]?.[j] ?? Infinity;
      }
      if (minutes < bestMinutes) {
        bestMinutes = minutes;
        bestCandidate = candidate;
      }
    }

    // No admissible candidate means the precedence pairs contradict each other
    // (a cycle). Give up rather than emit something that violates one.
    if (bestCandidate < 0) return null;
    used[bestCandidate] = true;
    seed.push(bestCandidate);
    previousFacility = stops[bestCandidate].facilityId;
  }

  let best = seed;
  let bestCost = costOrder(best, stops, matrix, startFacilityId, endFacilityId);
  if (!bestCost) return null;

  // The current order is a legitimate starting point too, and if it is already
  // better than the greedy seed we improve from there instead — otherwise a
  // heuristic could "improve" a hand-tuned order into something worse and then
  // offer it.
  const currentCost = costOrder(currentOrder, stops, matrix, startFacilityId, endFacilityId);
  if (currentCost && currentCost.objective < bestCost.objective && respectsPrecedence(currentOrder, pairs)) {
    best = [...currentOrder];
    bestCost = currentCost;
  }

  // ---- 2-opt: reverse a segment while it keeps improving ------------------
  for (let pass = 0; pass < OPTIMISATION_TWO_OPT_MAX_PASSES; pass++) {
    let improved = false;

    for (let a = 0; a < n - 1; a++) {
      for (let b = a + 1; b < n; b++) {
        const candidate = [...best.slice(0, a), ...best.slice(a, b + 1).reverse(), ...best.slice(b + 1)];
        if (!respectsPrecedence(candidate, pairs)) continue;
        const cost = costOrder(candidate, stops, matrix, startFacilityId, endFacilityId);
        if (!cost) continue;
        if (cost.objective < bestCost.objective - 1e-9) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return { order: best, cost: bestCost };
}

// ---------------------------------------------------------------------------
// The suggestion
// ---------------------------------------------------------------------------

/** Rounded the way both surfaces must round it — once, here, on the server. */
const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * The whole of Part B, as one call.
 *
 * Returns `offered: false` with a reason far more often than it returns a
 * suggestion, and that is the design: Section 9 says *"below a configurable
 * floor, do not offer it at all — noise erodes trust."* The reason is on the
 * payload for logging and for the template screen's "already the best order"
 * line, not so a UI can decide for itself whether to show something.
 */
export function buildOptimisationSuggestion(input: OptimisationInput): OptimisationSuggestion {
  const { stops, matrix, startFacilityId, endFacilityId } = input;

  if (stops.length < OPTIMISATION_MIN_STOPS) return emptySuggestion('NOT_ENOUGH_STOPS');
  if (stops.some((s) => !s.facilityId)) return emptySuggestion('UNRESOLVED_STOPS');
  if (!matrix.ids.length || !matrix.miles.length) return emptySuggestion('NO_MATRIX');

  const currentOrder = stops.map((_, i) => i);
  const currentCost = costOrder(currentOrder, stops, matrix, startFacilityId, endFacilityId);
  if (!currentCost) return emptySuggestion('NO_MATRIX');

  const pairs = precedencePairs(stops);

  const solved =
    stops.length <= OPTIMISATION_EXACT_MAX_STOPS
      ? solveExact(stops, matrix, pairs, startFacilityId, endFacilityId)
      : solveHeuristic(stops, matrix, pairs, startFacilityId, endFacilityId, currentOrder);

  if (!solved) return emptySuggestion('NO_MATRIX');

  const savedMiles = currentCost.miles - solved.cost.miles;
  const savedMinutes = currentCost.minutes - solved.cost.minutes;

  const base = {
    movedOrder: solved.order.map((i) => stops[i].position),
    currentMiles: round(currentCost.miles),
    currentMinutes: round(currentCost.minutes),
    suggestedMiles: round(solved.cost.miles),
    suggestedMinutes: round(solved.cost.minutes),
    savedMiles: round(savedMiles),
    savedMinutes: round(savedMinutes),
    floors: { miles: OPTIMISATION_MIN_SAVED_MILES, minutes: OPTIMISATION_MIN_SAVED_MINUTES },
  };

  const sameOrder = solved.order.every((stopIndex, position) => stopIndex === position);
  if (sameOrder) return { ...base, offered: false, declineReason: 'ALREADY_BEST', movedOrder: [] };

  // OR, not AND. Two orders can cover near-identical distance and differ sharply
  // in time — see the reasoning on the two constants. Requiring both floors
  // would suppress "same miles, half an hour earlier", which is the suggestion
  // with the clearest justification there is.
  const clearsFloor =
    base.savedMiles >= OPTIMISATION_MIN_SAVED_MILES ||
    base.savedMinutes >= OPTIMISATION_MIN_SAVED_MINUTES;

  if (!clearsFloor) return { ...base, offered: false, declineReason: 'BELOW_FLOOR', movedOrder: [] };

  return { ...base, offered: true, declineReason: null };
}

/**
 * Have stops been added or removed relative to the template this run came from?
 *
 * Spec Section 9: *"Runs on the **template** when created or edited — optimise
 * once, reuse daily. Runs on a **trip** only when stops changed relative to the
 * template."* This is that gate.
 *
 * A MULTISET comparison, not a set one: a template with two stops at the same
 * cross-dock and a run with one is a run that changed, and a plain `Set` would
 * call those equal. Order is deliberately ignored — a reorder is not an addition
 * or a removal, and a template's own order is the one the optimiser already
 * blessed when the template was saved. Re-offering on a reorder would mean
 * arguing with a dispatcher who had just moved a stop by hand.
 */
export function stopSetChanged(
  templateFacilityIds: readonly string[],
  runFacilityIds: readonly string[],
): boolean {
  if (templateFacilityIds.length !== runFacilityIds.length) return true;

  const counts = new Map<string, number>();
  for (const id of templateFacilityIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of runFacilityIds) {
    const remaining = counts.get(id);
    if (!remaining) return true;
    counts.set(id, remaining - 1);
  }
  return [...counts.values()].some((n) => n !== 0);
}

// ---------------------------------------------------------------------------
// Splicing an accepted suggestion back into the full stop list
// ---------------------------------------------------------------------------

/**
 * Turn a suggested order over the movable stops into a permutation of the WHOLE
 * consignment array, in the form `reorderConsignments` takes.
 *
 * Excluded rows — skipped stops, template-inserted ghosts — keep the exact
 * positions they had. Only the slots the movable stops already occupied are
 * refilled, in the suggested order. Sweeping the excluded rows to the end would
 * be a second change riding along with the one the dispatcher approved, and they
 * approved a driving order, not a tidy-up.
 *
 * Throws nothing: a `movedOrder` that is not a permutation of the movable
 * positions returns null, and the caller answers 400. The reorder endpoint
 * validates again on the way in (`assertPermutation`), so this is the first of
 * two independent checks rather than the only one.
 */
export function spliceSuggestedOrder(
  totalStops: number,
  movablePositions: readonly number[],
  movedOrder: readonly number[],
): number[] | null {
  if (movedOrder.length !== movablePositions.length) return null;

  const movable = new Set(movablePositions);
  if (movable.size !== movablePositions.length) return null;
  if (!movedOrder.every((p) => movable.has(p))) return null;
  if (new Set(movedOrder).size !== movedOrder.length) return null;

  // Slots are taken in ascending position order so the movable stops land in the
  // gaps they already occupied, whatever order they were listed in.
  const slots = [...movablePositions].sort((a, b) => a - b);

  const result: number[] = [];
  let next = 0;
  for (let position = 0; position < totalStops; position++) {
    if (movable.has(position)) {
      result.push(movedOrder[next]);
      next++;
    } else {
      result.push(position);
    }
  }

  // Defensive: every slot must have been filled exactly once.
  if (next !== slots.length) return null;
  return result;
}
