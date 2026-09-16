/**
 * quick-617 — the mechanical applier for Task 3.
 *
 *   node scripts/audit/617-apply-routing.js --sub <support|driver|owner> [--write]
 *
 * Applies the pattern PROVEN in Task 2 (`02-single-file-proof.md`), unchanged,
 * to the files named by `evidence/01-inventory.json`, MINUS:
 *
 *   - the 8 files carrying the `findUnique` + top-level-`select`-without-tenantId
 *     hazard (01-inventory.md §7) — STOPPED AND REPORTED, never improvised around;
 *   - `driver/incidents/route.ts`, routed by hand in Task 2.
 *
 * WHAT IT DOES, per file, and nothing else:
 *   1. `import { prisma, TX_OPTIONS }` -> `import { TX_OPTIONS }`, plus a
 *      `getTenantPrismaForOrg` import. The `prisma` binding is dropped ONLY
 *      after asserting the file makes no other use of it.
 *   2. deletes every `@bypass_rls` JSDoc block — it documents a mechanism that no
 *      longer exists, and a comment asserting a removed invariant is the
 *      quick-547/548/562 class.
 *   3. deletes every `set_config('app.bypass_rls', …)` line, and a blank line
 *      immediately after it if the deletion would leave one.
 *   4. inserts `const tenantPrisma = await getTenantPrismaForOrg(<tenant>)` ONCE
 *      PER EXPORTED HANDLER, immediately before that handler's FIRST
 *      `$transaction` — not once per transaction.
 *   5. `prisma.$transaction` -> `tenantPrisma.$transaction`. `TX_OPTIONS`, the
 *      callback, and everything inside `where` / `data` / `select` / `include` /
 *      `orderBy` / `take` are untouched.
 *
 * IT REFUSES, per file, rather than guessing:
 *   - a `$transaction` that is not inside an exported route handler;
 *   - a file where `prisma` is used for anything but `$transaction`;
 *   - a file with no resolvable tenant expression;
 *   - any file whose post-transform tenant-predicate count FELL.
 *
 * Line endings are PRESERVED per file (this repo is core.autocrlf=true with no
 * .gitattributes; quick-546 lost an assertion to exactly that).
 */

const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '..', '..');
const INVENTORY = path.resolve(
  WEB,
  '../../.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/01-inventory.json',
);

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const SUB = argv[argv.indexOf('--sub') + 1];
if (!['support', 'driver', 'owner'].includes(SUB)) {
  console.error('usage: 617-apply-routing.js --sub <support|driver|owner> [--write]');
  process.exit(1);
}

const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
const hazardFiles = new Set(inv.findUniqueSelectHazards.map((h) => h.file));
const allFiles = [...new Set(inv.statements.map((s) => s.file))];
const targets = allFiles
  .filter((f) => !hazardFiles.has(f))
  .filter((f) => !f.includes('driver/incidents/route.ts'))
  .filter((f) => f.startsWith(`src/app/api/mobile/${SUB}/`))
  .sort();

const HANDLER = /^export\s+(?:async\s+function|const)\s+(GET|POST|PATCH|PUT|DELETE)\b/;
const TENANT_PREDICATE = /\btenantId\b|\borgId\b/g;

// Eight of the 38 files are written WITHOUT statement semicolons. An inserted
// `…;` in one of them is a style regression in a diff a human has to read, so
// the file's own convention is detected and followed.
const FIRST_COMMENT = (indent, expr, semi) =>
  [
    `${indent}/*`,
    `${indent} * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id`,
    `${indent} * (DEC-11), so the header-reading getTenantPrisma() would throw.`,
    `${indent} * userId is deliberately NOT passed — it would make the audit-columns`,
    `${indent} * extension start writing createdById/updatedById, a behaviour change`,
    `${indent} * this routing task declines to make. Every where clause is unchanged:`,
    `${indent} * RLS is the second layer, not a replacement for the first.`,
    `${indent} */`,
    `${indent}const tenantPrisma = await getTenantPrismaForOrg(${expr})${semi}`,
  ];

const NEXT_COMMENT = (indent, expr, semi) => [
  `${indent}// quick-617: tenant-scoped client — see the first handler in this file.`,
  `${indent}const tenantPrisma = await getTenantPrismaForOrg(${expr})${semi}`,
];

const results = [];

for (const rel of targets) {
  const full = path.resolve(WEB, rel);
  const raw = fs.readFileSync(full, 'utf8');
  const crlf = raw.includes('\r\n');
  const text = raw.replace(/\r\n/g, '\n');
  const before = (text.match(TENANT_PREDICATE) || []).length;
  const problems = [];

  // ---- refusals, checked BEFORE anything is changed ----------------------
  // `\w` does NOT match `$`, so a naive /prisma\.(?!\$transaction)(\w+)/ silently
  // misses `prisma.$queryRaw` — which is exactly what support/ticket/route.ts uses
  // for quick-616's nextval. Match the member explicitly, `$` included.
  const otherPrismaUse = [...text.matchAll(/\bprisma\.(\$?\w+)/g)]
    .map((m) => m[1])
    .filter((m) => m !== '$transaction');
  // The `prisma` binding is DROPPED only when the file makes no other use of it.
  const keepPrismaImport = otherPrismaUse.length > 0;
  // The file's own statement-semicolon convention, read off its prisma import.
  const semi = /^import \{ prisma, TX_OPTIONS \} from '@\/lib\/db\/prisma';$/m.test(text) ? ';' : '';
  const tenantExpr = /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*auth/.test(text)
    ? 'tenantId'
    : /\bauth\.tenantId\b/.test(text)
      ? 'auth.tenantId'
      : null;
  if (!tenantExpr) problems.push('no resolvable tenant expression (neither a destructured tenantId nor auth.tenantId)');

  let lines = text.split('\n');

  // ---- 2. delete @bypass_rls JSDoc blocks --------------------------------
  const keep = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\*\*\s*$/.test(lines[i])) {
      let j = i;
      while (j < lines.length && !/\*\//.test(lines[j])) j++;
      const block = lines.slice(i, j + 1);
      // THE ANNOTATION FORM ONLY — a JSDoc line that BEGINS `@bypass_rls reason:`.
      //
      // A substring test is destructive here and was caught doing it: quick-616's
      // `generateTicketNumber` header QUOTES the annotation it replaced
      // (``It carried `@bypass_rls reason: mobile-api` with…``) across 22 lines
      // that document a correction, not a live mechanism. A `.includes()` deleted
      // the whole thing. Same family as quick-600's `pool.on('connect'` check and
      // quick-612's migration guard, both of which false-positived on the prose
      // describing the invariant they protect.
      const isAnnotation = block.some((l) => /^\s*\*\s*@bypass_rls reason:/.test(l));
      if (isAnnotation) {
        i = j;
        continue;
      }
    }
    keep.push(lines[i]);
  }
  lines = keep;

  // ---- 3. delete the set_config lines -------------------------------------
  const keep2 = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\$executeRaw/.test(l) && l.includes('app.bypass_rls')) {
      // swallow a blank line immediately after, so the callback does not open
      // with an orphaned gap
      if (lines[i + 1] !== undefined && lines[i + 1].trim() === '') i++;
      continue;
    }
    keep2.push(l);
  }
  lines = keep2;

  // ---- 4. one acquisition per exported handler ----------------------------
  const handlerStarts = [];
  lines.forEach((l, i) => {
    if (HANDLER.test(l)) handlerStarts.push(i);
  });
  if (handlerStarts.length === 0) problems.push('no exported route handler found');

  const insertions = [];
  for (let h = 0; h < handlerStarts.length; h++) {
    const from = handlerStarts[h];
    const to = h + 1 < handlerStarts.length ? handlerStarts[h + 1] : lines.length;
    const idx = lines.findIndex((l, i) => i >= from && i < to && l.includes('prisma.$transaction('));
    if (idx === -1) continue;
    insertions.push({ at: idx, indent: (/^\s*/.exec(lines[idx]) || [''])[0] });
  }

  // every $transaction must be inside SOME handler span, or the file is refused
  const txLines = lines.map((l, i) => (l.includes('prisma.$transaction(') ? i : -1)).filter((i) => i >= 0);
  for (const t of txLines) {
    const inSpan = handlerStarts.some((s, h) => {
      const e = h + 1 < handlerStarts.length ? handlerStarts[h + 1] : lines.length;
      return t >= s && t < e;
    });
    if (!inSpan) problems.push(`a $transaction at line ${t + 1} is not inside an exported handler`);
  }

  if (problems.length) {
    results.push({ file: rel, ok: false, problems, before, after: before });
    continue;
  }

  // apply insertions back-to-front so earlier indexes stay valid
  insertions
    .sort((a, b) => b.at - a.at)
    .forEach((ins, n) => {
      const isFirst = n === insertions.length - 1; // back-to-front: the LAST applied is the first in the file
      const block = isFirst
        ? FIRST_COMMENT(ins.indent, tenantExpr, semi)
        : NEXT_COMMENT(ins.indent, tenantExpr, semi);
      lines.splice(ins.at, 0, ...block);
    });

  // ---- 5. receiver ---------------------------------------------------------
  let out = lines.join('\n');
  out = out.replace(/\bprisma\.\$transaction\(/g, 'tenantPrisma.$transaction(');

  // ---- 1. imports ----------------------------------------------------------
  out = out.replace(
    /^import \{ prisma, TX_OPTIONS \} from '@\/lib\/db\/prisma';?$/m,
    (m) => {
      const semi = m.endsWith(';') ? ';' : '';
      // support/ticket/route.ts keeps `prisma`: its module-level
      // generateTicketNumber reads quick-616's sequence with prisma.$queryRaw,
      // which has no tenant in hand and deliberately opens no transaction.
      const first = keepPrismaImport
        ? `import { prisma, TX_OPTIONS } from '@/lib/db/prisma'${semi}`
        : `import { TX_OPTIONS } from '@/lib/db/prisma'${semi}`;
      return `${first}\nimport { getTenantPrismaForOrg } from '@/lib/context/tenant-context'${semi}`;
    },
  );

  const after = (out.match(TENANT_PREDICATE) || []).length;
  const bypassLeft = (out.match(/app\.bypass_rls/g) || []).length;
  const acquisitions = (out.match(/getTenantPrismaForOrg\(/g) || []).length;
  const stillImportsPrisma = /import \{ prisma[, ]/.test(out);

  if (after < before) problems.push(`TENANT PREDICATE COUNT FELL: ${before} -> ${after}`);
  if (bypassLeft !== 0) problems.push(`${bypassLeft} bypass references remain`);
  if (acquisitions !== insertions.length) {
    problems.push(`expected ${insertions.length} acquisition call sites, found ${acquisitions}`);
  }
  if (!/^import \{ getTenantPrismaForOrg \} from '@\/lib\/context\/tenant-context';?$/m.test(out)) {
    problems.push('the getTenantPrismaForOrg import was not added (unrecognised prisma import line?)');
  }
  if (stillImportsPrisma && !keepPrismaImport) problems.push('still imports the bare prisma binding');
  if (!stillImportsPrisma && keepPrismaImport) problems.push('dropped the prisma binding a non-transaction call still needs');
  // A botched patch to this script once wrote the literal text `undefined` into
  // thirteen files (an interpolated argument that was never threaded through).
  // tsc caught nothing, because `fooundefined` is a valid identifier suffix in
  // some positions. Assert the emitted acquisition line is EXACTLY right.
  const emitted = [...out.matchAll(/const tenantPrisma = await getTenantPrismaForOrg\(([^)]*)\)(.?)/g)];
  for (const [, expr, tail] of emitted) {
    if (expr !== tenantExpr) problems.push(`emitted acquisition argument is "${expr}", expected "${tenantExpr}"`);
    if (tail !== semi && tail !== '\n' && tail !== '') {
      problems.push(`emitted acquisition line ends with ${JSON.stringify(tail)}, expected ${JSON.stringify(semi)}`);
    }
  }
  if (/undefined/.test(out) && !/undefined/.test(text)) problems.push('the transform introduced the literal text "undefined"');

  if (problems.length) {
    results.push({ file: rel, ok: false, problems, before, after });
    continue;
  }

  if (WRITE) fs.writeFileSync(full, crlf ? out.replace(/\n/g, '\r\n') : out, 'utf8');
  results.push({
    file: rel,
    ok: true,
    before,
    after,
    handlers: insertions.length,
    transactions: txLines.length,
  });
}

const okFiles = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
const beforeTotal = results.reduce((a, r) => a + r.before, 0);
const afterTotal = results.reduce((a, r) => a + r.after, 0);

console.log(`sub-surface: ${SUB}   mode: ${WRITE ? 'WRITE' : 'dry-run'}`);
console.log(`targets: ${targets.length}   applied: ${okFiles.length}   refused: ${bad.length}`);
console.log(`tenant-predicate occurrences  BEFORE ${beforeTotal}  AFTER ${afterTotal}  (after >= before: ${afterTotal >= beforeTotal})`);
for (const r of okFiles) {
  console.log(`  OK  ${r.file.replace('src/app/api/mobile/', '')}  handlers=${r.handlers} txs=${r.transactions} tenantPreds ${r.before}->${r.after}`);
}
for (const r of bad) {
  console.log(`  REFUSED  ${r.file.replace('src/app/api/mobile/', '')}`);
  for (const p of r.problems) console.log(`      - ${p}`);
}
if (afterTotal < beforeTotal) {
  console.error('TENANT PREDICATE COUNT FELL ACROSS THE SUB-SURFACE — HARD FAILURE');
  process.exit(2);
}
if (bad.length) process.exit(3);
