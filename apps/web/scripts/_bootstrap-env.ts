/**
 * Environment bootstrap for terminal scripts. Import this FIRST, before any
 * module that touches Prisma or the Anthropic client:
 *
 *   import './_bootstrap-env';
 *   import { … } from '../src/lib/…';
 *
 * Import statements execute in source order, and `lib/db/prisma.ts` builds its
 * `pg.Pool` at module scope — so the environment has to be correct before that
 * import line runs, not merely before `main()` does.
 *
 * TWO FILES. `.env` holds DATABASE_URL / DIRECT_URL; `.env.local` holds
 * ANTHROPIC_API_KEY. Neither alone is enough.
 *
 * WHY DATABASE_URL IS REPOINTED AT DIRECT_URL. `DATABASE_URL` is Supabase's
 * pooler on **port 6543**, which the app uses from Vercel and which is not
 * reachable from a developer machine — a script gets `ECONNREFUSED` before any
 * query runs. `DIRECT_URL` is the same database on **5432** and does connect.
 * This mirrors `prisma.config.ts`, which already prefers
 * `DIRECT_URL || DATABASE_URL` for exactly this reason.
 *
 * Same database, same role, same policies. Nothing about tenant scoping is
 * relaxed to make a script run — only the port changes.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../..');
const APP_ROOT = resolve(__dirname, '..');

loadEnv({ path: resolve(REPO_ROOT, '.env') });
loadEnv({ path: resolve(REPO_ROOT, '.env.local') });

// THREE files, not two. The repo-root pair carries DATABASE_URL / DIRECT_URL /
// ANTHROPIC_API_KEY; the S3 credentials live only in `apps/web/.env.local`,
// because that is the file Next.js itself loads and storage is a web-app
// concern. Without this a script can reach the database and the model but not
// R2 — which is why an earlier script documented "there are no S3 credentials
// in .env or .env.local" and read its bytes off the local disk instead. There
// are; they were simply in the file it did not load.
//
// Loaded LAST and non-overriding: dotenv leaves an already-set variable alone,
// so the repo-root DATABASE_URL still wins. That matters — `apps/web/.env.local`
// may point DATABASE_URL at the RLS-enforced `app_user` role, and silently
// switching a script onto it would make every query return zero rows.
loadEnv({ path: resolve(APP_ROOT, '.env.local') });

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

if (!process.env.DATABASE_URL) {
  throw new Error('No DATABASE_URL or DIRECT_URL found in .env / .env.local');
}

// The pool's 5s connect timeout is sized for Vercel sitting next to Supabase.
// From a developer machine the TLS handshake to us-west-1 on 5432 regularly
// exceeds it and the script dies before its first query. Raised here, for this
// process only — production reads the same variable, is never given it, and
// keeps its 5s default.
process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';
