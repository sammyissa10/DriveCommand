/**
 * The distance matrix, and its cache. Spec Section 9: *"Cache the matrix per
 * ordered facility set."*
 *
 * ---------------------------------------------------------------------------
 * WHY THE KEY IS THE SORTED ID LIST
 * ---------------------------------------------------------------------------
 * The matrix is a fact about a SET of facilities — every pairwise leg between
 * them — and is completely independent of the order a trip visits them in. So
 * the key is the facility ids **sorted**, and the matrix rows are built in that
 * same sorted order. Two consequences, both of them the point:
 *
 *  - **An unchanged template hits every day.** Section 9's stated goal. Reorder
 *    the template's stops, re-run the optimiser twice with the order swapped,
 *    ask twice in one morning — same set, same key, one routing call.
 *  - **A changed set cannot hit.** Add a stop, remove one, or re-point one at a
 *    different facility and the sorted list differs, so the key differs, so the
 *    matrix is refetched. Invalidation is structural rather than a hook someone
 *    has to remember to call — which is the only kind that survives.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CACHE IS IN PROCESS
 * ---------------------------------------------------------------------------
 * There is no cache table, and this phase writes no DDL. In-process is therefore
 * the strongest available store, and it is genuinely enough for the stated
 * requirement — a dispatcher optimising a template, tweaking it, and optimising
 * again is one process and one minute. What it does NOT survive is a deploy or a
 * cold start, so the *first* optimisation after either pays for a routing call
 * again. `07-SUMMARY.md` records the small table that would fix it; it is not
 * written here because a migration is not this phase's to write.
 */

import { getOSRMMatrix } from '@/lib/geo/osrm';
import { logger } from '@/lib/logger';

import {
  MATRIX_CACHE_MAX_ENTRIES,
  MATRIX_CACHE_TTL_MS,
  MATRIX_MAX_POINTS,
} from './optimisation-constants';
import type { DistanceMatrix } from './optimisation';

/** A facility that can be a matrix node: it has coordinates. */
export interface MatrixPoint {
  id: string;
  latitude: number;
  longitude: number;
}

interface CacheEntry {
  matrix: DistanceMatrix;
  at: number;
}

const cache = new Map<string, CacheEntry>();

/** The cache key: the facility ids, sorted, joined. Exported for the tests. */
export function matrixCacheKey(facilityIds: readonly string[]): string {
  return [...new Set(facilityIds)].sort().join('>');
}

/** Drop everything. Test seam, and the escape hatch if a geocode is corrected. */
export function clearMatrixCache(): void {
  cache.clear();
}

/** How many matrices are held. Test seam — asserts "the provider was called once". */
export function matrixCacheSize(): number {
  return cache.size;
}

function readCache(key: string, now: number): DistanceMatrix | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now - entry.at > MATRIX_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Re-insert so the eviction below is least-recently-USED rather than
  // least-recently-written: a template optimised every morning should not be
  // evicted by a week of one-off imports.
  cache.delete(key);
  cache.set(key, entry);
  return entry.matrix;
}

function writeCache(key: string, matrix: DistanceMatrix, now: number): void {
  cache.set(key, { matrix, at: now });
  while (cache.size > MATRIX_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * The road matrix over a set of facilities, from cache or from the provider.
 *
 * Returns null rather than throwing, and null means "no suggestion" all the way
 * up. A routing engine that is down, slow, or rate-limited must degrade to the
 * screen simply not offering an optimisation — never to an error a dispatcher
 * has to dismiss, and never to a suggestion computed from partial data.
 *
 * A facility with no coordinates is not an error either: it is a facility nobody
 * geocoded, which is ordinary, and it means this run cannot be costed. The
 * caller reports `UNRESOLVED_STOPS` and says nothing more.
 */
export async function getDistanceMatrix(points: readonly MatrixPoint[]): Promise<DistanceMatrix | null> {
  const unique = new Map<string, MatrixPoint>();
  for (const point of points) {
    if (!point.id) continue;
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
    unique.set(point.id, point);
  }

  const ids = [...unique.keys()].sort();
  if (ids.length < 2) return null;
  if (ids.length > MATRIX_MAX_POINTS) {
    logger.info('[document-import] matrix skipped — too many facilities', { count: ids.length });
    return null;
  }

  const key = matrixCacheKey(ids);
  const now = Date.now();

  const cached = readCache(key, now);
  if (cached) return cached;

  const ordered = ids.map((id) => unique.get(id)!);
  const result = await getOSRMMatrix(ordered.map((p) => ({ lat: p.latitude, lng: p.longitude })));
  if (!result) {
    logger.info('[document-import] matrix unavailable', { facilities: ids.length });
    return null;
  }

  const matrix: DistanceMatrix = { ids, miles: result.miles, minutes: result.minutes };
  writeCache(key, matrix, now);
  return matrix;
}
