import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Multi-role auth setup for Playwright.
 * Authenticates all 4 roles via the /api/auth/login API endpoint (not UI).
 * Each role saves its session cookies to a separate storageState file.
 *
 * Required environment variables:
 *   TEST_SYSADMIN_EMAIL    - SysAdmin account email (isSystemAdmin=true in DB)
 *   TEST_SYSADMIN_PASSWORD - SysAdmin account password
 *
 * Optional (defaults to demo/test accounts):
 *   TEST_OWNER_EMAIL       - Owner account email (default: demo@drivecommand.com)
 *   TEST_OWNER_PASSWORD    - Owner account password (default: demo1234)
 *   TEST_DRIVER_EMAIL      - Driver account email (default: driver@test.com)
 *   TEST_DRIVER_PASSWORD   - Driver account password (default: driver1234)
 *   TEST_MANAGER_EMAIL     - Manager account email (default: manager@test.com)
 *   TEST_MANAGER_PASSWORD  - Manager account password (default: manager1234)
 *
 * quick-575 — added the MANAGER block (`.playwright/auth/manager.json`) and
 * gave the DRIVER block a default so `my-notifications-reachability.spec.ts`
 * can run without every env var being set by hand. Neither default account is
 * guaranteed to exist in the database this suite points at — if the login
 * returns non-200, the specs that depend on it are written-but-unexecuted, not
 * silently skipped.
 */

const AUTH_DIR = path.join(__dirname, '..', '.playwright', 'auth');

setup.beforeAll(async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

setup('authenticate as owner', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_OWNER_EMAIL ?? 'demo@drivecommand.com',
      password: process.env.TEST_OWNER_PASSWORD ?? 'demo1234',
    },
  });
  expect(res.status()).toBe(200);

  // Save to role-specific path
  await request.storageState({ path: path.join(AUTH_DIR, 'owner.json') });
  // Also write to legacy path so existing specs that reference .playwright/auth.json still work
  await request.storageState({ path: path.join(AUTH_DIR, '..', 'auth.json') });
});

setup('authenticate as sysadmin', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_SYSADMIN_EMAIL!,
      password: process.env.TEST_SYSADMIN_PASSWORD!,
    },
  });
  expect(res.status()).toBe(200);

  await request.storageState({ path: path.join(AUTH_DIR, 'sysadmin.json') });
});

setup('authenticate as driver', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_DRIVER_EMAIL ?? 'driver@test.com',
      password: process.env.TEST_DRIVER_PASSWORD ?? 'driver1234',
    },
  });
  expect(res.status()).toBe(200);

  await request.storageState({ path: path.join(AUTH_DIR, 'driver.json') });
});

setup('authenticate as manager', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_MANAGER_EMAIL ?? 'manager@test.com',
      password: process.env.TEST_MANAGER_PASSWORD ?? 'manager1234',
    },
  });
  expect(res.status()).toBe(200);

  await request.storageState({ path: path.join(AUTH_DIR, 'manager.json') });
});
