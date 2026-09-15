import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'src/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      // Component tests render to static markup with react-dom/server, so they
      // need no DOM — but they do need the .tsx extension to be collected.
      'src/**/__tests__/**/*.test.tsx',
    ],
    /**
     * quick-608 — takes PRODUCTION away from every collected file, in every
     * worker, before any of them runs.
     *
     * This entry is the mechanism that makes the refusal impossible to omit: a
     * new real-database suite written next month is covered because the RUNNER
     * applies this, not because the suite remembered to import anything.
     * `tests/security/real-db-census.test.ts` asserts this line is still here.
     *
     * See docs/audits/production-test-writes.md.
     */
    setupFiles: ['./tests/setup/production-db-guard.ts'],
    testTimeout: 30000, // DB operations can be slow
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
