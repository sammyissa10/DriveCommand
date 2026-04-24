import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Naming lint test — enforces spec Section 3 naming table.
 *
 * Internal entity names (PlaybookInstance, StepInstance, PlaybookTrigger)
 * must NEVER appear in user-visible UI text or string attributes.
 * These are database/code-level names; the UI must use human terms
 * ("Checklists & Workflows", "Active Checklist", "Playbook", etc.).
 */

const OWNER_CHECKLISTS_DIR = join(process.cwd(), 'src/app/(owner)/checklists');

// Internal names from spec Section 3 that must NOT appear in rendered JSX
const BANNED_NAMES = ['PlaybookInstance', 'StepInstance', 'PlaybookTrigger'];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (full.endsWith('.tsx')) files.push(full);
  }
  return files;
}

/**
 * Strip lines that cannot contain user-visible JSX text:
 * - Import statements
 * - Type/interface declarations
 * - JSDoc lines (starting with *)
 */
function stripImportsAndTypes(source: string): string {
  return source
    .split('\n')
    .map((line) =>
      /^\s*(import\s|export\s+(type|interface)\s|type\s|interface\s)/.test(line) ||
      /^\s*\*/.test(line)
        ? ''
        : line
    )
    .join('\n');
}

describe('Workflows naming lint (spec Section 3)', () => {
  it('does not surface internal names in rendered JSX of the owner checklists route', () => {
    const files = walk(OWNER_CHECKLISTS_DIR);

    expect(files.length).toBeGreaterThan(0);

    const violations: Array<{ file: string; line: number; text: string; name: string }> = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const cleaned = stripImportsAndTypes(source);
      const lines = cleaned.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const name of BANNED_NAMES) {
          if (!line.includes(name)) continue;

          // Check for banned name in JSX text content (between > and <)
          const inJsxText = new RegExp(`>[^<>]*${name}[^<>]*<`).test(line);

          // Check for banned name inside a JSX string attribute value
          const inStringAttr = new RegExp(`=\\s*["'][^"']*${name}[^"']*["']`).test(line);

          if (inJsxText || inStringAttr) {
            violations.push({ file, line: i + 1, text: line.trim(), name });
          }
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}  [${v.name}]  ${v.text}`)
        .join('\n');
      throw new Error(
        `Internal workflow names leaked into UI — use user-facing names from spec Section 3:\n${msg}`
      );
    }

    expect(violations.length).toBe(0);
  });
});
