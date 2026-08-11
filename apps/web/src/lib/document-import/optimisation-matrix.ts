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
 * L1 IN PROCESS, L2 IN `route_matrix_cache`
 * ---------------------------------------------------------------------------
 * **Read order on every call is L1 → L2 → provider.** Both layers are read from
 * GETs and from mutations alike; reading is not writing, and a suggestion that
 * refused to read a cache on a GET would be a cache that never worked.
 *
 * **Writing is not symmetric, and that asymmetry is the rule this file exists to
 * hold.** A provider compute ALWAYS writes L1, because L1 is this process's own
 * memory and dies with it. It writes L2 **only when the caller passes
 * `persist: true`**, and `persist: true` comes only from the two
 * accept-the-suggestion POSTs (`applyImportOptimisation`,
 * `applyTemplateOptimisation`). Every GET path omits it and defaults to false, so
 * **no view path can write a row** — Section 9's "optimisation is a suggestion,
 * never a mutation", enforced at the layer that would otherwise be tempted.
 *
 * The honest consequence, stated rather than glossed: **a facility set that is
 * only ever VIEWED and never accepted still pays one provider call per cold
 * start, exactly as it did before this table existed.** Making that case free
 * would need either a write from a GET (forbidden) or a background warm job
 * (there is no cron or queue in scope). What L2 buys is the other case, and it is
 * the one Section 9 names: once a dispatcher has **accepted** an order for a
 * facility set, that set is free forever after — across deploys, cold starts and
 * instances — which is what "optimise once, reuse daily" actually requires.
 *
 * A cache HIT never writes anything, in either layer's store. `computed_at`
 * therefore means "when the provider was asked", the L2 TTL is measured from a
 * real event, and a popular set is recomputed on a fixed cadence rather than
 * being kept alive by being read.
 *
 * L2 **degrades, never throws**. A read or a write that fails is logged and
 * treated as a miss or a no-op. The matrix is a suggestion; an unreachable cache
 * table must never become an error a dispatcher has to dismiss.
 */

import type { PrismaClient } from '@/generated/prisma';
import { getOSRMMatrix } from '@/lib/geo/osrm';
import { logger } from '@/lib/logger';

import {
  MATRIX_CACHE_MAX_ENTRIES,
  MATRIX_CACHE_TTL_MS,
  MATRIX_L2_CACHE_TTL_MS,
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

// ---------------------------------------------------------------------------
// L2 — `route_matrix_cache`
// ---------------------------------------------------------------------------

export interface MatrixStoreRow {
  miles: number[][];
  minutes: number[][];
  /** When the PROVIDER was asked. Never refreshed by a read — see the header. */
  computedAt: Date;
}

/**
 * The L2 seam.
 *
 * An interface rather than a direct Prisma call so the layering can be tested
 * without a database. CLAUDE.md's rule still stands and is worth restating: a
 * faked DB in a unit test is not evidence about SQL. The fake proves the
 * **layering** — read order, the persist gate, the TTL boundary, that a hit does
 * not write — and the column names were verified against `information_schema` on
 * production, not inferred from their neighbours.
 */
export interface MatrixStore {
  read(orgId: string, key: string): Promise<MatrixStoreRow | null>;
  write(orgId: string, key: string, row: { miles: number[][]; minutes: number[][] }): Promise<void>;
}

/**
 * The real store. Both methods swallow their own failures: a miss and a no-op
 * are correct degradations, an exception is not.
 */
export function prismaMatrixStore(db: PrismaClient): MatrixStore {
  return {
    async read(orgId, key) {
      try {
        const row = await db.routeMatrixCache.findFirst({
          where: { orgId, facilityKey: key },
          select: { miles: true, minutes: true, computedAt: true },
        });
        if (!row) return null;
        return {
          miles: row.miles as unknown as number[][],
          minutes: row.minutes as unknown as number[][],
          computedAt: row.computedAt,
        };
      } catch (error) {
        logger.warn('[document-import] matrix cache read failed', { error });
        return null;
      }
    },
    async write(orgId, key, row) {
      try {
        await db.routeMatrixCache.upsert({
          // The unique pair is `(org_id, facility_key)`; the generated compound
          // input name was read off `src/generated/prisma`, not assumed.
          where: { orgId_facilityKey: { orgId, facilityKey: key } },
          create: {
            orgId,
            facilityKey: key,
            miles: row.miles,
            minutes: row.minutes,
          },
          update: {
            miles: row.miles,
            minutes: row.minutes,
            computedAt: new Date(),
          },
        });
      } catch (error) {
        logger.warn('[document-import] matrix cache write failed', { error });
      }
    },
  };
}

/**
 * A stored jsonb grid, checked rather than cast.
 *
 * jsonb comes back as an untyped JSON value, and a row written by an older or a
 * future version of this code must be a MISS rather than a cast that produces a
 * matrix full of `undefined` and a suggestion computed from it. Anything that is
 * not exactly `size × size` of finite numbers is rejected.
 */
function asMatrixGrid(value: unknown, size: number): number[][] | null {
  if (!Array.isArray(value) || value.length !== size) return null;
  const grid: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== size) return null;
    const cells: number[] = [];
    for (const cell of row) {
      if (typeof cell !== 'number' || !Number.isFinite(cell)) return null;
      cells.push(cell);
    }
    grid.push(cells);
  }
  return grid;
}

/** How the caller reaches L2. Omitted entirely = L1 only, exactly as before. */
export interface MatrixCacheOptions {
  orgId: string;
  store?: MatrixStore | null;
  /**
   * Write the computed matrix to L2. **True only from the two accept-the-
   * suggestion POSTs.** A view path leaves it false and therefore writes nothing.
   */
  persist?: boolean;
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
export async function getDistanceMatrix(
  points: readonly MatrixPoint[],
  options?: MatrixCacheOptions,
): Promise<DistanceMatrix | null> {
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

  // --- L2. Read on every path, including the GETs. Reading is not writing. ---
  const store = options?.store ?? null;
  const orgId = options?.orgId ?? null;
  if (store && orgId) {
    // Guarded HERE as well as inside `prismaMatrixStore`, not instead of it: the
    // seam is an interface, so the failing implementation may be any store at
    // all, and "degrade, never throw" has to hold for the caller's sake rather
    // than depending on one implementation remembering to be polite.
    let row: MatrixStoreRow | null = null;
    try {
      row = await store.read(orgId, key);
    } catch (error) {
      logger.warn('[document-import] matrix cache read failed', { error });
    }
    if (row) {
      const computedAt = row.computedAt instanceof Date ? row.computedAt.getTime() : NaN;
      const miles = asMatrixGrid(row.miles, ids.length);
      const minutes = asMatrixGrid(row.minutes, ids.length);
      const fresh = Number.isFinite(computedAt) && now - computedAt <= MATRIX_L2_CACHE_TTL_MS;
      if (fresh && miles && minutes) {
        // `ids` is already in scope and already sorted — it is what produced the
        // key. Never reconstruct it by splitting the key back apart.
        const matrix: DistanceMatrix = { ids, miles, minutes };
        // Seed L1 with the row's OWN `computedAt`, not `now`: the 24-hour L1
        // backstop is meant to measure age since the provider was asked, and
        // stamping it with `now` would let a month-old matrix look brand new.
        writeCache(key, matrix, computedAt);
        // No write back. A hit does not refresh `computed_at`.
        return matrix;
      }
    }
  }

  const ordered = ids.map((id) => unique.get(id)!);
  const result = await getOSRMMatrix(ordered.map((p) => ({ lat: p.latitude, lng: p.longitude })));
  if (!result) {
    logger.info('[document-import] matrix unavailable', { facilities: ids.length });
    return null;
  }

  const matrix: DistanceMatrix = { ids, miles: result.miles, minutes: result.minutes };
  writeCache(key, matrix, now);
  // L2 only under an explicit `persist`, which only the accept paths pass.
  if (options?.persist === true && store && orgId) {
    try {
      await store.write(orgId, key, { miles: matrix.miles, minutes: matrix.minutes });
    } catch (error) {
      logger.warn('[document-import] matrix cache write failed', { error });
    }
  }
  return matrix;
}
