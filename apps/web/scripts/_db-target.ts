/**
 * Which database did this script actually resolve, and may it write there?
 *
 * PURE. No dotenv, no `process.env` mutation, no connection, no `console`. The
 * side-effecting half lives in `_bootstrap-env.ts` / `_bootstrap-env-readonly.ts`;
 * everything decidable is decided here so it can be unit-tested without a database.
 *
 * WHY THIS FILE EXISTS — quick-607.
 *
 * `_bootstrap-env.ts` used to end with:
 *
 *     if (process.env.DIRECT_URL) { process.env.DATABASE_URL = process.env.DIRECT_URL; }
 *
 * unconditional, with `.env`, `.env.local` and `apps/web/.env.local` all pointing
 * `DIRECT_URL` at PRODUCTION. Two audits recorded the consequences separately and
 * never connected them:
 *
 *   - `app-user-failure-remediation.md` §8 item 8: `npm run audit:rls-policy-drift`
 *     reads production regardless of `DATABASE_URL`. Read-only, so nothing was
 *     written — but an operator would believe they had measured staging.
 *   - `phase-0-verification-gates.md`: the deleted isolation suite's `createTestTenant()`
 *     wrote into whatever `DATABASE_URL` named, and "the only thing standing between
 *     this file and tenants written into the production database was a constructor
 *     that happens not to compile".
 *
 * Same line. The read-only one is a false measurement; the write one is a production
 * write. What makes both dangerous is the same thing and it is neither of those: the
 * script reported success WITHOUT EVER SAYING WHICH DATABASE IT TOUCHED.
 */

/** Supabase project ref of PRODUCTION. */
export const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';

/** Supabase project ref of STAGING. */
export const STAGING_REF = 'wyixpgunnjmzguhggocz';

/** What a resolved target is allowed to do. `writes` is the DEFAULT — see `_bootstrap-env.ts`. */
export type ScriptIntent = 'read-only' | 'writes';

/** Which rung of the ladder produced the resolved URL. Reported in the banner verbatim. */
export type ResolutionSource =
  | 'explicit DIRECT_URL (port fix within the explicitly-pinned project)'
  | 'explicit DATABASE_URL'
  | 'explicit DIRECT_URL'
  | 'file DIRECT_URL (port fix; nothing pinned)'
  | 'file DATABASE_URL (nothing pinned)';

export interface ResolveInput {
  /**
   * `process.env.DATABASE_URL` as captured BEFORE any dotenv load. This is the
   * whole mechanism: dotenv does not override an already-set variable, so after
   * the load an inline pin and a file value are indistinguishable. Capturing
   * first is what makes "the operator meant this" a decidable question.
   */
  explicitDatabaseUrl: string | undefined;
  /** `process.env.DIRECT_URL` as captured before any dotenv load. */
  explicitDirectUrl: string | undefined;
  /** `process.env.DATABASE_URL` after the dotenv load. */
  fileDatabaseUrl: string | undefined;
  /** `process.env.DIRECT_URL` after the dotenv load. */
  fileDirectUrl: string | undefined;
}

export interface ResolvedTarget {
  url: string;
  source: ResolutionSource;
  /** Supabase project ref, or null for a connection string that carries none (a local database). */
  ref: string | null;
  host: string;
  port: string;
  /** Role the connection authenticates as - app_user, app_admin, postgres. */
  role: string;
  isProduction: boolean;
  isStaging: boolean;
}

export class DbTargetError extends Error {}

/**
 * The Supabase project ref, which is the only part of a connection string that
 * identifies WHICH DATABASE. Two shapes carry it and both appear in this repo's
 * env files:
 *
 *   postgresql://postgres.<ref>:pw@aws-1-us-west-1.pooler.supabase.com:5432/postgres
 *   postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres
 *
 * Returns null rather than throwing for anything else (a local database, a CI
 * dummy) - "no ref" is a real answer and the banner prints it as such.
 */
export function projectRefOf(connectionString: string): string | null {
  const fromUser = /:\/\/[^:/@]*\.([a-z]{20})(?::|@)/.exec(connectionString);
  if (fromUser) return fromUser[1];

  const fromHost = /@db\.([a-z]{20})\.supabase\.(?:co|com)/.exec(connectionString);
  if (fromHost) return fromHost[1];

  return null;
}

/** Role the connection authenticates as. `postgres.<ref>` yields `postgres`. */
export function roleOf(connectionString: string): string {
  const m = /:\/\/([^:/@]+)[:@]/.exec(connectionString);
  if (!m) return '(unknown)';
  return m[1].split('.')[0];
}

export function hostOf(connectionString: string): { host: string; port: string } {
  const m = /@([^/:?]+)(?::(\d+))?/.exec(connectionString);
  if (!m) return { host: '(unknown)', port: '(unknown)' };
  return { host: m[1], port: m[2] ?? '5432' };
}

/**
 * Credentials out, identity in. The banner exists to name the database, so the
 * ref, host, port and role all survive; the password never does.
 */
export function maskConnectionString(connectionString: string): string {
  return connectionString.replace(/:\/\/([^:/@]+):[^@]*@/, '://$1:***@');
}

/**
 * THE RESOLUTION RULE. Honour an explicitly-set `DATABASE_URL`; fall back to
 * `DIRECT_URL` only when the operator pinned nothing.
 *
 * Five rungs, in order:
 *
 *   1. Both pinned, SAME project ref -> the pinned `DIRECT_URL`. This keeps the
 *      6543 -> 5432 port fix (the pooler port is not reachable from a developer
 *      machine) while staying inside the project the operator chose. It is also
 *      exactly the "export both" workaround the prior audits prescribed, so that
 *      workflow keeps working unchanged.
 *   2. Both pinned, DIFFERENT project refs -> REFUSE. Silently picking one is the
 *      entire defect this file exists to close; there is no reading of two
 *      conflicting pins that is safe to guess at.
 *   3. Only `DATABASE_URL` pinned -> use it VERBATIM. This is the rung the old code
 *      got wrong, and the one `audit:rls-policy-drift` needed.
 *   4. Only `DIRECT_URL` pinned -> use it.
 *   5. Nothing pinned -> file `DIRECT_URL` if present, else file `DATABASE_URL`.
 *      Historical behaviour, preserved deliberately: every existing caller that
 *      relies on the port fix reaches this rung and is unaffected.
 */
export function resolveScriptDatabaseUrl(input: ResolveInput): ResolvedTarget {
  const { explicitDatabaseUrl, explicitDirectUrl, fileDatabaseUrl, fileDirectUrl } = input;

  let url: string;
  let source: ResolutionSource;

  if (explicitDatabaseUrl && explicitDirectUrl) {
    const dbRef = projectRefOf(explicitDatabaseUrl);
    const directRef = projectRefOf(explicitDirectUrl);

    if (dbRef !== directRef) {
      // Rung 2. Both named, and they disagree about WHICH DATABASE. The old code
      // answered this by taking DIRECT_URL without a word.
      throw new DbTargetError(
        `DATABASE_URL and DIRECT_URL were both set explicitly and they name DIFFERENT projects ` +
          `(DATABASE_URL -> ${dbRef ?? 'no project ref'}, DIRECT_URL -> ${directRef ?? 'no project ref'}). ` +
          `Refusing to guess which one you meant. Pin both at the same project, or pin only one.`
      );
    }

    url = explicitDirectUrl;
    source = 'explicit DIRECT_URL (port fix within the explicitly-pinned project)';
  } else if (explicitDatabaseUrl) {
    url = explicitDatabaseUrl;
    source = 'explicit DATABASE_URL';
  } else if (explicitDirectUrl) {
    url = explicitDirectUrl;
    source = 'explicit DIRECT_URL';
  } else if (fileDirectUrl) {
    url = fileDirectUrl;
    source = 'file DIRECT_URL (port fix; nothing pinned)';
  } else if (fileDatabaseUrl) {
    url = fileDatabaseUrl;
    source = 'file DATABASE_URL (nothing pinned)';
  } else {
    throw new DbTargetError(
      'No DATABASE_URL or DIRECT_URL found in the environment or in .env / .env.local'
    );
  }

  const ref = projectRefOf(url);
  const { host, port } = hostOf(url);

  return {
    url,
    source,
    ref,
    host,
    port,
    role: roleOf(url),
    isProduction: ref === PRODUCTION_REF,
    isStaging: ref === STAGING_REF,
  };
}

/** Human name for a ref, so the banner never makes the operator look one up. */
export function describeRef(ref: string | null): string {
  if (ref === PRODUCTION_REF) return `${ref} (PRODUCTION)`;
  if (ref === STAGING_REF) return `${ref} (staging)`;
  if (ref === null) return '(no Supabase project ref - local or non-Supabase)';
  return `${ref} (UNRECOGNISED)`;
}

/**
 * The banner. Printed to STDERR at script start - never stdout, because
 * `rls-policy-drift.ts --json` pipes its payload into `jq` and quick-585 already
 * removed three non-JSON stdout lines once for exactly this reason.
 */
export function formatTargetBanner(args: {
  scriptName: string;
  target: ResolvedTarget;
  intent: ScriptIntent;
  productionWritesAllowed: boolean;
}): string {
  const { scriptName, target, intent, productionWritesAllowed } = args;

  const lines = [
    `[db-target] script   : ${scriptName}`,
    `[db-target] project  : ${describeRef(target.ref)}`,
    `[db-target] host     : ${target.host}:${target.port}`,
    `[db-target] role     : ${target.role}`,
    `[db-target] resolved : ${target.source}`,
    `[db-target] intent   : ${intent}`,
  ];

  if (intent === 'writes' && target.isProduction && productionWritesAllowed) {
    lines.push('[db-target] WARNING  : writing to PRODUCTION - --allow-production was passed');
  }

  return lines.join('\n');
}

/**
 * THE WRITER GUARD, and the direction of its default is the whole point.
 *
 * A script does not declare itself a WRITER - it declares itself READ-ONLY, by
 * importing `_bootstrap-env-readonly` instead of `_bootstrap-env`. Everything
 * else is treated as a writer. So a new script that thinks about none of this
 * gets the safe answer: it refuses production loudly rather than writing to it.
 *
 * The inverse default - writers opt in - is the one that cannot work, because the
 * failure mode of forgetting is a silent production write, and nothing downstream
 * can tell the difference between "declared read-only" and "never thought about it".
 * Same shape as the T3/T4 facility verdict union: make the wrong state
 * unrepresentable rather than adding a check an edit can drop.
 *
 * Read-only scripts may target production freely - `audit:rls-policy-drift` and
 * `audit:app-user-harness` both exist to measure it.
 */
export function assertWriteTargetAllowed(args: {
  scriptName: string;
  target: ResolvedTarget;
  intent: ScriptIntent;
  productionWritesAllowed: boolean;
}): void {
  const { scriptName, target, intent, productionWritesAllowed } = args;

  if (intent === 'read-only') return;
  if (!target.isProduction) return;
  if (productionWritesAllowed) return;

  throw new DbTargetError(
    `${scriptName} REFUSING TO RUN - it resolved the PRODUCTION project ` +
      `(${PRODUCTION_REF}) and it is not declared read-only.\n` +
      `\n` +
      `  resolved via : ${target.source}\n` +
      `  connection   : ${maskConnectionString(target.url)}\n` +
      `\n` +
      `If this script really must write to production, pass --allow-production ` +
      `(or set ALLOW_PRODUCTION_WRITES=1).\n` +
      `If it only reads, import 'scripts/_bootstrap-env-readonly' instead of ` +
      `'scripts/_bootstrap-env' - read-only scripts may target production freely.\n` +
      `To point it somewhere else, pin DATABASE_URL inline; it is now honoured.`
  );
}

/**
 * `--allow-production` on argv, or `ALLOW_PRODUCTION_WRITES=1`.
 *
 * The env parameter is `Record<string, string | undefined>` rather than
 * `NodeJS.ProcessEnv`, which Next's types make require `NODE_ENV` - a test would
 * otherwise have to build a whole environment to ask a one-key question. An
 * all-optional single-key type does not work either: TypeScript's weak-type check
 * rejects `ProcessEnv` against it for having "no properties in common".
 */
export function productionWritesAllowedFrom(
  argv: string[],
  env: Record<string, string | undefined>
): boolean {
  return argv.includes('--allow-production') || env.ALLOW_PRODUCTION_WRITES === '1';
}
