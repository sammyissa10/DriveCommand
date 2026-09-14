/**
 * RLS Policy DEFINITIONS - pure parse/replay/canonicalise/diff library
 * (no database, no filesystem, no network, no console, no process.exit)
 *
 * WHAT THIS EXISTS TO CATCH - the one sentence this file was written for
 * ---------------------------------------------------------------------
 * **A policy rewritten to `USING (true)` under its own name is INVISIBLE to
 * the name diff, and is exactly what this layer catches.**
 *
 * `rls-policy-replay.ts` diffs `(table, policy_name)` identity. That is the
 * only detector available for quick-584's class of loss (a policy that
 * VANISHES), and it is deliberately untouched by this file. But identity says
 * nothing about the body: a `tenant_isolation_policy` whose `USING` is
 * replaced with `true` still exists, still carries its name, and the name diff
 * still reports CLEAN. quick-597 section 6 measured this and it is the second
 * of the two blind Phase 0 gates.
 *
 * THIS IS AN ADDITIVE LAYER, NEVER A REWRITE OF THE NAME LAYER.
 * ------------------------------------------------------------
 * Presence/absence stays the name layer's job. `diffPolicyDefinitions`
 * deliberately compares ONLY keys present in BOTH sets, so a missing or
 * unexpected policy is reported once, by the layer that owns it, and never
 * twice. `POLICY_STATEMENT_RE`, `INTEGRITY_FLOORS` and the 328/230
 * reproduction numbers in `rls-policy-replay.ts` are byte-unchanged.
 *
 * WHY A DEPARSE ROUND-TRIP AND NOT STRING NORMALISATION
 * -----------------------------------------------------
 * A migration writes `current_setting('app.bypass_rls', TRUE) = 'on'`.
 * Postgres stores a parse tree and `pg_get_expr` renders it as
 * `(current_setting('app.bypass_rls'::text, true) = 'on'::text)`. Those two
 * strings differ in five places (outer parens, two `::text` casts, `TRUE` vs
 * `true`) and are the SAME EXPRESSION. A regex normaliser that tried to close
 * that gap would have to reimplement a fraction of the Postgres parser, and
 * every case it got wrong would be a FALSE POSITIVE on a gate whose whole
 * value is that a finding means something.
 *
 * So the expected side is canonicalised BY POSTGRES:
 * `598-canonicalise-policies.ts` creates each migration-declared body under a
 * probe name inside `BEGIN ... ROLLBACK` on STAGING and reads `pg_get_expr`
 * back. Measured against staging: the hand-written bypass body above
 * round-trips BYTE-IDENTICAL to the live expression. The result is committed
 * as `rls-policy-canonical.json` so the comparison against PRODUCTION is a
 * pure `SELECT` with no transaction and no DDL.
 *
 * Consumed by `rls-policy-drift.ts` (the runner) and
 * `598-canonicalise-policies.ts` (the staging canonicaliser).
 */

import { createHash } from 'crypto';

import {
  parsePolicyStatements,
  policyKey,
  type MigrationFile,
  type PolicyKey,
} from './rls-policy-replay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyCommand = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/** One `CREATE POLICY` statement as the migration corpus declares it. */
export interface PolicyDefinition {
  migration: string;
  table: string;
  policy: string;
  /** `AS PERMISSIVE` (the Postgres default) means true. */
  permissive: boolean;
  /** `FOR ALL` is the Postgres default. */
  cmd: PolicyCommand;
  /** `TO public` is the Postgres default; recorded literally as ['public']. */
  roles: string[];
  /** Raw SQL text inside `USING ( ... )`, trimmed. Null when the clause is absent. */
  using: string | null;
  /** Raw SQL text inside `WITH CHECK ( ... )`, trimmed. Null when the clause is absent. */
  withCheck: string | null;
}

/**
 * The comparison key. Both sides of the diff are produced by Postgres
 * (`pg_get_expr` / `polcmd` / `polpermissive` / `polroles`), never by this
 * parser - the parser's output is an INPUT to canonicalisation, not a side of
 * the comparison.
 */
export interface CanonicalPolicyShape {
  cmd: PolicyCommand;
  permissive: boolean;
  /** Sorted, so `TO app_user, postgres` and `TO postgres, app_user` are one shape. */
  roles: string[];
  using: string | null;
  withCheck: string | null;
}

/** A live `pg_policy` row, already mapped out of the catalogue's encodings. */
export interface LivePolicyShapeRow {
  table: string;
  policy: string;
  permissive: boolean;
  /** `polcmd`: `*` ALL, `r` SELECT, `a` INSERT, `w` UPDATE, `d` DELETE. */
  cmd: PolicyCommand;
  roles: string[];
  using: string | null;
  withCheck: string | null;
}

export interface DefinitionDriftFinding {
  key: PolicyKey;
  field: 'cmd' | 'permissive' | 'roles' | 'using' | 'withCheck';
  expected: string;
  live: string;
}

export interface DefinitionDiff {
  /** Keys present in BOTH sets whose canonical shape differs. */
  definitionDrift: DefinitionDriftFinding[];
  /** Live keys with no canonical entry - cannot be judged, reported by name. */
  notCanonicalised: PolicyKey[];
  /** How many keys were actually compared. Zero is a LOUD failure, not CLEAN. */
  compared: number;
}

// ---------------------------------------------------------------------------
// 1. Statement extraction
// ---------------------------------------------------------------------------

/**
 * Finds the START offset of every `CREATE POLICY` statement using the SAME
 * line-anchored rule the name layer uses. That is load-bearing, not stylistic:
 * `20260802120000_document_import_phase1` contains a
 * `DO $$ ... EXECUTE format('CREATE POLICY ...')` block whose two inner lines
 * begin with a quote, not with the keyword. The name layer excludes them and
 * so must this one, or the two layers would disagree about which statements
 * exist.
 *
 * The anchor also excludes the many `--   CREATE POLICY ...` lines inside
 * migration comment blocks, which is why an unanchored grep over the corpus
 * returns 278 CREATE hits where this parser returns 265 (measured at
 * quick-598). `replayPolicyDefinitions` asserts the two parsers agree
 * statement-for-statement, so a divergence here is a throw, not a miscount.
 */
const CREATE_POLICY_START_RE = /^[ \t]*CREATE\s+POLICY\b/gim;

/**
 * Scans forward from `start` to the `;` that terminates the statement, at
 * paren depth 0, honouring single quotes (with doubled-quote escapes),
 * double-quoted identifiers, dollar-quoted strings and `--` comments. Returns
 * the statement text INCLUDING the terminating semicolon, or null when the
 * statement is unterminated (which is reported, never silently skipped).
 */
function readStatement(sql: string, start: number): string | null {
  let i = start;
  let depth = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '"') {
      i++;
      while (i < sql.length && sql[i] !== '"') i++;
      i++;
      continue;
    }

    if (ch === '$') {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        if (close === -1) return null;
        i = close + tag[0].length;
        continue;
      }
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }

    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) return sql.slice(start, i + 1);

    i++;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. Clause parser
// ---------------------------------------------------------------------------

const HEADER_RE =
  /^[ \t]*CREATE\s+POLICY\s+("(?:[^"]+)"|[A-Za-z_][A-Za-z0-9_$]*)\s+ON\s+(?:(?:"(?:[^"]+)"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*)?("(?:[^"]+)"|[A-Za-z_][A-Za-z0-9_$]*)/i;

function stripQuotes(identifier: string): string {
  if (identifier.startsWith('"') && identifier.endsWith('"')) return identifier.slice(1, -1);
  return identifier;
}

/** Reads a balanced paren group starting at `text[0] === '('`. */
function readParenthesised(text: string): { inner: string; consumed: number } | null {
  if (text[0] !== '(') return null;
  let depth = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '"') {
      i++;
      while (i < text.length && text[i] !== '"') i++;
      i++;
      continue;
    }

    if (ch === '-' && text[i + 1] === '-') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl;
      continue;
    }

    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { inner: text.slice(1, i), consumed: i + 1 };
    }

    i++;
  }

  return null;
}

const ROLE_RE = /^("(?:[^"]+)"|[A-Za-z_][A-Za-z0-9_$]*)/;

export class PolicyDefinitionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyDefinitionParseError';
  }
}

/**
 * Parses every `CREATE POLICY` in one migration file into a full definition.
 *
 * Defaults are Postgres's own, applied when the clause is absent:
 * `AS PERMISSIVE`, `FOR ALL`, `TO public`. Recording them explicitly is what
 * lets a migration that writes the clause and one that omits it compare equal.
 *
 * Clause order is tolerated rather than assumed. Postgres's grammar fixes it
 * (AS / FOR / TO / USING / WITH CHECK), but a loop costs nothing and removes a
 * whole class of "the parser silently stopped early" - which fails GREEN.
 */
export function parsePolicyDefinitions(migration: string, sql: string): PolicyDefinition[] {
  // CRLF first - same reason as the name layer: this repo is `i/lf w/crlf`
  // (core.autocrlf=true, no .gitattributes), and a trailing CR on a captured
  // identifier mismatches every live pg_policy key.
  const normalised = sql.replace(/\r\n/g, '\n');

  const definitions: PolicyDefinition[] = [];
  let match: RegExpExecArray | null;
  CREATE_POLICY_START_RE.lastIndex = 0;

  while ((match = CREATE_POLICY_START_RE.exec(normalised)) !== null) {
    const start = match.index;
    const statement = readStatement(normalised, start);
    if (statement === null) {
      throw new PolicyDefinitionParseError(
        `${migration}: unterminated CREATE POLICY statement at offset ${start}. ` +
          `A statement the parser cannot terminate would be silently dropped, which ` +
          `fails GREEN - refusing to continue.`
      );
    }

    const header = HEADER_RE.exec(statement);
    if (!header) {
      throw new PolicyDefinitionParseError(
        `${migration}: CREATE POLICY at offset ${start} did not match the header grammar. ` +
          `First 120 chars: ${JSON.stringify(statement.slice(0, 120))}`
      );
    }

    const policy = stripQuotes(header[1]);
    const table = stripQuotes(header[2]);

    let rest = statement.slice(header[0].length);
    let permissive = true;
    let cmd: PolicyCommand = 'ALL';
    let roles: string[] = ['public'];
    let using: string | null = null;
    let withCheck: string | null = null;

    let progressed = true;
    while (progressed) {
      progressed = false;
      rest = rest.replace(/^\s+/, '');
      if (rest.startsWith('--')) {
        const nl = rest.indexOf('\n');
        rest = nl === -1 ? '' : rest.slice(nl + 1);
        progressed = true;
        continue;
      }

      const asClause = /^AS\s+(PERMISSIVE|RESTRICTIVE)\b/i.exec(rest);
      if (asClause) {
        permissive = asClause[1].toUpperCase() === 'PERMISSIVE';
        rest = rest.slice(asClause[0].length);
        progressed = true;
        continue;
      }

      const forClause = /^FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(rest);
      if (forClause) {
        cmd = forClause[1].toUpperCase() as PolicyCommand;
        rest = rest.slice(forClause[0].length);
        progressed = true;
        continue;
      }

      const toClause = /^TO\s+/i.exec(rest);
      if (toClause) {
        rest = rest.slice(toClause[0].length);
        const collected: string[] = [];
        for (;;) {
          rest = rest.replace(/^\s+/, '');
          const role = ROLE_RE.exec(rest);
          if (!role) break;
          collected.push(stripQuotes(role[1]).toLowerCase());
          rest = rest.slice(role[0].length).replace(/^\s+/, '');
          if (rest.startsWith(',')) {
            rest = rest.slice(1);
            continue;
          }
          break;
        }
        if (collected.length === 0) {
          throw new PolicyDefinitionParseError(
            `${migration}: ${table}.${policy} has a TO clause with no roles.`
          );
        }
        roles = collected;
        progressed = true;
        continue;
      }

      const usingClause = /^USING\s*/i.exec(rest);
      if (usingClause && rest.slice(usingClause[0].length).startsWith('(')) {
        const body = readParenthesised(rest.slice(usingClause[0].length));
        if (!body) {
          throw new PolicyDefinitionParseError(
            `${migration}: ${table}.${policy} has an unbalanced USING clause.`
          );
        }
        using = body.inner.trim();
        rest = rest.slice(usingClause[0].length + body.consumed);
        progressed = true;
        continue;
      }

      const checkClause = /^WITH\s+CHECK\s*/i.exec(rest);
      if (checkClause && rest.slice(checkClause[0].length).startsWith('(')) {
        const body = readParenthesised(rest.slice(checkClause[0].length));
        if (!body) {
          throw new PolicyDefinitionParseError(
            `${migration}: ${table}.${policy} has an unbalanced WITH CHECK clause.`
          );
        }
        withCheck = body.inner.trim();
        rest = rest.slice(checkClause[0].length + body.consumed);
        progressed = true;
        continue;
      }
    }

    definitions.push({ migration, table, policy, permissive, cmd, roles, using, withCheck });
  }

  return definitions;
}

// ---------------------------------------------------------------------------
// 3. Replay
// ---------------------------------------------------------------------------

export interface DefinitionReplayResult {
  /** Every parsed CREATE POLICY, in corpus order. */
  definitions: PolicyDefinition[];
  /** The NET set the migrations leave behind, keyed `table.policy`. */
  expected: Map<PolicyKey, PolicyDefinition>;
}

/**
 * Replays CREATE/DROP in migration order and keeps the LAST definition for
 * each surviving key.
 *
 * DROPs come from `parsePolicyStatements` - the name layer's own parser -
 * rather than from a second DROP regex here, so the two layers can never
 * disagree about which policies are present. The CREATEs in that statement
 * list correspond 1:1, in order, with the definitions parsed here (both use
 * the same line-anchored start rule); that correspondence is ASSERTED per
 * statement rather than assumed, because a silent misalignment would attach
 * the wrong body to the right name and still look green.
 *
 * Confirmed by grep for quick-598: the corpus contains ZERO `ALTER POLICY`
 * statements, so the last `CREATE POLICY` for a key fully determines its
 * expected body.
 */
export function replayPolicyDefinitions(files: MigrationFile[]): DefinitionReplayResult {
  for (let i = 1; i < files.length; i++) {
    if (files[i].migration < files[i - 1].migration) {
      throw new PolicyDefinitionParseError(
        `replayPolicyDefinitions: migration files are not sorted ascending ` +
          `(found "${files[i].migration}" after "${files[i - 1].migration}").`
      );
    }
  }

  const all: PolicyDefinition[] = [];
  const expected = new Map<PolicyKey, PolicyDefinition>();

  for (const file of files) {
    const statements = parsePolicyStatements(file.migration, file.sql);
    const definitions = parsePolicyDefinitions(file.migration, file.sql);
    all.push(...definitions);

    let cursor = 0;
    for (const stmt of statements) {
      const key = policyKey(stmt);
      if (stmt.kind === 'DROP') {
        expected.delete(key);
        continue;
      }

      const def = definitions[cursor++];
      if (!def) {
        throw new PolicyDefinitionParseError(
          `${file.migration}: the name layer found a CREATE POLICY for ${key} that the ` +
            `definition parser did not. The two parsers have diverged.`
        );
      }
      if (def.table !== stmt.table || def.policy !== stmt.policy) {
        throw new PolicyDefinitionParseError(
          `${file.migration}: CREATE POLICY alignment broke - name layer says ${key}, ` +
            `definition layer says ${policyKey(def)}.`
        );
      }
      expected.set(key, def);
    }

    if (cursor !== definitions.length) {
      throw new PolicyDefinitionParseError(
        `${file.migration}: definition parser found ${definitions.length} CREATE POLICY ` +
          `statements, name layer consumed ${cursor}. The two parsers have diverged.`
      );
    }
  }

  return { definitions: all, expected };
}

// ---------------------------------------------------------------------------
// 4. Canonical shape
// ---------------------------------------------------------------------------

/** `polcmd` encodings, as stored in the catalogue. */
export const POLICY_CMD_BY_CATALOGUE_CHAR: Record<string, PolicyCommand> = {
  '*': 'ALL',
  r: 'SELECT',
  a: 'INSERT',
  w: 'UPDATE',
  d: 'DELETE',
};

/**
 * `TO public` surfaces in `pg_policy.polroles` as `{0}` - a pseudo-oid with no
 * `pg_roles` row at all. Map it to the literal `public` or every `TO public`
 * policy (which is most of them) shows false drift on its role list. Measured
 * on staging, not inferred.
 */
export const PUBLIC_ROLE_OID = 0;

export function canonicalPolicyShape(row: {
  cmd: PolicyCommand;
  permissive: boolean;
  roles: string[];
  using: string | null;
  withCheck: string | null;
}): CanonicalPolicyShape {
  return {
    cmd: row.cmd,
    permissive: row.permissive,
    roles: [...row.roles].map((r) => r.toLowerCase()).sort(),
    using: row.using,
    withCheck: row.withCheck,
  };
}

function renderField(value: unknown): string {
  if (value === null) return '(absent)';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

// ---------------------------------------------------------------------------
// 5. Diff
// ---------------------------------------------------------------------------

/**
 * Compares ONLY keys present in both sets.
 *
 * Presence is the NAME layer's job and duplicating it here would report every
 * missing/unexpected policy twice, on a gate whose value depends on a finding
 * meaning one thing. A live key with no canonical entry is reported separately
 * as `notCanonicalised` - it is "cannot be judged", which is neither clean nor
 * drift, and is printed by name rather than counted as either.
 */
export function diffPolicyDefinitions(
  expectedCanonical: Record<PolicyKey, CanonicalPolicyShape>,
  live: LivePolicyShapeRow[]
): DefinitionDiff {
  const definitionDrift: DefinitionDriftFinding[] = [];
  const notCanonicalised: PolicyKey[] = [];
  let compared = 0;

  for (const row of live) {
    const key = policyKey({ table: row.table, policy: row.policy });
    const expected = expectedCanonical[key];
    if (!expected) {
      notCanonicalised.push(key);
      continue;
    }

    compared++;
    const actual = canonicalPolicyShape(row);
    const expectedShape = canonicalPolicyShape(expected);

    const fields: Array<DefinitionDriftFinding['field']> = [
      'cmd',
      'permissive',
      'roles',
      'using',
      'withCheck',
    ];

    for (const field of fields) {
      const a = expectedShape[field];
      const b = actual[field];
      const same = Array.isArray(a) && Array.isArray(b) ? a.join(' ') === b.join(' ') : a === b;
      if (!same) {
        definitionDrift.push({
          key,
          field,
          expected: renderField(a),
          live: renderField(b),
        });
      }
    }
  }

  definitionDrift.sort((x, y) => x.key.localeCompare(y.key) || x.field.localeCompare(y.field));
  notCanonicalised.sort();

  return { definitionDrift, notCanonicalised, compared };
}

// ---------------------------------------------------------------------------
// 6. Corpus hash
// ---------------------------------------------------------------------------

/**
 * SHA-256 over the SORTED expected definition set.
 *
 * Stable against unrelated migration edits (a new index, a column rename) and
 * changes the moment any policy BODY changes - which is precisely when
 * `rls-policy-canonical.json` goes stale and the definition layer must refuse
 * to report CLEAN. Raw clause text is hashed rather than a whitespace-collapsed
 * form: collapsing runs inside string literals, and a migration file is an
 * applied historical artefact that is never reformatted, so the false-staleness
 * risk the collapse would avoid does not exist here.
 */
export function computeDefinitionCorpusHash(expected: Map<PolicyKey, PolicyDefinition>): string {
  const rows = [...expected.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, def]) =>
      JSON.stringify({
        key,
        cmd: def.cmd,
        permissive: def.permissive,
        roles: [...def.roles].sort(),
        using: def.using,
        withCheck: def.withCheck,
      })
    );

  return createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// 7. Anti-vacuity floors
// ---------------------------------------------------------------------------

/**
 * The definition layer's OWN floors. It shares none with the name layer,
 * because the two can fail independently: the name parser can be intact while
 * the clause parser silently returns `using: null` for everything, at which
 * point every comparison passes and the gate is green and blind - the exact
 * shape this task exists to remove.
 *
 * A comparison over an EMPTY intersection is the worst of these, because it
 * looks identical to perfect agreement. `MIN_COMPARED` is the floor that makes
 * it fail loud.
 *
 * Calibrated against quick-598's measured run: 151 migration files, 265
 * CREATE POLICY definitions parsed, 180 in the net expected set, 180
 * canonicalised against staging, 180 compared. Floors sit at roughly the same
 * margin below those values that `INTEGRITY_FLOORS` holds below its own
 * (~83%), and deliberately NOT at the current value - a floor equal to today's
 * number fails on the next legitimate policy removal and teaches people to
 * edit the floor rather than read the finding.
 */
export const DEFINITION_FLOORS = {
  MIN_DEFINITIONS_PARSED: 220,
  MIN_EXPECTED_DEFINITIONS: 150,
  MIN_CANONICALISED: 150,
  MIN_COMPARED: 150,
} as const;

export class DefinitionCorpusIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitionCorpusIntegrityError';
  }
}

export interface DefinitionCorpusIntegrityInput {
  definitionsParsed: number;
  expectedDefinitions: number;
  /** Omitted by the canonicaliser itself (it has not produced them yet). */
  canonicalised?: number;
  /** Omitted when only the parse side is being checked. */
  compared?: number;
}

export function assertDefinitionCorpusIntegrity(input: DefinitionCorpusIntegrityInput): void {
  const problems: string[] = [];

  if (input.definitionsParsed < DEFINITION_FLOORS.MIN_DEFINITIONS_PARSED) {
    problems.push(
      `CREATE POLICY definitions parsed = ${input.definitionsParsed}, floor = ${DEFINITION_FLOORS.MIN_DEFINITIONS_PARSED}`
    );
  }
  if (input.expectedDefinitions < DEFINITION_FLOORS.MIN_EXPECTED_DEFINITIONS) {
    problems.push(
      `expected definitions (net) = ${input.expectedDefinitions}, floor = ${DEFINITION_FLOORS.MIN_EXPECTED_DEFINITIONS}`
    );
  }
  if (
    input.canonicalised !== undefined &&
    input.canonicalised < DEFINITION_FLOORS.MIN_CANONICALISED
  ) {
    problems.push(
      `canonicalised definitions = ${input.canonicalised}, floor = ${DEFINITION_FLOORS.MIN_CANONICALISED}`
    );
  }
  if (input.compared !== undefined && input.compared < DEFINITION_FLOORS.MIN_COMPARED) {
    problems.push(
      `policies compared = ${input.compared}, floor = ${DEFINITION_FLOORS.MIN_COMPARED}. ` +
        `A comparison over an empty or near-empty intersection is indistinguishable ` +
        `from perfect agreement and must never print CLEAN.`
    );
  }

  if (problems.length > 0) {
    throw new DefinitionCorpusIntegrityError(
      `RLS policy DEFINITION corpus integrity floor breached - the clause parser or the ` +
        `canonical artefact may be broken, which would make the definition verdict ` +
        `meaningless while still looking green. Problems:\n  - ${problems.join('\n  - ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// 8. Artefact shape
// ---------------------------------------------------------------------------

export interface NotCanonicalisedEntry {
  key: PolicyKey;
  sqlstate: string;
  message: string;
}

export interface CanonicalArtefact {
  generatedAt: string;
  projectRef: string;
  corpusHash: string;
  definitionCount: number;
  canonicalisedCount: number;
  notCanonicalised: NotCanonicalisedEntry[];
  policies: Record<PolicyKey, CanonicalPolicyShape>;
}

