/**
 * quick-603 Task 1 / Task 5 — the authoritative `logger.error` arity scan.
 *
 * The grep in the plan (`logger\.error\(([^,]*(`[^`]*`)?[^,]*), \{`) is line-oriented
 * and cannot see a call whose second argument sits on the next line. This walks the
 * argument list with a balanced-delimiter scan instead, so a multi-line call is
 * classified the same as a single-line one.
 *
 * Run from `apps/web`:  node ../../.planning/quick/603-.../evidence/scripts/scan-logger-arity.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BACKSLASH = String.fromCharCode(92);

/**
 * Blank out `//` and block comments, preserving every byte position so that the
 * reported line numbers stay correct.
 *
 * Added mid-task, after the fix's own explanatory comments (which quote the old
 * broken call verbatim) were matched as if they were code. The count is
 * re-verified against the pre-fix tree in `05-logger-classification.md`: it is
 * still 76, so no site in the original population was ever a comment.
 */
function stripComments(src) {
  const out = src.split('');
  let i = 0;
  let inStr = null;
  while (i < src.length) {
    const c = src[i];
    const p = src[i - 1];
    if (inStr) {
      if (c === inStr && p !== BACKSLASH) inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < src.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
      continue;
    }
    i++;
  }
  return out.join('');
}

const files = execSync('find src -name "*.ts" -o -name "*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => !f.startsWith('src/generated/'));

let total = 0;
const objSlot = [];
const messageOnly = [];
const other = [];

for (const file of files) {
  // CRLF normalisation (quick-546) — this repo is core.autocrlf=true with no .gitattributes.
  const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  let idx = 0;
  while ((idx = src.indexOf('logger.error(', idx)) !== -1) {
    total++;
    const open = idx + 'logger.error('.length;
    let depth = 0;
    let i = open;
    let inStr = null;
    const args = [];
    let cur = '';
    for (; i < src.length; i++) {
      const c = src[i];
      const p = src[i - 1];
      if (inStr) {
        if (c === inStr && p !== BACKSLASH) inStr = null;
        cur += c;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; cur += c; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
      if (c === ')' && depth === 0) { args.push(cur); break; }
      if (c === ')' || c === ']' || c === '}') { depth--; cur += c; continue; }
      if (c === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
      cur += c;
    }
    const line = src.slice(0, idx).split('\n').length;
    const loc = `${file}:${line}`;
    const raw = src.slice(idx, i + 1).replace(/\s+/g, ' ');
    const nonEmpty = args.filter((a) => a.trim().length > 0);
    if (nonEmpty.length < 2) {
      messageOnly.push({ loc, raw });
    } else {
      const a2 = nonEmpty[1].trim().replace(/\s+/g, ' ');
      if (a2.startsWith('{')) objSlot.push({ loc, raw, arg2: a2 });
      else other.push({ loc, raw, arg2: a2 });
    }
    idx = open;
  }
}

console.log('files scanned:', files.length);
console.log('TOTAL logger.error calls:', total);
console.log('OBJECT LITERAL in slot 2 (the defect):', objSlot.length);
console.log('message only (1 arg):', messageOnly.length);
console.log('identifier/expression in slot 2:', other.length);
console.log('sum check:', objSlot.length + messageOnly.length + other.length === total);

const out = process.argv[2];
if (out) {
  writeFileSync(out, JSON.stringify({ total, objSlot, messageOnly: messageOnly.length, other: other.length }, null, 2));
  console.log('wrote', out);
}
