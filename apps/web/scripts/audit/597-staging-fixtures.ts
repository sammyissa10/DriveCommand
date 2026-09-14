/**
 * quick-597 — disposable staging fixtures for the RLS policy satisfiability matrix.
 *
 * MODES
 *   --seed          seed the carrier graph (via scripts/seed-staging.ts) plus the
 *                   policy-specific `RLS597` rows this task needs, and write
 *                   evidence/fixture-ids.json
 *   --teardown      delete everything --seed created, in FK-safe order
 *   --verify-clean  assert staging carries zero Tenant rows and zero rows in every
 *                   fixture table; exit 1 naming the table and count otherwise
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts:53-55` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and `.env`, `.env.local` and `apps/web/.env.local` all point
 * `DIRECT_URL` at PRODUCTION. Importing it — or pinning only `DATABASE_URL` inline
 * for a script that does — silently repoints the run at production. This file loads
 * `apps/web/.env.staging` explicitly and refuses on the production project ref.
 *
 * Run from apps/web/:
 *   npx tsx scripts/audit/597-staging-fixtures.ts --seed
 *   npx tsx scripts/audit/597-staging-fixtures.ts --teardown
 *   npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

// ---------------------------------------------------------------------------
// Environment — explicit, staging-only, production-ref guarded
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence'
);
// quick-598 follow-up — the RUNTIME handshake file is gitignored and lives
// beside the app, NOT in quick-597's evidence directory.
//
// The suite seeds fixtures on every run (tests-db/global-setup.ts), and every
// seed mints fresh UUIDs. Writing those into a committed evidence file meant
// each test run rewrote 23 lines of quick-597's recorded evidence AND left the
// working tree dirty — and "vercel --prod" ships the working directory, not
// git HEAD (see CLAUDE.md). The evidence copy is a frozen historical record;
// this is the live one.
const FIXTURE_IDS_PATH = resolve(APP_ROOT, '.rls-fixture-ids.json');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

const DIRECT_URL = process.env.STAGING_DIRECT_URL;

function refuse(reason: string): never {
  console.error(`597-staging-fixtures: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

if (!DIRECT_URL) refuse('STAGING_DIRECT_URL is not set in apps/web/.env.staging');
if (DIRECT_URL.includes(PRODUCTION_REF)) {
  refuse(`STAGING_DIRECT_URL names the PRODUCTION project (${PRODUCTION_REF})`);
}
if (!DIRECT_URL.includes(STAGING_REF)) {
  refuse(`STAGING_DIRECT_URL does not name the staging project (${STAGING_REF})`);
}

// Never print a connection string or a password. Anywhere.
process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

// ---------------------------------------------------------------------------
// Shape written to evidence/fixture-ids.json and read by 597-policy-verify.ts
// ---------------------------------------------------------------------------

export interface FixtureTenant {
  key: 'A' | 'B';
  slug: string;
  id: string;
  ownerUserId: string;
}

export interface FixtureIds {
  capturedAt: string;
  projectRef: string;
  promoCode: string;
  tenants: Record<'A' | 'B', FixtureTenant>;
  /** table -> tenant key -> row ids owned by that tenant */
  rows: Record<string, Record<'A' | 'B', string[]>>;
}

const MARKER = 'RLS597';
const PROMO_CODE = 'RLS597-PROMO';

const SLUGS: Record<'A' | 'B', string> = {
  A: 'staging-alpha',
  B: 'staging-beta',
};

// ---------------------------------------------------------------------------
// --seed
// ---------------------------------------------------------------------------

function runSeedStaging(): void {
  console.log('--- running scripts/seed-staging.ts against staging (DATABASE_URL pinned) ---');
  const result = spawnSync('npx', ['tsx', 'scripts/seed-staging.ts'], {
    cwd: APP_ROOT,
    stdio: 'inherit',
    shell: true,
    // Pinned EXPLICITLY. seed-staging.ts reads a bare process.env.DATABASE_URL and
    // carries its own production-ref guard; it loads no dotenv of its own.
    env: { ...process.env, DATABASE_URL: DIRECT_URL },
  });
  if (result.status !== 0) {
    refuse(`scripts/seed-staging.ts exited ${result.status}`);
  }
}

async function seed(client: Client): Promise<void> {
  runSeedStaging();

  console.log('\n--- adding RLS597 policy-probe rows ---');

  const tenants: Record<'A' | 'B', FixtureTenant> = {} as Record<'A' | 'B', FixtureTenant>;

  for (const key of ['A', 'B'] as const) {
    const slug = SLUGS[key];
    const t = await client.query<{ id: string }>('SELECT id FROM "Tenant" WHERE slug = $1', [slug]);
    if (t.rowCount !== 1) refuse(`expected exactly one Tenant with slug ${slug}, got ${t.rowCount}`);
    const tenantId = t.rows[0].id;

    const u = await client.query<{ id: string }>(
      'SELECT id FROM "User" WHERE "tenantId" = $1 AND role = $2 ORDER BY email LIMIT 1',
      [tenantId, 'OWNER']
    );
    if (u.rowCount !== 1) refuse(`no OWNER user found for tenant ${slug}`);

    tenants[key] = { key, slug, id: tenantId, ownerUserId: u.rows[0].id };
    console.log(`  tenant ${key} (${slug}) = ${tenantId}`);
  }

  const rows: FixtureIds['rows'] = {
    audit_log: { A: [], B: [] },
    in_app_notifications: { A: [], B: [] },
    PushToken: { A: [], B: [] },
    SysAdminInvoice: { A: [], B: [] },
    SysAdminInvoiceItem: { A: [], B: [] },
    stops: { A: [], B: [] },
    carrier_documents: { A: [], B: [] },
    route_template_stops: { A: [], B: [] },
  };

  // Idempotency: remove any marker rows from a previous run before re-inserting.
  await deleteMarkerRows(client);

  for (const key of ['A', 'B'] as const) {
    const t = tenants[key];

    // audit_log — tenant_id uuid NOT NULL, user_id uuid NOT NULL (FK to "User").
    //
    // DEC-14. `audit_log_action_check` admits EXACTLY eight values:
    //   VIEW_PII, VIEW_PII_DENIED, DOWNLOAD_DOCUMENT, DOWNLOAD_DOCUMENT_DENIED,
    //   UPDATE_RESTRICTED, DELETE_RESTRICTED, EXPORT, RATE_LIMIT_HIT.
    // An `RLS597.probe` action is a 23514 on every insert. Read off
    // `pg_get_constraintdef` on staging, not inferred from the column's name. The
    // marker therefore lives in `resource_type`, which carries no CHECK — and
    // teardown keys on that column.
    const al = await client.query<{ id: string }>(
      `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'EXPORT', $3, gen_random_uuid())
       RETURNING id`,
      [t.id, t.ownerUserId, `${MARKER}_resource`]
    );
    rows.audit_log[key].push(al.rows[0].id);

    // in_app_notifications — org_id uuid NOT NULL; unique (org_id, entity_id, type).
    const notif = await client.query<{ id: string }>(
      `INSERT INTO in_app_notifications (org_id, user_id, type, title, message, entity_type, entity_id)
       VALUES ($1, $2, 'compliance_alert'::"InAppNotificationType", $3, $4, $5, gen_random_uuid())
       RETURNING id`,
      [t.id, t.ownerUserId, `${MARKER} title`, `${MARKER} message`, `${MARKER}_entity`]
    );
    rows.in_app_notifications[key].push(notif.rows[0].id);

    // "PushToken" — id is a cuid in the app, i.e. a plain text PK with no DB
    // default. Supply it. "updatedAt" is Prisma-level @updatedAt with no DB
    // default either, so it is supplied too.
    const pt = await client.query<{ id: string }>(
      `INSERT INTO "PushToken" (id, "userId", token, platform, "updatedAt", "createdAt", "tenantId")
       VALUES ($1, $2, $3, 'ios', now(), now(), $4)
       RETURNING id`,
      [`rls597_${t.slug}`, t.ownerUserId, `${MARKER}-token-${t.slug}`, t.id]
    );
    rows.PushToken[key].push(pt.rows[0].id);

    // "SysAdminInvoice" / "SysAdminInvoiceItem"
    const inv = await client.query<{ id: string }>(
      `INSERT INTO "SysAdminInvoice"
         ("tenantId", "invoiceNumber", status, "issueDate", "dueDate", subtotal, total, notes, "updatedAt")
       VALUES ($1, $2, 'DRAFT'::"SysAdminInvoiceStatus", now(), now() + interval '30 days',
               100.00, 100.00, $3, now())
       RETURNING id`,
      [t.id, `${MARKER}-${t.slug.toUpperCase()}`, `${MARKER} probe invoice`]
    );
    rows.SysAdminInvoice[key].push(inv.rows[0].id);

    const item = await client.query<{ id: string }>(
      `INSERT INTO "SysAdminInvoiceItem"
         ("invoiceId", "chargeType", description, quantity, "unitPrice", amount, "tenantId")
       VALUES ($1, $2, $3, 1.00, 100.00, 100.00, $4)
       RETURNING id`,
      [inv.rows[0].id, MARKER, `${MARKER} probe item`, t.id]
    );
    rows.SysAdminInvoiceItem[key].push(item.rows[0].id);

    // The three EXISTS-subquery carrier tables come from seed-staging.ts. Record
    // which rows belong to which tenant so the app_user matrix can count them by
    // id rather than re-deriving the join it is trying to test.
    const stops = await client.query<{ id: string }>(
      `SELECT s.id FROM stops s JOIN dispatches d ON d.id = s.dispatch_id WHERE d.org_id = $1`,
      [t.id]
    );
    rows.stops[key] = stops.rows.map((r) => r.id);

    const docs = await client.query<{ id: string }>(
      `SELECT cd.id FROM carrier_documents cd JOIN "User" u ON u.id = cd.uploaded_by
        WHERE u."tenantId" = $1`,
      [t.id]
    );
    rows.carrier_documents[key] = docs.rows.map((r) => r.id);

    const rts = await client.query<{ id: string }>(
      `SELECT rts.id FROM route_template_stops rts
         JOIN route_templates rt ON rt.id = rts.route_template_id
        WHERE rt.org_id = $1`,
      [t.id]
    );
    rows.route_template_stops[key] = rts.rows.map((r) => r.id);
  }

  // "Promo" is GLOBAL (no tenant column). One row, for the grant probe only.
  await client.query(
    `INSERT INTO "Promo" (code, description, "bonusTrialDays", "activeFrom", "activeTo", "updatedAt")
     VALUES ($1, $2, 0, now() - interval '1 day', now() + interval '365 days', now())`,
    [PROMO_CODE, `${MARKER} grant probe`]
  );

  const payload: FixtureIds = {
    capturedAt: new Date().toISOString(),
    projectRef: STAGING_REF,
    promoCode: PROMO_CODE,
    tenants,
    rows,
  };

  mkdirSync(dirname(FIXTURE_IDS_PATH), { recursive: true });
  writeFileSync(FIXTURE_IDS_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log('\nRow counts written to fixture-ids.json:');
  for (const [table, byTenant] of Object.entries(payload.rows)) {
    console.log(`  ${table.padEnd(24)} A=${byTenant.A.length} B=${byTenant.B.length}`);
    if (byTenant.A.length === 0 || byTenant.B.length === 0) {
      refuse(`table ${table} has no rows for one of the two tenants — the matrix would be vacuous`);
    }
  }
  console.log(`\nWrote ${FIXTURE_IDS_PATH}`);
}

// ---------------------------------------------------------------------------
// --teardown
// ---------------------------------------------------------------------------

/** The RLS597 extras only. FK-safe: items before invoices. */
async function deleteMarkerRows(client: Client): Promise<void> {
  await client.query(`DELETE FROM "SysAdminInvoiceItem" WHERE description LIKE $1`, [`${MARKER}%`]);
  await client.query(
    `DELETE FROM "SysAdminInvoiceItem" WHERE "invoiceId" IN
       (SELECT id FROM "SysAdminInvoice" WHERE "invoiceNumber" LIKE $1)`,
    [`${MARKER}%`]
  );
  await client.query(`DELETE FROM "SysAdminInvoice" WHERE "invoiceNumber" LIKE $1`, [`${MARKER}%`]);
  await client.query(`DELETE FROM in_app_notifications WHERE title LIKE $1`, [`${MARKER}%`]);
  await client.query(`DELETE FROM "PushToken" WHERE token LIKE $1`, [`${MARKER}%`]);
  await client.query(`DELETE FROM audit_log WHERE resource_type LIKE $1`, [`${MARKER}%`]);
  await client.query(`DELETE FROM "Promo" WHERE code = $1`, [PROMO_CODE]);
}

async function teardown(client: Client): Promise<void> {
  const slugs = [SLUGS.A, SLUGS.B];
  const t = await client.query<{ id: string }>('SELECT id FROM "Tenant" WHERE slug = ANY($1)', [
    slugs,
  ]);
  const tenantIds = t.rows.map((r) => r.id);
  console.log(`Tearing down ${tenantIds.length} disposable tenant(s): ${slugs.join(', ')}`);

  await deleteMarkerRows(client);
  console.log('  deleted RLS597 marker rows');

  if (tenantIds.length === 0) {
    console.log('  no disposable tenants present — nothing further to do');
    return;
  }

  // Anything else that hangs off these tenants and is NOT part of the
  // seed-staging graph. `scripts/migrate.mjs` spawns seed-starter-playbooks.ts
  // after applying migrations, so a migration run while the fixtures exist
  // creates Playbook/PlaybookStep/PlaybookTrigger/StepTemplate rows for both of
  // them. Without these four deletes the Tenant delete fails on an FK.
  const extraScoped: Array<[string, string]> = [
    ['audit_log', 'tenant_id'],
    ['in_app_notifications', 'org_id'],
    ['"PushToken"', '"tenantId"'],
    ['"SysAdminInvoiceItem"', '"tenantId"'],
    ['"SysAdminInvoice"', '"tenantId"'],
    ['"PlaybookTrigger"', '"tenantId"'],
    ['"PlaybookStep"', '"tenantId"'],
    ['"Playbook"', '"tenantId"'],
    ['"StepTemplate"', '"tenantId"'],
  ];
  for (const [table, col] of extraScoped) {
    const r = await client.query(`DELETE FROM ${table} WHERE ${col} = ANY($1::uuid[])`, [tenantIds]);
    console.log(`  ${table}: ${r.rowCount} deleted`);
  }

  // The seed-staging graph, in EXACT reverse of its creation order.
  const steps: Array<[string, string]> = [
    [
      'carrier_documents',
      `DELETE FROM carrier_documents WHERE uploaded_by IN
         (SELECT id FROM "User" WHERE "tenantId" = ANY($1::uuid[]))`,
    ],
    [
      'route_template_stops',
      `DELETE FROM route_template_stops WHERE route_template_id IN
         (SELECT id FROM route_templates WHERE org_id = ANY($1::uuid[]))`,
    ],
    ['route_templates', `DELETE FROM route_templates WHERE org_id = ANY($1::uuid[])`],
    [
      'stops',
      `DELETE FROM stops WHERE dispatch_id IN
         (SELECT id FROM dispatches WHERE org_id = ANY($1::uuid[]))`,
    ],
    ['loads', `DELETE FROM loads WHERE org_id = ANY($1::uuid[])`],
    ['dispatches', `DELETE FROM dispatches WHERE org_id = ANY($1::uuid[])`],
    ['facilities', `DELETE FROM facilities WHERE org_id = ANY($1::uuid[])`],
    ['carrier_trucks', `DELETE FROM carrier_trucks WHERE org_id = ANY($1::uuid[])`],
    ['clients', `DELETE FROM clients WHERE org_id = ANY($1::uuid[])`],
    ['carrier_drivers', `DELETE FROM carrier_drivers WHERE org_id = ANY($1::uuid[])`],
    ['"User"', `DELETE FROM "User" WHERE "tenantId" = ANY($1::uuid[])`],
    ['"Tenant"', `DELETE FROM "Tenant" WHERE id = ANY($1::uuid[])`],
  ];

  for (const [label, sql] of steps) {
    const r = await client.query(sql, [tenantIds]);
    console.log(`  ${label}: ${r.rowCount} deleted`);
  }
}

// ---------------------------------------------------------------------------
// --verify-clean
// ---------------------------------------------------------------------------

const CLEAN_TABLES = [
  '"Tenant"',
  'audit_log',
  '"PushToken"',
  'in_app_notifications',
  '"SysAdminInvoice"',
  '"SysAdminInvoiceItem"',
  'stops',
  'carrier_documents',
  'route_template_stops',
  '"SupportTicket"',
];

async function verifyClean(client: Client): Promise<number> {
  let dirty = 0;
  console.log('--- verify-clean (staging) ---');
  for (const table of CLEAN_TABLES) {
    const r = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
    const n = Number(r.rows[0].n);
    console.log(`  ${table.padEnd(24)} ${n}`);
    if (n !== 0) dirty++;
  }
  const promo = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM "Promo" WHERE code = $1`,
    [PROMO_CODE]
  );
  const promoN = Number(promo.rows[0].n);
  console.log(`  ${`"Promo" (${PROMO_CODE})`.padEnd(24)} ${promoN}`);
  if (promoN !== 0) dirty++;

  if (dirty > 0) {
    console.error(`\nNOT CLEAN — ${dirty} table(s) above carry rows. Exit 1.`);
    return 1;
  }
  console.log('\nCLEAN — every table above is empty. Exit 0.');
  return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = process.argv.find((a) => ['--seed', '--teardown', '--verify-clean'].includes(a));
  if (!mode) {
    console.error('Usage: 597-staging-fixtures.ts --seed | --teardown | --verify-clean');
    process.exit(1);
  }

  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();
  const who = await client.query<{ u: string; db: string }>(
    'SELECT current_user AS u, current_database() AS db'
  );
  console.log(`Connected to staging (${STAGING_REF}) as role "${who.rows[0].u}".`);

  try {
    if (mode === '--seed') await seed(client);
    else if (mode === '--teardown') await teardown(client);
    else process.exitCode = await verifyClean(client);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error('597-staging-fixtures FAILED:', e);
  process.exit(1);
});
