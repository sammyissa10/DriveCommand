---
phase: quick-362
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/owner-shell.tsx
autonomous: true

must_haves:
  truths:
    - "Desktop layout shows dark gradient background behind white content card"
    - "Content card appears visibly inset from dark chrome on all 4 sides"
    - "Topbar has matching dark background (gradient inherited from shell)"
  artifacts:
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "Desktop shell layout with proper background classes"
      contains: "shell-bg"
  key_links:
    - from: "apps/web/src/components/navigation/owner-shell.tsx"
      to: "apps/web/src/app/globals.css"
      via: "shell-bg class"
      pattern: "shell-bg"
---

<objective>
Fix the desktop topbar color mismatch and ensure the white content card properly overlays the dark chrome.

Purpose: The `sidebar-shell-background` class used on line 41 is NOT defined in globals.css, causing the shell background to be transparent/undefined. The correct class `shell-bg` (defined on lines 505-511 of globals.css) applies the proper dark gradient.

Output: Desktop layout with dark gradient background visible behind white content card on all 4 sides.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/app/globals.css (lines 505-521 for shell-bg and topbar-dark-context)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix shell background class and add topbar dark context</name>
  <files>apps/web/src/components/navigation/owner-shell.tsx</files>
  <action>
    Make two changes to owner-shell.tsx:

    1. Line 41: Replace `sidebar-shell-background` with `shell-bg`
       - Before: `<div className="hidden lg:flex h-screen sidebar-shell-background">`
       - After: `<div className="hidden lg:flex h-screen shell-bg">`
       - Reason: `sidebar-shell-background` is undefined; `shell-bg` is defined in globals.css (lines 505-511) and applies the dark gradient

    2. Line 53: Add `topbar-dark-context` class to the header element
       - Before: `<header className="flex h-14 shrink-0 items-center gap-4 px-6">`
       - After: `<header className="flex h-14 shrink-0 items-center gap-4 px-6 topbar-dark-context">`
       - Reason: This utility class (defined in globals.css lines 514-521) sets --muted-foreground and --foreground to light values so icons/buttons are readable on the dark topbar
  </action>
  <verify>
    1. Run `grep -n "shell-bg\|topbar-dark-context" apps/web/src/components/navigation/owner-shell.tsx` to confirm both classes are present
    2. Run `npx tsc --noEmit` in apps/web to ensure no TypeScript errors
  </verify>
  <done>
    - Desktop shell outer div uses `shell-bg` class (dark gradient background)
    - Desktop topbar header uses `topbar-dark-context` class (light icons on dark)
    - Content card with `bg-white rounded-2xl m-3` is visibly inset on all 4 sides against dark chrome
  </done>
</task>

</tasks>

<verification>
1. Visual check: Open any owner portal page on desktop (lg breakpoint+)
2. Confirm: Dark gradient visible as a frame around the white content card
3. Confirm: White content card has visible margin (inset) on all 4 sides — top, bottom, left, right
4. Confirm: Topbar icons/buttons are light colored (readable on dark background)
</verification>

<success_criteria>
- `sidebar-shell-background` replaced with `shell-bg` on line 41
- `topbar-dark-context` added to header on line 53
- TypeScript compiles without errors
- Visual: Dark chrome visible on all 4 sides of white content card
</success_criteria>

<output>
After completion, create `.planning/quick/362-fix-topbar-color-mismatch-and-make-conte/362-SUMMARY.md`
</output>
