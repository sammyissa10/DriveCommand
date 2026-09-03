/**
 * quick-587 — `app.bypass_rls` flag removal guard.
 *
 * WHAT THIS PINS
 * --------------
 * quick-586 routed fourteen bare-`prisma` access paths on `stops`,
 * `carrier_documents` and `route_template_stops` onto a tenant-scoped client.
 * quick-587 then removed the twelve now-vestigial
 * `set_config('app.bypass_rls', 'on', TRUE)` statements from those paths, after
 * the decision that **none of the three tables will get a `bypass_rls_policy`** —
 * so on those tables the flag could never fire, and on every sibling model in
 * those transactions (`CarrierDriver`, `Trip`, `CarrierLoad`, `CarrierExpense`,
 * all of which DO carry a live `bypass_rls_policy`) the rows are already admitted
 * by `tenant_isolation_policy`, because every one of those queries carries an
 * explicit `orgId` predicate and the tenant GUC is now set by `getTenantPrisma*`.
 *
 * THE INVARIANT
 * -------------
 * In these nine files:
 *
 *   1. NO `tenantPrisma.$transaction` body may contain `app.bypass_rls`.
 *      A tenant-scoped client does not need the bypass — that is the whole
 *      argument for the removal, expressed as a rule rather than a line number.
 *   2. The bare-`prisma` transactions keep EXACTLY their remaining flags.
 *      These are out-of-scope transactions touching `FleetMessage` / `User` /
 *      `Trip` / `CarrierLoad`. Twelve of them touch a NON-EXEMPT model, so
 *      removing their flag is the third-class hazard quick-586 documented on
 *      `stops/[id]/page.tsx`. This half of the guard exists to stop someone
 *      "finishing the job".
 *
 * NOT A SYSTEM COUNTER-ASSERTION. quick-587 found **zero** SYSTEM sites — nothing
 * here demonstrably reads or writes across tenants — so there is no
 * "deliberately retained because cross-tenant" set to pin. Rule 2 pins retention
 * for a different reason: those transactions are simply out of scope and unsafe
 * to touch without their own analysis.
 *
 * Anti-vacuity: re-adding a flag inside any tenant-client transaction fails
 * rule 1; deleting any retained flag fails rule 2. Both were driven RED before
 * this file was committed.
 *
 * Line endings are normalised — `core.autocrlf=true` and there is no
 * `.gitattributes`, so the working tree is CRLF while the index is LF.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

const BYPASS = "set_config('app.bypass_rls'";

/** Files quick-586 converted and quick-587 audited. */
interface FileSpec {
  /** Path relative to apps/web/src. */
  path: string;
  /** Flags that must REMAIN (all on the bare `prisma` client, all out of scope). */
  retainedFlags: number;
  /** Flags quick-587 removed from this file. */
  removedFlags: number;
  /** Smallest plausible size, so a truncated read cannot pass vacuously. */
  minBytes: number;
}

const FILES: FileSpec[] = [
  { path: 'app/(driver)/actions/driver-routes.ts', retainedFlags: 3, removedFlags: 2, minBytes: 4000 },
  { path: 'app/(owner)/carrier/stops/[id]/page.tsx', retainedFlags: 3, removedFlags: 0, minBytes: 3000 },
  { path: 'app/(owner)/carrier/trips/[id]/page.tsx', retainedFlags: 1, removedFlags: 0, minBytes: 3000 },
  { path: 'app/(owner)/carrier/trips/[id]/stops/page.tsx', retainedFlags: 1, removedFlags: 0, minBytes: 2000 },
  { path: 'app/api/driver/stops/[stopId]/documents/route.ts', retainedFlags: 0, removedFlags: 3, minBytes: 4000 },
  { path: 'app/api/driver/stops/[stopId]/messages/route.ts', retainedFlags: 5, removedFlags: 2, minBytes: 4000 },
  { path: 'app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts', retainedFlags: 0, removedFlags: 1, minBytes: 3000 },
  { path: 'app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts', retainedFlags: 0, removedFlags: 2, minBytes: 3000 },
  { path: 'app/api/v1/carrier/stops/[id]/messages/route.ts', retainedFlags: 4, removedFlags: 2, minBytes: 4000 },
];

const TOTAL_REMOVED = 12;
const TOTAL_RETAINED = 17;

function read(rel: string): string {
  const src = readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
  if (src.length === 0) throw new Error(`empty read: ${rel}`);
  return src;
}

/**
 * Every `<receiver>.$transaction(` body in `src`, sliced by paren matching with
 * string/template awareness. Regex cannot do this — a transaction body contains
 * parentheses, and `TX_OPTIONS` sits after the closing one.
 */
function transactionBodies(src: string): { receiver: string; body: string }[] {
  const out: { receiver: string; body: string }[] = [];
  const re = /([A-Za-z_$][\w$]*)\.\$transaction\(/g;
  let m: RegExpExecArray | null;
  const BACKSLASH = 92;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let i = open;
    let quote: string | null = null;
    let escaped = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (escaped) { escaped = false; continue; }
      if (quote) {
        if (c.charCodeAt(0) === BACKSLASH) { escaped = true; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) { i++; break; } }
    }
    out.push({ receiver: m[1], body: src.slice(open, i) });
  }
  return out;
}

const countOf = (s: string, needle: string) => s.split(needle).length - 1;

describe('quick-587 — app.bypass_rls flag removal guard', () => {
  it('covers every audited file (integrity floor)', () => {
    expect(FILES.length).toBe(9);
    expect(FILES.reduce((n, f) => n + f.removedFlags, 0)).toBe(TOTAL_REMOVED);
    expect(FILES.reduce((n, f) => n + f.retainedFlags, 0)).toBe(TOTAL_RETAINED);
  });

  describe.each(FILES)('$path', (spec) => {
    it('is readable and non-trivial', () => {
      const src = read(spec.path);
      expect(src.length).toBeGreaterThan(spec.minBytes);
      // "was it actually found" — the file must really contain transactions,
      // or every assertion below would pass against nothing.
      expect(transactionBodies(src).length).toBeGreaterThan(0);
    });

    it('RULE 1 — no tenant-scoped transaction sets app.bypass_rls', () => {
      const src = read(spec.path);
      const tenantTxs = transactionBodies(src).filter(
        (t) => t.receiver === 'tenantPrisma' || t.receiver === 'db',
      );
      const offenders = tenantTxs.filter((t) => t.body.includes(BYPASS));
      expect(
        offenders.length,
        `${spec.path}: ${offenders.length} tenant-client transaction(s) set app.bypass_rls. ` +
          `quick-587 removed these deliberately — a tenant-scoped client does not need the ` +
          `bypass, and stops/carrier_documents/route_template_stops get no bypass_rls_policy. ` +
          `Do not re-add it.`,
      ).toBe(0);
    });

    it('RULE 2 — retained flags are still present and still on the bare client', () => {
      const src = read(spec.path);
      expect(
        countOf(src, BYPASS),
        `${spec.path}: expected exactly ${spec.retainedFlags} app.bypass_rls flag(s). ` +
          `These sit in out-of-scope transactions (FleetMessage / User / Trip / CarrierLoad); ` +
          `12 of the 17 across all files touch a NON-EXEMPT model, so removing one would newly ` +
          `apply a tenantId filter — the hazard quick-586 found on stops/[id]/page.tsx. ` +
          `Removing them needs its own audit, not this task's conclusion.`,
      ).toBe(spec.retainedFlags);

      const bareWithFlag = transactionBodies(src).filter(
        (t) => t.receiver === 'prisma' && t.body.includes(BYPASS),
      );
      expect(bareWithFlag.length).toBe(spec.retainedFlags);
    });
  });

  it('the three target tables are never reached from a flagged tenant transaction', () => {
    // Belt and braces: across all nine files, no transaction that touches
    // carrierStop / carrierDocument / routeTemplateStop on a tenant client may
    // carry the bypass flag.
    let checked = 0;
    for (const spec of FILES) {
      const src = read(spec.path);
      for (const tx of transactionBodies(src)) {
        if (tx.receiver !== 'tenantPrisma' && tx.receiver !== 'db') continue;
        if (!/\btx\.(carrierStop|carrierDocument|routeTemplateStop)\b/.test(tx.body)) continue;
        checked++;
        expect(tx.body.includes(BYPASS), `${spec.path}: flagged tenant tx touching a target table`).toBe(false);
      }
    }
    // Non-vacuity: these transactions must actually exist.
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});
