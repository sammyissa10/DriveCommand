/**
 * quick-604 — the unmigrated-path tripwire's arming gate.
 *
 * THE GATE, IN ONE SENTENCE — the implementation below is exactly this sentence
 * and nothing more:
 *
 *   The tripwire arms only when the resolved connection string contains the
 *   STAGING project ref `wyixpgunnjmzguhggocz` AND the environment variable
 *   `TENANT_CONTEXT_TRIPWIRE` is exactly `on`.
 *
 * ─── WHY THE REF MATCH IS POSITIVE ─────────────────────────────────────────
 *
 * The ref match is the load-bearing half, and it is stated POSITIVELY. A
 * negative gate ("not the production ref") arms against every string it does
 * not recognise — including a future database that does not exist yet, a
 * mistyped ref, a local Postgres, or a restored production snapshot under a new
 * project id. The failure mode of a positive gate is "the tripwire did not
 * arm", which costs a re-run. The failure mode of a negative gate is a raise
 * inside a customer's request.
 *
 * The env flag is belt and braces. It is NOT the control: with the flag on and
 * a production-shaped string, this function returns false.
 *
 * `PRODUCTION_REF` exists here only so a second, independent assertion can
 * refuse it outright. That refusal is unreachable by default — the positive ref
 * match has already returned false by the time it would matter — and it is
 * deliberately not the mechanism.
 *
 * ─── WHAT ARMING DOES ──────────────────────────────────────────────────────
 *
 * When armed, `lib/db/prisma.ts`'s existing `pool.on('connect')` handler issues
 * a second, session-scoped `set_config('app.tenant_context_tripwire','on',false)`
 * after the tenant-GUC initialiser. `current_tenant_id()` on staging carries a
 * COALESCE branch (quick-602) that falls into `tenant_context_required()` and
 * raises SQLSTATE `TC001` when a statement reaches an RLS policy with no tenant
 * context set. On production the flag is never set, so that branch is never
 * taken and `current_tenant_id()` behaves exactly as it does today.
 *
 * quick-602 established that a session-level `SET` issued by application code is
 * the ONLY arming mechanism available: `ALTER ROLE` / `ALTER DATABASE … SET` of
 * a custom GUC is 42501 for both `postgres` and `app_user` on Supabase, and
 * Supavisor silently drops the connection-string `options` parameter.
 */

/** The staging project ref. The positive match. */
const STAGING_REF = 'wyixpgunnjmzguhggocz';

/**
 * The production project ref. Present ONLY for the independent second refusal
 * below — never as the mechanism. See the header.
 */
const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';

/** The exact literal that arms. `'ON'`, `'1'`, `'true'` do not. */
const ARMING_FLAG_VALUE = 'on';

/**
 * True only when the connection string names the staging project AND the flag
 * is exactly `on`.
 */
export function shouldArmTripwire(
  connectionString: string | undefined,
  flag: string | undefined,
): boolean {
  if (!connectionString) return false;

  // The load-bearing half: a POSITIVE match on the staging ref.
  if (!connectionString.includes(STAGING_REF)) return false;

  // Independent second refusal. Unreachable by default — a string containing the
  // production ref cannot also contain the staging ref — and deliberately not the
  // mechanism. It exists so that if the positive match is ever weakened, the
  // production case still fails closed.
  if (connectionString.includes(PRODUCTION_REF)) return false;

  return flag === ARMING_FLAG_VALUE;
}
