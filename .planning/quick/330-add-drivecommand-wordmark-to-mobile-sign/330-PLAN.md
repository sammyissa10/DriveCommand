---
phase: quick-330
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/auth/sign-in-card.tsx
autonomous: true

must_haves:
  truths:
    - "On mobile, logo and DriveCommand wordmark appear together on one horizontal line, centered"
    - "Miles Ahead. tagline appears centered directly below the logo+wordmark row"
    - "Entire sign-in block is vertically centered in viewport with balanced whitespace"
    - "Sign in heading alignment matches branding block alignment"
  artifacts:
    - path: "apps/web/src/components/auth/sign-in-card.tsx"
      provides: "Updated mobile branding block and vertical centering"
      contains: "DriveCommand"
  key_links:
    - from: "mobile branding block"
      to: "existing desktop branding"
      via: "consistent brand presentation"
      pattern: "Miles.*Ahead"
---

<objective>
Add DriveCommand wordmark and tagline to mobile sign-in view and vertically center the content.

Purpose: Mobile users currently see only the logo without brand identity. This update brings mobile branding parity with desktop while improving visual balance.
Output: Updated sign-in-card.tsx with mobile branding and centered layout.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/auth/sign-in-card.tsx
@apps/web/src/app/(auth)/layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mobile branding block with wordmark and tagline</name>
  <files>apps/web/src/components/auth/sign-in-card.tsx</files>
  <action>
Replace the mobile logo block (lines 211-219) with a full branding block that matches desktop:

1. Replace the current mobile-only div (md:hidden with just the logo) with:
   - A flex container: `flex flex-col items-center mb-8 md:hidden`
   - Inside: a horizontal row `flex flex-row items-center gap-2` containing:
     - The logo Image (reduce to width={36} height={36} for mobile fit)
     - A span with `text-xl font-bold text-white tracking-tight` containing "DriveCommand"
   - Below the row: the tagline `<p className="mt-2 text-lg font-semibold text-white tracking-tight text-center">Miles <span className="text-b-300">Ahead.</span></p>`

2. Keep the animation wrapper if desired, or apply static since mobile already has reduced motion considerations.

This mirrors the desktop branding structure but with mobile-appropriate sizing (36px logo vs 56px desktop).
  </action>
  <verify>Run `cd /Users/ayazmohammed/DriveCommand/apps/web && npm run build` to ensure no TypeScript errors. Visually inspect on mobile viewport (375px width) in browser dev tools.</verify>
  <done>Mobile view shows logo + "DriveCommand" wordmark on same line, with "Miles Ahead." tagline centered below.</done>
</task>

<task type="auto">
  <name>Task 2: Vertically center sign-in content on mobile</name>
  <files>apps/web/src/components/auth/sign-in-card.tsx</files>
  <action>
Update the right panel container (line 209) to vertically center content on mobile:

1. The current right panel div has: `flex items-center justify-center` which should center, but the inner content div (line 210) has `flex flex-col` without centering.

2. The issue is the outer container needs `min-h-dvh` on mobile to fill viewport. Currently the parent motion.div has `h-dvh min-h-dvh` but the right panel only has `min-h-0`.

3. Update the right panel (line 209):
   - Change from: `className="w-full md:w-1/2 flex items-center justify-center p-8 md:p-12 lg:p-16 bg-[#0E1424] md:border-l md:border-[#1C2536] min-h-0 overflow-auto"`
   - Change to: `className="w-full md:w-1/2 min-h-dvh md:min-h-0 flex items-center justify-center px-6 py-8 md:p-12 lg:p-16 bg-[#0E1424] md:border-l md:border-[#1C2536] overflow-auto"`

   Key changes:
   - Add `min-h-dvh md:min-h-0` so mobile gets full viewport height for centering
   - Change `p-8` to `px-6 py-8` for slightly tighter horizontal padding on mobile (prevents cramping on 320px viewports)

This ensures the flex centering actually works on mobile by giving the container full viewport height.
  </action>
  <verify>In browser dev tools, toggle to mobile viewport (375px and 320px widths). The sign-in block should be vertically centered with roughly equal whitespace above and below. No horizontal scrollbar should appear.</verify>
  <done>Sign-in content is vertically centered in mobile viewport with balanced whitespace above and below.</done>
</task>

<task type="auto">
  <name>Task 3: Align heading with branding block</name>
  <files>apps/web/src/components/auth/sign-in-card.tsx</files>
  <action>
The branding block is now centered (from Task 1). The "Sign in" heading (line 222) is left-aligned. For visual consistency on mobile, center the heading and subtitle to match the centered branding:

1. Update the heading motion.div (lines 221-223):
   - Change `<h1 className="text-h1 text-white mb-2">` to `<h1 className="text-h1 text-white mb-2 text-center md:text-left">`

2. Update the subtitle motion.p (line 224):
   - Change `className="text-body text-n-400 mb-10"` to `className="text-body text-n-400 mb-10 text-center md:text-left"`

This centers both on mobile while preserving left-alignment on desktop (where the form panel is part of a two-column layout).

Note: Do NOT change form field labels, inputs, buttons, or the forgot password link styling.
  </action>
  <verify>On mobile viewport, heading "Sign in" and subtitle "Welcome back. Let's get rolling." should be centered, matching the centered branding block above. On desktop (md: breakpoint and above), they should remain left-aligned.</verify>
  <done>Branding, heading, and subtitle share consistent center alignment on mobile; desktop retains left alignment.</done>
</task>

</tasks>

<verification>
1. Mobile viewport (375px): Logo + "DriveCommand" on one line, "Miles Ahead." below, all centered
2. Mobile viewport (375px): "Sign in" heading and subtitle centered
3. Mobile viewport (375px): Entire content block vertically centered in viewport
4. Mobile viewport (320px): No horizontal scrollbar, content fits
5. Desktop viewport (1024px+): No changes to left panel or form layout
6. Build passes: `npm run build` completes without errors
</verification>

<success_criteria>
- Mobile sign-in shows full brand identity matching desktop
- Content is vertically centered with balanced whitespace
- Visual alignment is consistent (branding, heading, subtitle all centered on mobile)
- No regressions on desktop layout
- No horizontal overflow on 320px viewport
</success_criteria>

<output>
After completion, create `.planning/quick/330-add-drivecommand-wordmark-to-mobile-sign/330-SUMMARY.md`
</output>
