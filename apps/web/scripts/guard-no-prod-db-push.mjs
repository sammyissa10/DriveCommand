#!/usr/bin/env node
/**
 * Refuse `prisma db push` (and `migrate reset` / `migrate dev`) when
 * DATABASE_URL resolves to a production host.
 *
 * ─── WHY ────────────────────────────────────────────────────────────────────
 *
 * `prisma db push` reconciles the database to `schema.prisma`. RLS policies
 * never appear in `schema.prisma`, so from `db push`'s point of view they are
 * objects the schema does not describe. This is the leading unfalsified
 * mechanism for the 2026 loss of 59 carrier RLS policies
 * (docs/diagnostics/rls-policy-drop-forensics.md §4).
 *
 * It is not a hypothetical lapse. Four of the repo's own documents instructed
 * `db push`, one of them scoped to "local development" — and there is no local
 * database (DEC-3); `.env.local`'s DATABASE_URL is the production pooler. A
 * developer following the documentation as written ran it against production.
 * Those documents are corrected in the same change as this guard; this file is
 * the half that still works when someone types the command from memory.
 *
 * ─── WHAT COUNTS AS PRODUCTION ──────────────────────────────────────────────
 *
 * Any host containing the production project ref, any Supabase pooler or
 * direct host, or an explicit PROD marker. The match is deliberately BROAD and
 * fails CLOSED: an unparseable or absent URL is refused, not waved through. A
 * guard that guesses "probably fine" is the thing being replaced.
 *
 * Escape hatch: ALLOW_PROD_DB_PUSH=i-understand-this-can-drop-rls-policies.
 * Long and unpleasant on purpose. It is not a convenience flag; it exists so a
 * deliberate, supervised action is possible without editing this file.
 */

const PROD_PROJECT_REF = 'oqdhberkghtnszrkdvfm';

const PROD_HOST_MARKERS = [
  PROD_PROJECT_REF,
  '.pooler.supabase.com',
  '.supabase.co',
  '.supabase.in',
];

const OVERRIDE = 'i-understand-this-can-drop-rls-policies';

function fail(lines) {
  console.error('');
  console.error('='.repeat(74));
  console.error(' BLOCKED — refusing a destructive Prisma command against production');
  console.error('='.repeat(74));
  for (const l of lines) console.error(` ${l}`);
  console.error('');
  console.error(' Why: `prisma db push` reconciles the database to schema.prisma, and RLS');
  console.error(' policies are not in schema.prisma. It can silently drop them. This is the');
  console.error(' leading unfalsified cause of the 2026 loss of 59 carrier RLS policies.');
  console.error('');
  console.error(' What to do instead: write a forward migration.');
  console.error('   apps/web/prisma/migrations/<UTC timestamp>_<name>/migration.sql');
  console.error(' It is applied by scripts/migrate.mjs. See apps/web/docs/database.md.');
  console.error('');
  console.error(` Override (deliberate, supervised only):`);
  console.error(`   ALLOW_PROD_DB_PUSH=${OVERRIDE}`);
  console.error('='.repeat(74));
  console.error('');
  process.exit(1);
}

// `migrate.mjs` prefers DIRECT_URL, so check whichever this command would use,
// plus DATABASE_URL itself — either reaching production is a refusal.
const candidates = [
  ['DATABASE_URL', process.env.DATABASE_URL],
  ['DIRECT_URL', process.env.DIRECT_URL],
];

const present = candidates.filter(([, v]) => typeof v === 'string' && v.length > 0);

if (process.env.ALLOW_PROD_DB_PUSH === OVERRIDE) {
  console.warn('');
  console.warn('!! ALLOW_PROD_DB_PUSH override accepted. Proceeding against:');
  for (const [name, value] of present) {
    console.warn(`!!   ${name} host = ${hostOf(value) ?? '(unparseable)'}`);
  }
  console.warn('!! If this is production, RLS policies may be dropped without warning.');
  console.warn('');
  process.exit(0);
}

if (present.length === 0) {
  fail([
    'Neither DATABASE_URL nor DIRECT_URL is set.',
    '',
    'Refusing rather than assuming this is safe. A db push with no resolvable',
    'target is not a local no-op — Prisma may still read a .env file this guard',
    'cannot see.',
  ]);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const offenders = [];
for (const [name, value] of present) {
  const host = hostOf(value);
  if (host === null) {
    // Unparseable — fail closed rather than pattern-match a string we do not
    // understand.
    offenders.push(`${name}: unparseable connection string`);
    continue;
  }
  const hit = PROD_HOST_MARKERS.find((m) => host.includes(m) || value.includes(m));
  if (hit) offenders.push(`${name}: host ${host} matches "${hit}"`);
}

if (offenders.length > 0) {
  fail([
    'DATABASE_URL / DIRECT_URL resolves to a production database:',
    '',
    ...offenders.map((o) => `  ${o}`),
  ]);
}

console.log('[guard-no-prod-db-push] target is not production — allowing.');
for (const [name, value] of present) {
  console.log(`[guard-no-prod-db-push]   ${name} host = ${hostOf(value)}`);
}
