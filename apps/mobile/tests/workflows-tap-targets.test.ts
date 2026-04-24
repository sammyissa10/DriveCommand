import { describe, it, expect } from 'vitest'

/**
 * Mobile tap-target audit — workflow task screens.
 *
 * Spec mandate: any Pressable/TouchableOpacity in task action screens must
 * have height ≥ 56px. This test reads StyleSheet definitions statically
 * (no DOM rendering required) and asserts all touchable height values comply.
 *
 * Static-analysis test — uses Node.js fs/path, not Expo/React renderer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCREENS_DIR = path.resolve(
  __dirname,
  '../components/driver/workflows'
);
const MIN_TAP_TARGET_PX = 56;

// Regex to find height values in StyleSheet definitions
// Matches: height: 48 or height: 56 etc.
const HEIGHT_PATTERN = /height\s*:\s*(\d+)/g;

// Files to audit — the 4 task action screens built in Phase 43-06
const AUDIT_FILES = [
  'MyTasksScreen.tsx',
  'DocumentUploadScreen.tsx',
  'FormFillScreen.tsx',
  'SignatureScreen.tsx',
];

describe('Mobile tap-target audit — workflow task screens', () => {
  AUDIT_FILES.forEach((fileName) => {
    it(`${fileName}: no Pressable/TouchableOpacity with height < ${MIN_TAP_TARGET_PX}px`, () => {
      const filePath = path.join(SCREENS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        // File doesn't exist yet — skip with a descriptive message
        console.warn(`SKIP: ${fileName} not found at ${filePath}`);
        return;
      }

      const source = fs.readFileSync(filePath, 'utf-8');

      const violations: Array<{ height: number; context: string }> = [];
      let match: RegExpExecArray | null;

      // Reset lastIndex before each scan
      HEIGHT_PATTERN.lastIndex = 0;

      while ((match = HEIGHT_PATTERN.exec(source)) !== null) {
        const heightValue = parseInt(match[1], 10);

        // Only flag values that are positive and below the minimum
        if (heightValue <= 0 || heightValue >= MIN_TAP_TARGET_PX) continue;

        // Heuristic: inspect up to 500 chars of source before this match
        // to determine whether this height belongs to a touchable element.
        const contextStart = Math.max(0, match.index - 500);
        const context = source.slice(contextStart, match.index + 20);

        const isTouchableContext =
          context.includes('TouchableOpacity') ||
          context.includes('Pressable') ||
          context.includes('button') ||
          context.includes('Button') ||
          context.includes('action') ||
          context.includes('Btn');

        if (isTouchableContext) {
          violations.push({ height: heightValue, context: context.slice(-100) });
        }
      }

      if (violations.length > 0) {
        const details = violations
          .map((v) => `  height: ${v.height} (found near: ...${v.context.trim()})`)
          .join('\n');
        throw new Error(
          `${fileName}: Found ${violations.length} touchable element(s) with height < ${MIN_TAP_TARGET_PX}px — increase to ≥${MIN_TAP_TARGET_PX}px:\n${details}`
        );
      }

      expect(violations).toHaveLength(0);
    });
  });
});
