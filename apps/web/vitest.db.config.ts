import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * quick-598 — a SEPARATE vitest config for the database-backed RLS isolation
 * suite.
 *
 * `.github/workflows/ci.yml` runs `npx vitest run` with a DUMMY `DATABASE_URL`
 * (`postgresql://ci:ci@localhost:5432/ci`), and `vitest.config.ts` collects
 * `tests/**` and `src/__tests__/**`. A DB-backed suite under either path
 * therefore runs in CI against a database that is not there — which is exactly
 * how `tests/isolation/` came to fail at import on every CI run.
 *
 * `tests-db/` matches NO glob in `vitest.config.ts`. That file is deliberately
 * NOT edited: overriding its `exclude` would silently drop
 * `configDefaults.exclude` (node_modules, dist, .next) and is a worse landmine
 * than the one being avoided.
 *
 *   npm run test:rls-isolation
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests-db/**/*.test.ts'],
    // quick-549: a cold vitest run in apps/web imports for ~82s, and every test
    // here waits on a round trip to a remote Supabase instance.
    testTimeout: 60000,
    hookTimeout: 120000,
    // One file at a time. Each behaviour case opens its own app_user connection
    // to a transaction-mode pooler, and parallel files would compete for
    // backends while asserting on session GUCs.
    fileParallelism: false,
    // Seed the two staging tenants before the run and tear them down after it,
    // so `npm run test:rls-isolation` is self-contained. Without this the suite
    // reports 68 failed / 82 passed on a clean staging — every failure being
    // "tenant A has no rows" — which is indistinguishable at a glance from a
    // real isolation regression. See tests-db/global-setup.ts.
    globalSetup: ['./tests-db/global-setup.ts'],
    /**
     * quick-608 — the same production guard `vitest.config.ts` carries.
     *
     * This suite already refuses the production ref itself (`tests-db/rls-isolation/env.ts`,
     * quick-598), so this is belt AND braces rather than the only control. It is
     * here so that "which vitest config runs a file" is never the thing that
     * decides whether production is reachable — a new file added under
     * `tests-db/` inherits the guard exactly as one under `tests/` does.
     */
    setupFiles: ['./tests/setup/production-db-guard.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
