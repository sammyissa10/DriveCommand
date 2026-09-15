/**
 * quick-607 — the script connection-target gate.
 *
 * TWO THINGS ARE GUARDED HERE, and they are different in kind.
 *
 *   PART A — the RESOLUTION LADDER, driven as pure functions. No database, no
 *   dotenv, no `process.env`. `resolveScriptDatabaseUrl` is the rule "honour an
 *   explicitly-set DATABASE_URL, fall back to DIRECT_URL only when nothing was
 *   pinned", and each of its five rungs is asserted separately, including the
 *   rung that REFUSES rather than guessing.
 *
 *   PART B — the CENSUS, as a source scan. Which scripts reach a database
 *   through a bootstrap door, and which door. `_bootstrap-env` is the writer
 *   door and refuses production; `_bootstrap-env-readonly` is the read-only door
 *   and does not. Nothing at runtime can prove a script issues no writes, so the
 *   read-only claim is checked by a HUMAN at review time — and this census is
 *   what makes that review possible, by turning "a script quietly changed its
 *   posture" into a failing test.
 *
 * WHY A TEST AND NOT A LINT RULE. `apps/web` has no working lint entry point
 * (quick-562): `next lint` no longer accepts `--dir` on this Next version and
 * ESLint 9 finds no `eslint.config.js`. `tests/**` is collected by
 * `vitest.config.ts`, which is what `npm test` and CI already run.
 *
 * LINE ENDINGS. Every read in Part B normalises CRLF. This repo has no
 * `.gitattributes` and `core.autocrlf=true`, so the working tree is CRLF while
 * the index is LF; quick-546 had a source-scanning guard whose slice returned
 * null on correct source and whose assertion then passed against an empty
 * string. Each scan here also carries a "was it actually found" assertion, for
 * the same reason: the failure mode of a bad scan is GREEN, not red.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

import {
  assertWriteTargetAllowed,
  DbTargetError,
  formatTargetBanner,
  maskConnectionString,
  PRODUCTION_REF,
  productionWritesAllowedFrom,
  projectRefOf,
  resolveScriptDatabaseUrl,
  STAGING_REF,
} from '../../scripts/_db-target';

const APP_ROOT = resolve(__dirname, '../..');

const PROD_URL = `postgresql://postgres.${PRODUCTION_REF}:hunter2@aws-1-us-west-1.pooler.supabase.com:5432/postgres`;
const PROD_POOLER_URL = `postgresql://postgres.${PRODUCTION_REF}:hunter2@aws-1-us-west-1.pooler.supabase.com:6543/postgres`;
const STAGING_URL = `postgresql://postgres.${STAGING_REF}:hunter2@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
const STAGING_APP_USER_URL = `postgresql://app_user.${STAGING_REF}:hunter2@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;

// ---------------------------------------------------------------------------
// PART A — the resolution ladder
// ---------------------------------------------------------------------------

describe('projectRefOf', () => {
  it('reads the ref out of the Supabase pooler user shape', () => {
    expect(projectRefOf(PROD_URL)).toBe(PRODUCTION_REF);
    expect(projectRefOf(STAGING_APP_USER_URL)).toBe(STAGING_REF);
  });

  it('reads the ref out of the direct db.<ref>.supabase.co host shape', () => {
    expect(projectRefOf(`postgresql://postgres:pw@db.${STAGING_REF}.supabase.co:5432/postgres`)).toBe(
      STAGING_REF
    );
  });

  it('returns null rather than throwing for a connection string with no ref', () => {
    expect(projectRefOf('postgresql://ci:ci@localhost:5432/ci')).toBeNull();
  });
});

describe('maskConnectionString', () => {
  it('removes the password and keeps everything that identifies the database', () => {
    const masked = maskConnectionString(PROD_URL);
    expect(masked).not.toContain('hunter2');
    expect(masked).toContain(PRODUCTION_REF);
    expect(masked).toContain('5432');
  });
});

describe('resolveScriptDatabaseUrl — the five rungs', () => {
  it('rung 1: both pinned at the SAME project takes the pinned DIRECT_URL (the port fix survives)', () => {
    const target = resolveScriptDatabaseUrl({
      explicitDatabaseUrl: `postgresql://postgres.${STAGING_REF}:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
      explicitDirectUrl: STAGING_URL,
      fileDatabaseUrl: PROD_POOLER_URL,
      fileDirectUrl: PROD_URL,
    });

    expect(target.ref).toBe(STAGING_REF);
    expect(target.port).toBe('5432');
    expect(target.source).toBe('explicit DIRECT_URL (port fix within the explicitly-pinned project)');
  });

  it('rung 2: both pinned at DIFFERENT projects REFUSES instead of guessing', () => {
    expect(() =>
      resolveScriptDatabaseUrl({
        explicitDatabaseUrl: STAGING_URL,
        explicitDirectUrl: PROD_URL,
        fileDatabaseUrl: PROD_POOLER_URL,
        fileDirectUrl: PROD_URL,
      })
    ).toThrow(DbTargetError);
  });

  it('rung 3: DATABASE_URL pinned alone is honoured VERBATIM — the whole defect', () => {
    // This is the case the old code got wrong. `DATABASE_URL=<staging>` with the
    // repo-root .env files present used to resolve to PRODUCTION, silently.
    const target = resolveScriptDatabaseUrl({
      explicitDatabaseUrl: STAGING_URL,
      explicitDirectUrl: undefined,
      fileDatabaseUrl: STAGING_URL,
      fileDirectUrl: PROD_URL,
    });

    expect(target.ref).toBe(STAGING_REF);
    expect(target.isProduction).toBe(false);
    expect(target.source).toBe('explicit DATABASE_URL');
  });

  it('rung 4: DIRECT_URL pinned alone is used', () => {
    const target = resolveScriptDatabaseUrl({
      explicitDatabaseUrl: undefined,
      explicitDirectUrl: STAGING_URL,
      fileDatabaseUrl: PROD_POOLER_URL,
      fileDirectUrl: STAGING_URL,
    });

    expect(target.ref).toBe(STAGING_REF);
    expect(target.source).toBe('explicit DIRECT_URL');
  });

  it('rung 5: nothing pinned keeps the historical port fix — no existing caller breaks', () => {
    const target = resolveScriptDatabaseUrl({
      explicitDatabaseUrl: undefined,
      explicitDirectUrl: undefined,
      fileDatabaseUrl: PROD_POOLER_URL,
      fileDirectUrl: PROD_URL,
    });

    expect(target.ref).toBe(PRODUCTION_REF);
    expect(target.port).toBe('5432');
    expect(target.source).toBe('file DIRECT_URL (port fix; nothing pinned)');
  });

  it('rung 5 with no DIRECT_URL at all falls back to the file DATABASE_URL', () => {
    const target = resolveScriptDatabaseUrl({
      explicitDatabaseUrl: undefined,
      explicitDirectUrl: undefined,
      fileDatabaseUrl: 'postgresql://ci:ci@localhost:5432/ci',
      fileDirectUrl: undefined,
    });

    expect(target.ref).toBeNull();
    expect(target.source).toBe('file DATABASE_URL (nothing pinned)');
  });

  it('throws when the environment names no database at all', () => {
    expect(() =>
      resolveScriptDatabaseUrl({
        explicitDatabaseUrl: undefined,
        explicitDirectUrl: undefined,
        fileDatabaseUrl: undefined,
        fileDirectUrl: undefined,
      })
    ).toThrow(DbTargetError);
  });
});

describe('assertWriteTargetAllowed — the writer guard', () => {
  const prodTarget = resolveScriptDatabaseUrl({
    explicitDatabaseUrl: undefined,
    explicitDirectUrl: undefined,
    fileDatabaseUrl: undefined,
    fileDirectUrl: PROD_URL,
  });

  const stagingTarget = resolveScriptDatabaseUrl({
    explicitDatabaseUrl: undefined,
    explicitDirectUrl: undefined,
    fileDatabaseUrl: undefined,
    fileDirectUrl: STAGING_URL,
  });

  it('refuses a WRITER that resolved production with no flag', () => {
    expect(() =>
      assertWriteTargetAllowed({
        scriptName: 'writer.ts',
        target: prodTarget,
        intent: 'writes',
        productionWritesAllowed: false,
      })
    ).toThrow(/REFUSING TO RUN/);
  });

  it('names the production ref and the remedy in the refusal, and never leaks the password', () => {
    let message = '';
    try {
      assertWriteTargetAllowed({
        scriptName: 'writer.ts',
        target: prodTarget,
        intent: 'writes',
        productionWritesAllowed: false,
      });
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain(PRODUCTION_REF);
    expect(message).toContain('--allow-production');
    expect(message).not.toContain('hunter2');
  });

  it('allows a WRITER that resolved production WITH the flag', () => {
    expect(() =>
      assertWriteTargetAllowed({
        scriptName: 'writer.ts',
        target: prodTarget,
        intent: 'writes',
        productionWritesAllowed: true,
      })
    ).not.toThrow();
  });

  // The counter-assertion. Without it, a guard that refused EVERYTHING would pass
  // the test above and break every script in the repo.
  it('allows a WRITER anywhere that is not production, with no flag', () => {
    expect(() =>
      assertWriteTargetAllowed({
        scriptName: 'writer.ts',
        target: stagingTarget,
        intent: 'writes',
        productionWritesAllowed: false,
      })
    ).not.toThrow();
  });

  it('allows a READ-ONLY script to target production freely', () => {
    expect(() =>
      assertWriteTargetAllowed({
        scriptName: 'reader.ts',
        target: prodTarget,
        intent: 'read-only',
        productionWritesAllowed: false,
      })
    ).not.toThrow();
  });
});

describe('productionWritesAllowedFrom', () => {
  it('reads the flag off argv', () => {
    expect(productionWritesAllowedFrom(['node', 's.ts', '--allow-production'], {})).toBe(true);
  });

  it('reads the env escape hatch', () => {
    expect(productionWritesAllowedFrom(['node', 's.ts'], { ALLOW_PRODUCTION_WRITES: '1' })).toBe(true);
  });

  it('is false by default', () => {
    expect(productionWritesAllowedFrom(['node', 's.ts'], {})).toBe(false);
  });
});

describe('formatTargetBanner', () => {
  const target = resolveScriptDatabaseUrl({
    explicitDatabaseUrl: undefined,
    explicitDirectUrl: STAGING_APP_USER_URL,
    fileDatabaseUrl: undefined,
    fileDirectUrl: undefined,
  });

  const banner = formatTargetBanner({
    scriptName: 'rls-policy-drift.ts',
    target,
    intent: 'read-only',
    productionWritesAllowed: false,
  });

  it('names the project ref, the host, the role and how it was resolved', () => {
    expect(banner).toContain(STAGING_REF);
    expect(banner).toContain('staging');
    expect(banner).toContain('aws-0-us-west-1.pooler.supabase.com:5432');
    expect(banner).toContain('app_user');
    expect(banner).toContain('explicit DIRECT_URL');
    expect(banner).toContain('read-only');
  });

  it('never prints the password', () => {
    expect(banner).not.toContain('hunter2');
  });

  it('warns loudly when a writer has been permitted against production', () => {
    const prodTarget = resolveScriptDatabaseUrl({
      explicitDatabaseUrl: undefined,
      explicitDirectUrl: PROD_URL,
      fileDatabaseUrl: undefined,
      fileDirectUrl: undefined,
    });

    const warned = formatTargetBanner({
      scriptName: 'writer.ts',
      target: prodTarget,
      intent: 'writes',
      productionWritesAllowed: true,
    });

    expect(warned).toContain('WARNING');
    expect(warned).toContain('PRODUCTION');
  });
});

// ---------------------------------------------------------------------------
// PART B — the census
// ---------------------------------------------------------------------------

/**
 * Every file that reaches a database through the READ-ONLY door. Adding one is a
 * claim that the script issues no committed writes, and it is a one-line diff
 * that a reviewer can see.
 */
const READ_ONLY_DOOR: readonly string[] = [
  // SELECTs against pg_catalog only; its own header enumerates the statement
  // types it cannot issue.
  'scripts/audit/rls-policy-drift.ts',
  // DML runs ONLY inside BEGIN/ROLLBACK and the file contains no commit
  // statement anywhere. Its ground rule 2 states this explicitly.
  'scripts/audit/app-user-connection-harness.ts',
];

/**
 * Every file that reaches a database through the WRITER door. These refuse the
 * production project unless `--allow-production` is passed.
 */
const WRITER_DOOR: readonly string[] = [
  // beginImport() -> inserts document_imports / document_import_pages, plus R2.
  'scripts/test-extraction.ts',
  // putObjectBytes() + startImport() -> the same, plus R2 object puts.
  'scripts/test-pdf-import.ts',
];

function read(path: string): string {
  // CRLF -> LF. quick-546: without this, a working-tree scan on Windows matches
  // nothing and the assertions pass vacuously against empty strings.
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') || full.endsWith('.mjs')) out.push(full);
  }
  return out;
}

/**
 * Real imports only. `_bootstrap-env` is NAMED in 27 files and IMPORTED by four —
 * the other 23 mention it in prose while deliberately building their own staging
 * pools. A substring grep reports the wrong number by a factor of six, which is
 * the same shape as quick-602's `withTenantContext` count (3 matches, all of them
 * comments, on a tree with zero call sites).
 */
function importedDoors(source: string): { readOnly: boolean; writer: boolean } {
  const importLines = source
    .split('\n')
    .filter((line) => /^\s*(import\s|.*\brequire\()/.test(line))
    .join('\n');

  return {
    readOnly: /_bootstrap-env-readonly/.test(importLines),
    // `_bootstrap-env'` with the closing quote, so it cannot match the readonly door.
    writer: /_bootstrap-env['"]/.test(importLines),
  };
}

describe('script bootstrap census', () => {
  const files = [
    ...walk(join(APP_ROOT, 'scripts')),
    ...walk(join(APP_ROOT, 'tests')),
    ...walk(join(APP_ROOT, 'tests-db')),
  ].filter((f) => !/_bootstrap-(env|env-readonly|core)\.ts$/.test(f));

  const actualReadOnly: string[] = [];
  const actualWriter: string[] = [];

  for (const file of files) {
    const doors = importedDoors(read(file));
    const rel = relative(APP_ROOT, file).replace(/\\/g, '/');
    if (doors.readOnly) actualReadOnly.push(rel);
    if (doors.writer) actualWriter.push(rel);
  }

  // The "was it actually found" assertion. Without it, a walk that returned
  // nothing — a renamed directory, a broken matcher — would make both equality
  // assertions below pass against empty arrays.
  it('the scan actually found files to scan', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('the READ-ONLY door census is exactly the declared list', () => {
    expect(actualReadOnly.sort()).toEqual([...READ_ONLY_DOOR].sort());
  });

  it('the WRITER door census is exactly the declared list', () => {
    expect(actualWriter.sort()).toEqual([...WRITER_DOOR].sort());
  });

  it('no file imports both doors', () => {
    expect(actualReadOnly.filter((f) => actualWriter.includes(f))).toEqual([]);
  });
});

describe('the default door is the WRITER door', () => {
  /**
   * The direction of the default is the entire safety property: a new script that
   * thinks about none of this must refuse production rather than write to it. If
   * `_bootstrap-env.ts` is ever switched to `read-only`, every unexamined script
   * in the repo silently gains production-write access.
   */
  it("_bootstrap-env.ts declares intent 'writes'", () => {
    const source = read(join(APP_ROOT, 'scripts/_bootstrap-env.ts'));
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("bootstrapScriptEnv('writes')");
    expect(source).not.toContain("bootstrapScriptEnv('read-only')");
  });

  it("_bootstrap-env-readonly.ts declares intent 'read-only'", () => {
    const source = read(join(APP_ROOT, 'scripts/_bootstrap-env-readonly.ts'));
    expect(source.length).toBeGreaterThan(200);
    expect(source).toContain("bootstrapScriptEnv('read-only')");
  });

  it('the core never repoints DATABASE_URL at DIRECT_URL unconditionally again', () => {
    // The literal defect. `DATABASE_URL = DIRECT_URL` with no consideration of what
    // the operator pinned is what sent every script to production for months.
    const source = read(join(APP_ROOT, 'scripts/_bootstrap-core.ts'));
    expect(source.length).toBeGreaterThan(200);
    expect(source).not.toMatch(/process\.env\.DATABASE_URL\s*=\s*process\.env\.DIRECT_URL/);
    // ...and it still hands the resolved target to downstream consumers.
    expect(source).toContain('process.env.DATABASE_URL = target.url');
  });

  it('the core leaves DIRECT_URL alone, because migrate.mjs needs it privileged', () => {
    // `_prisma_migrations` has RLS enabled, zero policies and no app_user grant, so
    // a migration run on a de-privileged connection reads zero rows with no error.
    const source = read(join(APP_ROOT, 'scripts/_bootstrap-core.ts'));
    expect(source).not.toMatch(/process\.env\.DIRECT_URL\s*=/);
  });

  it('the banner goes to stderr, never stdout', () => {
    // quick-585 removed three non-JSON stdout lines because `--json` payloads are
    // piped into jq. Putting the banner on stdout would reintroduce that exactly.
    const source = read(join(APP_ROOT, 'scripts/_bootstrap-core.ts'));
    expect(source).toContain('console.error(');
    expect(source).not.toMatch(/console\.log\(/);
  });
});
