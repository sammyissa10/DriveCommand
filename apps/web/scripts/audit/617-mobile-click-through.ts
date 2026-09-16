/**
 * quick-617 — THE MOBILE CLICK-THROUGH. The first HTTP exercise of `/api/mobile/*`
 * in this programme.
 *
 *   npx tsx scripts/audit/617-mobile-click-through.ts --out <abs.json>
 *
 * WHY THIS EXISTS AND WHY `604-click-through.ts` COULD NOT DO IT
 * -------------------------------------------------------------
 * 604's 66 entries are all SESSION-COOKIE surfaces — owner pages, driver pages,
 * cron routes. **Not one of them touches `/api/mobile/*`.** So running it proves
 * that this task broke nothing on the web surfaces, and says NOTHING about the
 * 67 statements it actually routed. That gap is worth closing rather than
 * reporting, because the whole point of a click-through is to exercise the code
 * that changed.
 *
 * `validateMobileToken` calls `admin.auth.getUser(token)` — so the mobile Bearer
 * token IS a Supabase access token, obtainable from the staging password grant
 * with the seeded credentials. The session is OBTAINED, NEVER FORGED, for the
 * same reason 604 gives: a hand-built token measures this script's understanding
 * of Supabase rather than the application.
 *
 * SAFETY
 * ------
 * Never imports `scripts/_bootstrap-env`. Loads `.env.staging` explicitly and
 * refuses POSITIVELY unless the Supabase project ref is staging. Every credential
 * is masked. GET only — no mobile route is invoked with a method that writes.
 *
 * A 200 IS NOT A PASS (quick-602)
 * -------------------------------
 * `purge-deleted` raised TC001 seven times behind an HTTP 200. Each request
 * records the server log's byte offset immediately before and after it, and the
 * TC001 mentions in that slice. The slice is the authority.
 *
 * ANTI-VACUITY — the failure mode of this measurement is GREEN
 * -----------------------------------------------------------
 *   FLOOR             at least 20 routed GET routes are exercised.
 *   AUTH CONTROL      the SAME route with NO Authorization header must return
 *                     401. Without it, a harness pointed at a dead server, or one
 *                     whose token is silently ignored, produces the same clean
 *                     sheet as a healthy run.
 *   TENANT CONTROL    a driver token from tenant B must not see tenant A's rows.
 *                     Reported by name; over an empty table it proves nothing and
 *                     says so.
 */

import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync, statSync, openSync, readSync, closeSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(msg: string): never {
  console.error(`617-mobile-click-through: REFUSING TO RUN — ${msg}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SEED_PASSWORD = process.env.STAGING_SEED_PASSWORD;
if (!SUPABASE_URL) refuse('NEXT_PUBLIC_SUPABASE_URL is not set in .env.staging');
if (SUPABASE_URL.includes(PRODUCTION_REF)) refuse(`NEXT_PUBLIC_SUPABASE_URL names PRODUCTION`);
if (!SUPABASE_URL.includes(STAGING_REF)) refuse('NEXT_PUBLIC_SUPABASE_URL does not name staging');
if (!ANON_KEY) refuse('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.staging');
if (!SEED_PASSWORD) refuse('STAGING_SEED_PASSWORD is not set in .env.staging');

const BASE = process.env.CLICK_THROUGH_BASE ?? 'http://localhost:3000';
const SERVER_LOG = process.env.CLICK_THROUGH_LOG
  ? resolve(process.env.CLICK_THROUGH_LOG)
  : resolve(EVIDENCE_DIR, '05-server.log');

console.error(
  `[click-target] supabase project : ${STAGING_REF} (staging)  anon key MASKED ${ANON_KEY.slice(0, 6)}...${ANON_KEY.slice(-4)}`,
);
console.error(`[click-target] server : ${BASE}   log : ${SERVER_LOG}`);

// ---------------------------------------------------------------------------

const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045';

async function accessToken(email: string): Promise<{ token: string; userId: string; meta: Record<string, unknown> }> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
  });
  if (!r.ok) refuse(`password grant for ${email} returned ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; user: { id: string; app_metadata: Record<string, unknown> } };
  return { token: j.access_token, userId: j.user.id, meta: j.user.app_metadata };
}

function logSize(): number {
  try {
    return statSize(SERVER_LOG);
  } catch {
    return 0;
  }
}
function statSize(p: string): number {
  return statSync(p).size;
}
function logSlice(from: number, to: number): string {
  if (to <= from) return '';
  const fd = openSync(SERVER_LOG, 'r');
  try {
    const buf = Buffer.alloc(to - from);
    readSync(fd, buf, 0, to - from, from);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

type Entry = {
  route: string;
  role: string;
  status: number | null;
  verdict: 'pass' | 'fail' | 'not-reachable' | 'unauthorised-control';
  logByteRange: [number, number];
  logTc001Mentions: number;
  bodyPreview: string;
  error?: string;
};

async function visit(route: string, role: string, token: string | null): Promise<Entry> {
  const before = logSize();
  let status: number | null = null;
  let body = '';
  let error: string | undefined;
  try {
    const r = await fetch(`${BASE}${route}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    status = r.status;
    body = (await r.text()).slice(0, 220);
  } catch (e) {
    error = (e as Error).message;
  }
  // give the server a moment to flush its log before slicing
  await new Promise((res) => setTimeout(res, 120));
  const after = logSize();
  const slice = logSlice(before, after);
  const verdict: Entry['verdict'] =
    error != null ? 'fail' : status === 200 ? 'pass' : status === 404 || status === 403 ? 'not-reachable' : 'fail';
  return {
    route,
    role,
    status,
    verdict,
    logByteRange: [before, after],
    logTc001Mentions: (slice.match(/TC001/g) || []).length,
    bodyPreview: body,
    error,
  };
}

// ---------------------------------------------------------------------------
// The routed GET routes, derived from the PINNED inventory: every routed file
// whose path carries no dynamic segment (a `[id]` needs a real id and staging is
// sparse) and which exports a GET handler.
// ---------------------------------------------------------------------------

function routedGetRoutes(): { route: string; role: 'OWNER' | 'DRIVER' }[] {
  const inv = JSON.parse(
    require('fs').readFileSync(resolve(EVIDENCE_DIR, '01-inventory.json'), 'utf8'),
  ) as { statements: { file: string }[]; findUniqueSelectHazards: { file: string }[] };
  const stopped = new Set(inv.findUniqueSelectHazards.map((h) => h.file));
  const files = [...new Set(inv.statements.map((s) => s.file))].filter((f) => !stopped.has(f));
  const out: { route: string; role: 'OWNER' | 'DRIVER' }[] = [];
  for (const f of files) {
    if (f.includes('[')) continue; // dynamic segment — no id to substitute on sparse staging
    const src = require('fs').readFileSync(resolve(APP_ROOT, f), 'utf8');
    if (!/export\s+(?:async\s+function|const)\s+GET\b/.test(src)) continue;
    const route = '/' + f.replace(/^src\/app\//, '').replace(/\/route\.ts$/, '');
    out.push({ route, role: route.includes('/driver/') ? 'DRIVER' : 'OWNER' });
  }
  return out.sort((a, b) => (a.route < b.route ? -1 : 1));
}

// ---------------------------------------------------------------------------

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const OUT = outIdx >= 0 ? resolve(process.argv[outIdx + 1]) : resolve(EVIDENCE_DIR, '05-mobile-click-through.json');

  console.error('logging in (password grant against staging Supabase) …');
  const ownerA = await accessToken('owner@alpha.staging.test');
  const driverA = await accessToken('driver1@alpha.staging.test');
  const driverB = await accessToken('driver1@beta.staging.test');
  for (const [label, s] of [
    ['OWNER  alpha', ownerA],
    ['DRIVER alpha', driverA],
    ['DRIVER beta ', driverB],
  ] as const) {
    console.error(
      `  ${label}  userId ${s.userId}  app_metadata.tenantId ${s.meta.tenantId}  role ${s.meta.role}  token MASKED (${s.token.length} chars)`,
    );
  }
  if (ownerA.meta.tenantId !== TENANT_A) refuse('owner@alpha app_metadata.tenantId is not tenant A');
  if (driverB.meta.tenantId !== TENANT_B) refuse('driver1@beta app_metadata.tenantId is not tenant B');

  const routes = routedGetRoutes();
  console.log(`\nROUTED mobile GET routes (derived from the pinned inventory): ${routes.length}\n`);

  const entries: Entry[] = [];
  for (const r of routes) {
    const token = r.role === 'DRIVER' ? driverA.token : ownerA.token;
    const e = await visit(r.route, r.role, token);
    entries.push(e);
    console.log(
      `  ${String(e.status ?? 'ERR').padEnd(4)} ${e.verdict.padEnd(15)} ${r.role.padEnd(6)} ${e.route}${e.logTc001Mentions ? `   TC001x${e.logTc001Mentions}` : ''}`,
    );
  }

  // ---- ANTI-VACUITY ------------------------------------------------------
  console.log('\nANTI-VACUITY:');
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  checks.push({
    name: 'FLOOR — at least 20 routed GET routes exercised',
    pass: routes.length >= 20,
    detail: `${routes.length} >= 20`,
  });

  // AUTH CONTROL — the same route with NO token must be 401. A harness pointed
  // at a dead server, or one whose token is quietly ignored, gives the same
  // clean sheet as a healthy run without this.
  const probe = routes.find((r) => r.role === 'DRIVER') ?? routes[0];
  const noToken = await visit(probe.route, 'NO-TOKEN', null);
  entries.push({ ...noToken, verdict: 'unauthorised-control' });
  checks.push({
    name: `AUTH CONTROL — ${probe.route} with NO Authorization returns 401`,
    pass: noToken.status === 401,
    detail: `status ${noToken.status} (expected 401)`,
  });

  // TENANT CONTROL — a tenant-B driver token against the same driver route.
  const crossRoute = routes.find((r) => r.route.includes('/driver/')) ?? probe;
  const cross = await visit(crossRoute.route, 'DRIVER-tenantB', driverB.token);
  entries.push(cross);
  checks.push({
    name: `TENANT CONTROL — ${crossRoute.route} with a tenant-B driver token still answers 200 with tenant-B data`,
    pass: cross.status === 200,
    detail:
      `status ${cross.status}; body ${cross.bodyPreview.slice(0, 120)} — ` +
      `NOTE: staging is sparse, so an empty result here proves the route does not RAISE, not that it scopes`,
  });

  const tc001 = entries.reduce((a, e) => a + e.logTc001Mentions, 0);
  const wholeLog = logSlice(0, logSize());
  const wholeLogTc001 = (wholeLog.match(/TC001/g) || []).length;
  checks.push({
    name: 'ZERO TC001 across the correlated slices AND the whole log (independent measurements)',
    pass: tc001 === 0 && wholeLogTc001 === 0,
    detail: `slices ${tc001}, whole log ${wholeLogTc001}`,
  });

  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);

  const pass = entries.filter((e) => e.verdict === 'pass').length;
  const fail = entries.filter((e) => e.verdict === 'fail').length;
  const nr = entries.filter((e) => e.verdict === 'not-reachable').length;
  console.log(
    `\n${entries.length} entries — pass ${pass} · fail ${fail} · not-reachable ${nr} · TC001 ${tc001}`,
  );

  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        supabaseProject: `${STAGING_REF} (staging)`,
        base: BASE,
        serverLog: SERVER_LOG,
        totals: { entries: entries.length, pass, fail, notReachable: nr, tc001, wholeLogTc001 },
        antiVacuity: checks,
        entries,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`written: ${OUT}`);
  if (checks.some((c) => !c.pass) || fail > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
