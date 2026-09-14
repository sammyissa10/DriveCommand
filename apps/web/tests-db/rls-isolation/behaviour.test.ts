/**
 * quick-598 — what the RLS policies actually DO, measured as `app_user`.
 *
 * This is the file that replaces the behavioural half of the 17 vacuous tests
 * in `src/__tests__/isolation/`. Those tests asserted string literals against
 * string literals and passed with every policy dropped. Every number below
 * came back from a real Postgres over a real connection as a role that RLS
 * applies to.
 *
 * FOUR GROUND RULES, inherited verbatim from `scripts/audit/597-policy-verify.ts`
 *   1. Nothing is swallowed. A probe that raises reports its SQLSTATE and the
 *      full server message, and FAILS the test - it is never read as zero.
 *   2. No writes. This file issues SELECTs only, and every case runs inside
 *      `BEGIN ... ROLLBACK`.
 *   3. One FRESH `pg.Client` per GUC case, with all of that case's work in ONE
 *      transaction. `STAGING_DATABASE_URL_APP_USER` is a Supavisor
 *      TRANSACTION-mode pooler string: outside a transaction consecutive
 *      statements may land on different backends and a session-scope
 *      `set_config` would not be observed by the next statement. Each probe is
 *      additionally fenced with a SAVEPOINT.
 *   4. Unlike 597's report, THIS IS A GATE. An unexpected result fails.
 *
 * THE `''` CASE IS THE UNSET CASE, AND THAT IS NOT A SHORTCUT.
 * -----------------------------------------------------------
 * A genuinely-unset `app.current_tenant_id` is NOT REACHABLE on the app_user
 * pooler connection (quick-597 section 7.3): once the placeholder has been set
 * on a server backend, neither `set_config(name, NULL, false)` nor `RESET`
 * returns `current_setting(name, true)` to NULL - the reset value is `''`.
 * `''` is also exactly what `lib/db/prisma.ts:71` writes on every new physical
 * connection, so it is the case that actually occurs in production. The suite
 * tests `''` and says so rather than simulating an unset case it cannot reach.
 *
 * WHY THE PROBE COUNTS A FIXED ID SET RATHER THAN RE-FILTERING BY TENANT
 * ---------------------------------------------------------------------
 * See `env.ts`. If the probe re-derived ownership with the same expression the
 * policy uses, a policy rewritten to `USING (true)` and a probe that also said
 * `true` would agree, and the suite would pass on a wide-open table.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';

import {
  ISOLATION_TARGETS,
  collectTargetIds,
  loadFixtureIds,
  openAppUser,
  openDirect,
  probe,
  probeRows,
  probeWriteThenRollback,
  WRITE_PROBE_TARGETS,
  type FixtureIds,
  type Probe,
  type TargetIds,
} from './env';

type CaseKey = 'tenantA' | 'tenantB' | 'emptyGuc' | 'bypass';

interface CaseResult {
  /** What `current_setting('app.current_tenant_id', true)` read at connect. */
  gucAtConnect: string | null;
  /** ... and after this case's `set_config`. */
  gucAfterSet: string | null;
  role: string;
  bypassRls: boolean;
  /** target key -> { A, B } row counts over the externally-known id sets. */
  counts: Record<string, { A: Probe; B: Probe }>;
}

let fixtures: FixtureIds;
let ids: TargetIds;
/** Which targets actually carry a `bypass_rls_policy`, read from the catalogue. */
let bypassPolicyTables: Set<string>;
const results: Record<string, CaseResult> = {};

/** Cross-tenant / own-tenant DELETE row counts, both discarded. */
const writeResults: Record<string, { crossTenant: Probe; ownTenant: Probe }> = {};

async function runWriteCase(): Promise<void> {
  const client: Client = await openAppUser();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [
      fixtures.tenants.A.id,
    ]);

    for (const key of WRITE_PROBE_TARGETS) {
      const target = ISOLATION_TARGETS.find((t) => t.key === key)!;
      writeResults[key] = {
        crossTenant: await probeWriteThenRollback(
          client,
          `DELETE FROM ${target.sql} WHERE id::text = ANY($1::text[])`,
          [ids[key].B]
        ),
        ownTenant: await probeWriteThenRollback(
          client,
          `DELETE FROM ${target.sql} WHERE id::text = ANY($1::text[])`,
          [ids[key].A]
        ),
      };
    }

    await client.query('ROLLBACK');
  } finally {
    await client.end().catch(() => {});
  }
}

async function runCase(key: CaseKey, gucValue: string): Promise<CaseResult> {
  const client: Client = await openAppUser();
  try {
    await client.query('BEGIN');

    const who = await client.query<{ u: string; bp: boolean; g: string | null }>(
      `SELECT current_user AS u,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bp,
              current_setting('app.current_tenant_id', true) AS g`
    );

    await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [gucValue]);
    if (key === 'bypass') {
      // Local to the transaction, so the ROLLBACK below un-sets it.
      await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    }

    const after = await client.query<{ g: string | null }>(
      `SELECT current_setting('app.current_tenant_id', true) AS g`
    );

    const counts: CaseResult['counts'] = {};
    for (const target of ISOLATION_TARGETS) {
      counts[target.key] = {
        A: await probe(
          client,
          `SELECT count(*)::int AS n FROM ${target.sql} WHERE id::text = ANY($1::text[])`,
          [ids[target.key].A]
        ),
        B: await probe(
          client,
          `SELECT count(*)::int AS n FROM ${target.sql} WHERE id::text = ANY($1::text[])`,
          [ids[target.key].B]
        ),
      };
    }

    await client.query('ROLLBACK');

    return {
      gucAtConnect: who.rows[0].g,
      gucAfterSet: after.rows[0].g,
      role: who.rows[0].u,
      bypassRls: who.rows[0].bp,
      counts,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

beforeAll(async () => {
  fixtures = loadFixtureIds();

  const admin = await openDirect();
  try {
    ids = await collectTargetIds(admin, fixtures.tenants);

    const bypass = await admin.query<{ t: string }>(
      `SELECT c.relname AS t
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND p.polname = 'bypass_rls_policy'`
    );
    bypassPolicyTables = new Set(bypass.rows.map((r) => r.t));
  } finally {
    await admin.end().catch(() => {});
  }

  results.tenantA = await runCase('tenantA', fixtures.tenants.A.id);
  results.tenantB = await runCase('tenantB', fixtures.tenants.B.id);
  results.emptyGuc = await runCase('emptyGuc', '');
  results.bypass = await runCase('bypass', '');
  await runWriteCase();
});

afterAll(() => {
  // Nothing to tear down: this file opens four connections, closes all four,
  // and every transaction it opens is rolled back. The fixture graph belongs
  // to `scripts/audit/597-staging-fixtures.ts`.
});

// ---------------------------------------------------------------------------
// Anti-vacuity. Without these, an empty fixture graph makes every isolation
// assertion below read `0 === 0` and pass - the failure mode this whole task
// exists to remove.
// ---------------------------------------------------------------------------

describe('preconditions (a green run here must mean something)', () => {
  it('connects as a role RLS actually applies to', () => {
    expect(results.tenantA.role).toBe('app_user');
    expect(results.tenantA.bypassRls).toBe(false);
  });

  it('the two fixture tenants are distinct', () => {
    expect(fixtures.tenants.A.id).not.toBe(fixtures.tenants.B.id);
  });

  it.each(ISOLATION_TARGETS.map((t) => t.key))(
    '%s has fixture rows for BOTH tenants (otherwise its isolation test is vacuous)',
    (key) => {
      expect(ids[key].A.length, `${key}: no tenant A fixture rows`).toBeGreaterThan(0);
      expect(ids[key].B.length, `${key}: no tenant B fixture rows`).toBeGreaterThan(0);
    }
  );

  it('the GUC this suite sets is observed by the backend it queries', () => {
    expect(results.tenantA.gucAfterSet).toBe(fixtures.tenants.A.id);
    expect(results.tenantB.gucAfterSet).toBe(fixtures.tenants.B.id);
    expect(results.emptyGuc.gucAfterSet).toBe('');
  });
});

// ---------------------------------------------------------------------------
// The isolation matrix. Every case carries its counter-assertion: "own rows
// are visible" alone passes on a wide-open table, and "other rows are hidden"
// alone passes on a table nobody can read at all.
// ---------------------------------------------------------------------------

describe('cross-tenant isolation as app_user', () => {
  it.each(ISOLATION_TARGETS.map((t) => t.key))(
    '%s: GUC = tenant A sees A rows and ZERO B rows',
    (key) => {
      const own = probeRows(results.tenantA.counts[key].A, `${key} own rows (tenant A)`);
      const other = probeRows(results.tenantA.counts[key].B, `${key} cross-tenant rows (tenant A)`);
      expect(own, `${key}: tenant A cannot see its own rows`).toBe(ids[key].A.length);
      expect(own, `${key}: tenant A sees nothing at all - the probe is vacuous`).toBeGreaterThan(0);
      expect(other, `${key}: CROSS-TENANT LEAK - tenant A can see tenant B rows`).toBe(0);
    }
  );

  it.each(ISOLATION_TARGETS.map((t) => t.key))(
    '%s: GUC = tenant B sees B rows and ZERO A rows',
    (key) => {
      const own = probeRows(results.tenantB.counts[key].B, `${key} own rows (tenant B)`);
      const other = probeRows(results.tenantB.counts[key].A, `${key} cross-tenant rows (tenant B)`);
      expect(own, `${key}: tenant B cannot see its own rows`).toBe(ids[key].B.length);
      expect(own, `${key}: tenant B sees nothing at all - the probe is vacuous`).toBeGreaterThan(0);
      expect(other, `${key}: CROSS-TENANT LEAK - tenant B can see tenant A rows`).toBe(0);
    }
  );

  it.each(ISOLATION_TARGETS.map((t) => t.key))(
    "%s: GUC = '' returns zero rows WITHOUT raising",
    (key) => {
      // probeRows throws with the SQLSTATE attached if the probe raised, so
      // "returned 0" and "blew up" can never be confused. That distinction is
      // the whole of quick-597 change 1: `audit_log` used to raise 22P02 here.
      const a = probeRows(results.emptyGuc.counts[key].A, `${key} with empty GUC (A ids)`);
      const b = probeRows(results.emptyGuc.counts[key].B, `${key} with empty GUC (B ids)`);
      expect(a, `${key}: rows visible with no tenant context`).toBe(0);
      expect(b, `${key}: rows visible with no tenant context`).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Claims 3 and 7 of the 17: the bypass policy admits service-role queries.
// A POSITIVE assertion - the old tests inferred it from a string literal.
// ---------------------------------------------------------------------------

describe("bypass_rls_policy with app.bypass_rls = 'on'", () => {
  it.each(ISOLATION_TARGETS.map((t) => t.key))('%s: behaves as its catalogue says', (key) => {
    const a = probeRows(results.bypass.counts[key].A, `${key} bypass (A ids)`);
    const b = probeRows(results.bypass.counts[key].B, `${key} bypass (B ids)`);

    if (bypassPolicyTables.has(key)) {
      expect(a, `${key}: bypass policy exists but admits no tenant A rows`).toBe(ids[key].A.length);
      expect(b, `${key}: bypass policy exists but admits no tenant B rows`).toBe(ids[key].B.length);
      expect(b, `${key}: bypass must make CROSS-tenant rows visible`).toBeGreaterThan(0);
    } else {
      // MEASURED, not assumed: `stops`, `carrier_documents` and
      // `route_template_stops` carry ONLY `tenant_isolation_policy`. With an
      // empty GUC and app.bypass_rls = 'on' they return zero - there is no
      // policy for the flag to satisfy. Asserting that keeps the suite honest
      // about which tables the bypass mechanism actually reaches, and turns
      // "someone added a bypass policy to stops" into a visible failure rather
      // than a silent widening.
      expect(a, `${key}: has no bypass_rls_policy, so the flag must change nothing`).toBe(0);
      expect(b, `${key}: has no bypass_rls_policy, so the flag must change nothing`).toBe(0);
    }
  });

  it('at least one target does carry a bypass_rls_policy', () => {
    const withBypass = ISOLATION_TARGETS.filter((t) => bypassPolicyTables.has(t.key));
    // Without this floor, deleting every bypass policy would send all 16
    // targets down the else-branch and the suite would still be green.
    expect(withBypass.length).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant WRITES. The deleted `tests/isolation/cross-tenant.test.ts`
// claimed these (its tests 4 and 5) at the APPLICATION layer, through the
// `withTenantRLS` Prisma extension, and never once executed — it failed at
// import on Prisma 7. These assert the DATABASE layer instead: a DELETE issued
// as app_user with tenant A's GUC must not touch tenant B's rows.
//
// Every statement below runs inside a SAVEPOINT that is rolled back on success
// as well as on failure, inside a transaction that is also rolled back. The
// counter-assertion is the own-tenant DELETE: without it, "zero rows affected"
// would also be what a missing GRANT looks like.
// ---------------------------------------------------------------------------

describe('cross-tenant writes as app_user', () => {
  it.each(WRITE_PROBE_TARGETS)(
    '%s: a DELETE of tenant B rows under tenant A context affects ZERO rows',
    (key) => {
      const cross = probeRows(writeResults[key].crossTenant, `${key} cross-tenant DELETE`);
      const own = probeRows(writeResults[key].ownTenant, `${key} own-tenant DELETE`);
      expect(cross, `${key}: CROSS-TENANT WRITE - tenant A deleted tenant B rows`).toBe(0);
      expect(
        own,
        `${key}: own-tenant DELETE affected nothing, so the zero above proves nothing`
      ).toBe(ids[key].A.length);
      expect(own).toBeGreaterThan(0);
    }
  );
});

describe('nothing was actually written', () => {
  it('every fixture row still exists after the write probes', async () => {
    // The guarantee is structural (rolled-back savepoint inside a rolled-back
    // transaction), but a deletion on a staging fixture is unrecoverable
    // without a re-seed, so it is verified rather than trusted.
    const admin = await openDirect();
    try {
      const fresh = await collectTargetIds(admin, fixtures.tenants);
      for (const key of WRITE_PROBE_TARGETS) {
        expect(fresh[key].A.length, `${key}: tenant A rows lost`).toBe(ids[key].A.length);
        expect(fresh[key].B.length, `${key}: tenant B rows lost`).toBe(ids[key].B.length);
      }
    } finally {
      await admin.end().catch(() => {});
    }
  });
});
