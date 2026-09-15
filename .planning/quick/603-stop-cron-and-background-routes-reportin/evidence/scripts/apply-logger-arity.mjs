/**
 * quick-603 Task 5 Step B — apply the real `logger.error` arity to buckets (a) and (b).
 *
 * THE quick-541 TRAP IS SIDESTEPPED, NOT NAVIGATED.
 * -------------------------------------------------
 * quick-541 wedged an import between `import {` and its first specifier in four
 * files by splicing after "the last line matching ^import", producing a TS1003
 * PARSE error that then blinded the whole tsc gate. This script never inserts an
 * import line at all: every affected file ALREADY imports `logger` from
 * `@/lib/logger` (it has to, to call `logger.error`), so `serializeError` is
 * added to that existing specifier list. The script ASSERTS it found such an
 * import and refuses to touch a file where it did not.
 *
 * THE TRANSFORM
 * -------------
 *   logger.error(MSG, { …ctx })            ->  logger.error(MSG, E, { …ctx', err: serializeError(E) })
 *
 * where E is the error variable for that site and ctx' is ctx with any top-level
 * `err`/`error` entry whose value MENTIONS E removed (it is about to be carried,
 * better, by `serializeError`). An `error: <something-unrelated>` entry — e.g. a
 * pre-flattened `message` const — is KEPT, because dropping it would lose a fact
 * the author put there deliberately.
 *
 * Bucket (b) — no error in scope — gets `undefined` in slot 2 and the context
 * moved to slot 3, which is where it belongs.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** Split an object-literal body into top-level entries, respecting nesting and strings. */
function splitEntries(body) {
  const entries = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  const BACKSLASH = String.fromCharCode(92);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    const p = body[i - 1];
    if (inStr) {
      if (c === inStr && p !== BACKSLASH) inStr = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { entries.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) entries.push(cur);
  return entries.map((e) => e.trim()).filter(Boolean);
}

function rewriteContext(arg2Text, errVar) {
  const body = arg2Text.trim().replace(/^\{/, '').replace(/\}$/, '');
  const kept = [];
  for (const entry of splitEntries(body)) {
    if (entry.startsWith('...')) { kept.push(entry); continue; }
    const colon = (() => {
      let depth = 0;
      let inStr = null;
      const BACKSLASH = String.fromCharCode(92);
      for (let i = 0; i < entry.length; i++) {
        const c = entry[i];
        const p = entry[i - 1];
        if (inStr) { if (c === inStr && p !== BACKSLASH) inStr = null; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '(' || c === '[' || c === '{') { depth++; continue; }
        if (c === ')' || c === ']' || c === '}') { depth--; continue; }
        if (c === ':' && depth === 0) return i;
      }
      return -1;
    })();
    const key = (colon === -1 ? entry : entry.slice(0, colon)).trim();
    const value = colon === -1 ? key : entry.slice(colon + 1).trim();
    const mentions = new RegExp(`\\b${errVar}\\b`).test(value);
    if ((key === 'err' || key === 'error') && mentions) continue; // carried by serializeError now
    kept.push(entry);
  }
  kept.push(`err: serializeError(${errVar})`);
  return `{ ${kept.join(', ')} }`;
}

/** Add `serializeError` to the file's EXISTING `@/lib/logger` import. Never inserts a line. */
function ensureSerializeErrorImport(src) {
  if (/\bserializeError\b/.test(src.split('\n').filter((l) => l.startsWith('import')).join('\n'))) {
    return { src, already: true };
  }
  const re = /import\s*\{([^}]*)\}\s*from\s*'@\/lib\/logger';/;
  const m = src.match(re);
  if (!m) return { src, failed: true };
  const specifiers = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (specifiers.includes('serializeError')) return { src, already: true };
  specifiers.push('serializeError');
  return { src: src.replace(re, `import { ${specifiers.join(', ')} } from '@/lib/logger';`) };
}

const sites = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dryRun = process.argv.includes('--dry-run');

// Group by file, and rewrite from the BOTTOM of each file upwards so earlier
// byte offsets stay valid.
const byFile = new Map();
for (const s of sites) {
  if (!byFile.has(s.file)) byFile.set(s.file, []);
  byFile.get(s.file).push(s);
}

let rewritten = 0;
const problems = [];
for (const [file, fileSites] of byFile) {
  let src = readFileSync(file, 'utf8').split(CR + LF).join(LF);
  const ordered = [...fileSites].sort((a, b) => b.line - a.line);
  let needsImport = false;

  for (const s of ordered) {
    const lines = src.split(LF);
    let idx = lines.slice(0, s.line - 1).join(LF).length + (s.line > 1 ? 1 : 0);
    idx = src.indexOf('logger.error(', idx);
    if (idx === -1) { problems.push(`${s.loc}: call not found at recorded line`); continue; }

    // Balanced scan for the closing paren and the two argument spans.
    const open = idx + 'logger.error('.length;
    let depth = 0;
    let inStr = null;
    const BACKSLASH = String.fromCharCode(92);
    const argStarts = [open];
    let close = -1;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      const p = src[i - 1];
      if (inStr) { if (c === inStr && p !== BACKSLASH) inStr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; continue; }
      if (c === ')' && depth === 0) { close = i; break; }
      if (c === ')' || c === ']' || c === '}') { depth--; continue; }
      if (c === ',' && depth === 0) argStarts.push(i + 1);
    }
    if (close === -1 || argStarts.length < 2) { problems.push(`${s.loc}: unparsable call`); continue; }

    const msg = src.slice(argStarts[0], argStarts[1] - 1).trim();
    const ctx = src.slice(argStarts[1], close).trim();
    if (!ctx.startsWith('{')) { problems.push(`${s.loc}: slot 2 is not an object literal`); continue; }

    let replacement;
    if (s.bucket === 'b') {
      replacement = `logger.error(${msg}, undefined, ${ctx})`;
    } else {
      replacement = `logger.error(${msg}, ${s.errVar}, ${rewriteContext(ctx, s.errVar)})`;
      needsImport = true;
    }
    src = src.slice(0, idx) + replacement + src.slice(close + 1);
    rewritten++;
  }

  if (needsImport) {
    const r = ensureSerializeErrorImport(src);
    if (r.failed) { problems.push(`${file}: no \`from '@/lib/logger'\` named import to extend`); continue; }
    src = r.src;
  }
  if (!dryRun) writeFileSync(file, src);
}

console.log(dryRun ? 'DRY RUN' : 'APPLIED', '- call sites rewritten:', rewritten, 'across', byFile.size, 'files');
if (problems.length) {
  console.error('PROBLEMS:');
  problems.forEach((p) => console.error('  ', p));
  process.exit(1);
}
