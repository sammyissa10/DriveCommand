/**
 * quick-540 — every caller that starts a trip must go through the gate.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A MOCK TEST.
 *
 * The defect this guards against is not "caller X behaves wrongly". It is
 * "someone added caller X and nobody noticed" — which is exactly what happened
 * in Phase 9: the gate was written, tested with 25 unit tests, and wired to the
 * one endpoint whose name was `/start`, while `startTrip()` and the `status`
 * PATCH went on starting trips with no gate for a whole phase.
 *
 * A mock-based test cannot catch that. It can only assert about the call sites
 * its author remembered to write a case for, which is the same blind spot DEC-8
 * named: *"the migration's own assertion block only checks what its author
 * remembered to add, so it cannot catch an omission."* A test that enumerates
 * the source is the only shape that fails on a caller nobody thought about.
 *
 * This IS real behaviour, not a mock of it: the assertion runs against the
 * actual files that ship, read from disk, with no stubbing anywhere.
 *
 * THE INVARIANT, in one sentence:
 *   `transitionTripStatus(_, _, 'in_progress')` may be reached from exactly one
 *   module — the one that runs `evaluateTripStartGate` first.
 *
 * HOW IT FAILS FOR A SIXTH CALLER, which is the point of the test:
 *
 *   a) Someone writes `transitionTripStatus(orgId, id, 'in_progress')` in a new
 *      file. `literalStarters` gains that file, the set no longer equals
 *      GATE_MODULE, and the failure message names the file and line.
 *
 *   b) Someone writes `transitionTripStatus(orgId, id, someStatusVariable)` —
 *      the shape the `status` PATCH has, where the value is only knowably
 *      'in_progress' at runtime. That file is required to prove it discriminates:
 *      it must import `handleStartTrip` AND branch on `'in_progress'`. Without
 *      both, the test fails and names it.
 *
 *   c) Someone reaches the function through the deprecated alias
 *      `transitionDispatchStatus` (re-exported from `lib/carrier/dispatches.ts`,
 *      which a grep for `transitionTripStatus` does NOT find — this scan looks
 *      for both names precisely because that alias exists and quick-539's
 *      enumeration would have missed a caller using it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

/** The ONLY module permitted to perform the in_progress transition. */
const GATE_MODULE = 'src/lib/carrier/inspection-handlers.ts';

/** Where the function is defined. Contains no call to itself. */
const DEFINITION_MODULE = 'src/lib/carrier/trips.ts';

/** Both names the function is reachable under. */
const CALL_NAMES = ['transitionTripStatus', 'transitionDispatchStatus'] as const;

const SRC_ROOT = join(process.cwd(), 'src');
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'generated', 'legacy', '.next']);

// ---------------------------------------------------------------------------
// Source walking
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative, forward-slashed, so assertions read the same on any OS. */
function rel(file: string): string {
  return relative(process.cwd(), file).split(sep).join('/');
}

/**
 * Split a call's argument list at top level, respecting nesting and strings.
 *
 * Deliberately hand-rolled rather than regex: `transitionTripStatus(a, f(b, c),
 * 'x')` has a comma inside `f(...)` that a regex split would treat as an
 * argument boundary and silently mis-read the third argument — which is the one
 * this whole test turns on.
 */
function splitArgs(source: string, openParenIndex: number): string[] | null {
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  const args: string[] = [];

  for (let i = openParenIndex; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];

    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      current += ch;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      if (depth === 1 && i === openParenIndex) continue; // skip the opening paren
      current += ch;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        args.push(current.trim());
        return args;
      }
      current += ch;
      continue;
    }

    if (ch === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  return null; // unbalanced — caller decides
}

/** Line number of a character offset, 1-indexed. */
function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

interface CallSite {
  file: string;
  line: number;
  statusArg: string;
}

function findCallSites(): { literal: CallSite[]; dynamic: CallSite[] } {
  const literal: CallSite[] = [];
  const dynamic: CallSite[] = [];

  for (const file of walk(SRC_ROOT)) {
    const relPath = rel(file);
    if (relPath === DEFINITION_MODULE) continue; // the definition, not a call
    const source = readFileSync(file, 'utf8');

    for (const name of CALL_NAMES) {
      let from = 0;
      for (;;) {
        const idx = source.indexOf(`${name}(`, from);
        if (idx === -1) break;
        from = idx + name.length;

        // Skip `export { transitionTripStatus as ... }` and `import { ... }`,
        // and skip a name that is part of a longer identifier.
        const before = source[idx - 1] ?? '';
        if (/[A-Za-z0-9_$.]/.test(before)) continue;

        const args = splitArgs(source, idx + name.length);
        if (!args || args.length < 3) continue;

        const statusArg = args[2];
        const site: CallSite = { file: relPath, line: lineOf(source, idx), statusArg };

        if (/^['"`]/.test(statusArg)) {
          // A string literal. Only 'in_progress' matters.
          if (/in_progress/.test(statusArg)) literal.push(site);
        } else {
          // Not a literal — it could be 'in_progress' at runtime.
          dynamic.push(site);
        }
      }
    }
  }

  return { literal, dynamic };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trip start gate coverage', () => {
  const { literal, dynamic } = findCallSites();

  it('finds the gate module itself, proving the scan works', () => {
    // A scan that matches nothing would pass every assertion below while
    // checking nothing at all. This is the scan's own smoke test.
    expect(literal.map((c) => c.file)).toContain(GATE_MODULE);
  });

  it('only the gate module passes the in_progress literal to transitionTripStatus', () => {
    const offenders = literal.filter((c) => c.file !== GATE_MODULE);

    expect(
      offenders.map((c) => `${c.file}:${c.line}`),
      offenders.length === 0
        ? ''
        : [
            '',
            'These call sites start a trip WITHOUT the inspection gate:',
            ...offenders.map((c) => `  ${c.file}:${c.line}`),
            '',
            'Call handleStartTrip() from lib/carrier/inspection-handlers.ts instead.',
            'It runs evaluateTripStartGate first and only reaches',
            'transitionTripStatus on an ALLOWED verdict.',
            '',
          ].join('\n')
    ).toEqual([]);
  });

  it('any caller passing a NON-literal status must prove it routes in_progress to the gate', () => {
    // The `status` PATCH is this shape: it forwards a validated variable, and
    // is only safe because it branches on 'in_progress' first. A new caller of
    // the same shape must carry the same proof.
    const unproven = dynamic.filter((site) => {
      if (site.file === GATE_MODULE) return false;
      const source = readFileSync(join(process.cwd(), site.file), 'utf8');
      const importsGate = /handleStartTrip/.test(source);
      const discriminates = /['"]in_progress['"]\s*(===|==)|(===|==)\s*['"]in_progress['"]/.test(
        source
      );
      return !(importsGate && discriminates);
    });

    expect(
      unproven.map((c) => `${c.file}:${c.line} (status arg: ${c.statusArg})`),
      unproven.length === 0
        ? ''
        : [
            '',
            'These call sites forward a runtime status value to transitionTripStatus',
            'without proving they route in_progress through the gate:',
            ...unproven.map((c) => `  ${c.file}:${c.line} — status arg: ${c.statusArg}`),
            '',
            'Either branch on status === \'in_progress\' and call handleStartTrip(),',
            'or narrow the value so it can never be in_progress.',
            '',
          ].join('\n')
    ).toEqual([]);
  });

  it('the deprecated transitionDispatchStatus alias still exists and is therefore still scanned', () => {
    // If this ever fails because the alias was deleted, that is GOOD — delete
    // it from CALL_NAMES too. It fails loudly rather than leaving the scan
    // quietly looking for a name that no longer exists, which would be a scan
    // that passes while checking half of what it claims.
    const dispatches = readFileSync(
      join(process.cwd(), 'src/lib/carrier/dispatches.ts'),
      'utf8'
    );
    expect(dispatches).toContain('transitionTripStatus as transitionDispatchStatus');
  });

  it('the two known start doors call handleStartTrip, not transitionTripStatus', () => {
    // Named explicitly so a regression that reverts either one fails HERE with
    // the file named, rather than only in the generic sweep above.
    //
    // Asserted against the SCANNER's call sites, not against the raw text: both
    // files legitimately mention `transitionTripStatus` in prose explaining why
    // they no longer call it, and a substring check would fail on the comment
    // that documents the fix. The scanner only counts `name(`, so prose is
    // invisible to it — which is the correct boundary.
    const DRIVER_ACTION = 'src/app/(driver)/actions/driver-routes.ts';
    const STATUS_ROUTE = 'src/app/api/v1/carrier/dispatches/[id]/status/route.ts';

    const allSites = [...literal, ...dynamic].map((c) => c.file);
    expect(allSites).not.toContain(DRIVER_ACTION);

    // The status route still calls it — for completed / cancelled / tonu — so
    // it appears as a DYNAMIC site, never a literal one.
    expect(literal.map((c) => c.file)).not.toContain(STATUS_ROUTE);
    expect(dynamic.map((c) => c.file)).toContain(STATUS_ROUTE);

    for (const file of [DRIVER_ACTION, STATUS_ROUTE]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain('handleStartTrip');
    }
  });
});

// ---------------------------------------------------------------------------
// The behavioural half — no source scanning, no mocks, no database
// ---------------------------------------------------------------------------

describe('the gate refuses and permits the right things (behaviour, not structure)', () => {
  it('an owner override still starts a blocked trip — Phase 9 item 5', async () => {
    // Gating the status PATCH must not break the override. This asserts the
    // property the route now depends on: the override rung outranks a critical
    // failure, so `canStart` is true and handleStartTrip proceeds.
    const { evaluateTripStartGate } = await import('../inspection-gate');

    const criticalFailure = {
      stepInstanceId: 's1',
      name: 'Front Brakes',
      isCritical: true,
      status: 'FAILED' as const,
      note: 'Pedal to the floor',
      photoKeys: [],
      completedAt: new Date('2026-08-25T04:00:00Z'),
    };

    const withoutOverride = evaluateTripStartGate({
      tenantRequiresInspection: true,
      tenantBlocksOnFailure: true,
      tripInspectionRequired: null,
      override: null,
      currentInspection: {
        playbookInstanceId: 'i1',
        dispatchId: 't1',
        truckId: 'tr1',
        completedByUserId: 'u1',
        items: [criticalFailure],
        lastAnsweredAt: new Date('2026-08-25T04:00:00Z'),
      },
      priorInspection: null,
      now: new Date('2026-08-25T05:00:00Z'),
    });
    expect(withoutOverride.kind).toBe('BLOCKED');

    const withOverride = evaluateTripStartGate({
      tenantRequiresInspection: true,
      tenantBlocksOnFailure: true,
      tripInspectionRequired: null,
      override: {
        byUserId: 'owner-1',
        reason: 'Mechanic replaced the master cylinder on site at 05:10',
        at: new Date('2026-08-25T05:10:00Z'),
      },
      currentInspection: {
        playbookInstanceId: 'i1',
        dispatchId: 't1',
        truckId: 'tr1',
        completedByUserId: 'u1',
        items: [criticalFailure],
        lastAnsweredAt: new Date('2026-08-25T04:00:00Z'),
      },
      priorInspection: null,
      now: new Date('2026-08-25T05:20:00Z'),
    });
    expect(withOverride.kind).toBe('ALLOWED');
    expect(withOverride.kind === 'ALLOWED' && withOverride.via).toBe('OWNER_OVERRIDE');
  });

  it('a refusal always carries a sentence, never an empty string', async () => {
    // Step 4's requirement, asserted rather than asserted-about: every refusal
    // reason a caller can surface is non-empty and is not the word "error".
    const { inspectionCopy } = await import('../inspection-handlers');
    const sentences = [
      inspectionCopy.blocked(1),
      inspectionCopy.blocked(3),
      inspectionCopy.inspectionRequired(0),
      inspectionCopy.inspectionRequired(2),
    ];
    for (const s of sentences) {
      expect(s.trim().length).toBeGreaterThan(20);
      expect(s.toLowerCase()).not.toBe('error');
      expect(s).toMatch(/[.!]$/);
    }
  });
});
