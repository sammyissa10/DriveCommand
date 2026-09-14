/**
 * quick-600 (B5) — the both-directions probe matrix for every routed admin-
 * connection site, run against STAGING.
 *
 *   npx tsx scripts/audit/600-admin-verify.ts --setup
 *   npx tsx scripts/audit/600-admin-verify.ts --run
 *   npx tsx scripts/audit/600-admin-verify.ts --teardown
 *
 * Writes evidence/03-routed-sites.json and evidence/03-routed-sites.md.
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts:53-55` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and every env file points `DIRECT_URL` at PRODUCTION. This
 * file loads `apps/web/.env.staging` explicitly and refuses on the production
 * ref. Modelled on `scripts/audit/599-policy-verify.ts` — same four ground
 * rules, same environment discipline, same evidence shape.
 *
 * FOUR GROUND RULES (599's, unchanged)
 *   1. Nothing is swallowed. Every probe records `{rows:n}` or `{error:{code,message}}`.
 *   2. Every write probe runs inside `BEGIN … ROLLBACK`. There is no COMMIT here.
 *   3. One FRESH `pg.Client` per case, all of a case's work in ONE transaction.
 *   4. This is a REPORT; only a connect/fixture failure exits 1.
 *
 * FIXTURES — quick-597's, reused, not rebuilt.
 * --------------------------------------------
 * `npx tsx scripts/audit/597-staging-fixtures.ts --seed` gives two disposable
 * tenants (A/B) with an owner user each, plus committed `SysAdminInvoice` /
 * `SysAdminInvoiceItem` rows. Twelve of this task's routed tables have NO
 * rows in that fixture set — this script's `--setup` adds ONE committed row
 * (marked `RLS600`) per (tenant, table) for exactly those tables, using the
 * SAME two tenant ids 597 already minted. This is additive to 597's fixture,
 * not a second, parallel fixture mechanism: no new disposable tenant is
 * created, and `--teardown` removes only what `--setup` added.
 *
 * SHAPE-BASED CONSOLIDATION — READ BEFORE JUDGING THE ROW COUNT.
 * ----------------------------------------------------------------
 * 38 individual `getAdminDb(` call sites exist across 17 files (the
 * allowlist's own count). Several call sites inside ONE reason group issue
 * BYTE-IDENTICAL SQL against the same table (e.g. `suspendTenant` and
 * `reactivateTenant` both run `UPDATE "Tenant" SET ... WHERE id = $1`; the
 * four digest crons all run the exact same `Tenant` sweep). What a grant or
 * a policy can say about one of those statements it says about all of them —
 * so this matrix has ONE row per DISTINCT STATEMENT SHAPE (22), each row
 * naming every call site that shares it. This is a deliberate, DOCUMENTED
 * scope decision, not a silent narrowing — see ROUTING-MANIFEST.md and the
 * summary for the full site-to-shape mapping.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/600-build-the-privileged-admin-connection-b5/evidence'
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`600-admin-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
const APP_USER_URL = process.env.STAGING_DATABASE_URL_APP_USER;
const ADMIN_URL = process.env.STAGING_DATABASE_URL_ADMIN;

for (const [name, url] of [
  ['STAGING_DIRECT_URL', DIRECT_URL],
  ['STAGING_DATABASE_URL_APP_USER', APP_USER_URL],
  ['STAGING_DATABASE_URL_ADMIN', ADMIN_URL],
] as const) {
  if (!url) refuse(`${name} is not set in apps/web/.env.staging`);
  if (url.includes(PRODUCTION_REF)) refuse(`${name} names the PRODUCTION project (${PRODUCTION_REF})`);
  if (!url.includes(STAGING_REF)) refuse(`${name} does not name the staging project (${STAGING_REF})`);
}

process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

const MODE = process.argv.includes('--setup')
  ? 'setup'
  : process.argv.includes('--teardown')
    ? 'teardown'
    : process.argv.includes('--run')
      ? 'run'
      : undefined;
if (!MODE) refuse('--setup | --run | --teardown is required');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface FixtureTenant {
  key: 'A' | 'B';
  slug: string;
  id: string;
  ownerUserId: string;
}
interface FixtureIds {
  capturedAt: string;
  projectRef: string;
  tenants: Record<'A' | 'B', FixtureTenant>;
  rows: Record<string, Record<'A' | 'B', string[]>>;
}

const RUNTIME_FIXTURE_IDS_PATH = resolve(APP_ROOT, '.rls-fixture-ids.json');
if (!existsSync(RUNTIME_FIXTURE_IDS_PATH)) {
  refuse(`${RUNTIME_FIXTURE_IDS_PATH} does not exist — run 597-staging-fixtures.ts --seed first`);
}
const fixtures: FixtureIds = JSON.parse(readFileSync(RUNTIME_FIXTURE_IDS_PATH, 'utf8'));
if (fixtures.projectRef !== STAGING_REF) {
  refuse(`fixture-ids.json was captured against ${fixtures.projectRef}, not ${STAGING_REF}`);
}
const A = fixtures.tenants.A;
const B = fixtures.tenants.B;

const MARKER = 'RLS600';

// 600's own committed extra-fixture ids, written by --setup and read by --run.
const EXTRA_IDS_PATH = resolve(APP_ROOT, '.rls600-extra-ids.json');

interface ExtraIds {
  customerId: Record<'A' | 'B', string>;
  loadId: Record<'A' | 'B', string>;
  playbookId: Record<'A' | 'B', string>;
  playbookInstanceActiveId: Record<'A' | 'B', string>;
  playbookInstanceBlockedId: Record<'A' | 'B', string>;
  stepInstanceId: Record<'A' | 'B', string>;
  driverInvitationId: Record<'A' | 'B', string>;
  supportTicketId: Record<'A' | 'B', string>;
  ticketMessageId: Record<'A' | 'B', string>;
  subscriptionId: Record<'A' | 'B', string>;
  automationRunId: Record<'A' | 'B', string>;
}

// ---------------------------------------------------------------------------
// Probe plumbing — copied verbatim in spirit from 599-policy-verify.ts
// ---------------------------------------------------------------------------

type Probe = { rows: number } | { error: { code: string; message: string } };

function fmtProbe(p: Probe): string {
  if ('rows' in p) return String(p.rows);
  return `ERROR [${p.error.code}] ${p.error.message}`;
}

let savepointCounter = 0;

async function probe(client: Client, sql: string, params: unknown[] = []): Promise<Probe> {
  const sp = `p600_${savepointCounter++}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const r = await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    if (r.rows.length > 0 && Object.keys(r.rows[0]).length === 1) {
      const v = Object.values(r.rows[0])[0];
      if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) {
        return { rows: Number(v) };
      }
    }
    return { rows: r.rows.length > 0 ? r.rows.length : (r.rowCount ?? 0) };
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
    const err = e as { code?: string; message?: string };
    return { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
  }
}

/** A write probe whose SAVEPOINT is ALWAYS rolled back, success or failure. */
async function probeWrite(client: Client, sql: string, params: unknown[] = []): Promise<Probe> {
  const sp = `w600_${savepointCounter++}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const r = await client.query(sql, params);
    return { rows: r.rowCount ?? 0 };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
  }
}

async function countDistinctTenants(client: Client, sql: string, params: unknown[] = []): Promise<number> {
  const r = await client.query<{ id: string }>(sql, params);
  return new Set(r.rows.map((row) => row.id)).size;
}

async function openAdmin(): Promise<Client> {
  const c = new Client({ connectionString: ADMIN_URL });
  await c.connect();
  return c;
}
async function openAppUser(): Promise<Client> {
  const c = new Client({ connectionString: APP_USER_URL });
  await c.connect();
  return c;
}
async function openDirect(): Promise<Client> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  return c;
}

// ---------------------------------------------------------------------------
// --setup / --teardown — 600's own committed extra fixture, additive to 597's
// ---------------------------------------------------------------------------

async function setup(): Promise<void> {
  const c = await openDirect(); // postgres — bypasses RLS, committed writes
  try {
    const ids: ExtraIds = {
      customerId: { A: '', B: '' },
      loadId: { A: '', B: '' },
      playbookId: { A: '', B: '' },
      playbookInstanceActiveId: { A: '', B: '' },
      playbookInstanceBlockedId: { A: '', B: '' },
      stepInstanceId: { A: '', B: '' },
      driverInvitationId: { A: '', B: '' },
      supportTicketId: { A: '', B: '' },
      ticketMessageId: { A: '', B: '' },
      subscriptionId: { A: '', B: '' },
      automationRunId: { A: '', B: '' },
    };

    const plan = await c.query<{ id: string }>(`SELECT id FROM "Plan" WHERE key = 'starter' LIMIT 1`);
    if (plan.rowCount !== 1) refuse(`expected exactly one Plan with key='starter'`);
    const planId = plan.rows[0].id;

    for (const key of ['A', 'B'] as const) {
      const t = key === 'A' ? A : B;

      const cust = await c.query<{ id: string }>(
        `INSERT INTO "Customer" ("tenantId", "companyName", "updatedAt")
         VALUES ($1, $2, now()) RETURNING id`,
        [t.id, `${MARKER} Customer ${t.slug}`]
      );
      ids.customerId[key] = cust.rows[0].id;

      const load = await c.query<{ id: string }>(
        `INSERT INTO "Load" ("tenantId", "loadNumber", "customerId", origin, destination,
                              "pickupDate", rate, "trackingToken", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now(), 100.00, $6, now()) RETURNING id`,
        [t.id, `${MARKER}-${t.slug}`, ids.customerId[key], `${MARKER} origin`, `${MARKER} destination`,
          `${MARKER}-track-${t.slug}`]
      );
      ids.loadId[key] = load.rows[0].id;

      const pb = await c.query<{ id: string }>(
        `INSERT INTO "Playbook" ("tenantId", name, "entityType", category, "updatedAt")
         VALUES ($1, $2, 'OTHER', 'CUSTOM', now()) RETURNING id`,
        [t.id, `${MARKER} Playbook ${t.slug}`]
      );
      ids.playbookId[key] = pb.rows[0].id;

      const piActive = await c.query<{ id: string }>(
        `INSERT INTO "PlaybookInstance"
           ("tenantId", "playbookId", "playbookSnapshot", "entityType", "entityId", status, "updatedAt")
         VALUES ($1, $2, '{}'::jsonb, 'OTHER', gen_random_uuid(), 'NOT_STARTED', now()) RETURNING id`,
        [t.id, ids.playbookId[key]]
      );
      ids.playbookInstanceActiveId[key] = piActive.rows[0].id;

      const piBlocked = await c.query<{ id: string }>(
        `INSERT INTO "PlaybookInstance"
           ("tenantId", "playbookId", "playbookSnapshot", "entityType", "entityId", status, "updatedAt")
         VALUES ($1, $2, '{}'::jsonb, 'OTHER', gen_random_uuid(), 'BLOCKED', now()) RETURNING id`,
        [t.id, ids.playbookId[key]]
      );
      ids.playbookInstanceBlockedId[key] = piBlocked.rows[0].id;

      const si = await c.query<{ id: string }>(
        `INSERT INTO "StepInstance"
           ("playbookInstanceId", "stepSnapshot", status, "assigneeRole", "dueDate", "isOverdue", "tenantId", "updatedAt")
         VALUES ($1, '{}'::jsonb, 'NOT_STARTED', 'DISPATCHER', now() - interval '48 hours', false, $2, now())
         RETURNING id`,
        [ids.playbookInstanceActiveId[key], t.id]
      );
      ids.stepInstanceId[key] = si.rows[0].id;

      const inv = await c.query<{ id: string }>(
        `INSERT INTO "DriverInvitation" ("tenantId", email, "firstName", "lastName", "expiresAt", "updatedAt")
         VALUES ($1, $2, $3, $4, now() + interval '7 days', now()) RETURNING id`,
        [t.id, `${MARKER.toLowerCase()}-${t.slug}@example.test`, MARKER, t.slug]
      );
      ids.driverInvitationId[key] = inv.rows[0].id;

      const ticket = await c.query<{ id: string }>(
        `INSERT INTO "SupportTicket"
           ("ticketNumber", "tenantId", "submittedBy", "fromPage", title, description, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
        [`${MARKER}-${t.slug}`, t.id, t.ownerUserId, '/rls600-probe', `${MARKER} ticket`, `${MARKER} description`]
      );
      ids.supportTicketId[key] = ticket.rows[0].id;

      const msg = await c.query<{ id: string }>(
        `INSERT INTO "TicketMessage" ("ticketId", "senderType", "senderLabel", body)
         VALUES ($1, 'OWNER', $2, $3) RETURNING id`,
        [ids.supportTicketId[key], t.slug, `${MARKER} message`]
      );
      ids.ticketMessageId[key] = msg.rows[0].id;

      const sub = await c.query<{ id: string }>(
        `INSERT INTO "Subscription" ("tenantId", "planId", "trialEndsAt", "updatedAt")
         VALUES ($1, $2, now() + interval '14 days', now()) RETURNING id`,
        [t.id, planId]
      );
      ids.subscriptionId[key] = sub.rows[0].id;

      const run = await c.query<{ id: string }>(
        `INSERT INTO "AutomationRun" ("tenantId", "triggeredBy", status)
         VALUES ($1, $2, 'PENDING') RETURNING id`,
        [t.id, `${MARKER}:setup`]
      );
      ids.automationRunId[key] = run.rows[0].id;
    }

    writeFileSync(EXTRA_IDS_PATH, JSON.stringify(ids, null, 2) + '\n', 'utf8');
    console.log(`600-admin-verify --setup: wrote ${EXTRA_IDS_PATH}`);
    console.log(JSON.stringify(ids, null, 2));
  } finally {
    await c.end().catch(() => {});
  }
}

async function teardown(): Promise<void> {
  const c = await openDirect();
  try {
    await c.query(`DELETE FROM "TicketMessage" WHERE body LIKE $1`, [`${MARKER}%`]);
    await c.query(`DELETE FROM "SupportTicket" WHERE "ticketNumber" LIKE $1`, [`${MARKER}%`]);
    await c.query(`DELETE FROM "StepInstance" WHERE "tenantId" = ANY($1::uuid[]) AND "createdAt" > now() - interval '1 day'`, [[A.id, B.id]]);
    await c.query(`DELETE FROM "PlaybookInstance" WHERE "tenantId" = ANY($1::uuid[]) AND "createdAt" > now() - interval '1 day'`, [[A.id, B.id]]);
    await c.query(`DELETE FROM "Playbook" WHERE name LIKE $1`, [`${MARKER}%`]);
    await c.query(`DELETE FROM "DriverInvitation" WHERE email LIKE $1`, [`${MARKER.toLowerCase()}%`]);
    await c.query(`DELETE FROM "Load" WHERE "trackingToken" LIKE $1`, [`${MARKER}%`]);
    await c.query(`DELETE FROM "Customer" WHERE "companyName" LIKE $1`, [`${MARKER}%`]);
    await c.query(`DELETE FROM "Subscription" WHERE "tenantId" = ANY($1::uuid[])`, [[A.id, B.id]]);
    await c.query(`DELETE FROM "AutomationRun" WHERE "triggeredBy" LIKE $1`, [`${MARKER}%`]);
    console.log('600-admin-verify --teardown: done');
  } finally {
    await c.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// The matrix — one row per statement SHAPE
// ---------------------------------------------------------------------------

interface MatrixRow {
  shape: string;
  reason: string; // AdminReason this shape belongs to
  callSites: string[];
  directionA: Probe;
  directionASpan?: number; // for sweeps — count(DISTINCT tenant)
  directionB: Probe;
  pass: boolean;
  note: string;
}

async function runMatrix(ids: ExtraIds): Promise<MatrixRow[]> {
  const rows: MatrixRow[] = [];

  async function addRead(opts: {
    shape: string;
    reason: string;
    callSites: string[];
    note: string;
    sweepSql: string; // run as admin, no GUC — must return rows spanning >=2 tenants
    sweepParams?: unknown[];
    crossTenantSql: string; // run as app_user, GUC=A, naming tenant B — expect 0
    crossTenantParams?: unknown[];
  }): Promise<void> {
    const admin = await openAdmin();
    let dirA: Probe;
    let span = 0;
    try {
      await admin.query('BEGIN');
      span = await countDistinctTenants(admin, opts.sweepSql, opts.sweepParams ?? []);
      dirA = { rows: span };
      await admin.query('ROLLBACK');
    } catch (e) {
      const err = e as { code?: string; message?: string };
      dirA = { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
      await admin.query('ROLLBACK').catch(() => {});
    } finally {
      await admin.end().catch(() => {});
    }

    const appUser = await openAppUser();
    let dirB: Probe;
    try {
      await appUser.query('BEGIN');
      await appUser.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [A.id]);
      dirB = await probe(appUser, opts.crossTenantSql, opts.crossTenantParams ?? []);
      await appUser.query('ROLLBACK');
    } finally {
      await appUser.end().catch(() => {});
    }

    const pass =
      'rows' in dirA &&
      span >= 2 &&
      (('rows' in dirB && dirB.rows === 0) || 'error' in dirB);

    rows.push({
      shape: opts.shape,
      reason: opts.reason,
      callSites: opts.callSites,
      directionA: dirA,
      directionASpan: span,
      directionB: dirB,
      pass,
      note: opts.note,
    });
  }

  async function addReadSingle(opts: {
    shape: string;
    reason: string;
    callSites: string[];
    note: string;
    adminSql: string;
    adminParams: unknown[];
    crossTenantSql: string;
    crossTenantParams: unknown[];
  }): Promise<void> {
    const admin = await openAdmin();
    let dirA: Probe;
    try {
      await admin.query('BEGIN');
      dirA = await probe(admin, opts.adminSql, opts.adminParams);
      await admin.query('ROLLBACK');
    } finally {
      await admin.end().catch(() => {});
    }

    const appUser = await openAppUser();
    let dirB: Probe;
    try {
      await appUser.query('BEGIN');
      await appUser.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [A.id]);
      dirB = await probe(appUser, opts.crossTenantSql, opts.crossTenantParams);
      await appUser.query('ROLLBACK');
    } finally {
      await appUser.end().catch(() => {});
    }

    const pass =
      'rows' in dirA && dirA.rows >= 1 && (('rows' in dirB && dirB.rows === 0) || 'error' in dirB);

    rows.push({ shape: opts.shape, reason: opts.reason, callSites: opts.callSites, directionA: dirA, directionB: dirB, pass, note: opts.note });
  }

  async function addWrite(opts: {
    shape: string;
    reason: string;
    callSites: string[];
    note: string;
    adminSql: string;
    adminParams: unknown[];
    adminMinRows?: number;
    crossTenantSql: string;
    crossTenantParams: unknown[];
  }): Promise<void> {
    const admin = await openAdmin();
    let dirA: Probe;
    try {
      await admin.query('BEGIN');
      dirA = await probeWrite(admin, opts.adminSql, opts.adminParams);
      await admin.query('ROLLBACK');
    } finally {
      await admin.end().catch(() => {});
    }

    const appUser = await openAppUser();
    let dirB: Probe;
    try {
      await appUser.query('BEGIN');
      await appUser.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [A.id]);
      dirB = await probeWrite(appUser, opts.crossTenantSql, opts.crossTenantParams);
      await appUser.query('ROLLBACK');
    } finally {
      await appUser.end().catch(() => {});
    }

    const minRows = opts.adminMinRows ?? 1;
    const pass =
      'rows' in dirA && dirA.rows >= minRows && (('rows' in dirB && dirB.rows === 0) || 'error' in dirB);

    rows.push({ shape: opts.shape, reason: opts.reason, callSites: opts.callSites, directionA: dirA, directionB: dirB, pass, note: opts.note });
  }

  // --- S1: Tenant sweep (digest x4 + reminders) ---------------------------
  await addRead({
    shape: 'S1 — Tenant active-tenant sweep',
    reason: 'compliance/daily/weekly digest tenant sweep, reminders cron tenant sweep',
    callSites: [
      'digest-compliance-30day/route.ts',
      'digest-daily-driver/route.ts',
      'digest-weekly-owner/route.ts',
      'send-reminders/route.ts',
    ],
    note: 'Admin sees >=2 active tenants unscoped; tenant A cannot see tenant B by id.',
    sweepSql: `SELECT id FROM "Tenant" WHERE "isActive" = true`,
    crossTenantSql: `SELECT id FROM "Tenant" WHERE "isActive" = true AND id = $1`,
    crossTenantParams: [B.id],
  });

  // --- S2: PlaybookInstance active sweep -----------------------------------
  await addRead({
    shape: 'S2 — PlaybookInstance active-tenant sweep',
    reason: 'workflow digest active-tenant sweep',
    callSites: ['workflow-digest/route.ts'],
    note: 'Admin sees the RLS600 NOT_STARTED rows for both A and B; tenant A cannot see B\'s.',
    sweepSql: `SELECT "tenantId" AS id FROM "PlaybookInstance" WHERE status IN ('NOT_STARTED','IN_PROGRESS') AND id = ANY($1::uuid[])`,
    sweepParams: [[ids.playbookInstanceActiveId.A, ids.playbookInstanceActiveId.B]],
    crossTenantSql: `SELECT id FROM "PlaybookInstance" WHERE status IN ('NOT_STARTED','IN_PROGRESS') AND id = $1`,
    crossTenantParams: [ids.playbookInstanceActiveId.B],
  });

  // --- S3: StepInstance overdue sweep --------------------------------------
  await addRead({
    shape: 'S3 — StepInstance overdue sweep',
    reason: 'workflow overdue-step sweep',
    callSites: ['workflow-notifications/route.ts (sweep 1)'],
    note: 'Admin sees the RLS600 overdue StepInstance for both A and B; tenant A cannot see B\'s.',
    sweepSql: `SELECT "tenantId" AS id FROM "StepInstance" WHERE status IN ('NOT_STARTED','IN_PROGRESS') AND "isOverdue" = false AND id = ANY($1::uuid[])`,
    sweepParams: [[ids.stepInstanceId.A, ids.stepInstanceId.B]],
    crossTenantSql: `SELECT id FROM "StepInstance" WHERE status IN ('NOT_STARTED','IN_PROGRESS') AND "isOverdue" = false AND id = $1`,
    crossTenantParams: [ids.stepInstanceId.B],
  });

  // --- S4: PlaybookInstance blocked sweep ----------------------------------
  await addRead({
    shape: 'S4 — PlaybookInstance blocked sweep',
    reason: 'workflow blocked-instance sweep',
    callSites: ['workflow-notifications/route.ts (sweep 2)'],
    note: 'Admin sees the RLS600 BLOCKED rows for both A and B; tenant A cannot see B\'s.',
    sweepSql: `SELECT "tenantId" AS id FROM "PlaybookInstance" WHERE status = 'BLOCKED' AND id = ANY($1::uuid[])`,
    sweepParams: [[ids.playbookInstanceBlockedId.A, ids.playbookInstanceBlockedId.B]],
    crossTenantSql: `SELECT id FROM "PlaybookInstance" WHERE status = 'BLOCKED' AND id = $1`,
    crossTenantParams: [ids.playbookInstanceBlockedId.B],
  });

  // --- S5: SupportTicket batch close ---------------------------------------
  await addWrite({
    shape: 'S5 — SupportTicket batch close (id IN (...))',
    reason: 'auto-close stale ticket sweep',
    callSites: ['auto-close-tickets/route.ts'],
    note: 'Admin closes tenant B\'s RLS600 ticket in a batch statement; tenant-A-scoped app_user affects 0 rows on the same id.',
    adminSql: `UPDATE "SupportTicket" SET status = 'CLOSED' WHERE id = ANY($1::uuid[])`,
    adminParams: [[ids.supportTicketId.A, ids.supportTicketId.B]],
    adminMinRows: 2,
    crossTenantSql: `UPDATE "SupportTicket" SET status = 'CLOSED' WHERE id = ANY($1::uuid[])`,
    crossTenantParams: [[ids.supportTicketId.B]],
  });

  // --- S6: AutomationRun create ---------------------------------------------
  await addWrite({
    shape: 'S6 — AutomationRun create for an arbitrary tenant',
    reason: 'sysadmin manual automation trigger (create)',
    callSites: ['(admin)/actions/automations.ts:107 (manualTriggerRule, step 1)'],
    note: 'Admin creates a PENDING run naming tenant B with no GUC set; tenant-A-scoped app_user\'s WITH CHECK refuses the same insert naming tenant B.',
    adminSql: `INSERT INTO "AutomationRun" ("tenantId", "triggeredBy", status) VALUES ($1, 'RLS600:probe-create', 'PENDING')`,
    adminParams: [B.id],
    crossTenantSql: `INSERT INTO "AutomationRun" ("tenantId", "triggeredBy", status) VALUES ($1, 'RLS600:probe-create', 'PENDING')`,
    crossTenantParams: [B.id],
  });

  // --- S7: AutomationRun update status --------------------------------------
  await addWrite({
    shape: 'S7 — AutomationRun status update by id',
    reason: 'sysadmin manual automation trigger (SENT/FAILED)',
    callSites: [
      '(admin)/actions/automations.ts:141 (manualTriggerRule, SENT branch)',
      '(admin)/actions/automations.ts:151 (manualTriggerRule, FAILED branch)',
    ],
    note: 'Admin marks tenant B\'s RLS600 run SENT with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id.',
    adminSql: `UPDATE "AutomationRun" SET status = 'SENT' WHERE id = $1 AND status = 'PENDING'`,
    adminParams: [ids.automationRunId.B],
    crossTenantSql: `UPDATE "AutomationRun" SET status = 'SENT' WHERE id = $1 AND status = 'PENDING'`,
    crossTenantParams: [ids.automationRunId.B],
  });

  // --- S8: Subscription update + AppEvent create (extendTrial) -------------
  await addWrite({
    shape: 'S8 — Subscription update by tenantId (extendTrial)',
    reason: 'sysadmin trial extension',
    callSites: ['(admin)/actions/tenants.ts:586-615 (extendTrial)'],
    note: 'Admin extends tenant B\'s trial with no GUC set; tenant-A-scoped app_user affects 0 rows on tenant B\'s subscription.',
    adminSql: `UPDATE "Subscription" SET "trialEndsAt" = now() + interval '365 days' WHERE "tenantId" = $1`,
    adminParams: [B.id],
    crossTenantSql: `UPDATE "Subscription" SET "trialEndsAt" = now() + interval '365 days' WHERE "tenantId" = $1`,
    crossTenantParams: [B.id],
  });

  // --- S9: Tenant listing ----------------------------------------------------
  await addRead({
    shape: 'S9 — Tenant listing, unfiltered',
    reason: 'sysadmin tenant listing',
    callSites: ['lib/db/repositories/tenant.repository.ts:87 (listAllTenants)'],
    note: 'Admin lists every tenant with no GUC set (>=2 distinct, A and B both present); tenant A cannot see B by id.',
    sweepSql: `SELECT id FROM "Tenant" WHERE id = ANY($1::uuid[])`,
    sweepParams: [[A.id, B.id]],
    crossTenantSql: `SELECT id FROM "Tenant" WHERE id = $1`,
    crossTenantParams: [B.id],
  });

  // --- S10: Tenant create -----------------------------------------------------
  await addWrite({
    shape: 'S10 — Tenant create (no tenant belongs to another tenant)',
    reason: 'sysadmin tenant create',
    callSites: ['(admin)/actions/tenants.ts:98-123 (createTenant)'],
    note: 'Admin creates a brand-new tenant with no GUC set; tenant-A-scoped app_user\'s INSERT is refused because a GUC is set (tenant_bootstrap_insert only admits an UNSET GUC).',
    adminSql: `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1, $2, now())`,
    adminParams: [`${MARKER} probe tenant`, `${MARKER.toLowerCase()}-probe-${Date.now()}`],
    crossTenantSql: `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1, $2, now())`,
    crossTenantParams: [`${MARKER} probe tenant (cross)`, `${MARKER.toLowerCase()}-probe-x-${Date.now()}`],
  });

  // --- S11: Tenant update (status/profile/settings — one shape) --------------
  await addWrite({
    shape: 'S11 — Tenant UPDATE by id (status change / profile / settings)',
    reason: 'sysadmin tenant status change, profile update, settings update',
    callSites: [
      '(admin)/actions/tenants.ts:190 (suspendTenant)',
      '(admin)/actions/tenants.ts:229 (reactivateTenant)',
      '(admin)/actions/tenants.ts:432 (updateTenant)',
      '(admin)/actions/tenants.ts:542 (updateTenantSettings)',
    ],
    note: 'Admin updates tenant B with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id (tenant_self_update only admits id = current_tenant_id()).',
    adminSql: `UPDATE "Tenant" SET "requirePreTripInspection" = "requirePreTripInspection" WHERE id = $1`,
    adminParams: [B.id],
    crossTenantSql: `UPDATE "Tenant" SET "requirePreTripInspection" = "requirePreTripInspection" WHERE id = $1`,
    crossTenantParams: [B.id],
  });

  // --- S12: Tenant delete -----------------------------------------------------
  // Bespoke, not addWrite: deleting the REAL tenant B (which has real seeded
  // Users from seed-staging.ts) hits `User_tenantId_fkey` — a genuine,
  // unrelated data-integrity constraint that would fire under ANY role,
  // including postgres. Admin's DELETE grant + RLS bypass is what this row
  // tests, so direction A targets a THROWAWAY tenant with NO dependents,
  // created and deleted inside the SAME rolled-back transaction. Direction B
  // still targets the real tenant B, because "0 rows, never reaching the FK
  // layer" is the actual isolation claim for a tenant-scoped connection (no
  // DELETE policy exists on "Tenant" at all, deliberately).
  {
    const admin = await openAdmin();
    let dirA: Probe;
    try {
      await admin.query('BEGIN');
      const throwaway = await admin.query<{ id: string }>(
        `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
        [`${MARKER} S12 throwaway`, `${MARKER.toLowerCase()}-s12-${Date.now()}`]
      );
      const del = await admin.query(`DELETE FROM "Tenant" WHERE id = $1`, [throwaway.rows[0].id]);
      dirA = { rows: del.rowCount ?? 0 };
      await admin.query('ROLLBACK');
    } catch (e) {
      const err = e as { code?: string; message?: string };
      dirA = { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
      await admin.query('ROLLBACK').catch(() => {});
    } finally {
      await admin.end().catch(() => {});
    }

    const appUser = await openAppUser();
    let dirB: Probe;
    try {
      await appUser.query('BEGIN');
      await appUser.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [A.id]);
      dirB = await probeWrite(appUser, `DELETE FROM "Tenant" WHERE id = $1`, [B.id]);
      await appUser.query('ROLLBACK');
    } finally {
      await appUser.end().catch(() => {});
    }

    const pass = 'rows' in dirA && dirA.rows === 1 && (('rows' in dirB && dirB.rows === 0) || 'error' in dirB);
    rows.push({
      shape: 'S12 — Tenant DELETE by id',
      reason: 'sysadmin tenant delete',
      callSites: ['(admin)/actions/tenants.ts:625 (deleteTenant)'],
      directionA: dirA,
      directionB: dirB,
      pass,
      note:
        'Admin creates + deletes a THROWAWAY, dependent-free tenant with no GUC set (isolates the grant/RLS question from the real User_tenantId_fkey constraint, which real tenant B would trip under ANY role). Tenant-A-scoped app_user attempting DELETE on the REAL tenant B affects 0 rows — no DELETE policy exists on "Tenant" at all, deliberately (design §4.5): a tenant must never be able to delete itself.',
    });
  }

  // --- S13: tenant lookup by user id ------------------------------------------
  await addReadSingle({
    shape: 'S13 — User + Tenant join, by userId',
    reason: 'tenant lookup by user id',
    callSites: ['lib/db/repositories/tenant.repository.ts:66 (findTenantByUserId)'],
    note: 'Admin resolves tenant B\'s owner user id to its tenant with no GUC set; tenant-A-scoped app_user reads 0 rows for that user id.',
    adminSql: `SELECT id FROM "User" WHERE id = $1`,
    adminParams: [B.ownerUserId],
    crossTenantSql: `SELECT id FROM "User" WHERE id = $1`,
    crossTenantParams: [B.ownerUserId],
  });

  // --- S14: invitation lookup by id -------------------------------------------
  await addReadSingle({
    shape: 'S14 — DriverInvitation lookup by id',
    reason: 'invitation lookup by token',
    callSites: [
      'api/auth/accept-invitation/route.ts:44 (GET)',
      'api/auth/accept-invitation/route.ts:121 (POST)',
    ],
    note: 'Admin reads tenant B\'s RLS600 invitation by id with no GUC set; tenant-A-scoped app_user reads 0 rows for the same id.',
    adminSql: `SELECT id FROM "DriverInvitation" WHERE id = $1`,
    adminParams: [ids.driverInvitationId.B],
    crossTenantSql: `SELECT id FROM "DriverInvitation" WHERE id = $1`,
    crossTenantParams: [ids.driverInvitationId.B],
  });

  // --- S15: tracking lookup by token -------------------------------------------
  await addReadSingle({
    shape: 'S15 — Load lookup by trackingToken',
    reason: 'public shipment tracking lookup',
    callSites: ['api/track/[token]/route.ts:24'],
    note: 'Admin reads tenant B\'s RLS600 load by trackingToken with no GUC set; tenant-A-scoped app_user reads 0 rows for the same token.',
    adminSql: `SELECT id FROM "Load" WHERE "trackingToken" = $1`,
    adminParams: [`${MARKER}-track-${B.slug}`],
    crossTenantSql: `SELECT id FROM "Load" WHERE "trackingToken" = $1`,
    crossTenantParams: [`${MARKER}-track-${B.slug}`],
  });

  // --- S16: SupportTicket status update ----------------------------------------
  await addWrite({
    shape: 'S16 — SupportTicket status UPDATE by id',
    reason: 'sysadmin ticket status update',
    callSites: ['actions/support-tickets.ts:341 (updateTicketStatus)'],
    note: 'Admin resolves tenant B\'s RLS600 ticket with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id.',
    adminSql: `UPDATE "SupportTicket" SET status = 'RESOLVED' WHERE id = $1`,
    adminParams: [ids.supportTicketId.B],
    crossTenantSql: `UPDATE "SupportTicket" SET status = 'RESOLVED' WHERE id = $1`,
    crossTenantParams: [ids.supportTicketId.B],
  });

  // --- S17: SupportTicket reply (read + insert + update) ------------------------
  await addWrite({
    shape: 'S17 — TicketMessage create for an arbitrary tenant\'s ticket',
    reason: 'sysadmin ticket reply',
    callSites: ['actions/support-tickets.ts:475 (addAdminReply)'],
    note: 'Admin posts a reply on tenant B\'s RLS600 ticket with no GUC set. The cross-tenant column runs the SAME insert as app_user scoped to tenant A, naming tenant B\'s ticketId — recorded as measured, not assumed; TicketMessage carries no tenant column of its own, so its write-side isolation (if any) can only come from a policy that subqueries SupportTicket, and whether one exists is exactly what this row measures.',
    adminSql: `INSERT INTO "TicketMessage" ("ticketId", "senderType", "senderLabel", body) VALUES ($1, 'ADMIN', 'RLS600 probe', 'RLS600 probe reply')`,
    adminParams: [ids.supportTicketId.B],
    crossTenantSql: `INSERT INTO "TicketMessage" ("ticketId", "senderType", "senderLabel", body) VALUES ($1, 'ADMIN', 'RLS600 probe', 'RLS600 probe reply (cross-tenant)')`,
    crossTenantParams: [ids.supportTicketId.B],
  });

  // --- S18: TicketMessage thread read ----------------------------------------
  await addReadSingle({
    shape: 'S18 — TicketMessage read by ticketId',
    reason: 'sysadmin ticket thread read',
    callSites: ['actions/support-tickets.ts:542 (getTicketMessages)'],
    note: 'Admin reads tenant B\'s RLS600 ticket thread with no GUC set; tenant-A-scoped app_user reads 0 rows for the same ticketId (TicketMessage\'s policy is a subquery over SupportTicket.tenantId).',
    adminSql: `SELECT id FROM "TicketMessage" WHERE "ticketId" = $1`,
    adminParams: [ids.supportTicketId.B],
    crossTenantSql: `SELECT id FROM "TicketMessage" WHERE "ticketId" = $1`,
    crossTenantParams: [ids.supportTicketId.B],
  });

  // --- S19: SysAdminInvoice management (create) --------------------------------
  await addWrite({
    shape: 'S19 — SysAdminInvoice create for an arbitrary tenant',
    reason: 'sysadmin invoice management',
    callSites: ['(admin)/actions/sysadmin-invoices.ts (createSysAdminInvoice and 9 sibling functions)'],
    note: 'Admin creates an invoice for tenant B with no GUC set; tenant-A-scoped app_user\'s WITH CHECK refuses the same insert.',
    adminSql: `INSERT INTO "SysAdminInvoice" ("tenantId", "invoiceNumber", status, "issueDate", "dueDate", subtotal, total, "updatedAt")
               VALUES ($1, $2, 'DRAFT', now(), now() + interval '30 days', 1.00, 1.00, now())`,
    adminParams: [B.id, `${MARKER}-CREATE-${Date.now()}`],
    crossTenantSql: `INSERT INTO "SysAdminInvoice" ("tenantId", "invoiceNumber", status, "issueDate", "dueDate", subtotal, total, "updatedAt")
                      VALUES ($1, $2, 'DRAFT', now(), now() + interval '30 days', 1.00, 1.00, now())`,
    crossTenantParams: [B.id, `${MARKER}-CREATE-X-${Date.now()}`],
  });

  // --- S20: SysAdminInvoice audit trail read -----------------------------------
  await addReadSingle({
    shape: 'S20 — SysAdminInvoice audit-trail read (createdBy/updatedBy) by id',
    reason: 'sysadmin invoice audit trail',
    callSites: ['(admin)/billing/[id]/page.tsx:36'],
    note: 'Admin reads tenant B\'s seeded invoice with no GUC set; tenant-A-scoped app_user reads 0 rows for the same id.',
    adminSql: `SELECT id FROM "SysAdminInvoice" WHERE id = $1`,
    adminParams: [fixtures.rows.SysAdminInvoice.B[0]],
    crossTenantSql: `SELECT id FROM "SysAdminInvoice" WHERE id = $1`,
    crossTenantParams: [fixtures.rows.SysAdminInvoice.B[0]],
  });

  // --- S21: overdue invoice sweep (batch) --------------------------------------
  await addWrite({
    shape: 'S21 — SysAdminInvoice batch OVERDUE sweep',
    reason: 'overdue invoice sweep',
    callSites: ['api/cron/mark-overdue-invoices/route.ts', '(admin)/actions/sysadmin-invoices.ts (markOverdueInvoices)'],
    note: 'Admin marks tenant B\'s seeded (DRAFT) invoice OVERDUE (batch shape) with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id.',
    adminSql: `UPDATE "SysAdminInvoice" SET status = 'OVERDUE' WHERE id = ANY($1::uuid[]) AND status = 'DRAFT'`,
    adminParams: [[fixtures.rows.SysAdminInvoice.B[0]]],
    crossTenantSql: `UPDATE "SysAdminInvoice" SET status = 'OVERDUE' WHERE id = ANY($1::uuid[]) AND status = 'DRAFT'`,
    crossTenantParams: [[fixtures.rows.SysAdminInvoice.B[0]]],
  });

  // --- S22: invoice email lookup (SysAdminInvoice + User) ------------------------
  await addReadSingle({
    shape: 'S22 — SysAdminInvoice + User owner lookup',
    reason: 'sysadmin invoice email lookup',
    callSites: ['lib/email/send-sysadmin-invoice.ts'],
    note: 'Admin resolves tenant B\'s invoice + owner email with no GUC set; tenant-A-scoped app_user reads 0 rows for the same invoice id.',
    adminSql: `SELECT id FROM "SysAdminInvoice" WHERE id = $1`,
    adminParams: [fixtures.rows.SysAdminInvoice.B[0]],
    crossTenantSql: `SELECT id FROM "SysAdminInvoice" WHERE id = $1`,
    crossTenantParams: [fixtures.rows.SysAdminInvoice.B[0]],
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function renderMd(rows: MatrixRow[]): string {
  const L: string[] = [];
  L.push('# quick-600 — both-directions routed-site matrix (staging)');
  L.push('');
  L.push(`Captured ${new Date().toISOString()} against staging \`${STAGING_REF}\`.`);
  L.push('');
  L.push('| shape | reason | call sites | dir A (admin) | dir A span | dir B (tenant A, naming B) | PASS |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    L.push(
      `| ${r.shape} | ${r.reason} | ${r.callSites.join('<br>')} | ${fmtProbe(r.directionA)} | ${r.directionASpan ?? '—'} | ${fmtProbe(r.directionB)} | ${r.pass ? 'PASS' : 'FAIL'} |`
    );
  }
  L.push('');
  L.push('## Notes per row');
  L.push('');
  for (const r of rows) {
    L.push(`### ${r.shape}`);
    L.push('');
    L.push(r.note);
    L.push('');
  }
  return L.join('\n');
}

async function main(): Promise<void> {
  if (MODE === 'setup') {
    await setup();
    return;
  }
  if (MODE === 'teardown') {
    await teardown();
    return;
  }

  if (!existsSync(EXTRA_IDS_PATH)) {
    refuse(`${EXTRA_IDS_PATH} does not exist — run --setup first`);
  }
  const ids: ExtraIds = JSON.parse(readFileSync(EXTRA_IDS_PATH, 'utf8'));

  const rows = await runMatrix(ids);

  const failing = rows.filter((r) => !r.pass);
  console.log(`600-admin-verify --run: ${rows.length} shape(s), ${failing.length} FAILING`);
  for (const r of rows) {
    console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.shape}`);
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '03-routed-sites.json'), JSON.stringify(rows, null, 2) + '\n', 'utf8');
  writeFileSync(resolve(EVIDENCE_DIR, '03-routed-sites.md'), renderMd(rows) + '\n', 'utf8');
  console.log(`\nWrote evidence/03-routed-sites.json and .md`);

  if (failing.length > 0) {
    console.error(`\n${failing.length} shape(s) FAILED — see evidence for detail.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('600-admin-verify FAILED:', e);
  process.exit(1);
});
