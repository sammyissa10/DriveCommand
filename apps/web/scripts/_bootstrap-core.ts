/**
 * The side-effecting half of script environment bootstrap: load the dotenv files,
 * apply the resolution rule from `_db-target.ts`, PRINT WHICH DATABASE WAS
 * RESOLVED, and enforce the writer guard.
 *
 * Do not import this module directly. Import one of the two doors, which differ
 * only in the intent they declare:
 *
 *   import '../_bootstrap-env';           // writes  (the DEFAULT - refuses production)
 *   import '../_bootstrap-env-readonly';  // read-only (may target production freely)
 *
 * WHY THE CAPTURE HAPPENS AT MODULE SCOPE, ABOVE EVERYTHING.
 *
 * dotenv does not override an already-set variable. That is the behaviour the old
 * code relied on, and it is also what made the defect undiagnosable from inside:
 * once `loadEnv` has run, `process.env.DATABASE_URL` looks identical whether the
 * operator typed it on the command line or a file supplied it. The distinction is
 * only available BEFORE the first load, so it is taken before the first load.
 *
 * WHY THE BANNER IS UNCONDITIONAL.
 *
 * Both findings this replaces were survivable in themselves - one was a read, the
 * other never actually fired. What made them dangerous was that a script could
 * finish, print CLEAN, and never say which database produced that answer. An
 * operator should never have to infer the target, so the target is stated every
 * time, on every run, whether or not anything is wrong.
 */

import { config as loadEnv } from 'dotenv';
import { basename, resolve } from 'path';

import {
  assertWriteTargetAllowed,
  DbTargetError,
  formatTargetBanner,
  productionWritesAllowedFrom,
  resolveScriptDatabaseUrl,
  type ScriptIntent,
} from './_db-target';

// CAPTURED FIRST. See the header - after `loadEnv` these are unreadable as
// "what the operator pinned", and that is the whole mechanism.
const EXPLICIT_DATABASE_URL = process.env.DATABASE_URL;
const EXPLICIT_DIRECT_URL = process.env.DIRECT_URL;

const REPO_ROOT = resolve(__dirname, '../../..');
const APP_ROOT = resolve(__dirname, '..');

export function bootstrapScriptEnv(intent: ScriptIntent): void {
  // `quiet: true` suppresses dotenv's injection banner. That is not cosmetic: the
  // banner is written to STDOUT, so without it any script with a machine-readable
  // mode (e.g. `rls-policy-drift.ts --json`) emits three non-JSON lines ahead of its
  // payload and piping into `jq` fails. Found in quick-585.
  //
  // TWO FILES at the repo root. `.env` holds DATABASE_URL / DIRECT_URL; `.env.local`
  // holds ANTHROPIC_API_KEY. Neither alone is enough.
  loadEnv({ path: resolve(REPO_ROOT, '.env'), quiet: true });
  loadEnv({ path: resolve(REPO_ROOT, '.env.local'), quiet: true });

  // THREE files, not two. The S3 credentials live only in `apps/web/.env.local`,
  // because that is the file Next.js itself loads and storage is a web-app concern.
  // Without this a script can reach the database and the model but not R2 - which is
  // why an earlier script documented "there are no S3 credentials in .env or
  // .env.local" and read its bytes off the local disk instead. There are; they were
  // simply in the file it did not load.
  //
  // Loaded LAST and non-overriding: dotenv leaves an already-set variable alone, so
  // the repo-root DATABASE_URL still wins.
  loadEnv({ path: resolve(APP_ROOT, '.env.local'), quiet: true });

  const scriptName = basename(process.argv[1] ?? 'unknown-script');
  const productionWritesAllowed = productionWritesAllowedFrom(process.argv, process.env);

  let target;
  try {
    target = resolveScriptDatabaseUrl({
      explicitDatabaseUrl: EXPLICIT_DATABASE_URL,
      explicitDirectUrl: EXPLICIT_DIRECT_URL,
      fileDatabaseUrl: process.env.DATABASE_URL,
      fileDirectUrl: process.env.DIRECT_URL,
    });
  } catch (err) {
    if (err instanceof DbTargetError) {
      console.error(`\n[db-target] ${scriptName} REFUSING TO RUN\n[db-target] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  // The banner goes to STDERR. `--json` payloads go to stdout and are piped into
  // `jq`; quick-585 already had to remove three stdout lines for that reason and
  // this must not reintroduce them.
  console.error(
    formatTargetBanner({ scriptName, target, intent, productionWritesAllowed })
  );

  try {
    assertWriteTargetAllowed({ scriptName, target, intent, productionWritesAllowed });
  } catch (err) {
    if (err instanceof DbTargetError) {
      console.error(`\n[db-target] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  // The resolved target is what every downstream consumer reads. `lib/db/prisma.ts`
  // builds its `pg.Pool` from `DATABASE_URL` at module scope, which is why this has
  // to happen during the bootstrap module's evaluation and not inside a `main()`.
  process.env.DATABASE_URL = target.url;

  // DIRECT_URL is deliberately LEFT ALONE. `scripts/migrate.mjs` and
  // `prisma.config.ts` need it to stay the privileged connection: `_prisma_migrations`
  // has RLS enabled, zero policies and no `app_user` grant, so a migration run on a
  // de-privileged connection reads zero rows with no error and re-applies everything.
  // Narrowing DIRECT_URL here to match a pinned DATABASE_URL would break that
  // silently, which is the same class of bug as the one being fixed.

  // The pool's 5s connect timeout is sized for Vercel sitting next to Supabase.
  // From a developer machine the TLS handshake to us-west-1 on 5432 regularly
  // exceeds it and the script dies before its first query. Raised here, for this
  // process only - production reads the same variable, is never given it, and keeps
  // its 5s default.
  process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';
}
