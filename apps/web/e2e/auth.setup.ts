import { test as setup, type APIRequestContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { AUTH_STATUS_PATH, type RoleAuthStatus } from './fixtures/auth-helpers';

/**
 * Multi-role auth setup for Playwright.
 * Authenticates all 4 roles via the /api/auth/login API endpoint (not UI).
 * Each role saves its session cookies to a separate storageState file.
 *
 * Required environment variables:
 *   TEST_SYSADMIN_EMAIL    - SysAdmin account email (isSystemAdmin=true in DB)
 *   TEST_SYSADMIN_PASSWORD - SysAdmin account password
 *   Neither is set anywhere (not in .env.local, not in the ambient shell) as
 *   of quick-576 — the sysadmin block below is expected to record
 *   `ok:false, error:'no credentials configured'` on every run until someone
 *   provisions them. That is reported loudly (see the summary block) rather
 *   than thrown, so it costs only the sysadmin specs.
 *
 * Optional (defaults to real QA test accounts):
 *   TEST_OWNER_EMAIL       - Owner account email (default: demo@drivecommand.com)
 *   TEST_OWNER_PASSWORD    - Owner account password (default: demo1234)
 *   TEST_DRIVER_EMAIL      - Driver account email (default: driver@test.com)
 *   TEST_DRIVER_PASSWORD   - Driver account password (default: TestPass123!)
 *   TEST_MANAGER_EMAIL     - Manager account email (default: manager@test.com)
 *   TEST_MANAGER_PASSWORD  - Manager account password (default: TestPass123!)
 *
 * quick-576 — Part A of quick-576 diagnosed the driver/manager 401s reported
 * by quick-575 as a wrong-password bug, not a missing-account bug: all four
 * QA accounts (owner@test.com, driver@test.com, manager@test.com,
 * owner_b@test.com) are healthy in the database this suite points at
 * (project ref oqdhberkghtnszrkdvfm, reached via `.env.local`) — auth row
 * present, email confirmed, not banned, correct app_metadata role/tenantId,
 * matching app User row. quick-183 set their real password to
 * `TestPass123!`; quick-575 invented `driver1234` / `manager1234` as
 * defaults without ever looking the real password up, verified 200 against
 * the Supabase token endpoint for all four accounts with `TestPass123!` and
 * 400 with `driver1234`. The paragraph that used to sit here — "neither
 * default account is guaranteed to exist in the database this suite points
 * at" — was itself false and is corrected above: they exist and are
 * healthy; the defaults were simply the wrong password.
 *
 * quick-576 also restructured all four blocks below so a broken account
 * (wrong password, unset env var, or a real outage) fails only ITS OWN
 * specs. Previously every block called `expect(res.status()).toBe(200)`,
 * which THROWS inside the shared `setup` Playwright project — and because
 * `chromium` and `mobile` both declare `dependencies: ['setup']`, a single
 * role's failure (in practice: the sysadmin block, whose env vars have never
 * been set) marked the whole `setup` project failed and skipped EVERY
 * dependent spec, including specs for roles that authenticated fine. Each
 * block now: resolves its credentials; if credentials are missing entirely,
 * skips the HTTP call rather than POSTing `undefined` and reading a schema
 * 400 as if the account were broken; POSTs and records ok/status/error into
 * `.playwright/auth/status.json` either way; deletes any pre-existing
 * storageState file for that role on failure (a stale `driver.json` from an
 * earlier green run must not let a spec sail past a now-broken account on
 * cookies nobody is re-verifying); and never throws. A trailing summary test
 * reads the manifest and prints one greppable `console.error` line per
 * failed role — loud, not silent, and without taking the project down.
 */

const AUTH_DIR = path.join(__dirname, '..', '.playwright', 'auth');

setup.beforeAll(async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

/** Deletes a stale storageState file so a broken account can't be masked by an old green run. */
function deleteStaleAuthFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Nothing to clean up — file never existed.
  }
}

/**
 * Read-modify-write against the shared status manifest. The four role
 * blocks below run serially (see the `describe.serial` wrapper), so this
 * does not need file locking — but it is written as read-then-write rather
 * than a blind overwrite so a future relaxation of that ordering does not
 * silently lose entries written by a sibling block.
 */
function recordAuthStatus(entry: RoleAuthStatus): void {
  let manifest: Record<string, RoleAuthStatus> = {};
  try {
    manifest = JSON.parse(fs.readFileSync(AUTH_STATUS_PATH, 'utf-8')) as Record<string, RoleAuthStatus>;
  } catch {
    manifest = {};
  }
  manifest[entry.role] = entry;
  fs.writeFileSync(AUTH_STATUS_PATH, JSON.stringify(manifest, null, 2));
}

/**
 * Shared login-and-record logic for one role. Never throws — a failure is
 * recorded into the manifest and the function returns, so the calling
 * `setup(...)` test always reports green and the `setup` Playwright project
 * is never the reason a healthy role's specs get skipped.
 */
async function authenticateRole(
  request: APIRequestContext,
  opts: {
    role: string;
    email: string | undefined;
    password: string | undefined;
    authFilePath: string;
    onSuccess?: () => Promise<void>;
  }
): Promise<void> {
  const { role, email, password, authFilePath } = opts;

  if (!email || !password) {
    recordAuthStatus({
      role,
      email: email ?? null,
      ok: false,
      status: null,
      error: 'no credentials configured',
    });
    deleteStaleAuthFile(authFilePath);
    return;
  }

  const res = await request.post('/api/auth/login', { data: { email, password } });

  if (res.status() !== 200) {
    const body = await res.text().catch(() => '(could not read response body)');
    recordAuthStatus({ role, email, ok: false, status: res.status(), error: body });
    deleteStaleAuthFile(authFilePath);
    return;
  }

  await request.storageState({ path: authFilePath });
  if (opts.onSuccess) {
    await opts.onSuccess();
  }
  recordAuthStatus({ role, email, ok: true, status: res.status(), error: null });
}

// Wrapped in describe.serial so the trailing summary block is GUARANTEED to
// run after all four role blocks even though playwright.config.ts sets
// `fullyParallel: true` globally (which would otherwise let Playwright
// spread same-file tests across workers with no ordering guarantee).
// Verified empirically per the plan: see 576-SUMMARY.md for the captured
// `--project=setup --reporter=list` output showing the summary line last.
setup.describe.serial('multi-role auth setup', () => {
  setup('authenticate as owner', async ({ request }) => {
    await authenticateRole(request, {
      role: 'owner',
      email: process.env.TEST_OWNER_EMAIL ?? 'demo@drivecommand.com',
      password: process.env.TEST_OWNER_PASSWORD ?? 'demo1234',
      authFilePath: path.join(AUTH_DIR, 'owner.json'),
      onSuccess: async () => {
        // Legacy path — see LEGACY_AUTH's comment in fixtures/auth-helpers.ts
        // for why this write currently has zero readers.
        await request.storageState({ path: path.join(AUTH_DIR, '..', 'auth.json') });
      },
    });
  });

  setup('authenticate as sysadmin', async ({ request }) => {
    await authenticateRole(request, {
      role: 'sysadmin',
      email: process.env.TEST_SYSADMIN_EMAIL,
      password: process.env.TEST_SYSADMIN_PASSWORD,
      authFilePath: path.join(AUTH_DIR, 'sysadmin.json'),
    });
  });

  setup('authenticate as driver', async ({ request }) => {
    await authenticateRole(request, {
      role: 'driver',
      email: process.env.TEST_DRIVER_EMAIL ?? 'driver@test.com',
      password: process.env.TEST_DRIVER_PASSWORD ?? 'TestPass123!',
      authFilePath: path.join(AUTH_DIR, 'driver.json'),
    });
  });

  setup('authenticate as manager', async ({ request }) => {
    await authenticateRole(request, {
      role: 'manager',
      email: process.env.TEST_MANAGER_EMAIL ?? 'manager@test.com',
      password: process.env.TEST_MANAGER_PASSWORD ?? 'TestPass123!',
      authFilePath: path.join(AUTH_DIR, 'manager.json'),
    });
  });

  // Must run LAST (enforced by describe.serial above, not by declaration
  // order alone). Reads the manifest all four blocks just wrote and prints
  // one greppable line per failure. Deliberately never throws: throwing here
  // would re-create exactly the all-or-nothing coupling this task removes.
  setup('auth setup summary', async () => {
    let manifest: Record<string, RoleAuthStatus> = {};
    try {
      manifest = JSON.parse(fs.readFileSync(AUTH_STATUS_PATH, 'utf-8')) as Record<string, RoleAuthStatus>;
    } catch {
      manifest = {};
    }
    for (const entry of Object.values(manifest)) {
      if (!entry.ok) {
        // eslint-disable-next-line no-console
        console.error(
          `AUTH SETUP FAILED — ${entry.role} (${entry.email ?? 'no email configured'}): ` +
            `status=${entry.status ?? 'n/a'} reason=${entry.error ?? 'unknown'}`
        );
      }
    }
  });
});
