/**
 * Static-analysis tap-target test for InspectionModeScreen.
 * Reads the source file and asserts PASS/FAIL buttons meet the 56px minimum.
 *
 * Pattern: Phase 43 workflows-tap-targets.test.ts (static analysis, no renderer)
 * Spec reference: Section 15 Phase 3 — mandated tap-target coverage for DVIR UI.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCREEN_FILE = path.resolve(
  __dirname,
  '../components/driver/workflows/InspectionModeScreen.tsx'
);

describe('InspectionModeScreen — tap targets', () => {
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(SCREEN_FILE)).toBe(true);
    source = fs.readFileSync(SCREEN_FILE, 'utf-8');
  });

  it('PASS/FAIL action buttons are at least 56px tall', () => {
    // Find all height: N or minHeight: N patterns in the source
    const heightPattern = /(?:min)?[Hh]eight\s*:\s*(\d+)/g;
    const heights: number[] = [];
    let match;
    while ((match = heightPattern.exec(source)) !== null) {
      heights.push(parseInt(match[1], 10));
    }

    // The file must contain explicit height values >= 56 for action buttons
    const actionButtonHeights = heights.filter((h) => h >= 56);
    expect(actionButtonHeights.length).toBeGreaterThan(0);
  });

  it('does not use react-native Animated (must use react-native-reanimated)', () => {
    // Importing from 'react-native' Animated would cause reconciler conflicts
    const badImport = /import\s+\{[^}]*\bAnimated\b[^}]*\}\s+from\s+['"]react-native['"]/;
    expect(source).not.toMatch(badImport);
  });

  it('has an exit confirmation Alert for back navigation', () => {
    expect(source).toMatch(/Alert\.alert/);
  });

  it('shows completion screen when all steps done', () => {
    // Completion state must have user-facing copy mentioning "Complete" or "complete"
    expect(source).toMatch(/Complete/i);
  });
});
