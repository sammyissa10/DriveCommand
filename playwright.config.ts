import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.playwright', 'auth.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Limit to 3 workers locally to prevent DB connection pool exhaustion under parallel load.
  // The withTenantRLS extension wraps every query in a transaction; too many parallel tests
  // saturate the Supabase connection pool and cause "Unable to start a transaction" errors.
  workers: process.env.CI ? 1 : 3,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
});
