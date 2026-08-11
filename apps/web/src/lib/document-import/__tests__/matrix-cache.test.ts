/**
 * The two-layer distance-matrix cache (quick-520, spec Section 9).
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE PIN
 * ---------------------------------------------------------------------------
 *  1. **A cold process serves an accepted facility set with no provider call.**
 *     That is the whole point of `route_matrix_cache`: L1 dies with the process,
 *     so before this existed the first optimisation after every deploy paid for
 *     a routing call. The counter on the stubbed provider is the assertion.
 *  2. **`persist: false` writes NOTHING.** The read paths are GETs, and Section
 *     9's "optimisation is a suggestion, never a mutation" has to hold for a
 *     cache row as much as for a stop order. This is that rule made executable.
 *  3. **A hit does not rewrite `computed_at`.** Otherwise the L2 TTL would be
 *     measured from the last READ, a popular set would never be recomputed, and
 *     a read path would be issuing a write to say so.
 *  4. **The key is structural.** Same set in any order and with any duplicates
 *     is one key; a different set is a different key and therefore a miss.
 *     Invalidation nobody has to remember to call.
 *  5. **A failing store is a miss, not an error.** The matrix is a suggestion;
 *     an unreachable cache table must never reach a dispatcher as an error.
 *
 * `MATRIX_L2_CACHE_TTL_MS` is IMPORTED, never restated — `optimisation-constants.ts`
 * opens by forbidding a tuned number from appearing twice, tests included.
 *
 * The store is a fake, and what that does and does not prove is worth being
 * precise about: it proves the LAYERING (read order, the persist gate, the TTL
 * boundary, that a hit does not write). It proves nothing about SQL, per
 * CLAUDE.md — the column names behind `prismaMatrixStore` were verified against
 * `information_schema` on production instead.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MATRIX_L2_CACHE_TTL_MS } from '../optimisation-constants';

const matrixCalls = { count: 0 };

vi.mock('@/lib/geo/osrm', () => ({
  getOSRMMatrix: vi.fn(async (points: { lat: number; lng: number }[]) => {
    matrixCalls.count++;
    const n = points.length;
    const grid = (v: number) =>
      Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : v)));
    return { miles: grid(10), minutes: grid(15) };
  }),
}));

import {
  clearMatrixCache,
  getDistanceMatrix,
  matrixCacheKey,
  matrixCacheSize,
  type MatrixPoint,
  type MatrixStore,
  type MatrixStoreRow,
} from '../optimisation-matrix';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = 'org-1';

const point = (id: string, lat: number, lng: number): MatrixPoint => ({
  id,
  latitude: lat,
  longitude: lng,
});

const POINTS: MatrixPoint[] = [
  point('fac-a', 43.0, -87.9),
  point('fac-b', 41.8, -87.6),
  point('fac-c', 44.9, -93.2),
];

const OTHER_POINTS: MatrixPoint[] = [POINTS[0], POINTS[1], point('fac-z', 39.7, -104.9)];

const grid = (n: number, v: number) =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : v)));

/** An in-memory `MatrixStore` that counts what it was asked to do. */
function fakeStore(seed?: { key: string; row: MatrixStoreRow }) {
  const rows = new Map<string, MatrixStoreRow>();
  if (seed) rows.set(`${ORG}::${seed.key}`, seed.row);
  const counts = { reads: 0, writes: 0 };

  const store: MatrixStore = {
    async read(orgId, key) {
      counts.reads++;
      return rows.get(`${orgId}::${key}`) ?? null;
    },
    async write(orgId, key, row) {
      counts.writes++;
      rows.set(`${orgId}::${key}`, { ...row, computedAt: new Date() });
    },
  };

  return { store, rows, counts };
}

const seededRow = (computedAt: Date): MatrixStoreRow => ({
  // Deliberately DIFFERENT numbers from the stubbed provider's, so a test that
  // claims a hit cannot be satisfied by a fresh compute that happens to match.
  miles: grid(3, 4),
  minutes: grid(3, 7),
  computedAt,
});

beforeEach(() => {
  clearMatrixCache();
  matrixCalls.count = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('the key is a fact about the SET', () => {
  it('ignores order and duplicates, and changes when the set changes', () => {
    const a = matrixCacheKey(['fac-b', 'fac-a', 'fac-c']);
    expect(matrixCacheKey(['fac-a', 'fac-b', 'fac-c'])).toBe(a);
    expect(matrixCacheKey(['fac-a', 'fac-a', 'fac-b', 'fac-c'])).toBe(a);
    expect(matrixCacheKey(['fac-a', 'fac-b', 'fac-z'])).not.toBe(a);
  });
});

describe('L2 read-through', () => {
  it('serves a cold process from the store without calling the provider', async () => {
    const key = matrixCacheKey(POINTS.map((p) => p.id));
    const { store, counts } = fakeStore({ key, row: seededRow(new Date()) });

    const matrix = await getDistanceMatrix(POINTS, { orgId: ORG, store, persist: false });

    expect(matrixCalls.count).toBe(0);
    expect(matrix).not.toBeNull();
    expect(matrix!.ids).toEqual(['fac-a', 'fac-b', 'fac-c']);
    expect(matrix!.miles).toEqual(grid(3, 4));
    expect(matrix!.minutes).toEqual(grid(3, 7));
    // A hit is not a write. `computed_at` is never refreshed by a read.
    expect(counts.writes).toBe(0);
  });

  it('misses when one facility in the set is different, and asks the provider', async () => {
    const key = matrixCacheKey(POINTS.map((p) => p.id));
    const { store } = fakeStore({ key, row: seededRow(new Date()) });

    const matrix = await getDistanceMatrix(OTHER_POINTS, { orgId: ORG, store, persist: false });

    expect(matrixCalls.count).toBe(1);
    expect(matrix!.miles).toEqual(grid(3, 10));
  });

  it('is L1-only, exactly as before, when no options are supplied', async () => {
    await getDistanceMatrix(POINTS);
    await getDistanceMatrix(POINTS);
    expect(matrixCalls.count).toBe(1);
    expect(matrixCacheSize()).toBe(1);
  });
});

describe('the L2 ceiling', () => {
  it('treats a row older than the TTL as a miss and a row inside it as a hit', async () => {
    const now = new Date('2026-08-11T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const key = matrixCacheKey(POINTS.map((p) => p.id));

    const stale = fakeStore({
      key,
      row: seededRow(new Date(now.getTime() - MATRIX_L2_CACHE_TTL_MS - 1000)),
    });
    await getDistanceMatrix(POINTS, { orgId: ORG, store: stale.store, persist: false });
    expect(matrixCalls.count).toBe(1);

    clearMatrixCache();
    matrixCalls.count = 0;

    const fresh = fakeStore({
      key,
      row: seededRow(new Date(now.getTime() - MATRIX_L2_CACHE_TTL_MS + 1000)),
    });
    const matrix = await getDistanceMatrix(POINTS, {
      orgId: ORG,
      store: fresh.store,
      persist: false,
    });
    expect(matrixCalls.count).toBe(0);
    expect(matrix!.miles).toEqual(grid(3, 4));
  });
});

describe('no writes in view paths', () => {
  it('computes and caches in L1 but writes NOTHING to L2 under persist: false', async () => {
    const { store, counts } = fakeStore();

    const matrix = await getDistanceMatrix(POINTS, { orgId: ORG, store, persist: false });

    expect(matrix).not.toBeNull();
    expect(matrixCalls.count).toBe(1);
    expect(counts.writes).toBe(0);
    expect(matrixCacheSize()).toBe(1);
  });

  it('writes exactly one row, keyed on (orgId, matrixCacheKey), under persist: true', async () => {
    const { store, rows, counts } = fakeStore();

    await getDistanceMatrix(POINTS, { orgId: ORG, store, persist: true });

    expect(counts.writes).toBe(1);
    expect(rows.size).toBe(1);
    expect([...rows.keys()]).toEqual([`${ORG}::${matrixCacheKey(POINTS.map((p) => p.id))}`]);
  });
});

describe('a broken cache is a miss, never an error', () => {
  it('falls through to the provider when the store read rejects', async () => {
    const store: MatrixStore = {
      read: async () => {
        throw new Error('relation "route_matrix_cache" does not exist');
      },
      write: async () => {},
    };

    const matrix = await getDistanceMatrix(POINTS, { orgId: ORG, store, persist: false });

    expect(matrix).not.toBeNull();
    expect(matrixCalls.count).toBe(1);
  });

  it('still returns the matrix when the store write rejects', async () => {
    const store: MatrixStore = {
      read: async () => null,
      write: async () => {
        throw new Error('permission denied for table route_matrix_cache');
      },
    };

    const matrix = await getDistanceMatrix(POINTS, { orgId: ORG, store, persist: true });

    expect(matrix).not.toBeNull();
    expect(matrix!.miles).toEqual(grid(3, 10));
  });

  it('treats a stored grid of the wrong shape as a miss rather than casting it', async () => {
    const key = matrixCacheKey(POINTS.map((p) => p.id));
    const { store } = fakeStore({
      key,
      // A 2×2 grid where the set has three members — a row written by an older
      // code version, or by one that stored a different set under this key.
      row: { miles: grid(2, 4), minutes: grid(2, 7), computedAt: new Date() },
    });

    const matrix = await getDistanceMatrix(POINTS, { orgId: ORG, store, persist: false });

    expect(matrixCalls.count).toBe(1);
    expect(matrix!.miles).toEqual(grid(3, 10));
  });
});
