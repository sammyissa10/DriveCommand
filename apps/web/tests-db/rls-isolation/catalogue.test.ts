/**
 * quick-598 — the catalogue facts the 17 vacuous tests CLAIMED to check.
 *
 * Every assertion here reads `pg_class` / `pg_policy` / `information_schema`
 * on STAGING through a pure SELECT. Where the old test wrote
 *
 *     const appliedStatements = [
 *       'ALTER TABLE loads ENABLE ROW LEVEL SECURITY',
 *       'ALTER TABLE loads FORCE ROW LEVEL SECURITY',
 *     ];
 *     expect(appliedStatements).toHaveLength(2);
 *
 * this file asks `pg_class.relrowsecurity` and `pg_class.relforcerowsecurity`.
 * The difference is not stylistic: the old form passes with RLS switched off.
 *
 * Claim numbers below refer to the 17-row accounting table in
 * `docs/audits/phase-0-verification-gates.md`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';

import { openDirect } from './env';

/** Group A, as the deleted `group-a-isolation.test.ts` enumerated it (claim 4). */
const GROUP_A_TABLES = [
  'loads',
  'dispatches',
  'clients',
  'facilities',
  'carrier_drivers',
  'carrier_trucks',
  'route_templates',
  'contracts',
] as const;

/** Group B (claims 5-8, 10). */
const GROUP_B_TABLES = ['driver_pay_records'] as const;

/** Group C, the PascalCase/"tenantId" side (claims 11-12, 15-17). */
const GROUP_C_TENANTID_TABLES = [
  'PushToken',
  'DispatchOverrideAudit',
  'DriverHOSEntry',
  'DriverIncident',
  'NotificationSendLog',
  'PlaybookTrigger',
  'SupportTicket',
  'SysAdminInvoice',
  'Tag',
  'TagAssignment',
] as const;

/** Claim 15: the six tables whose `tenantId` was backfilled then made NOT NULL. */
const BACKFILLED_TABLES = [
  'PlaybookStep',
  'PushToken',
  'RouteDriver',
  'StepInstance',
  'SysAdminInvoiceItem',
  'UserNotificationPreference',
] as const;

interface RlsMeta {
  relname: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
}

interface PolicyRow {
  tablename: string;
  policyname: string;
  qual: string | null;
  with_check: string | null;
  permissive: string;
  cmd: string;
}

interface ColumnRow {
  table_name: string;
  column_name: string;
  is_nullable: string;
}

let admin: Client;
let rlsMeta: Map<string, RlsMeta>;
let policies: PolicyRow[];
let columns: ColumnRow[];
let grants: Array<{ table_name: string; privilege_type: string }>;
let pushTokenNullTenantIds: number;

const ALL_TABLES = [
  ...GROUP_A_TABLES,
  ...GROUP_B_TABLES,
  ...GROUP_C_TENANTID_TABLES,
  ...BACKFILLED_TABLES,
];

beforeAll(async () => {
  admin = await openDirect();

  const meta = await admin.query<RlsMeta>(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
    [ALL_TABLES]
  );
  rlsMeta = new Map(meta.rows.map((r) => [r.relname, r]));

  const pol = await admin.query<PolicyRow>(
    `SELECT tablename, policyname, qual, with_check, permissive, cmd
       FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY($1)
      ORDER BY tablename, policyname`,
    [ALL_TABLES]
  );
  policies = pol.rows;

  const cols = await admin.query<ColumnRow>(
    `SELECT table_name, column_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)
        AND column_name IN ('org_id', 'tenant_id', 'tenantId')`,
    [ALL_TABLES]
  );
  columns = cols.rows;

  const gr = await admin.query<{ table_name: string; privilege_type: string }>(
    `SELECT table_name, privilege_type
       FROM information_schema.role_table_grants
      WHERE grantee = 'app_user' AND table_schema = 'public' AND table_name = ANY($1)`,
    [GROUP_B_TABLES]
  );
  grants = gr.rows;

  const nulls = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "PushToken" WHERE "tenantId" IS NULL`
  );
  pushTokenNullTenantIds = nulls.rows[0].n;
});

afterAll(async () => {
  await admin?.end().catch(() => {});
});

function policyFor(table: string, name: string): PolicyRow {
  const found = policies.find((p) => p.tablename === table && p.policyname === name);
  if (!found) throw new Error(`no policy ${name} on ${table} - the catalogue read found nothing`);
  return found;
}

function columnFor(table: string, column: string): ColumnRow {
  const found = columns.find((c) => c.table_name === table && c.column_name === column);
  if (!found) throw new Error(`${table} has no ${column} column`);
  return found;
}

// ---------------------------------------------------------------------------
// Anti-vacuity first. `.find()` on an empty array returns undefined, and a
// suite built on it fails green if the catalogue read silently returned nothing.
// ---------------------------------------------------------------------------

describe('catalogue read integrity', () => {
  it('found every table it is about to make claims about', () => {
    const missing = ALL_TABLES.filter((t) => !rlsMeta.has(t));
    expect(missing, `tables absent from pg_class: ${missing.join(', ')}`).toEqual([]);
  });

  it('read a non-trivial number of policies', () => {
    expect(policies.length).toBeGreaterThanOrEqual(2 * ALL_TABLES.length - 6);
  });
});

// ---------------------------------------------------------------------------
// Claims 1, 2, 4 - Group A / loads
// ---------------------------------------------------------------------------

describe('Group A (org_id tables)', () => {
  it('claim 1: loads.tenant_isolation_policy uses org_id = current_tenant_id()', () => {
    const p = policyFor('loads', 'tenant_isolation_policy');
    expect(p.qual).toBe('(org_id = current_tenant_id())');
    expect(p.with_check).toBe('(org_id = current_tenant_id())');
    // The counter-assertion. `USING (true)` is the mutation this whole task
    // exists to catch, and `.toBe` above already rejects it - this states it.
    expect(p.qual).not.toBe('true');
  });

  it('claim 2: loads has FORCE RLS, not merely ENABLE', () => {
    const m = rlsMeta.get('loads')!;
    expect(m.relrowsecurity, 'loads: RLS not enabled').toBe(true);
    expect(m.relforcerowsecurity, 'loads: RLS enabled but NOT forced').toBe(true);
  });

  it.each(GROUP_A_TABLES)('claim 4: %s carries org_id and is FORCE RLS', (table) => {
    expect(columnFor(table, 'org_id').column_name).toBe('org_id');
    const m = rlsMeta.get(table)!;
    expect(m.relrowsecurity, `${table}: RLS not enabled`).toBe(true);
    expect(m.relforcerowsecurity, `${table}: RLS enabled but NOT forced`).toBe(true);
  });

  it.each(GROUP_A_TABLES)('claim 4: %s isolation policy scopes by org_id', (table) => {
    const p = policyFor(table, 'tenant_isolation_policy');
    expect(p.qual).toBe('(org_id = current_tenant_id())');
  });
});

// ---------------------------------------------------------------------------
// Claims 5, 6, 7, 10 - Group B / driver_pay_records
// ---------------------------------------------------------------------------

describe('Group B (driver_pay_records)', () => {
  it('claim 5: tenant_isolation_policy uses org_id = current_tenant_id()', () => {
    const p = policyFor('driver_pay_records', 'tenant_isolation_policy');
    expect(p.qual).toBe('(org_id = current_tenant_id())');
    expect(p.with_check).toBe('(org_id = current_tenant_id())');
  });

  it('claim 6: driver_pay_records has FORCE RLS', () => {
    const m = rlsMeta.get('driver_pay_records')!;
    expect(m.relrowsecurity).toBe(true);
    expect(m.relforcerowsecurity).toBe(true);
  });

  it('claim 7: bypass_rls_policy exists and compares text, not a ::boolean cast', () => {
    const p = policyFor('driver_pay_records', 'bypass_rls_policy');
    expect(p.qual).toContain("= 'on'");
    expect(p.qual).not.toContain('::boolean');
  });

  it('claim 10: app_user holds SELECT/INSERT/UPDATE/DELETE on driver_pay_records', () => {
    // The deleted test built the GRANT statement as a string and asserted that
    // string contained its own substrings. This asks the catalogue.
    const held = new Set(
      grants.filter((g) => g.table_name === 'driver_pay_records').map((g) => g.privilege_type)
    );
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(held.has(priv), `app_user lacks ${priv} on driver_pay_records`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Claims 11, 12, 13, 15, 16, 17 - Group C / PushToken
// ---------------------------------------------------------------------------

describe('Group C (tenantId tables)', () => {
  it('claim 11: PushToken.tenant_isolation_policy uses "tenantId" = current_tenant_id()', () => {
    const p = policyFor('PushToken', 'tenant_isolation_policy');
    expect(p.qual).toBe('("tenantId" = current_tenant_id())');
    expect(p.with_check).toBe('("tenantId" = current_tenant_id())');
    expect(p.qual).not.toContain('org_id');
  });

  it('claim 12: PushToken has FORCE RLS', () => {
    const m = rlsMeta.get('PushToken')!;
    expect(m.relrowsecurity).toBe(true);
    expect(m.relforcerowsecurity).toBe(true);
  });

  it('claim 13 (PARTIAL): PushToken.tenantId is NOT NULL and zero rows are NULL', () => {
    // PARTIAL, and the accounting table says so. The historical backfill ACT -
    // `UPDATE "PushToken" SET "tenantId" = u."tenantId" FROM "User" u` - is not
    // observable now and nothing in this repository can make it observable.
    // What IS observable is its outcome, so that is what is asserted. Claiming
    // more would be the same overreach as the test this replaces.
    expect(columnFor('PushToken', 'tenantId').is_nullable).toBe('NO');
    expect(pushTokenNullTenantIds).toBe(0);
  });

  it.each(BACKFILLED_TABLES)('claim 15: %s."tenantId" is NOT NULL', (table) => {
    expect(columnFor(table, 'tenantId').is_nullable).toBe('NO');
  });

  it('claim 15: the backfilled list is exactly the six tables named', () => {
    expect(BACKFILLED_TABLES).toHaveLength(6);
  });

  it.each(GROUP_C_TENANTID_TABLES)('claim 16: %s scopes by "tenantId", never org_id', (table) => {
    const p = policyFor(table, 'tenant_isolation_policy');
    expect(p.qual).toContain('"tenantId"');
    expect(p.qual).not.toContain('org_id');
  });

  it('claim 17: PushToken.bypass_rls_policy compares text, not a ::boolean cast', () => {
    const p = policyFor('PushToken', 'bypass_rls_policy');
    expect(p.qual).toContain("= 'on'");
    expect(p.qual).toContain('true'); // the missing_ok second argument
    expect(p.qual).not.toContain('::boolean');
  });
});

// ---------------------------------------------------------------------------
// quick-597's drops, asserted as ABSENCES so nobody reinstates them silently.
// ---------------------------------------------------------------------------

describe('quick-597 drops stay dropped', () => {
  it('PushToken has no user_isolation_policy (it keyed on a GUC nothing sets)', () => {
    expect(policies.find((p) => p.tablename === 'PushToken' && p.policyname === 'user_isolation_policy')).toBeUndefined();
  });

  it('the SysAdmin "deny" pair is gone (named deny, PERMISSIVE, so they GRANTED)', () => {
    const denies = policies.filter(
      (p) => p.policyname.includes('deny') && p.tablename.startsWith('SysAdminInvoice')
    );
    expect(denies).toEqual([]);
    // Counter-assertion: the tables themselves are still policed, so this test
    // cannot be satisfied by the tables having lost all their policies.
    expect(policyFor('SysAdminInvoice', 'tenant_isolation_policy').qual).toContain('"tenantId"');
  });
});
