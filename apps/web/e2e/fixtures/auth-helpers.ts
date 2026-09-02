import path from 'path';
import fs from 'fs';

/**
 * Auth state file paths for all 3 roles.
 * These files are created by e2e/auth.setup.ts before any tests run.
 * They are gitignored — stored in .playwright/auth/.
 */

export const OWNER_AUTH = path.join(__dirname, '../../.playwright/auth/owner.json');
export const SYSADMIN_AUTH = path.join(__dirname, '../../.playwright/auth/sysadmin.json');
export const DRIVER_AUTH = path.join(__dirname, '../../.playwright/auth/driver.json');

/**
 * Legacy path — kept for backward compatibility with pre-Phase-27 specs.
 * quick-576: grep-verified zero importers of `LEGACY_AUTH` across `e2e/`. The
 * 33 specs that read `.playwright/auth/owner.json` (D3 in 576-PLAN.md) import
 * `OWNER_AUTH` above, not this. `auth.setup.ts` still writes the legacy
 * `.playwright/auth.json` file itself (not via this constant), so nothing
 * currently breaks by leaving it — but there is no reader left to justify
 * writing it. Left in place; deleting the write is a separate, deliberate
 * cleanup, not part of this task's scope.
 */
export const LEGACY_AUTH = path.join(__dirname, '../../.playwright/auth.json');

/**
 * Status manifest — quick-576.
 *
 * `auth.setup.ts`'s four role blocks no longer throw on a failed login (see
 * that file's header). Instead each records its outcome here so a spec can
 * ask, by name, "did my role's login actually succeed" and get a message
 * that names the role, the email attempted and the HTTP status — instead of
 * either a false-green run against a stale storageState file, or an opaque
 * `ENOENT .playwright/auth/driver.json` with no indication why the file
 * never got written.
 */
export const AUTH_STATUS_PATH = path.join(__dirname, '../../.playwright/auth/status.json');

export interface RoleAuthStatus {
  role: string;
  email: string | null;
  ok: boolean;
  status: number | null;
  error: string | null;
}

/**
 * Reads the status manifest written by `auth.setup.ts`. Returns `{}` if the
 * file does not exist yet (e.g. called before the setup project has run) —
 * never throws, because a missing manifest is itself informative to a caller
 * that goes on to call `requireRoleAuth`.
 */
export function readAuthStatus(): Record<string, RoleAuthStatus> {
  try {
    const raw = fs.readFileSync(AUTH_STATUS_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, RoleAuthStatus>;
  } catch {
    return {};
  }
}

/**
 * Throws a message naming the role, the email attempted and the HTTP status
 * (or reason) when that role's setup login did not succeed. Call this from a
 * spec's `beforeAll` so a broken account fails loudly with a diagnosis,
 * rather than the spec failing later on an unrelated-looking assertion or an
 * ENOENT on a storageState path.
 */
export function requireRoleAuth(role: string): void {
  const manifest = readAuthStatus();
  const entry = manifest[role];
  if (!entry || !entry.ok) {
    const email = entry?.email ?? '(unknown)';
    const status = entry?.status ?? '(no response)';
    const reason = entry?.error ?? 'no status entry recorded — setup project may not have run';
    throw new Error(
      `requireRoleAuth('${role}') failed — auth.setup.ts could not authenticate ${email} ` +
        `(status: ${status}, reason: ${reason}). See .playwright/auth/status.json.`
    );
  }
}
