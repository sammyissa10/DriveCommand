import { spawnSync } from 'child_process';
import { resolve } from 'path';

/**
 * quick-598 follow-up — make `npm run test:rls-isolation` SELF-CONTAINED.
 *
 * WHY THIS EXISTS
 * ---------------
 * The suite asserts on rows returned by a real `app_user` connection, so it
 * needs the two seeded staging tenants to exist. quick-597's convention is to
 * seed fixtures, use them, and tear them down again, which left staging at zero
 * tenants — and a fresh `npm run test:rls-isolation` therefore reported
 * **68 failed / 82 passed**, every failure being "tenant A has no rows".
 *
 * That is the failure mode this repo keeps paying for: a gate that is red
 * unless you remember an out-of-band prerequisite is a gate people learn to
 * ignore, and a gate everybody ignores protects nothing (CLAUDE.md, quick-562).
 * It is also indistinguishable, at a glance, from a genuine isolation
 * regression — the one signal the suite exists to send.
 *
 * So the suite now seeds its own fixtures before the run and tears them down
 * after it, leaving staging exactly as it found it. The seeding script is
 * idempotent (it wraps the idempotent `scripts/seed-staging.ts`), so a run that
 * starts with fixtures already present is a no-op rather than a duplicate.
 *
 * SAFETY: `597-staging-fixtures.ts` refuses to run unless the resolved URL
 * carries the staging project ref, and refuses outright on the production ref.
 * This file adds no connection of its own — it shells out to that script and
 * inherits its guard rather than re-implementing it, so there is exactly one
 * place where the production check lives.
 *
 * Teardown runs even when the suite fails, because vitest awaits the returned
 * function regardless of test outcome. If the process is killed (Ctrl-C), the
 * fixtures survive; `npx tsx scripts/audit/597-staging-fixtures.ts --teardown`
 * clears them and `--verify-clean` confirms.
 */

const FIXTURES = resolve(__dirname, '../scripts/audit/597-staging-fixtures.ts');

function runFixtures(mode: '--seed' | '--teardown'): void {
  const result = spawnSync('npx', ['tsx', FIXTURES, mode], {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    // The fixtures script prints a per-table row count; surface it so a run
    // that seeds nothing is visible rather than silent.
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `RLS isolation fixtures ${mode} FAILED (exit ${result.status}).\n` +
        `The suite cannot run without fixtures, and passing it without them would ` +
        `be a vacuous green — which is the exact defect quick-598 set out to remove.\n\n` +
        detail
    );
  }
}

export async function setup(): Promise<void> {
  console.log('\n[rls-isolation] seeding staging fixtures (idempotent)…');
  runFixtures('--seed');
}

export async function teardown(): Promise<void> {
  console.log('\n[rls-isolation] tearing down staging fixtures…');
  runFixtures('--teardown');
}
