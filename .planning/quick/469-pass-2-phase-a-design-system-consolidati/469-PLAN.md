---
phase: quick-469
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/design-system.md
autonomous: true
must_haves:
  truths:
    - "Design system reference exists at .planning/design-system.md"
    - "TypeScript compiles without errors"
    - "Build completes successfully"
  artifacts:
    - path: ".planning/design-system.md"
      provides: "Design system reference documentation"
      min_lines: 300
  key_links: []
---

<objective>
Finalize design system consolidation by placing reference documentation at the user's requested location and verifying no regressions.

Purpose: The design system has been built and documented at `apps/web/DESIGN_SYSTEM.md`. User requested the reference live at `.planning/design-system.md`. This task copies the documentation to that location and verifies the build is clean.

Output: Design system reference at `.planning/design-system.md`, verified build.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/DESIGN_SYSTEM.md
@.planning/design-system-state.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy design system reference to .planning location</name>
  <files>.planning/design-system.md</files>
  <action>
Copy the content from `apps/web/DESIGN_SYSTEM.md` to `.planning/design-system.md`.

Add a note at the top indicating this is the canonical reference:
```markdown
<!-- Canonical design system reference for DriveCommand -->
<!-- Source: apps/web/DESIGN_SYSTEM.md -->
```

The content should be identical otherwise, preserving all component documentation, design rules, usage examples, and migration guide.
  </action>
  <verify>File exists at `.planning/design-system.md` with 300+ lines of content</verify>
  <done>Design system reference documentation exists at user-requested location `.planning/design-system.md`</done>
</task>

<task type="auto">
  <name>Task 2: Verify build integrity</name>
  <files>N/A (verification only)</files>
  <action>
Run TypeScript compilation and Next.js build to verify no regressions:

1. Clear any stale Next.js cache: `rm -rf apps/web/.next`
2. Run TypeScript check: `cd apps/web && npx tsc --noEmit`
3. Run production build: `cd apps/web && npm run build`

If any errors appear, they should be unrelated to the design system work (which is already complete). Note any errors in the summary but do not block on pre-existing issues.
  </action>
  <verify>`tsc --noEmit` exits 0, `npm run build` completes successfully</verify>
  <done>Build passes, confirming design system consolidation introduced no regressions</done>
</task>

</tasks>

<verification>
- [ ] `.planning/design-system.md` exists with full documentation content
- [ ] TypeScript compiles without errors
- [ ] Next.js build completes successfully
- [ ] `apps/web/DESIGN_SYSTEM.md` remains in place (both locations valid)
</verification>

<success_criteria>
1. Design system reference exists at `.planning/design-system.md` (user's requested location)
2. TypeScript compilation passes (`tsc --noEmit` exits 0)
3. Production build succeeds (`npm run build` exits 0)
</success_criteria>

<output>
After completion, create `.planning/quick/469-pass-2-phase-a-design-system-consolidati/469-SUMMARY.md`
</output>
