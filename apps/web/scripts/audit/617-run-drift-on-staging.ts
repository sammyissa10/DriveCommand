/**
 * quick-617 — run `audit:rls-policy-drift` with its target PINNED, in-process.
 *
 * quick-615 found the drift script does not print its own target; quick-607's
 * `_db-target` now does. But pinning it from a POSIX shell on Windows corrupted
 * the connection string (the resolved host came back as dotenv's own banner text
 * spliced into the URL, and the run died `DatabaseNotReachable`). Setting
 * process.env in-process before the import removes the shell from the path
 * entirely, and rung 1 ("both pinned, same project") is what resolves.
 *
 * Read-only by construction: the target script imports `_bootstrap-env-readonly`.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

const PROD = 'oqdhberkghtnszrkdvfm', STG = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');
const parsed = loadEnv({ path: resolve(APP_ROOT, '.env.staging'), processEnv: {} }).parsed || {};
const raw = parsed.STAGING_DIRECT_URL;
if (!raw || raw.includes(PROD) || !raw.includes(STG)) {
  console.error('617-run-drift-on-staging: REFUSING — STAGING_DIRECT_URL does not name staging');
  process.exit(1);
}
const url = raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
const u = new URL(url);
console.error(`[audit-target] BOTH DATABASE_URL and DIRECT_URL pinned to ${STG} (staging)  host ${u.host}  role ${u.username}  (credential MASKED)`);
import('./rls-policy-drift');
