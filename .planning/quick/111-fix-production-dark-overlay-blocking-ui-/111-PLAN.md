---
phase: quick-111
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(auth)/layout.tsx
autonomous: true

must_haves:
  truths:
    - "Sign-in page on production (drive-command.vercel.app) is fully interactive — form inputs clickable, button clickable"
    - "Sign-in page background overlay provides readability without blocking pointer events"
    - "After deploy, user can log in with demo credentials on production"
  artifacts:
    - path: "apps/web/src/app/(auth)/layout.tsx"
      provides: "Auth layout with non-blocking overlay"
      contains: "pointer-events-none"
  key_links:
    - from: "apps/web/src/app/(auth)/layout.tsx"
      to: "sign-in page form"
      via: "z-index stacking and pointer-events"
      pattern: "pointer-events-none"
---

<objective>
Fix the production dark overlay that blocks the entire UI on drive-command.vercel.app.

Purpose: The sign-in page (and potentially other auth pages) appears dark and completely unclickable in production. The auth layout at `(auth)/layout.tsx` renders a full-viewport `absolute inset-0 bg-black/40` overlay div WITHOUT `pointer-events-none`, relying solely on `z-10` on the sibling content div. This is fragile and can fail in production due to CSS ordering differences, stacking context edge cases, or hydration timing.

Output: Fixed auth layout, deployed to Vercel production.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(auth)/layout.tsx
@apps/web/src/app/layout.tsx
@apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix auth layout overlay to not block pointer events</name>
  <files>apps/web/src/app/(auth)/layout.tsx</files>
  <action>
In `apps/web/src/app/(auth)/layout.tsx`, the overlay div on line 14:
```
<div className="absolute inset-0 bg-black/40" />
```
is covering the full viewport without `pointer-events-none`. The form content is in a sibling div with `relative z-10`, but this stacking approach is fragile.

Fix by adding `pointer-events-none` to the overlay div:
```
<div className="absolute inset-0 bg-black/40 pointer-events-none" />
```

This ensures the dark semi-transparent overlay is purely visual and never intercepts clicks, regardless of CSS ordering or stacking context behavior in production builds.

The content div with `relative z-10` can remain as-is for visual stacking, but the pointer-events-none is the defensive fix that eliminates the class of bugs entirely.

After making the change, run a production build to verify no build errors:
```
cd apps/web && npx next build
```
  </action>
  <verify>
1. `npx next build` succeeds in `apps/web`
2. Start production server: `npx next start -p 3099`
3. Visit http://localhost:3099/sign-in — verify the form is clickable, inputs accept text, button submits
4. Visually confirm the dark overlay still appears (background image is darkened for readability)
  </verify>
  <done>Auth layout overlay has `pointer-events-none`, production build passes, sign-in form is interactive in prod mode</done>
</task>

<task type="auto">
  <name>Task 2: Deploy to Vercel production and verify</name>
  <files></files>
  <action>
Deploy the fix to Vercel production using CLI (per project convention — never push to GitHub for deployments):
```
cd apps/web && vercel --prod
```

Wait for deployment to complete. Then verify the production site at https://drive-command.vercel.app/sign-in:
- Page loads with background image and dark overlay
- Form inputs are clickable and accept keyboard input
- Sign-in button is clickable
- Demo credentials (demo@drivecommand.com / demo1234) can be entered and submitted
  </action>
  <verify>
1. `vercel --prod` completes successfully
2. Visit https://drive-command.vercel.app/sign-in — form is fully interactive
3. Can type in email and password fields
4. Sign-in button responds to clicks
  </verify>
  <done>Production site at drive-command.vercel.app has a fully interactive sign-in page with no blocking overlay</done>
</task>

</tasks>

<verification>
- Auth layout overlay div includes `pointer-events-none` class
- Production build succeeds without errors
- Sign-in page form is interactive in production mode (both local prod build and Vercel deployment)
- Dark overlay visual effect is preserved (background darkening for readability)
</verification>

<success_criteria>
- drive-command.vercel.app/sign-in page is fully interactive — no dark overlay blocking clicks
- Users can sign in with valid credentials on production
- Visual appearance preserved (dark overlay for background readability remains)
</success_criteria>

<output>
After completion, create `.planning/quick/111-fix-production-dark-overlay-blocking-ui-/111-SUMMARY.md`
</output>
