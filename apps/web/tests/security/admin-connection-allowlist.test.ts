/**
 * quick-600 (B5) — the `getAdminDb` import allowlist gate.
 *
 * There is no working lint entry point in `apps/web` (`next lint` no longer
 * accepts `--dir` on this Next version, and ESLint 9 finds no
 * `eslint.config.js` — the repo still has `.eslintrc.*`). This is therefore
 * a TEST-BASED SOURCE SCAN, not an ESLint rule, living under `tests/` so
 * `vitest.config.ts`'s `tests/**` glob collects it — what `npm test` and CI
 * already run. It is a pure source scan and needs no database, so CI's dummy
 * `DATABASE_URL` is irrelevant to it.
 *
 * WHAT THIS GUARDS.
 * -----------------
 * `getAdminDb(reason)` is the ONLY way to reach a connection that BYPASSES
 * RLS entirely (`app_admin`, `rolbypassrls = true`). A reviewer must be able
 * to answer "which files can reach it" by reading ONE list — this one — not
 * by trusting that every future PR remembers to ask. This test makes that
 * list a hard gate:
 *
 *   1. ALLOWLIST EQUALITY, BOTH DIRECTIONS. The set of files importing from
 *      `lib/db/admin-prisma` (by path, not by name — an alias cannot dodge
 *      this) must equal `ADMIN_ALLOWLIST` exactly. A file added to the
 *      allowlist that no longer imports the module fails just as loudly as
 *      an importer missing from the allowlist.
 *   2. PER-FILE CALL COUNT. Each allowlist entry records how many
 *      `getAdminDb(` calls its file contains, and the test asserts equality.
 *      A NEW call inside an ALREADY-allowlisted file is therefore still a
 *      deliberate, reviewable edit — the file doesn't get a free pass just
 *      because it is already on the list.
 *   3. NO ALIASING. `import { getAdminDb as x }` or
 *      `import { adminPrisma as x }` anywhere in `src` is a violation on its
 *      own — an alias defeats every grep-based review this list enables.
 *   4. `adminPrisma` — THE CLIENT ITSELF — is never exported from any module.
 *      `lib/db/admin-prisma.ts` does not export it under this name or any
 *      other; the only door out of that module is `getAdminDb`. Checked here
 *      as a standing invariant rather than trusted as a comment (quick-547/
 *      548's rule: a comment asserting an invariant is not evidence the
 *      invariant holds).
 *   5. ANTI-VACUITY (quick-546's rule — the failure mode of a bad slice or
 *      an empty corpus is GREEN, not red):
 *        - the scan actually visited a floor of real files;
 *        - every allowlist entry exists on disk and is not suspiciously
 *          small (a `minBytes` floor per file);
 *        - a COUNTER-ASSERTION: `lib/db/prisma.ts` — the tenant pool's own
 *          module, deliberately NOT on the allowlist — is confirmed READ and
 *          confirmed to contain ZERO `getAdminDb(` matches. Without this, an
 *          empty-corpus bug (the walker visiting nothing) would pass every
 *          other assertion in this file.
 *
 * Line endings are normalised — `core.autocrlf=true` and there is no
 * `.gitattributes`, so the working tree is CRLF while the index is LF
 * (same family as quick-546/587's guards).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const SRC_ROOT = resolve(__dirname, '..', '..', 'src');

/** Read a file relative to SRC_ROOT, CRLF-normalised. */
function readSrc(relPath: string): string {
  const abs = resolve(SRC_ROOT, relPath);
  const raw = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  if (raw.length === 0) throw new Error(`empty read: ${relPath}`);
  return raw;
}

/** Every `.ts`/`.tsx` file under `src`, as POSIX paths relative to `src`. */
function walkSrc(dir: string = SRC_ROOT, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkSrc(abs, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(relative(SRC_ROOT, abs).split('\\').join('/'));
    }
  }
  return out;
}

const countOf = (s: string, needle: string) => s.split(needle).length - 1;

/**
 * A file "imports from admin-prisma" when it names the module by PATH — the
 * alias `@/lib/db/admin-prisma` or a relative `.../admin-prisma` — in an
 * `import ... from '...'` statement. Matched on the path, never on the
 * imported identifier, so an aliased import (`getAdminDb as x`) is still
 * caught by rule 1 even though rule 3 also catches it independently.
 */
const ADMIN_MODULE_IMPORT_RE = /from\s+['"](?:[^'"]*\/)?admin-prisma['"]/;

function importsAdminModule(src: string): boolean {
  return ADMIN_MODULE_IMPORT_RE.test(src);
}

// ---------------------------------------------------------------------------
// THE ALLOWLIST — every file that may import `lib/db/admin-prisma`, and
// exactly how many `getAdminDb(` calls it is allowed to contain.
//
// Adding an entry here is what ROUTING-MANIFEST.md calls a ROUTE verdict.
// Never widen this list to "make a run green" — see CLAUDE.md.
// ---------------------------------------------------------------------------

interface AllowlistEntry {
  /** getAdminDb( call count in this file. tenant-context.ts imports the
   *  module only for assertRoleBootGuard and calls getAdminDb 0 times —
   *  0 is a legitimate, asserted value here, not an omission. */
  calls: number;
  /** Smallest plausible file size, so a truncated read cannot pass vacuously. */
  minBytes: number;
}

const ADMIN_ALLOWLIST: Record<string, AllowlistEntry> = {
  // quick-615 — 3 -> 4. ONE acquisition for `getAllTickets`, covering the
  // all-tenant `SupportTicket` scan and all THREE of the `Promise.all` joins
  // that decorate it (`User`, `Tenant`, and the `auth.users` display-name
  // fallback, which fails 42501 on a GRANT and is fixed by one). The seven
  // bypass-flagged statements and `:563` are deliberately untouched.
  'actions/support-tickets.ts': { calls: 4, minBytes: 15000 },
  // quick-613 — 3 -> 7. The three pre-existing `automationRun` calls, plus the
  // three routed `AutomationRule` units of work (listing, detail read,
  // activation toggle), plus ONE shared acquisition in `manualTriggerRule`
  // serving both its `tenant.findUnique` and its `automationRule.findUnique`.
  'app/(admin)/actions/automations.ts': { calls: 7, minBytes: 4000 },
  // quick-615 — NEW. Nine `NotificationSendLog` statements in two units of
  // work (the send-log list+count pair, the seven-way delivery-statistics
  // block). The file keeps its `prisma` import and stays MIXED on purpose: its
  // other eight statements are on `NotificationTemplate` /
  // `NotificationEmailConfig`, both RLS OFF, and must NOT be routed.
  'app/(admin)/actions/notifications.ts': { calls: 2, minBytes: 9000 },
  'app/(admin)/actions/sysadmin-invoices.ts': { calls: 10, minBytes: 9000 },
  // quick-615 — 7 -> 12. quick-600 routed this file's seven MUTATIONS from a
  // design-doc-derived census; its fourteen cross-tenant READS stayed on the
  // bare client. Five new acquisitions (tenant listing, platform metrics,
  // tenant detail read, owner invitation resend, owner email change); the other
  // three statements are RECEIVER SWAPS onto an admin client already in scope
  // (`:123` under `adminDb`, `:198` under `adminDbSuspend`, `:239` under
  // `adminDbReactivate`) and therefore add no call at all.
  'app/(admin)/actions/tenants.ts': { calls: 12, minBytes: 15000 },
  // quick-615 — NEW. Both units of work are tenantless: `getAllUsers` spans
  // every tenant, and `updateUserProfile`'s input is `{userId, …}`. The update
  // path shares ONE acquisition across read / write / compensating rollback /
  // re-read.
  'app/(admin)/actions/users.ts': { calls: 2, minBytes: 4000 },
  // quick-615 — NEW. Four single-statement sysadmin server components. `.tsx`
  // precedent: `app/track/[token]/page.tsx`, `app/(admin)/billing/[id]/page.tsx`.
  'app/(admin)/admin-support/page.tsx': { calls: 1, minBytes: 3000 },
  'app/(admin)/tenants/[id]/activation-progress-section.tsx': { calls: 1, minBytes: 2000 },
  'app/(admin)/tenants/[id]/automation-runs-section.tsx': { calls: 1, minBytes: 2500 },
  'app/(admin)/tenants/[id]/page.tsx': { calls: 1, minBytes: 11000 },
  'app/(admin)/billing/[id]/page.tsx': { calls: 1, minBytes: 4000 },
  'app/api/auth/accept-invitation/route.ts': { calls: 2, minBytes: 9000 },
  // quick-615 — 1 -> 2. The READ half quick-602 measured raising TC001; line
  // 57's acquisition was not in scope at line 25. Same unit of work, so it
  // REUSES the existing reason and mints no new member.
  'app/api/cron/auto-close-tickets/route.ts': { calls: 2, minBytes: 2500 },
  // quick-615 — NEW. ONE acquisition for the four `candidateQuery` closures and
  // ONE for the platform-scope rule lookup in `scheduleCronDrivenRule`. The two
  // per-candidate dedup reads in the same helper went to
  // `getTenantPrismaForOrg`, NOT here — they hold the loop variable.
  'app/api/cron/automations/route.ts': { calls: 2, minBytes: 7000 },
  // quick-606 — four cron tenant sweeps routed off the bare client.
  'app/api/cron/carrier-auto-dispatch/route.ts': { calls: 1, minBytes: 3000 },
  'app/api/cron/carrier-compliance-alerts/route.ts': { calls: 1, minBytes: 5000 },
  'app/api/cron/digest-compliance-30day/route.ts': { calls: 1, minBytes: 1000 },
  'app/api/cron/digest-daily-driver/route.ts': { calls: 1, minBytes: 1000 },
  'app/api/cron/digest-weekly-owner/route.ts': { calls: 1, minBytes: 1000 },
  'app/api/cron/mark-overdue-invoices/route.ts': { calls: 1, minBytes: 700 },
  'app/api/cron/purge-deleted/route.ts': { calls: 1, minBytes: 4000 },
  'app/api/cron/send-reminders/route.ts': { calls: 1, minBytes: 2000 },
  'app/api/cron/trip-reminders/route.ts': { calls: 1, minBytes: 6000 },
  'app/api/cron/workflow-digest/route.ts': { calls: 1, minBytes: 4000 },
  'app/api/cron/workflow-notifications/route.ts': { calls: 2, minBytes: 3000 },
  'app/api/track/[token]/route.ts': { calls: 1, minBytes: 1500 },
  // quick-606 — the PAGE now takes the same decision as its API twin above,
  // for the byte-identical query. It cannot be tenant-scoped: an anonymous
  // caller has no tenant until the token resolves one.
  'app/track/[token]/page.tsx': { calls: 1, minBytes: 3000 },
  // quick-615 — NEW. ONE acquisition at `runEvaluator`'s function scope serving
  // its three all-tenant reads (`AppEvent` scan, per-event `AutomationRule`
  // lookup, due-run queue). Its `:80` dedup read went to
  // `getTenantPrismaForOrg`; its bypass-flagged transaction is untouched.
  'lib/automations/evaluator.ts': { calls: 1, minBytes: 7000 },
  'lib/context/tenant-context.ts': { calls: 0, minBytes: 4000 },
  'lib/db/repositories/tenant.repository.ts': { calls: 2, minBytes: 1500 },
  'lib/email/send-sysadmin-invoice.ts': { calls: 1, minBytes: 2000 },
};

const TOTAL_EXPECTED_CALLS = Object.values(ADMIN_ALLOWLIST).reduce((n, e) => n + e.calls, 0);

/** Files confirmed NOT on the allowlist — the counter-assertion set (rule 5). */
const KNOWN_NON_ALLOWLISTED_FILE = 'lib/db/prisma.ts';

describe('quick-600 (B5) — getAdminDb import allowlist', () => {
  it('integrity floor: allowlist is non-trivial and internally consistent', () => {
    // quick-615 — 23 -> 31 entries, 48 -> 66 calls. Eight new FILES (8 of the
    // 11 cutover-blocker files; `tenants.ts`, `support-tickets.ts` and
    // `auto-close-tickets` were already on the list, and `sysadmin-invoices.ts`
    // turned out never to have been a blocker at all — its one apparent bare
    // statement is a `typeof` in a return-type annotation). 18 new calls: 11 in
    // the new files, 5 in `tenants.ts`, 1 each in `support-tickets.ts` and
    // `auto-close-tickets`. Three further routed statements added NO call —
    // they are receiver swaps onto an admin client already in scope.
    expect(Object.keys(ADMIN_ALLOWLIST).length).toBe(31);
    expect(TOTAL_EXPECTED_CALLS).toBe(66);
  });

  it('walked a real, non-trivial corpus (anti-vacuity)', () => {
    const files = walkSrc();
    // Floor well under the real count (1693 at authoring time) — this must
    // never pass against an empty or near-empty walk.
    expect(files.length).toBeGreaterThan(500);
  });

  it('counter-assertion: a known NON-allowlisted file is read and contains zero getAdminDb( calls', () => {
    expect(ADMIN_ALLOWLIST[KNOWN_NON_ALLOWLISTED_FILE]).toBeUndefined();
    const src = readSrc(KNOWN_NON_ALLOWLISTED_FILE);
    expect(src.length).toBeGreaterThan(1000);
    expect(countOf(src, 'getAdminDb(')).toBe(0);
    expect(importsAdminModule(src)).toBe(false);
  });

  it('every allowlist entry exists on disk and clears its minBytes floor', () => {
    for (const [path, entry] of Object.entries(ADMIN_ALLOWLIST)) {
      const src = readSrc(path); // throws (and fails the test) if missing or empty
      expect(src.length, `${path}: below its minBytes floor`).toBeGreaterThan(entry.minBytes);
    }
  });

  it('allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST', () => {
    const files = walkSrc();
    const importers = new Set(files.filter((f) => importsAdminModule(readSrc(f))));
    const allowlisted = new Set(Object.keys(ADMIN_ALLOWLIST));

    const missingFromAllowlist = [...importers].filter((f) => !allowlisted.has(f)).sort();
    const extraInAllowlist = [...allowlisted].filter((f) => !importers.has(f)).sort();

    expect(
      missingFromAllowlist,
      `these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST: ${missingFromAllowlist.join(', ')}`,
    ).toEqual([]);
    expect(
      extraInAllowlist,
      `these files are in ADMIN_ALLOWLIST but do NOT import lib/db/admin-prisma: ${extraInAllowlist.join(', ')}`,
    ).toEqual([]);
  });

  it('per-file call count matches exactly (quick-600 §3.2 countdown)', () => {
    for (const [path, entry] of Object.entries(ADMIN_ALLOWLIST)) {
      const src = readSrc(path);
      const actual = countOf(src, 'getAdminDb(');
      expect(actual, `${path}: expected ${entry.calls} getAdminDb( call(s), found ${actual}`).toBe(
        entry.calls,
      );
    }
  });

  it('no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src', () => {
    const files = walkSrc();
    const aliasHits: string[] = [];
    for (const f of files) {
      const src = readSrc(f);
      if (/getAdminDb\s+as\s+/.test(src)) aliasHits.push(`${f}: getAdminDb aliased`);
      if (/adminPrisma\s+as\s+/.test(src)) aliasHits.push(`${f}: adminPrisma aliased`);
    }
    expect(aliasHits, aliasHits.join('\n')).toEqual([]);
  });

  it('adminPrisma (the client) is never exported from any module', () => {
    const files = walkSrc();
    const exportHits: string[] = [];
    for (const f of files) {
      const src = readSrc(f);
      // `export ... adminPrisma` in any shape: `export const adminPrisma`,
      // `export { adminPrisma }`, `export { adminPrisma as X }`.
      if (/export\s*\{[^}]*\badminPrisma\b[^}]*\}/.test(src) || /export\s+(?:const|let|var)\s+adminPrisma\b/.test(src)) {
        exportHits.push(f);
      }
    }
    expect(exportHits, `adminPrisma exported from: ${exportHits.join(', ')}`).toEqual([]);
  });

  it('the tenant-GUC connect initialiser lives only in prisma.ts', () => {
    // Belt and braces for the design invariant in admin-prisma.ts's header:
    // the admin pool must never gain a REAL pool.on('connect', (client) => ...)
    // tenant-GUC initialiser, or the two pools become interchangeable in
    // exactly the way the module header says they must not.
    //
    // Matched on the CALL SHAPE (with the callback's opening paren), not on
    // the bare substring `pool.on('connect'` — that substring also appears
    // in this file's own explanatory prose (documenting what is deliberately
    // NOT here), and a naive substring check would false-positive on the
    // comment that describes the invariant it is trying to protect.
    const CONNECT_HANDLER_CALL_RE = /pool\.on\(\s*'connect'\s*,\s*\(/;
    const adminSrc = readSrc('lib/db/admin-prisma.ts');
    expect(CONNECT_HANDLER_CALL_RE.test(adminSrc)).toBe(false);
    const prismaSrc = readSrc('lib/db/prisma.ts');
    expect(CONNECT_HANDLER_CALL_RE.test(prismaSrc)).toBe(true);
  });
});
