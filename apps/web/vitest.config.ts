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
    testTimeout: 30000, // DB operations can be slow
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
