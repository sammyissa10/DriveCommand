/**
 * quick-618 — route the six remaining MOBILE_API owner files that quick-617
 * stopped. The two driver files were done by hand first, as the worked example.
 *
 *   node scripts/audit/618-apply-routing.js --check
 *   node scripts/audit/618-apply-routing.js --write
 *
 * ── THE THREE GUARDS, CARRIED FORWARD FROM quick-617 §5e ────────────────────
 *
 * That task's applier had three destructive defects, all caught late, and its
 * summary asks the next task to carry the guards rather than the code:
 *
 *  1. IT MATCHED `.includes('@bypass_rls reason:')` AND DELETED A 22-LINE HEADER
 *     THAT QUOTED THE ANNOTATION. So this one matches the ANNOTATION FORM — a
 *     JSDoc block containing a line whose content BEGINS `@bypass_rls reason:`
 *     — and refuses any block that is longer than the known shape. Same family
 *     as quick-600's `pool.on('connect'` check and quick-612's migration guard,
 *     both of which false-positived on prose describing the invariant they
 *     protect.
 *
 *  2. A BOTCHED PATCH WROTE THE LITERAL `undefined` INTO 13 FILES AND `tsc`
 *     REPORTED NOTHING, because `fooundefined` is a valid identifier. So the
 *     emitted acquisition line is asserted to be exactly right, and the output
 *     is scanned for a literal `undefined` that was not in the input.
 *
 *  3. A RE-RUN SILENTLY REWROTE THE PINNED INVENTORY. So this script never
 *     writes an inventory at all, and `--check` is the default posture: it
 *     prints the diff it would make and touches nothing.
 *
 * Plus the invariant quick-617 asserted on every file it wrote:
 *     the count of `tenantId` / `orgId` mentions must NOT FALL.
 * No `where`, `data`, `select`, `include`, `orderBy` or `take` is touched by any
 * rule below — the only deletions are the bypass annotation and the set_config.
 *
 * ── ONE ACQUISITION PER HANDLER, NOT PER TRANSACTION ────────────────────────
 *
 * `owner/loads/[id]/route.ts` PATCH holds three sibling transactions and
 * `scheduled-service` holds three handlers with one each. The acquisition is
 * inserted before the FIRST `prisma.$transaction` of each handler, and every
 * receiver in that handler is rewritten — never one acquisition per statement.
 *
 * WHAT THIS SCRIPT CANNOT SEE, AND WHO CATCHES IT: it inserts at the first
 * transaction's own indentation, which is inside whatever BLOCK that
 * transaction sits in. In `owner/loads/[id]/route.ts` PATCH the first
 * transaction is inside a `try`, so the acquisition landed in that `try` and the
 * other two transactions — in later `try` blocks — referred to a name out of
 * scope. `tsc` reported it as TS2304 twice and the declaration was hoisted to
 * the handler body BY HAND. A line-based applier cannot reason about scope;
 * running `tsc --noEmit` after `--write` is not optional, it is the other half
 * of this tool.
 */
const fs = require('fs');
const path = require('path');

const WRITE = process.argv.includes('--write');

const FILES = [
  'src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts',
  'src/app/api/mobile/owner/loads/[id]/route.ts',
  'src/app/api/mobile/owner/routes/[id]/route.ts',
  'src/app/api/mobile/owner/trucks/[id]/route.ts',
  'src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts',
  'src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts',
];

const OLD_IMPORT = "import { prisma, TX_OPTIONS } from '@/lib/db/prisma';";
const NEW_IMPORT =
  "import { TX_OPTIONS } from '@/lib/db/prisma';\n" +
  "import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';";

const ACQUISITION_COMMENT = [
  '/*',
  ' * quick-617/618: tenant-scoped client. /api/mobile/* sends no x-tenant-id',
  ' * (DEC-11), so the header-reading getTenantPrisma() would throw —',
  " * getTenantPrismaForOrg takes validateMobileToken()'s verified auth.tenantId.",
  ' * userId is deliberately NOT passed: it would drive the audit-columns',
  ' * extension to start writing createdById/updatedById, a behaviour change a',
  ' * routing fix must not make (quick-610).',
  ' *',
  ' * quick-617 STOPPED this file because a findUnique below carries a top-level',
  ' * select that omits tenantId, and the old post-check read that as',
  ' * `undefined !== tenantId` and discarded the row FOR ITS OWN TENANT — which,',
  ' * with the `if (!x) return 404` that follows every one of them, would have',
  ' * made this route answer "not found" on every request. quick-618 moved the',
  ' * tenant predicate into the findUnique `where`, so the select no longer',
  ' * decides isolation and every select here is left byte-identical.',
  ' */',
];

const SET_CONFIG_RE =
  /^[ \t]*await tx\.\$executeRaw`SELECT set_config\('app\.bypass_rls', 'on', TRUE\)`;\n(?:[ \t]*\n)?/gm;

/** Count the tenant predicate mentions this task must never reduce. */
function tenantMentions(src) {
  return (src.match(/\btenantId\b|\borgId\b/g) || []).length;
}

/**
 * Remove JSDoc blocks whose body carries the ANNOTATION FORM.
 * Refuses (and reports) any candidate block longer than MAX_BLOCK_LINES — the
 * shape being deleted is 7 lines; quick-616's 22-line header is the thing that
 * must survive.
 */
const MAX_BLOCK_LINES = 10;
function stripBypassAnnotations(src, report) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^[ \t]*\/\*\*[ \t]*$/.test(lines[i])) {
      let j = i;
      while (j < lines.length && !/\*\/[ \t]*$/.test(lines[j])) j++;
      const block = lines.slice(i, j + 1);
      const isAnnotation = block.some((l) => /^[ \t]*\*[ \t]*@bypass_rls reason:/.test(l));
      if (isAnnotation) {
        if (block.length > MAX_BLOCK_LINES) {
          report.refusedBlocks.push({ startLine: i + 1, length: block.length });
          out.push(lines[i]);
          continue;
        }
        report.strippedBlocks++;
        i = j;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Insert the acquisition before the FIRST prisma.$transaction of each handler. */
function insertAcquisitions(src, report) {
  const lines = src.split('\n');
  const handlerRe = /^export async function (GET|POST|PATCH|PUT|DELETE)\s*\(/;
  const txRe = /\bprisma\.\$transaction\s*\(/;

  const out = [];
  let seenInHandler = false;
  for (const line of lines) {
    if (handlerRe.test(line)) seenInHandler = false;
    if (!seenInHandler && txRe.test(line)) {
      const indent = (line.match(/^[ \t]*/) || [''])[0];
      for (const c of ACQUISITION_COMMENT) out.push(indent + c);
      out.push(`${indent}const tenantPrisma = await getTenantPrismaForOrg(tenantId);`);
      report.acquisitions++;
      seenInHandler = true;
    }
    out.push(line);
  }
  return out.join('\n');
}

let failed = 0;
for (const rel of FILES) {
  const abs = path.join(process.cwd(), rel);
  const raw = fs.readFileSync(abs, 'utf8');
  /**
   * NORMALISE LINE ENDINGS BEFORE MATCHING, RESTORE THEM ON WRITE.
   *
   * This repo has no `.gitattributes` and `core.autocrlf=true`, so the index is
   * LF and the working tree is CRLF. A line-anchored pattern like
   * `/^[ \t]*\/\*\*[ \t]*$/m` therefore matches NOTHING on disk, because every
   * line really ends `\r`. The first run of this script reported
   * `annotations stripped 0` and `N app.bypass_rls remain` for all six files —
   * which is exactly quick-546's finding in a new instrument, and the reason the
   * assertions exist: without them this would have written six files that kept
   * their bypass flags and looked routed.
   */
  const hadCRLF = raw.includes('\r\n');
  const before = raw.replace(/\r\n/g, '\n');
  const report = { strippedBlocks: 0, refusedBlocks: [], acquisitions: 0 };

  if (!before.includes(OLD_IMPORT)) {
    console.log(`SKIP  ${rel}  (import already routed or unexpected shape)`);
    continue;
  }

  let after = before.split(OLD_IMPORT).join(NEW_IMPORT);
  after = stripBypassAnnotations(after, report);
  after = after.replace(SET_CONFIG_RE, '');
  after = insertAcquisitions(after, report);
  after = after.split('prisma.$transaction').join('tenantPrisma.$transaction');
  // The join above also hits the string we just inserted; normalise doubles.
  after = after.split('tenanttenantPrisma').join('tenantPrisma');

  /* ── assertions ──────────────────────────────────────────────────────── */
  const problems = [];
  const bypassLeft = (after.match(/app\.bypass_rls/g) || []).length;
  const bareTxLeft = (after.match(/(?<!tenant)Prisma\.\$transaction|(?<![\w.])prisma\.\$transaction/g) || [])
    .length;
  const acqCount = (after.match(/const tenantPrisma = await getTenantPrismaForOrg\(tenantId\);/g) || [])
    .length;

  if (bypassLeft !== 0) problems.push(`${bypassLeft} app.bypass_rls remain`);
  if (bareTxLeft !== 0) problems.push(`${bareTxLeft} bare prisma.$transaction remain`);
  if (acqCount !== report.acquisitions)
    problems.push(`acquisition line count ${acqCount} != inserted ${report.acquisitions}`);
  if (report.acquisitions === 0) problems.push('no acquisition inserted');
  if (report.refusedBlocks.length)
    problems.push(`REFUSED oversized annotation blocks: ${JSON.stringify(report.refusedBlocks)}`);
  if (tenantMentions(after) < tenantMentions(before))
    problems.push(
      `tenant mentions FELL ${tenantMentions(before)} -> ${tenantMentions(after)} — a where clause was lost`,
    );
  /**
   * quick-617 defect 2: a literal `undefined` that was not there before, which
   * `tsc` cannot see because `fooundefined` is a valid identifier.
   *
   * The comment this script INSERTS quotes the defect (`undefined !== tenantId`),
   * so the naive count fires on the applier's own prose — which it did, on all
   * six files, in the first run. The allowance is computed from the comment
   * rather than the guard being weakened: anything above
   * `before + acquisitions x per-comment` is still a real introduction.
   */
  const perComment = (ACQUISITION_COMMENT.join('\n').match(/undefined/g) || []).length;
  const undefBefore = (before.match(/undefined/g) || []).length;
  const undefAllowed = undefBefore + perComment * report.acquisitions;
  const undefAfter = (after.match(/undefined/g) || []).length;
  if (undefAfter > undefAllowed)
    problems.push(
      `literal 'undefined' introduced (${undefBefore} -> ${undefAfter}, allowed ${undefAllowed})`,
    );

  const status = problems.length ? 'FAIL' : WRITE ? 'WROTE' : 'OK';
  if (problems.length) failed++;
  console.log(
    `${status.padEnd(5)} ${rel}\n      annotations stripped ${report.strippedBlocks}  acquisitions ${report.acquisitions}  tenant mentions ${tenantMentions(before)} -> ${tenantMentions(after)}`,
  );
  for (const p of problems) console.log(`      PROBLEM: ${p}`);

  if (WRITE && !problems.length) {
    fs.writeFileSync(abs, hadCRLF ? after.replace(/\n/g, '\r\n') : after);
  }
}

console.log(failed ? `\n${failed} file(s) FAILED — nothing written for those` : '\nall files clean');
process.exit(failed ? 2 : 0);
