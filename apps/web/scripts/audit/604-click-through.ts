/**
 * quick-604 — the click-through. A running Next server, pointed at STAGING as
 * `app_user` with the tripwire armed, driven over real HTTP with a real session
 * cookie.
 *
 *   npx tsx scripts/audit/604-click-through.ts --surfaces
 *   npx tsx scripts/audit/604-click-through.ts --surfaces2   (pass 2: the brief-named surfaces)
 *   npx tsx scripts/audit/604-click-through.ts --writes
 *   npx tsx scripts/audit/604-click-through.ts --pgstat <label>
 *
 * THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`. It loads
 * `apps/web/.env.staging` explicitly and refuses on the production ref.
 *
 * ─── WHY THIS IS A CLICK-THROUGH AND NOT A PROBE SWEEP ─────────────────────
 *
 * quick-602 §10: no authenticated browser path had ever been measured. Its own
 * sweep covered 24 session-free entry points touching 4 of 456 units — 0.88 %.
 * A route handler invoked in-process is not a request through middleware, and a
 * session-free cron route is not a page whose server components fan out into
 * dozens of tenant-scoped reads. So: real HTTP, real cookies, real roles.
 *
 * ─── THE SESSION IS OBTAINED, NEVER FORGED ─────────────────────────────────
 *
 * `POST /api/auth/login` calls `signInWithPassword` through `@supabase/ssr`, so
 * the `Set-Cookie` headers on its response ARE the chunked
 * `sb-<ref>-auth-token*` session cookies. Forging them by hand would measure
 * this script's understanding of `@supabase/ssr`'s chunking rather than the
 * application.
 *
 * ─── LOG CORRELATION ───────────────────────────────────────────────────────
 *
 * Next does not echo request headers, so a marker header cannot be correlated
 * from the log side. Instead the script records the server log file's byte
 * offset immediately before and immediately after each request and slices that
 * range. The range is written into the JSON so the correlation is auditable
 * rather than asserted.
 *
 * ─── WHAT A 200 IS NOT ─────────────────────────────────────────────────────
 *
 * quick-602 measured `purge-deleted` raising `TC001` SEVEN times behind an HTTP
 * 200 with `success:true`. The log slice, not the status code, is the authority
 * for the cron rows.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence',
);
/**
 * quick-605 (additive): the log this run correlates against. Defaults to
 * quick-604's own log so every existing invocation is byte-for-byte unchanged.
 * `--surfaces3` points it at quick-605's evidence directory instead — appending
 * a later task's requests to a closed task's evidence file would corrupt the
 * byte offsets already recorded in `04-click-through.json`.
 */
const SERVER_LOG = process.env.CLICK_THROUGH_LOG
  ? resolve(process.env.CLICK_THROUGH_LOG)
  : resolve(EVIDENCE_DIR, '04-server.log');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`604-click-through: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
if (!DIRECT_URL) refuse('STAGING_DIRECT_URL is not set');
if (DIRECT_URL.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
if (!DIRECT_URL.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');

const BASE = process.env.CLICK_THROUGH_BASE ?? 'http://localhost:3000';
const ORIGIN = 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const SEED_PASSWORD = process.env.STAGING_SEED_PASSWORD;

// ---------------------------------------------------------------------------
// The surface list — a committed constant, asserted to have >= 25 entries.
// ---------------------------------------------------------------------------

type Role = 'OWNER_A' | 'DRIVER_A' | 'OWNER_B';

const OWNER_SURFACES = [
  '/dashboard',
  '/carrier/dashboard',
  '/carrier/trips',
  '/carrier/loads',
  '/carrier/clients',
  '/carrier/contracts',
  '/carrier/facilities',
  '/carrier/templates',
  '/carrier/imports',
  '/carrier/messages',
  '/drivers',
  '/trucks',
  '/loads',
  '/routes',
  '/invoices',
  '/payroll',
  '/crm',
  '/compliance',
  '/live-map',
  '/settings/operations',
  '/support',
] as const;

const DRIVER_SURFACES = ['/home', '/my-load', '/my-route', '/documents', '/hours'] as const;

const NAMED_SURFACE_COUNT = OWNER_SURFACES.length + DRIVER_SURFACES.length;
if (NAMED_SURFACE_COUNT < 25) {
  refuse(`the named surface list has ${NAMED_SURFACE_COUNT} entries, fewer than the required 25`);
}

/** Enumerated from the directory, never hardcoded. */
function enumerateCronRoutes(): string[] {
  const dir = resolve(APP_ROOT, 'src/app/api/cron');
  const names = readdirSync(dir)
    .filter((n) => statSync(resolve(dir, n)).isDirectory())
    .sort();
  return names.map((n) => `/api/cron/${n}`);
}

const CRON_ROUTES = enumerateCronRoutes();
if (CRON_ROUTES.length !== 14) {
  refuse(`enumerated ${CRON_ROUTES.length} cron routes from the directory, expected 14`);
}

/**
 * quick-603: `/api/warmup` is a SCHEDULED entry point that does not live under
 * `/api/cron/`. It is exercised here, labelled, and deliberately NOT folded into
 * the 14.
 */
const EXTRA_SCHEDULED = ['/api/warmup'];

// ---------------------------------------------------------------------------
// PASS 2 (quick-604, second sweep) — the brief-named surfaces pass 1 substituted
// away. Each was checked against the route tree before being listed; the ones
// with no index page are listed anyway, because a 404 recorded as
// `not-reachable` with a stated reason is a verdict and an omission is not.
// ---------------------------------------------------------------------------

type Pass2Surface = {
  path: string;
  role: Role | 'SYSADMIN' | 'NONE';
  group: string;
  /**
   * A stated reason attached to a `not-reachable` verdict. These are properties of
   * the ROUTE TREE, checked with `ls` before this list was written, not guesses
   * about the HTTP response — so they are recorded here rather than inferred from
   * a 404, which cannot tell "no such route" from "no index page".
   */
  note?: string;
};

const PASS2_SURFACES: Pass2Surface[] = [
  // Driver Pay / Settlements
  { path: '/carrier/driver-pay/settlements', role: 'OWNER_A', group: 'Settlements' },
  { path: '/carrier/driver-pay/pending', role: 'OWNER_A', group: 'Driver Pay' },
  { path: '/carrier/driver-pay/reports', role: 'OWNER_A', group: 'Driver Pay' },
  {
    path: '/carrier/driver-pay',
    role: 'OWNER_A',
    group: 'Driver Pay',
    note: "no index page — `(owner)/carrier/driver-pay/` holds only `pending/`, `reports/` and `settlements/`, all of which ARE exercised above",
  },

  // Reports
  {
    path: '/carrier/reports',
    role: 'OWNER_A',
    group: 'Reports',
    note: "no index page — `(owner)/carrier/reports/` holds only `aging/`, `driver-pay/`, `performance/`, `revenue/` and `todays-trips/`",
  },
  { path: '/carrier/reports/aging', role: 'OWNER_A', group: 'Reports' },
  { path: '/carrier/reports/performance', role: 'OWNER_A', group: 'Reports' },
  { path: '/carrier/reports/revenue', role: 'OWNER_A', group: 'Reports' },
  { path: '/carrier/reports/todays-trips', role: 'OWNER_A', group: 'Reports' },

  // Checklists / Workflows
  { path: '/checklists', role: 'OWNER_A', group: 'Checklists' },
  {
    path: '/checklists/playbooks',
    role: 'OWNER_A',
    group: 'Workflows',
    note: 'no index page — the directory holds only `[id]/`, so the list lives on `/checklists` itself',
  },
  {
    path: '/checklists/instances',
    role: 'OWNER_A',
    group: 'Workflows',
    note: 'no index page — the directory holds only `[id]/`; staging carries ZERO PlaybookInstance rows, so there is no id to substitute either',
  },
  { path: '/checklists/analytics', role: 'OWNER_A', group: 'Workflows' },
  { path: '/checklists/automation', role: 'OWNER_A', group: 'Workflows' },

  // Notifications
  { path: '/settings/notifications', role: 'OWNER_A', group: 'Notifications' },

  // SysAdmin — needs the isSystemAdmin claim, which no seeded OWNER carries.
  { path: '/automations', role: 'SYSADMIN', group: 'Automations' },
  { path: '/admin-dashboard', role: 'SYSADMIN', group: 'SysAdmin' },
  { path: '/billing', role: 'SYSADMIN', group: 'SysAdmin' },
  { path: '/plans', role: 'SYSADMIN', group: 'SysAdmin' },
  { path: '/notifications', role: 'SYSADMIN', group: 'SysAdmin' },
  { path: '/admin-support', role: 'SYSADMIN', group: 'SysAdmin' },

  // Public / session-free
  { path: '/track/__PROBE_TOKEN__', role: 'NONE', group: 'public tracking page' },
  {
    path: '/sign-up',
    role: 'NONE',
    group: 'Signup',
    note: 'the PAGE renders; the signup FLOW cannot be completed on staging — `mailer_autoconfirm: false` and the built-in mailer 429s after ~3 sends, so no confirmation email can be received',
  },

  // Onboarding
  {
    path: '/onboarding',
    role: 'OWNER_A',
    group: 'Onboarding',
    note: 'redirects rather than rendering — the seeded tenant is past this gate',
  },
  { path: '/onboarding/welcome', role: 'OWNER_A', group: 'Onboarding' },
];

// ---------------------------------------------------------------------------
// Log-slice plumbing
// ---------------------------------------------------------------------------

function logSize(): number {
  try {
    return statSync(SERVER_LOG).size;
  } catch {
    return 0;
  }
}

function logSlice(from: number, to: number): string {
  if (to <= from) return '';
  try {
    const fd = openSync(SERVER_LOG, 'r');
    try {
      const buf = Buffer.alloc(to - from);
      readSync(fd, buf, 0, to - from, from);
      return buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return '';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Verdict / SQLSTATE recovery
// ---------------------------------------------------------------------------

/**
 * Recover a SQLSTATE from a log slice. `TC001` first and BY CODE, never by
 * message prose (`unmigrated-path-tripwire.md` §3.3).
 */
function recoverSqlstate(slice: string, body: string): string | null {
  const hay = `${slice}\n${body}`;
  if (/\bTC001\b/.test(hay)) return 'TC001';
  // The whole token is captured, delimited. An earlier draft matched
  // `[0-9A-Z]{5}` unanchored and recovered "ECONN" out of "ECONNREFUSED" — a
  // truncation that reads like a SQLSTATE and is not one.
  const m =
    hay.match(/"originalCode"\s*:\s*"([A-Z0-9_]{4,24})"/) ??
    hay.match(/\boriginalCode:\s*'([A-Z0-9_]{4,24})'/) ??
    hay.match(/"code"\s*:\s*"([A-Z0-9_]{4,24})"/) ??
    hay.match(/\bcode:\s*'([A-Z0-9_]{4,24})'/) ??
    hay.match(/\bSQLSTATE\s*[:=]?\s*'?([0-9A-Z]{5})'?\b/);
  return m ? m[1] : null;
}

const SWALLOWED_MARKERS = [
  /"failureCount"\s*:\s*[1-9]/,
  /"failed"\s*:\s*[1-9]/,
  /"failuresTruncated"\s*:\s*true/,
  /"success"\s*:\s*false/,
  /"ok"\s*:\s*false/,
  /:\s*-1\b/,
];

function bodyCarriesSwallowedFailure(body: string): string | null {
  for (const re of SWALLOWED_MARKERS) {
    if (re.test(body)) return re.source;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

type Session = { role: Role; email: string; tenantId: string; userId: string; cookie: string };

function joinSetCookie(headers: Headers): string {
  // Node 18+ exposes getSetCookie(); fall back to the raw header.
  const raw = (headers as any).getSetCookie?.() as string[] | undefined;
  const list = raw && raw.length ? raw : [headers.get('set-cookie') ?? ''];
  return list
    .filter(Boolean)
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function pickFixtures() {
  const client = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await client.connect();
  try {
    const rows = (
      await client.query<{ id: string; email: string; role: string; tenantId: string; slug: string }>(
        `SELECT u.id, u.email, u.role, u."tenantId", t.slug
           FROM public."User" u JOIN public."Tenant" t ON t.id = u."tenantId"
          ORDER BY t.slug, u.role, u.email`,
      )
    ).rows;
    const alpha = rows.filter((r) => r.slug === 'staging-alpha');
    const beta = rows.filter((r) => r.slug === 'staging-beta');
    const ownerA = alpha.find((r) => r.role === 'OWNER');
    const driverA = alpha.find((r) => r.role === 'DRIVER');
    const ownerB = beta.find((r) => r.role === 'OWNER');
    if (!ownerA || !driverA || !ownerB) refuse('could not find OWNER/DRIVER fixtures on both tenants');
    return { ownerA, driverA, ownerB };
  } finally {
    await client.end();
  }
}

async function login(role: Role, email: string, tenantId: string, userId: string): Promise<Session> {
  if (!SEED_PASSWORD) refuse('STAGING_SEED_PASSWORD is not set — run seed-staging-auth.ts --seed');
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
    redirect: 'manual',
  });
  const body = await res.text();
  if (res.status !== 200) {
    refuse(`login for ${email} returned ${res.status}: ${body.slice(0, 300)}`);
  }
  const cookie = joinSetCookie(res.headers);
  if (!cookie.includes('sb-')) {
    refuse(`login for ${email} returned 200 but no sb- session cookie was set`);
  }
  return { role, email, tenantId, userId, cookie };
}

// ---------------------------------------------------------------------------
// The surface walk
// ---------------------------------------------------------------------------

type Entry = {
  surface: string;
  label: string;
  role: Role | 'CRON' | 'NONE' | 'SYSADMIN';
  method: string;
  status: number | null;
  verdict: 'pass' | 'fail' | 'not-reachable';
  reason: string;
  sqlstate: string | null;
  logByteRange: [number, number];
  logTc001Mentions: number;
  bodyExcerpt: string;
  /**
   * quick-605 (additive, optional). Named substrings searched in the FULL
   * response body and the FULL correlated log slice — not in `bodyExcerpt`,
   * which is truncated at 2 KB and would miss a stack trace. Absent on every
   * quick-604 row; nothing reads it there.
   */
  markers?: Record<string, boolean>;
};

async function visit(
  surface: string,
  label: string,
  role: Role | 'CRON' | 'NONE' | 'SYSADMIN',
  cookie: string | null,
  extraHeaders: Record<string, string> = {},
  markerSpecs: Record<string, string> = {},
): Promise<Entry> {
  const from = logSize();
  let status: number | null = null;
  let body = '';
  let location: string | null = null;
  let transportError: string | null = null;
  try {
    const res = await fetch(`${BASE}${surface}`, {
      method: 'GET',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...extraHeaders,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
    });
    status = res.status;
    location = res.headers.get('location');
    body = (await res.text()).slice(0, 200_000);
  } catch (e) {
    transportError = String((e as Error)?.message ?? e);
  }
  // Give the server a moment to flush its log for this request.
  await sleep(350);
  const to = logSize();
  const slice = logSlice(from, to);
  const tc001 = (slice.match(/TC001/g) ?? []).length;

  let verdict: Entry['verdict'];
  let reason: string;
  let sqlstate: string | null = null;

  if (transportError) {
    verdict = 'fail';
    reason = `transport error: ${transportError}`;
    sqlstate = recoverSqlstate(slice, '') ?? 'SQLSTATE_UNRECOVERED';
  } else if (status! >= 500) {
    verdict = 'fail';
    reason = `HTTP ${status}`;
    sqlstate = recoverSqlstate(slice, body) ?? 'SQLSTATE_UNRECOVERED';
  } else if (tc001 > 0) {
    verdict = 'fail';
    reason = `TC001 raised ${tc001}× in the correlated log window behind HTTP ${status}`;
    sqlstate = 'TC001';
  } else if (status === 404) {
    verdict = 'not-reachable';
    reason = 'HTTP 404';
  } else if (status! >= 300 && status! < 400) {
    // A redirect AWAY from the requested surface means the surface never
    // rendered. `/sign-in` and `/unauthorized` are the two the plan names; any
    // other destination is recorded by name rather than being folded into
    // `pass`, because a page that redirected is not a page that worked.
    const away = !location || !location.endsWith(surface);
    verdict = away ? 'not-reachable' : 'pass';
    reason = `HTTP ${status}${location ? ` → ${location}` : ' with no Location header'}`;
  } else if (status! >= 400) {
    verdict = 'fail';
    reason = `HTTP ${status}`;
    sqlstate = recoverSqlstate(slice, body) ?? 'SQLSTATE_UNRECOVERED';
  } else {
    const marker = bodyCarriesSwallowedFailure(body);
    if (marker) {
      verdict = 'fail';
      reason = `HTTP ${status} with a swallowed-failure marker in the body: /${marker}/`;
      sqlstate = recoverSqlstate(slice, body) ?? 'SQLSTATE_UNRECOVERED';
    } else {
      verdict = 'pass';
      reason = `HTTP ${status}${location ? ` → ${location}` : ''}`;
    }
  }

  const entry: Entry = {
    surface,
    label,
    role,
    method: 'GET',
    status,
    verdict,
    reason,
    sqlstate,
    logByteRange: [from, to],
    logTc001Mentions: tc001,
    bodyExcerpt: body.slice(0, 2048),
  };
  const markerKeys = Object.keys(markerSpecs);
  if (markerKeys.length) {
    const hay = `${slice}\n${body}`;
    entry.markers = Object.fromEntries(markerKeys.map((k) => [k, hay.includes(markerSpecs[k])]));
  }
  console.log(
    `  ${String(status ?? 'ERR').padEnd(4)} ${verdict.padEnd(14)} ${surface}  ${sqlstate ?? ''}`,
  );
  return entry;
}

async function surfaces() {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  if (!CRON_SECRET) refuse('CRON_SECRET is not set in this shell — the cron sweep would measure auth, not RLS');

  const fx = await pickFixtures();
  console.log('logging in three sessions over the real /api/auth/login …');
  const sessions: Record<Role, Session> = {
    OWNER_A: await login('OWNER_A', fx.ownerA.email, fx.ownerA.tenantId, fx.ownerA.id),
    DRIVER_A: await login('DRIVER_A', fx.driverA.email, fx.driverA.tenantId, fx.driverA.id),
    OWNER_B: await login('OWNER_B', fx.ownerB.email, fx.ownerB.tenantId, fx.ownerB.id),
  };
  console.log(`  OWNER_A  ${sessions.OWNER_A.email}`);
  console.log(`  DRIVER_A ${sessions.DRIVER_A.email}`);
  console.log(`  OWNER_B  ${sessions.OWNER_B.email}`);

  const entries: Entry[] = [];

  console.log('\nOWNER surfaces:');
  for (const s of OWNER_SURFACES) {
    entries.push(await visit(s, 'named-surface', 'OWNER_A', sessions.OWNER_A.cookie));
  }

  console.log('\nDRIVER surfaces:');
  for (const s of DRIVER_SURFACES) {
    entries.push(await visit(s, 'named-surface', 'DRIVER_A', sessions.DRIVER_A.cookie));
  }

  console.log('\nCRON routes (14, enumerated from the directory):');
  for (const s of CRON_ROUTES) {
    entries.push(
      await visit(s, 'cron', 'CRON', null, { Authorization: `Bearer ${CRON_SECRET}` }),
    );
  }

  console.log('\nOther scheduled entry points (NOT folded into the 14):');
  for (const s of EXTRA_SCHEDULED) {
    entries.push(
      await visit(s, 'scheduled-non-cron', 'CRON', null, { Authorization: `Bearer ${CRON_SECRET}` }),
    );
  }

  const record = {
    task: 'quick-604',
    phase: 'surfaces',
    at: new Date().toISOString(),
    base: BASE,
    namedSurfaceCount: NAMED_SURFACE_COUNT,
    cronRouteCount: CRON_ROUTES.length,
    extraScheduled: EXTRA_SCHEDULED,
    sessions: Object.values(sessions).map((s) => ({
      role: s.role,
      email: s.email,
      tenantId: s.tenantId,
      cookieNames: s.cookie.split('; ').map((c) => c.split('=')[0]),
    })),
    entries,
  };
  writeFileSync(resolve(EVIDENCE_DIR, '04-click-through.json'), JSON.stringify(record, null, 2) + '\n');

  const counts = {
    pass: entries.filter((e) => e.verdict === 'pass').length,
    fail: entries.filter((e) => e.verdict === 'fail').length,
    notReachable: entries.filter((e) => e.verdict === 'not-reachable').length,
  };
  console.log(
    `\n${entries.length} entries — pass ${counts.pass} · fail ${counts.fail} · not-reachable ${counts.notReachable}`,
  );
}

// ---------------------------------------------------------------------------
// --surfaces2 — the brief-named surfaces pass 1 substituted away.
// Merges into 04-click-through.json rather than writing a second artefact, so
// every downstream number (classification, attribution, the integrity test) is
// re-derived from ONE file.
// ---------------------------------------------------------------------------

const SYSADMIN_EMAIL = 'sysadmin@staging.test';

/**
 * `track/[token]` is public and needs a real `Load.trackingToken`. If the legacy
 * `Load` table is empty there is nothing to hand it, and that is a stated reason
 * rather than a skipped row.
 */
async function findTrackingToken(): Promise<{ token: string | null; reason: string }> {
  const c = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const r = await c.query<{ trackingToken: string | null }>(
      `SELECT "trackingToken" FROM public."Load" WHERE "trackingToken" IS NOT NULL LIMIT 1`,
    );
    if (r.rows[0]?.trackingToken) {
      return { token: r.rows[0].trackingToken, reason: 'seeded Load.trackingToken' };
    }
    const n = (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM public."Load"')).rows[0].n;
    return {
      token: null,
      reason: `no seeded Load carries a trackingToken — the legacy "Load" table holds ${n} row(s) on staging (scripts/seed-staging.ts populates the CARRIER "loads" table, not this one)`,
    };
  } finally {
    await c.end();
  }
}

async function surfaces2() {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  const clickPath = resolve(EVIDENCE_DIR, '04-click-through.json');
  if (!existsSync(clickPath)) refuse('04-click-through.json not found — run --surfaces first');
  const record = JSON.parse(readFileSync(clickPath, 'utf8'));

  const fx = await pickFixtures();

  // The sysadmin fixture. Its absence is a hard stop, not a silent skip — a whole
  // portal with no verdict is the weakest thing this report could contain.
  const sysadmin = await (async () => {
    const c = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
    await c.connect();
    try {
      const r = await c.query<{ id: string; email: string; tenantId: string }>(
        `SELECT id, email, "tenantId" FROM public."User" WHERE email = $1 AND "isSystemAdmin" = true LIMIT 1`,
        [SYSADMIN_EMAIL],
      );
      return r.rows[0] ?? null;
    } finally {
      await c.end();
    }
  })();
  if (!sysadmin) {
    refuse(
      'no isSystemAdmin User on staging — run `npx tsx scripts/seed-staging-auth.ts --seed-sysadmin` first. ' +
        'Marking the whole (admin) portal not-reachable is the fallback, not the default.',
    );
  }

  console.log('logging in …');
  const sessions: Record<string, Session> = {
    OWNER_A: await login('OWNER_A', fx.ownerA.email, fx.ownerA.tenantId, fx.ownerA.id),
    DRIVER_A: await login('DRIVER_A', fx.driverA.email, fx.driverA.tenantId, fx.driverA.id),
    OWNER_B: await login('OWNER_B', fx.ownerB.email, fx.ownerB.tenantId, fx.ownerB.id),
    SYSADMIN: await login('OWNER_A' as Role, sysadmin.email, sysadmin.tenantId, sysadmin.id),
  };
  console.log(`  SYSADMIN ${sysadmin.email} (User.isSystemAdmin = true)`);

  const track = await findTrackingToken();
  console.log(`  tracking token: ${track.token ? 'found' : 'NONE — ' + track.reason}`);

  const entries: Entry[] = [];
  console.log('\nPASS 2 surfaces:');
  for (const s of PASS2_SURFACES) {
    let path = s.path;
    let preset: Entry | null = null;

    if (path.includes('__PROBE_TOKEN__')) {
      if (!track.token) {
        // A token this page cannot resolve is not a measurement of the page. The
        // row still exists, with the reason.
        path = path.replace('__PROBE_TOKEN__', '604-probe-no-seeded-token');
      } else {
        path = path.replace('__PROBE_TOKEN__', track.token);
      }
    }

    const cookie = s.role === 'NONE' ? null : sessions[s.role as string].cookie;
    const e = preset ?? (await visit(path, `pass2:${s.group}`, s.role === 'NONE' ? 'NONE' : (s.role as any), cookie));

    // Amend the reason where the instrument or the route tree, not the
    // application, is the limit. The note NEVER changes a `fail` — a 500 is a
    // 500 regardless of why the route is shaped the way it is.
    if (s.group === 'public tracking page' && !track.token) {
      if (e.verdict !== 'fail') e.verdict = 'not-reachable';
      e.reason = `${e.reason} — ${track.reason}`;
    }
    if (s.note && e.verdict !== 'fail') {
      e.reason = `${e.reason} — ${s.note}`;
    }
    entries.push(e);
  }

  record.pass2 = {
    at: new Date().toISOString(),
    surfaceCount: PASS2_SURFACES.length,
    sysadmin: { email: sysadmin.email, userId: sysadmin.id },
    trackingToken: { found: Boolean(track.token), reason: track.reason },
  };
  // IDEMPOTENT: drop any previous pass-2 rows before appending, so re-running
  // this phase corrects the artefact instead of doubling it. A sweep that
  // silently duplicates rows inflates every downstream count while every
  // assertion still passes.
  record.entries = [
    ...record.entries.filter((e: any) => !String(e.label).startsWith('pass2:')),
    ...entries,
  ];
  writeFileSync(clickPath, JSON.stringify(record, null, 2) + '\n');

  const counts = {
    pass: record.entries.filter((e: any) => e.verdict === 'pass').length,
    fail: record.entries.filter((e: any) => e.verdict === 'fail').length,
    notReachable: record.entries.filter((e: any) => e.verdict === 'not-reachable').length,
  };
  console.log(
    `\nmerged total ${record.entries.length} entries — pass ${counts.pass} · fail ${counts.fail} · not-reachable ${counts.notReachable}`,
  );
}

// ---------------------------------------------------------------------------
// --surfaces3 — quick-605's nuqs sweep.
//
// Reuses login()/visit()/the log-slice machinery rather than being a third
// harness. It writes its OWN artefact into quick-605's evidence directory and
// NEVER touches `04-click-through.json` — quick-604's pass-1 and pass-2 records
// are evidence for a closed task and are not rewritten by a later one.
//
// The authority for this sweep is NOT the HTTP status. It is the presence of the
// literal string `nuqs requires an adapter` in the full body or the correlated
// log slice. A 200 with that string in the log would be a swallowed failure; a
// 500 without it is a DIFFERENT defect and must not be attributed to nuqs.
// ---------------------------------------------------------------------------

const NUQS_MARKER = 'nuqs requires an adapter';

const QUICK_605_EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/605-fix-the-two-production-screens-that-500-/evidence',
);

type Surface3 = {
  /** `__DRIVER_ID__`, `__IMPORT_ID__`, `__MODEL__` are substituted from staging by SQL. */
  path: string;
  route: string;
  role: 'OWNER_A' | 'SYSADMIN';
  routeGroup: string;
  note?: string;
  /**
   * Extra named substrings, merged with the nuqs marker. These are the EMPTY-STATE
   * sentences of the pages whose grid sits behind a data gate: their presence is
   * positive evidence that the grid branch was NOT taken, which is what separates
   * a LATENT row from a safe one. Without them a 200 is just a 200.
   */
  markers?: Record<string, string>;
};

const SURFACES3: Surface3[] = [
  {
    path: '/carrier/driver-pay/settlements',
    route: '/carrier/driver-pay/settlements',
    role: 'OWNER_A',
    routeGroup: '(owner)',
  },
  { path: '/checklists/automation', route: '/checklists/automation', role: 'OWNER_A', routeGroup: '(owner)' },
  {
    path: '/carrier/driver-pay/reports',
    route: '/carrier/driver-pay/reports',
    role: 'OWNER_A',
    routeGroup: '(owner)',
    note: 'the DEFAULT tab — `overview`. Line 122 of the page replaces the whole content block with an empty state when the period has no payroll, so on staging this row does not render a grid at all.',
    markers: { emptyStateShown: 'No payroll activity in this period' },
  },
  {
    path: '/carrier/driver-pay/reports?tab=settlement-history',
    route: '/carrier/driver-pay/reports?tab=settlement-history',
    role: 'OWNER_A',
    routeGroup: '(owner)',
    note: 'the same page with an explicit tab, so `SettlementHistoryReport` — a `useDataGrid` consumer — renders regardless of whether staging has payroll data. This row, not the default one, is the measurement of the grid.',
  },
  {
    path: '/carrier/driver-pay/reports/__DRIVER_ID__',
    route: '/carrier/driver-pay/reports/[driverId]',
    role: 'OWNER_A',
    routeGroup: '(owner)',
    note: 'its `SettlementsYtdTable` grid sits behind `settlements.length === 0` at line 124 — the same shape as the `reports` overview tab, and a second data gate the plan did not anticipate.',
    markers: { emptyStateShown: 'No finalized or paid settlements for' },
  },
  {
    path: '/carrier/imports/__IMPORT_ID__/stops',
    route: '/carrier/imports/[id]/stops',
    role: 'OWNER_A',
    routeGroup: '(owner)',
  },
  { path: '/docs/features', route: '/docs/features', role: 'SYSADMIN', routeGroup: '(admin)' },
  {
    path: '/docs/database/__MODEL__',
    route: '/docs/database/[model]',
    role: 'SYSADMIN',
    routeGroup: '(admin)',
  },
];

/**
 * Resolve the three dynamic segments from staging by SQL, the way
 * `findTrackingToken()` does. An empty table yields a `not-reachable` verdict
 * with the reason committed as a string — never a skipped row, and never folded
 * into `pass`.
 */
async function resolveSurface3Ids(
  ownerTenantId: string,
): Promise<Record<string, { value: string | null; reason: string }>> {
  const c = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    /**
     * Scoped to OWNER_A's tenant, NOT "the first row in the table". The page
     * reads through the tenant-scoped client, so a row belonging to the other
     * seeded tenant comes back null and the page answers 404 — a measurement of
     * the id this script chose, not of the page.
     */
    async function firstId(
      table: string,
      tenantColumn: string,
      column = 'id',
    ): Promise<{ value: string | null; reason: string }> {
      const r = await c.query<{ v: string }>(
        `SELECT ${column}::text AS v FROM public.${table} WHERE ${tenantColumn} = $1 ORDER BY ${column} LIMIT 1`,
        [ownerTenantId],
      );
      if (r.rows[0]?.v) {
        return { value: r.rows[0].v, reason: `staging ${table}.${column} scoped to OWNER_A's tenant` };
      }
      const n = (
        await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table}`)
      ).rows[0].n;
      return {
        value: null,
        reason: `public.${table} holds ZERO rows for OWNER_A's tenant on staging (${n} row(s) tenant-wide) — no id to substitute`,
      };
    }

    const driver = await firstId('carrier_drivers', 'org_id');
    const imp = await firstId('document_imports', 'org_id');

    // `[model]` is not a database row — it is a Prisma MODEL NAME, resolved from
    // schema.prisma the way the page's own generateStaticParams does.
    const schema = readFileSync(resolve(APP_ROOT, 'prisma/schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
    const modelMatch = schema.match(/^model\s+(\w+)\s*\{/m);
    const model = modelMatch
      ? { value: modelMatch[1], reason: 'first `model` block in apps/web/prisma/schema.prisma' }
      : { value: null, reason: 'no `model` block found in apps/web/prisma/schema.prisma' };

    return { __DRIVER_ID__: driver, __IMPORT_ID__: imp, __MODEL__: model };
  } finally {
    await c.end();
  }
}

async function surfaces3() {
  if (!existsSync(QUICK_605_EVIDENCE_DIR)) mkdirSync(QUICK_605_EVIDENCE_DIR, { recursive: true });

  const outName = (() => {
    const i = process.argv.indexOf('--out');
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return '01-before-verdicts.json';
  })();

  const fx = await pickFixtures();

  const sysadmin = await (async () => {
    const c = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
    await c.connect();
    try {
      const r = await c.query<{ id: string; email: string; tenantId: string }>(
        `SELECT id, email, "tenantId" FROM public."User" WHERE email = $1 AND "isSystemAdmin" = true LIMIT 1`,
        [SYSADMIN_EMAIL],
      );
      return r.rows[0] ?? null;
    } finally {
      await c.end();
    }
  })();
  if (!sysadmin) {
    refuse(
      'no isSystemAdmin User on staging — run `npx tsx scripts/seed-staging-auth.ts --seed-sysadmin` first. ' +
        'Marking the two (admin) nuqs pages not-reachable by default is exactly the omission this sweep exists to close.',
    );
  }

  const ids = await resolveSurface3Ids(fx.ownerA.tenantId);
  for (const [k, v] of Object.entries(ids)) {
    console.log(`  ${k} = ${v.value ?? 'NONE'} (${v.reason})`);
  }

  console.log('logging in …');
  const sessions = {
    OWNER_A: await login('OWNER_A', fx.ownerA.email, fx.ownerA.tenantId, fx.ownerA.id),
    SYSADMIN: await login('OWNER_A' as Role, sysadmin.email, sysadmin.tenantId, sysadmin.id),
  };

  const entries: (Entry & {
    route: string;
    routeGroup: string;
    nuqsMarker: boolean;
    emptyStateShown?: boolean;
  })[] = [];
  console.log('\nquick-605 nuqs surfaces:');
  for (const s of SURFACES3) {
    let path = s.path;
    let unresolved: { token: string; reason: string } | null = null;
    for (const token of Object.keys(ids)) {
      if (!path.includes(token)) continue;
      const r = ids[token];
      if (!r.value) unresolved = { token, reason: r.reason };
      else path = path.replace(token, encodeURIComponent(r.value));
    }

    if (unresolved) {
      // NO REQUEST IS ISSUED. A fabricated id measures the id, not the page —
      // an earlier draft substituted a placeholder string and got a 500 with
      // SQLSTATE `P2007` (invalid UUID), which reads exactly like an
      // application defect and is nothing of the kind. The row still exists,
      // with status null and the reason committed as a string.
      const e: Entry = {
        surface: s.path,
        label: `nuqs:${s.routeGroup}`,
        role: s.role === 'SYSADMIN' ? 'SYSADMIN' : 'OWNER_A',
        method: 'GET',
        status: null,
        verdict: 'not-reachable',
        reason: `no request issued — ${unresolved.reason}`,
        sqlstate: null,
        logByteRange: [logSize(), logSize()],
        logTc001Mentions: 0,
        bodyExcerpt: '',
        markers: { nuqs: false },
      };
      console.log(`  ${'—'.padEnd(4)} ${'not-reachable'.padEnd(14)} ${s.route}  (no request issued)`);
      entries.push({ ...e, route: s.route, routeGroup: s.routeGroup, nuqsMarker: false });
      continue;
    }

    const cookie = sessions[s.role].cookie;
    const e = await visit(path, `nuqs:${s.routeGroup}`, s.role === 'SYSADMIN' ? 'SYSADMIN' : 'OWNER_A', cookie, {}, {
      nuqs: NUQS_MARKER,
      ...(s.markers ?? {}),
    });

    if (s.note) e.reason = `${e.reason} — ${s.note}`;

    entries.push({
      ...e,
      route: s.route,
      routeGroup: s.routeGroup,
      nuqsMarker: Boolean(e.markers?.nuqs),
      emptyStateShown: e.markers?.emptyStateShown,
    });
  }

  const record = {
    task: 'quick-605',
    phase: 'nuqs-surfaces',
    artefact: outName,
    at: new Date().toISOString(),
    base: BASE,
    authority:
      'the literal string `nuqs requires an adapter` in the full body or the correlated log slice — NOT the HTTP status',
    dynamicSegments: ids,
    sessions: [
      { role: 'OWNER_A', email: sessions.OWNER_A.email },
      { role: 'SYSADMIN', email: sysadmin.email },
    ],
    entries,
  };
  writeFileSync(resolve(QUICK_605_EVIDENCE_DIR, outName), JSON.stringify(record, null, 2) + '\n');

  const withMarker = entries.filter((e) => e.nuqsMarker).length;
  console.log(
    `\n${entries.length} rows — pass ${entries.filter((e) => e.verdict === 'pass').length} · fail ${entries.filter((e) => e.verdict === 'fail').length} · not-reachable ${entries.filter((e) => e.verdict === 'not-reachable').length}`,
  );
  console.log(`rows carrying \`${NUQS_MARKER}\`: ${withMarker}`);
  console.log(`wrote ${outName}`);
}

// ---------------------------------------------------------------------------
// --writes — WROTE vs SILENT_NO_OP vs REFUSED
// ---------------------------------------------------------------------------

const PROBE_NAME = `604-probe client ${Date.now()}`;

async function privileged<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const who = (await c.query<{ cu: string }>('SELECT current_user AS cu')).rows[0].cu;
    if (who === 'app_user') {
      refuse('the counter-read connection is app_user — it cannot tell "no row" from "no permission"');
    }
    return await fn(c);
  } finally {
    await c.end();
  }
}

type WriteEntry = {
  n: number;
  path: string;
  command: 'INSERT' | 'UPDATE' | 'DELETE';
  httpStatus: number | null;
  verdict: 'WROTE' | 'SILENT_NO_OP' | 'REFUSED';
  before: unknown;
  after: unknown;
  sqlstate: string | null;
  logByteRange: [number, number];
  bodyExcerpt: string;
  note: string;
};

async function request(
  method: string,
  path: string,
  cookie: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const from = logSize();
  let status: number | null = null;
  let text = '';
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        cookie,
        Origin: ORIGIN,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      redirect: 'manual',
    });
    status = res.status;
    text = (await res.text()).slice(0, 20_000);
  } catch (e) {
    text = `TRANSPORT_ERROR ${String((e as Error)?.message ?? e)}`;
  }
  await sleep(350);
  const to = logSize();
  return { status, text, from, to, slice: logSlice(from, to) };
}

/**
 * Path 4 needs the Server Action id, which is minted at build time and appears
 * in the client chunk as `createServerReference("<id>", …, "saveOperationsSettings")`.
 * Recovered from the page's own scripts rather than hardcoded.
 */
async function findServerActionId(pagePath: string, actionName: string, cookie: string) {
  // The anchor is the compiler's own marker comment, which keeps the id and the
  // NAME adjacent:
  //   __next_internal_action_entry_do_not_use__ [{"<id>":{"name":"<action>"}}, …
  // `createServerReference("<id>", …, "<action>")` is NOT a usable anchor under
  // Turbopack: the call is split across hundreds of characters of mangled module
  // identifiers, so a bounded regex between the two never matches.
  const re = new RegExp(
    `__next_internal_action_entry_do_not_use__\\s*\\[\\{\\s*"([0-9a-f]{20,})"\\s*:\\s*\\{\\s*"name"\\s*:\\s*"${actionName}"`,
  );

  // 1. The page's own served scripts.
  const res = await fetch(`${BASE}${pagePath}`, { headers: { cookie }, redirect: 'manual' });
  const html = await res.text();
  const inline = html.match(re);
  if (inline) return inline[1];
  for (const src of Array.from(html.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1])) {
    const url = src.startsWith('http') ? src : `${BASE}${src}`;
    const js = await fetch(url, { headers: { cookie } }).then((r) => (r.ok ? r.text() : ''));
    const m = js.match(re);
    if (m) return m[1];
  }

  // 2. Turbopack loads the page's action chunk LAZILY, so it is not in the
  //    initial <script src> list. Fall back to the chunks on disk, which the dev
  //    server has already emitted by the time the page rendered.
  const chunkDir = resolve(APP_ROOT, '.next/dev/static/chunks');
  if (existsSync(chunkDir)) {
    for (const name of readdirSync(chunkDir)) {
      if (!name.endsWith('.js')) continue;
      const m = readFileSync(resolve(chunkDir, name), 'utf8').match(re);
      if (m) return m[1];
    }
  }
  return null;
}

async function writes() {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  const fx = await pickFixtures();
  const owner = await login('OWNER_A', fx.ownerA.email, fx.ownerA.tenantId, fx.ownerA.id);
  const tenantId = owner.tenantId;
  const results: WriteEntry[] = [];

  const countProbeClients = () =>
    privileged(async (c) =>
      Number(
        (
          await c.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.clients WHERE name LIKE '604-probe%'`,
          )
        ).rows[0].n,
      ),
    );

  // ---- 1. INSERT -----------------------------------------------------------
  const before1 = await countProbeClients();
  const r1 = await request('POST', '/api/v1/carrier/clients', owner.cookie, {
    name: PROBE_NAME,
    city: 'Probeville',
  });
  const after1 = await countProbeClients();
  const created = await privileged(async (c) =>
    (
      await c.query<{ id: string; city: string | null }>(
        `SELECT id, city FROM public.clients WHERE name = $1 LIMIT 1`,
        [PROBE_NAME],
      )
    ).rows[0],
  );
  results.push({
    n: 1,
    path: 'POST /api/v1/carrier/clients',
    command: 'INSERT',
    httpStatus: r1.status,
    verdict:
      r1.status !== null && r1.status >= 200 && r1.status < 300
        ? after1 > before1
          ? 'WROTE'
          : 'SILENT_NO_OP'
        : 'REFUSED',
    before: { probeClients: before1 },
    after: { probeClients: after1 },
    sqlstate:
      r1.status !== null && r1.status >= 200 && r1.status < 300
        ? null
        : (recoverSqlstate(r1.slice, r1.text) ?? 'SQLSTATE_UNRECOVERED'),
    logByteRange: [r1.from, r1.to],
    bodyExcerpt: r1.text.slice(0, 1500),
    note: 'the loud case — an RLS refusal here is 42501, which proves the instrument can see a raise',
  });

  // ---- 2. UPDATE (the silent case) ----------------------------------------
  if (created) {
    const beforeCity = created.city;
    const r2 = await request('PATCH', `/api/v1/carrier/clients/${created.id}`, owner.cookie, {
      city: '604-probe-updated',
    });
    const afterCity = await privileged(async (c) =>
      (
        await c.query<{ city: string | null }>(`SELECT city FROM public.clients WHERE id = $1`, [
          created.id,
        ])
      ).rows[0]?.city ?? null,
    );
    results.push({
      n: 2,
      path: `PATCH /api/v1/carrier/clients/[id]`,
      command: 'UPDATE',
      httpStatus: r2.status,
      verdict:
        r2.status !== null && r2.status >= 200 && r2.status < 300
          ? afterCity !== beforeCity
            ? 'WROTE'
            : 'SILENT_NO_OP'
          : 'REFUSED',
      before: { city: beforeCity },
      after: { city: afterCity },
      sqlstate:
        r2.status !== null && r2.status >= 200 && r2.status < 300
          ? null
          : (recoverSqlstate(r2.slice, r2.text) ?? 'SQLSTATE_UNRECOVERED'),
      logByteRange: [r2.from, r2.to],
      bodyExcerpt: r2.text.slice(0, 1500),
      note: 'THE SILENT CASE — an UPDATE refused by RLS is 0 rows with no error (policy-satisfiability-sweep §4.1)',
    });

    // ---- 3. DELETE --------------------------------------------------------
    // `DELETE /api/v1/carrier/clients/[id]` is a SOFT delete: `softDeleteClient`
    // sets `status = 'inactive'` and the response says `{"status":"inactive"}`.
    // The counter-read therefore watches `status`, which is what the endpoint
    // claims to change. Watching `deleted_at` — a column this path never touches
    // — produced a FALSE `SILENT_NO_OP` on the first run, and a false
    // SILENT_NO_OP would poison the report exactly as badly as a missed one.
    const readStatus = () =>
      privileged(async (c) =>
        (
          await c.query<{ status: string | null }>(`SELECT status FROM public.clients WHERE id = $1`, [
            created.id,
          ])
        ).rows[0]?.status ?? null,
      );
    const before3 = await readStatus();
    const r3 = await request('DELETE', `/api/v1/carrier/clients/${created.id}`, owner.cookie, undefined);
    const after3 = await readStatus();
    results.push({
      n: 3,
      path: `DELETE /api/v1/carrier/clients/[id]`,
      command: 'DELETE',
      httpStatus: r3.status,
      verdict:
        r3.status !== null && r3.status >= 200 && r3.status < 300
          ? after3 !== before3 && after3 === 'inactive'
            ? 'WROTE'
            : 'SILENT_NO_OP'
          : 'REFUSED',
      before: { status: before3 },
      after: { status: after3 },
      sqlstate:
        r3.status !== null && r3.status >= 200 && r3.status < 300
          ? null
          : (recoverSqlstate(r3.slice, r3.text) ?? 'SQLSTATE_UNRECOVERED'),
      logByteRange: [r3.from, r3.to],
      bodyExcerpt: r3.text.slice(0, 1500),
      note: 'silent case — a SOFT delete (status → inactive), not a row removal; the counter-read watches the field the endpoint claims to change',
    });
  } else {
    for (const n of [2, 3] as const) {
      results.push({
        n,
        path: n === 2 ? 'PATCH /api/v1/carrier/clients/[id]' : 'DELETE /api/v1/carrier/clients/[id]',
        command: n === 2 ? 'UPDATE' : 'DELETE',
        httpStatus: null,
        verdict: 'REFUSED',
        before: null,
        after: null,
        sqlstate: 'NOT_REACHED — the INSERT in #1 produced no row to act on',
        logByteRange: [0, 0],
        bodyExcerpt: '',
        note: 'dependent on #1',
      });
    }
  }

  // ---- 4. /settings/operations server action → Tenant.update ---------------
  const readFlags = () =>
    privileged(async (c) =>
      (
        await c.query<{ r: boolean; b: boolean }>(
          `SELECT "requirePreTripInspection" AS r, "blockTripStartOnFailedInspection" AS b FROM public."Tenant" WHERE id = $1`,
          [tenantId],
        )
      ).rows[0],
    );

  const original = await readFlags();
  const actionId = await findServerActionId('/settings/operations', 'saveOperationsSettings', owner.cookie);
  if (!actionId) {
    results.push({
      n: 4,
      path: '/settings/operations server action → Tenant.update',
      command: 'UPDATE',
      httpStatus: null,
      verdict: 'REFUSED',
      before: original,
      after: original,
      sqlstate: 'ACTION_ID_UNRECOVERED',
      logByteRange: [0, 0],
      bodyExcerpt: '',
      note: 'the Server Action id could not be recovered from the page bundle — recorded, not guessed',
    });
  } else {
    const flipped = {
      requirePreTripInspection: !original.r,
      blockTripStartOnFailedInspection: !original.b,
    };
    const r4 = await request('POST', '/settings/operations', owner.cookie, JSON.stringify([flipped]), {
      'Next-Action': actionId,
      'Content-Type': 'text/plain;charset=UTF-8',
    });
    const afterFlags = await readFlags();
    const changed = afterFlags.r !== original.r || afterFlags.b !== original.b;
    results.push({
      n: 4,
      path: '/settings/operations server action → Tenant.update',
      command: 'UPDATE',
      httpStatus: r4.status,
      verdict:
        r4.status !== null && r4.status >= 200 && r4.status < 300
          ? changed
            ? 'WROTE'
            : 'SILENT_NO_OP'
          : 'REFUSED',
      before: original,
      after: afterFlags,
      sqlstate:
        r4.status !== null && r4.status >= 200 && r4.status < 300
          ? null
          : (recoverSqlstate(r4.slice, r4.text) ?? 'SQLSTATE_UNRECOVERED'),
      logByteRange: [r4.from, r4.to],
      bodyExcerpt: r4.text.slice(0, 1500),
      note: 'policy-satisfiability-sweep §5.2 row 1 — measures whether quick-599 tenant_self_update closed it END TO END',
    });

    // Restore, and ASSERT the restore landed.
    if (changed) {
      await privileged(async (c) => {
        await c.query(
          `UPDATE public."Tenant" SET "requirePreTripInspection" = $2, "blockTripStartOnFailedInspection" = $3 WHERE id = $1`,
          [tenantId, original.r, original.b],
        );
      });
    }
    const restored = await readFlags();
    if (restored.r !== original.r || restored.b !== original.b) {
      console.error('604-click-through: RESTORE OF PATH 4 DID NOT LAND');
      process.exit(1);
    }
    console.log('  path 4 restore asserted: flags back to their original values');
  }

  // ---- cleanup assertion ---------------------------------------------------
  const leftover = await privileged(async (c) =>
    Number(
      (
        await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM public.clients WHERE name LIKE '604-probe%' AND deleted_at IS NULL`,
        )
      ).rows[0].n,
    ),
  );
  if (leftover > 0) {
    // Self-clean, then re-assert. A probe row left behind is staging drift.
    await privileged(async (c) => {
      await c.query(`DELETE FROM public.clients WHERE name LIKE '604-probe%'`);
    });
  }
  const leftoverAfter = await privileged(async (c) =>
    Number(
      (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.clients WHERE name LIKE '604-probe%'`))
        .rows[0].n,
    ),
  );

  writeFileSync(
    resolve(EVIDENCE_DIR, '05-writes.json'),
    JSON.stringify(
      {
        task: 'quick-604',
        phase: 'writes',
        at: new Date().toISOString(),
        probeName: PROBE_NAME,
        counterReadConnection: 'STAGING_DIRECT_URL (postgres) — asserted NOT app_user',
        leftoverProbeClientsAtEnd: leftoverAfter,
        leftoverNeededForcedCleanup: leftover > 0,
        entries: results,
      },
      null,
      2,
    ) + '\n',
  );

  for (const r of results) {
    console.log(`  #${r.n} ${r.command.padEnd(6)} HTTP ${String(r.httpStatus ?? 'n/a').padEnd(4)} ${r.verdict}`);
  }
  console.log(`  leftover 604-probe clients rows at end: ${leftoverAfter}`);
}

// ---------------------------------------------------------------------------
// --pgstat — guard 2
// ---------------------------------------------------------------------------

async function pgstat(label: string) {
  const prodDirect = (() => {
    const text = readFileSync(resolve(REPO_ROOT, '.env'), 'utf8').replace(/\r\n/g, '\n');
    const m = text.match(/^DIRECT_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
    if (!m) refuse('DIRECT_URL not found in repo-root .env');
    if (!m[1].includes(PRODUCTION_REF)) refuse('repo-root DIRECT_URL does not name production');
    return m[1];
  })();

  const SQL =
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE usename = 'app_user')::int AS app_user FROM pg_stat_activity";

  async function one(url: string) {
    const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
    await c.connect();
    try {
      return (await c.query<{ total: number; app_user: number }>(SQL)).rows[0];
    } finally {
      await c.end();
    }
  }

  const staging = await one(DIRECT_URL!);
  const production = await one(prodDirect);
  const line = {
    label,
    at: new Date().toISOString(),
    staging,
    production,
  };
  /**
   * quick-606 (additive): `--pgstat-out <file>` writes into a LATER task's
   * evidence directory. Without it this appends to quick-604's `04-pgstat.json`
   * — a closed task's evidence — which is exactly the corruption `--surfaces3`
   * and `--surfaces606` are careful to avoid. Default unchanged.
   */
  const path = (() => {
    const i = process.argv.indexOf('--pgstat-out');
    if (i >= 0 && process.argv[i + 1]) return resolve(process.argv[i + 1]);
    return resolve(EVIDENCE_DIR, '04-pgstat.json');
  })();
  const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  prev.push(line);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(prev, null, 2) + '\n');
  console.log(
    `  ${label}: staging total=${staging.total} app_user=${staging.app_user} · production total=${production.total} app_user=${production.app_user}`,
  );
  if (production.app_user !== 0) {
    console.error('604-click-through: PRODUCTION SHOWS AN app_user CONNECTION. Stop.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// --surfaces606 — quick-606's re-verification and re-run sweep.
//
// Additive, modelled on --surfaces3. It writes its OWN artefact into quick-606's
// evidence directory against quick-606's OWN server log (CLICK_THROUGH_LOG) and
// NEVER touches `04-click-through.json` or quick-605's artefacts.
//
// TWO VERDICTS THIS FILE DID NOT HAVE BEFORE, and they exist because quick-605
// proved on `/carrier/driver-pay/reports` that "a LATENT row is not a safe row":
//
//   NOT_MEASURED — no request was issued, or the request could not exercise the
//                  statement at all. Never folded into pass.
//   LATENT       — the surface answered 2xx, but the table its principal query
//                  reads holds ZERO rows on staging, so the 200 proves the raise
//                  is gone and NOTHING about the scoping. Named, with the count.
//
// The `dataGate` on each row is a privileged COUNT taken before the sweep. It is
// what separates the two honestly: `pass` survives only where the gate found
// rows. A row with no gate is one whose work needs no tenant rows to execute
// (a DDL bootstrap, a grant check) and says so.
// ---------------------------------------------------------------------------

const QUICK_606_EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence',
);

type Verdict606 = 'pass' | 'fail' | 'not-reachable' | 'LATENT' | 'NOT_MEASURED';

type Surface606 = {
  /** The row number in the plan's `<the_thirteen>` table, or `U1`/`U2` for the two unmeasured rows. */
  id: string;
  path: string;
  route: string;
  role: Role | 'CRON' | 'NONE';
  /** quick-604's verdict, carried so the re-verification table is machine-built. */
  quick604: { verdict: string; sqlstate: string | null; note: string };
  /**
   * A privileged COUNT. Zero means a 2xx is LATENT, not a pass. The label is the
   * sentence that goes in the report; write it so a reader knows what was empty.
   */
  dataGate?: { sql: string; params?: 'ownerTenant' | 'driverUser'; label: string };
  /** Stated reason a row cannot be driven at all — makes it NOT_MEASURED with no request issued. */
  markers?: Record<string, string>;
};

const SURFACES606: Surface606[] = [
  {
    id: '1',
    path: '/carrier/trips',
    route: '/carrier/trips',
    role: 'OWNER_A',
    quick604: { verdict: 'fail', sqlstate: 'TC001', note: 'bare-client tenant-scoped read at page.tsx:19 (§7a)' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public.carrier_drivers WHERE org_id = $1`,
      params: 'ownerTenant',
      label: 'carrier_drivers for OWNER_A\'s tenant — the page\'s first bare-client statement',
    },
  },
  {
    id: '2',
    path: '/documents',
    route: '/documents',
    role: 'DRIVER_A',
    quick604: { verdict: 'fail', sqlstate: 'P2022', note: 'staging Document column drift (§7e) + a latent §7a read' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."Document" WHERE "driverId" = $1`,
      params: 'driverUser',
      label: 'Document rows for the DRIVER_A fixture — the page\'s only read',
    },
  },
  {
    id: '3',
    path: '/api/cron/carrier-auto-dispatch',
    route: '/api/cron/carrier-auto-dispatch',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: 'SQLSTATE_UNRECOVERED', note: 'fixture data (§7f) — a NOT_INVOKED in all but name' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public.route_templates WHERE org_id = $1 AND auto_generate_days_ahead > 0`,
      params: 'ownerTenant',
      label: 'route_templates with autoGenerateDaysAhead > 0 — the rows the route iterates',
    },
  },
  {
    id: '4',
    path: '/api/cron/carrier-compliance-alerts',
    route: '/api/cron/carrier-compliance-alerts',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: '42501', note: 'runtime connection asked to run DDL (§7c)' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."Tenant" WHERE "isActive" = true`,
      params: undefined,
      label: 'active Tenant rows — the sweep the DDL bootstrap was masking',
    },
  },
  {
    id: '5',
    path: '/api/cron/digest-compliance-30day',
    route: '/api/cron/digest-compliance-30day',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: 'TC001', note: 'withTenantRLS (§7b)' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."User" WHERE "isActive" = true`,
      params: undefined,
      label: 'active User rows across both tenants — the digests\' recipient query',
    },
  },
  {
    id: '6',
    path: '/api/cron/digest-daily-driver',
    route: '/api/cron/digest-daily-driver',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: 'TC001', note: 'withTenantRLS (§7b)' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."User" WHERE role = 'DRIVER' AND "isActive" = true`,
      params: undefined,
      label: 'active DRIVER User rows — the daily driver digest\'s recipient query',
    },
  },
  {
    id: '7',
    path: '/api/cron/digest-weekly-owner',
    route: '/api/cron/digest-weekly-owner',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: 'TC001', note: 'withTenantRLS (§7b)' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."User" WHERE role IN ('OWNER','MANAGER') AND "isActive" = true`,
      params: undefined,
      label: 'active OWNER/MANAGER User rows — the weekly owner digest\'s recipient query',
    },
  },
  {
    id: '8',
    path: '/api/cron/purge-deleted',
    route: '/api/cron/purge-deleted',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: 'TC001', note: 'bare-client cross-tenant DELETE sweep (§7a)' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."Document" WHERE "deletedAt" IS NOT NULL`,
      params: undefined,
      label: 'soft-deleted Document rows — one of the seven models the sweep walks',
    },
  },
  {
    id: '9',
    path: '/api/cron/send-reminders',
    route: '/api/cron/send-reminders',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: 'TC001', note: 'createTenantClient direct, check-upcoming-maintenance.ts:31' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."Truck"`,
      params: undefined,
      label: 'legacy Truck rows — findUpcomingMaintenance\'s only read',
    },
  },
  {
    id: '10',
    path: '/carrier/driver-pay/settlements',
    route: '/carrier/driver-pay/settlements',
    role: 'OWNER_A',
    quick604: { verdict: 'fail', sqlstate: 'SQLSTATE_UNRECOVERED', note: 'nuqs adapter (§7g) — quick-605 mounted it at the root (408a84ec)' },
    markers: { nuqs: 'nuqs requires an adapter' },
  },
  {
    id: '11',
    path: '/checklists/automation',
    route: '/checklists/automation',
    role: 'OWNER_A',
    quick604: { verdict: 'fail', sqlstate: 'SQLSTATE_UNRECOVERED', note: 'nuqs adapter (§7g) — quick-605 mounted it at the root (408a84ec)' },
    markers: { nuqs: 'nuqs requires an adapter' },
  },
  {
    id: '12',
    path: '/api/cron/trip-reminders',
    route: '/api/cron/trip-reminders',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: 'TC001', note: 'bare prisma.tenant.findMany sweep at :74' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public.dispatches WHERE status = 'planned'`,
      params: undefined,
      label: 'planned dispatches (Trip @@map("dispatches")) — the rows the per-tenant reminder query looks for',
    },
  },
  {
    id: '13',
    path: '/api/cron/workflow-notifications',
    route: '/api/cron/workflow-notifications',
    role: 'CRON',
    quick604: { verdict: 'fail', sqlstate: '42501', note: 'app_admin lacks SELECT on PlaybookNotification' },
    dataGate: {
      sql: `SELECT count(*)::int AS n FROM public."PlaybookInstance"`,
      params: undefined,
      label: 'PlaybookInstance rows — the sweep\'s subject',
    },
  },
  {
    id: 'U1',
    path: '/track/__TRACK_TOKEN__',
    route: '/track/[token]',
    role: 'NONE',
    quick604: { verdict: 'not-reachable', sqlstate: null, note: 'UNMEASURED — legacy "Load" holds 0 rows on staging' },
  },
  {
    id: 'U2',
    path: '/carrier/imports/__IMPORT_ID__/stops',
    route: '/carrier/imports/[id]/stops',
    role: 'OWNER_A',
    quick604: { verdict: 'not-reachable', sqlstate: null, note: 'UNMEASURED — document_imports holds 0 rows on staging' },
  },
];

/** Pull every `"key": <number>` pair out of a JSON body, so a LATENT reason can cite the route's own counters. */
function bodyCounters(body: string): Record<string, number> | null {
  const t = body.trim();
  if (!t.startsWith('{')) return null;
  try {
    const j = JSON.parse(t.slice(0, 200_000));
    const out: Record<string, number> = {};
    const walk = (o: any, prefix: string) => {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'number') out[`${prefix}${k}`] = v;
        else if (v && typeof v === 'object' && prefix.split('.').length < 3) walk(v, `${prefix}${k}.`);
      }
    };
    walk(j, '');
    return out;
  } catch {
    return null;
  }
}

async function surfaces606() {
  if (!existsSync(QUICK_606_EVIDENCE_DIR)) mkdirSync(QUICK_606_EVIDENCE_DIR, { recursive: true });
  if (!CRON_SECRET) refuse('CRON_SECRET is not set in this shell — the cron rows would measure auth, not RLS');

  const outName = (() => {
    const i = process.argv.indexOf('--out');
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return '02-reverify.json';
  })();
  const only = (() => {
    const i = process.argv.indexOf('--only');
    if (i >= 0 && process.argv[i + 1]) return new Set(process.argv[i + 1].split(','));
    return null;
  })();

  const fx = await pickFixtures();

  // --- the two substituted ids, and the data gates, on the privileged string ---
  const c = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await c.connect();
  let ids: Record<string, { value: string | null; reason: string }>;
  const gates: Record<string, { count: number | null; label: string; error?: string }> = {};
  let activeTenants = 0;
  try {
    const who = (await c.query<{ cu: string }>('SELECT current_user AS cu')).rows[0].cu;
    if (who === 'app_user') refuse('the gate connection is app_user — it cannot tell "no row" from "no permission"');

    activeTenants = (
      await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."Tenant" WHERE "isActive" = true`)
    ).rows[0].n;

    const imp = await c.query<{ v: string }>(
      `SELECT id::text AS v FROM public.document_imports WHERE org_id = $1 ORDER BY id LIMIT 1`,
      [fx.ownerA.tenantId],
    );
    const impTotal = (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM public.document_imports')).rows[0].n;
    const tok = await c.query<{ v: string }>(
      `SELECT "trackingToken" AS v FROM public."Load" WHERE "trackingToken" IS NOT NULL ORDER BY "trackingToken" LIMIT 1`,
    );
    const loadTotal = (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM public."Load"')).rows[0].n;
    ids = {
      __IMPORT_ID__: imp.rows[0]?.v
        ? { value: imp.rows[0].v, reason: "staging document_imports.id scoped to OWNER_A's tenant" }
        : {
            value: null,
            reason: `public.document_imports holds ZERO rows for OWNER_A's tenant on staging (${impTotal} tenant-wide) — no id to substitute`,
          },
      __TRACK_TOKEN__: tok.rows[0]?.v
        ? { value: tok.rows[0].v, reason: 'a legacy "Load" row carrying a trackingToken on staging' }
        : {
            value: null,
            reason: `no legacy "Load" row carries a trackingToken — public."Load" holds ${loadTotal} row(s) on staging (seed-staging.ts populates the CARRIER "loads" table instead)`,
          },
    };

    for (const s of SURFACES606) {
      if (!s.dataGate) continue;
      const p =
        s.dataGate.params === 'ownerTenant'
          ? [fx.ownerA.tenantId]
          : s.dataGate.params === 'driverUser'
            ? [fx.driverA.id]
            : [];
      try {
        const r = await c.query<{ n: number }>(s.dataGate.sql, p);
        gates[s.id] = { count: r.rows[0].n, label: s.dataGate.label };
      } catch (e) {
        gates[s.id] = { count: null, label: s.dataGate.label, error: String((e as any)?.message ?? e) };
      }
    }
  } finally {
    await c.end();
  }

  for (const [k, v] of Object.entries(ids)) console.log(`  ${k} = ${v.value ?? 'NONE'} (${v.reason})`);
  for (const [k, g] of Object.entries(gates)) console.log(`  gate ${k}: ${g.count ?? `ERROR ${g.error}`}  (${g.label})`);

  console.log('logging in …');
  const sessions = {
    OWNER_A: await login('OWNER_A', fx.ownerA.email, fx.ownerA.tenantId, fx.ownerA.id),
    DRIVER_A: await login('DRIVER_A', fx.driverA.email, fx.driverA.tenantId, fx.driverA.id),
  };

  const rows: any[] = [];
  console.log('\nquick-606 surfaces:');
  for (const s of SURFACES606) {
    if (only && !only.has(s.id)) continue;

    let path = s.path;
    let unresolved: { token: string; reason: string } | null = null;
    for (const token of Object.keys(ids)) {
      if (!path.includes(token)) continue;
      if (!ids[token].value) unresolved = { token, reason: ids[token].reason };
      else path = path.replace(token, encodeURIComponent(ids[token].value!));
    }

    if (unresolved) {
      // NO REQUEST IS ISSUED. A fabricated id measures the id, not the page.
      console.log(`  ${'—'.padEnd(4)} ${'NOT_MEASURED'.padEnd(13)} ${s.route}  (no request issued)`);
      rows.push({
        id: s.id,
        route: s.route,
        surface: s.path,
        role: s.role,
        status: null,
        verdict606: 'NOT_MEASURED' as Verdict606,
        reason: `no request issued — ${unresolved.reason}`,
        sqlstate: null,
        logByteRange: [logSize(), logSize()],
        logTc001Mentions: 0,
        quick604: s.quick604,
        dataGate: gates[s.id] ?? null,
        bodyCounters: null,
        bodyExcerpt: '',
      });
      continue;
    }

    const cookie =
      s.role === 'OWNER_A' ? sessions.OWNER_A.cookie : s.role === 'DRIVER_A' ? sessions.DRIVER_A.cookie : null;
    const headers: Record<string, string> = s.role === 'CRON' ? { Authorization: `Bearer ${CRON_SECRET}` } : {};
    const e = await visit(path, `606:${s.id}`, s.role === 'CRON' ? 'CRON' : s.role === 'NONE' ? 'NONE' : s.role, cookie, headers, s.markers ?? {});

    const gate = gates[s.id] ?? null;
    let verdict606: Verdict606 = e.verdict;
    let reason = e.reason;

    /**
     * THE SILENT PARTIAL SWEEP — found by this sweep's first run and not
     * predicted by anything.
     *
     * A cross-tenant cron whose tenant list comes off the BARE client does not
     * necessarily raise `TC001`. `unmigrated-path-tripwire.md` §8 item 7: the
     * pool holds `max: 1`, so if an earlier tenant-scoped statement left
     * `app.current_tenant_id` set, `current_tenant_id()` returns a value, the
     * tripwire branch is never taken, and the sweep is simply FILTERED to that
     * one tenant. It then reports `ok: true` having silently skipped every other
     * tenant — which is worse than the raise, and is precisely the erasure
     * quick-603 removed from these routes once already.
     *
     * So a route that names how many tenants it processed is checked against the
     * privileged count of active tenants. Fewer is a `fail`, not a `pass`, and it
     * carries no SQLSTATE because no statement was refused.
     */
    const sweptKey = e.markers
      ? null
      : Object.keys(bodyCounters(e.bodyExcerpt) ?? {}).find((k) =>
          /^(tenantsProcessed|processedTenants)$/.test(k),
        );
    const swept = sweptKey ? (bodyCounters(e.bodyExcerpt) ?? {})[sweptKey] : null;
    if (e.verdict === 'pass' && swept !== null && swept !== undefined && swept < activeTenants) {
      verdict606 = 'fail';
      reason = `${e.reason} — SILENT PARTIAL SWEEP: the route reports ${sweptKey}=${swept} against ${activeTenants} active tenants on staging. No statement was refused; the bare tenant list was RLS-FILTERED to whatever app.current_tenant_id an earlier request left on the max:1 pool (unmigrated-path-tripwire.md §8 item 7)`;
    } else if (e.verdict === 'pass' && gate && gate.count === 0) {
      verdict606 = 'LATENT';
      reason = `${e.reason} — but ${gate.label} = 0 on staging, so the 2xx proves the raise is gone and NOTHING about the scoping (R3)`;
    } else if (e.verdict === 'pass' && gate && gate.count === null) {
      verdict606 = 'NOT_MEASURED';
      reason = `${e.reason} — the data gate could not be read (${gate.error}), so whether this 2xx exercised anything is unknown`;
    }

    console.log(`  ${String(e.status ?? 'ERR').padEnd(4)} ${verdict606.padEnd(13)} ${s.route}  ${e.sqlstate ?? ''}`);
    rows.push({
      id: s.id,
      route: s.route,
      surface: s.path,
      requestedPath: path,
      role: s.role,
      status: e.status,
      verdict606,
      harnessVerdict: e.verdict,
      reason,
      sqlstate: e.sqlstate,
      logByteRange: e.logByteRange,
      logTc001Mentions: e.logTc001Mentions,
      quick604: s.quick604,
      dataGate: gate,
      markers: e.markers ?? null,
      bodyCounters: bodyCounters(e.bodyExcerpt),
      bodyExcerpt: e.bodyExcerpt,
    });
  }

  const record = {
    task: 'quick-606',
    phase: 'surfaces606',
    artefact: outName,
    at: new Date().toISOString(),
    base: BASE,
    serverLog: SERVER_LOG,
    authority:
      'the correlated server-log slice, not the HTTP status. TC001 is detected BY CODE, never by message prose.',
    activeTenantsOnStaging: activeTenants,
    verdictVocabulary: {
      pass: 'a 2xx with no TC001 in the correlated window, no swallowed-failure marker, a tenant sweep that covered every active tenant, AND a data gate that found rows',
      LATENT: 'a 2xx whose data gate found ZERO rows — the raise is gone, the scoping is unproven (R3)',
      NOT_MEASURED: 'no request was issued, or the gate could not be read',
      fail: 'a 5xx, a 4xx, a TC001 in the window, a swallowed-failure marker in the body, or a SILENT PARTIAL SWEEP (a 2xx whose own counter reports fewer tenants than staging has)',
      'not-reachable': 'a 404, or a redirect away from the requested surface',
    },
    dynamicSegments: ids,
    sessions: [
      { role: 'OWNER_A', email: sessions.OWNER_A.email, tenantId: sessions.OWNER_A.tenantId },
      { role: 'DRIVER_A', email: sessions.DRIVER_A.email, tenantId: sessions.DRIVER_A.tenantId },
    ],
    rows,
  };
  writeFileSync(resolve(QUICK_606_EVIDENCE_DIR, outName), JSON.stringify(record, null, 2) + '\n');

  const tally = (v: Verdict606) => rows.filter((r) => r.verdict606 === v).length;
  console.log(
    `\n${rows.length} rows — pass ${tally('pass')} · fail ${tally('fail')} · LATENT ${tally('LATENT')} · NOT_MEASURED ${tally('NOT_MEASURED')} · not-reachable ${tally('not-reachable')}`,
  );
  console.log(`wrote ${outName}`);
}

// ---------------------------------------------------------------------------

const phase = process.argv[2];
if (phase === '--surfaces') surfaces();
else if (phase === '--surfaces2') surfaces2();
else if (phase === '--surfaces3') surfaces3();
else if (phase === '--surfaces606') surfaces606();
else if (phase === '--writes') writes();
else if (phase === '--pgstat') pgstat(process.argv[3] ?? 'unlabelled');
else {
  console.error('usage: npx tsx scripts/audit/604-click-through.ts --surfaces|--surfaces2|--surfaces3 [--out <file>]|--surfaces606 [--out <file>] [--only <ids>]|--writes|--pgstat <label>');
  process.exit(1);
}
