---
phase: quick-436
plan: 436
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
autonomous: true

must_haves:
  truths:
    - "Visiting /carrier/dispatches redirects to /carrier/trips (via next.config)"
    - "Visiting /carrier/dispatches/:id redirects to /carrier/trips/:id (via next.config)"
    - "The three stub page.tsx files no longer exist"
    - "next.config.ts redirect rules are unchanged and still present"
  artifacts:
    - path: "apps/web/next.config.ts"
      provides: "Permanent redirects for /carrier/dispatches and /carrier/dispatches/:path*"
      contains: "/carrier/dispatches/:path*"
  key_links:
    - from: "internal links to /carrier/dispatches/*"
      to: "/carrier/trips/*"
      via: "next.config.ts permanent redirects (:path* wildcard)"
      pattern: "carrier/dispatches/:path\\*"
---

<objective>
After renaming Dispatches to Trips (quick-429), two redirect mechanisms cover
/carrier/dispatches/*: (1) stub page.tsx files that call redirect(), and (2)
permanent redirects in next.config.ts. The next.config redirects fire at the
routing layer before render and win, making the stub pages dead code. Remove the
redundant stub pages, keep the next.config redirects.

Purpose: Eliminate dead code; single source of truth for the redirect.
Output: Deleted stub directory; next.config.ts redirects preserved.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Already-confirmed facts (investigated during planning — do NOT re-confirm by re-reading needlessly):
#
# next.config.ts (lines 10-23) ALREADY contains BOTH redirect rules, both permanent:
#   { source: '/carrier/dispatches',        destination: '/carrier/trips',        permanent: true }
#   { source: '/carrier/dispatches/:path*', destination: '/carrier/trips/:path*', permanent: true }
# The :path* wildcard rule IS present — no need to add anything to next.config.ts.
#
# The dispatches stub directory contains EXACTLY three files, all pure redirect stubs:
#   apps/web/src/app/(owner)/carrier/dispatches/page.tsx           -> redirect('/carrier/trips')
#   apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx      -> redirect(`/carrier/trips/${id}`)
#   apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx -> redirect(`/carrier/trips/${id}/stops`)
#
# IMPORTANT: Many internal links across the app still point at /carrier/dispatches/*
# (owner-bottom-nav, dashboard, fleet pages, loads, search, permissions, etc.).
# These are NOT broken by this change — they are handled by the next.config redirects.
# A page file CANNOT be imported by other code, so deleting the stubs breaks no import.
# Do NOT change those internal links; they are out of scope.
#
# Do NOT confuse the PAGE route with the API route /api/v1/carrier/dispatches/* —
# the API routes are unrelated and must NOT be touched.
@apps/web/next.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify next.config redirects, then delete dispatches stub pages</name>
  <files>
    apps/web/src/app/(owner)/carrier/dispatches/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
  </files>
  <action>
    1. Confirm apps/web/next.config.ts still contains BOTH redirect rules
       (`/carrier/dispatches` -> `/carrier/trips` and
       `/carrier/dispatches/:path*` -> `/carrier/trips/:path*`, both permanent: true).
       Both are already present (verified during planning). Do NOT edit next.config.ts.
       If — and only if — the `:path*` wildcard rule were somehow missing, add it
       BEFORE deleting any stub. Do not weaken or remove any existing redirect.

    2. Delete the three stub page files (all pure redirect()-only stubs):
       - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
       - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
       - apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx

    3. Remove the now-empty directory tree:
       apps/web/src/app/(owner)/carrier/dispatches/  (and its [id]/ and [id]/stops/ subdirs)

    Do NOT touch anything under carrier/trips/, any API route, any component, or
    any internal link/href. Those internal /carrier/dispatches/* links are
    intentionally left in place — the next.config redirects handle them.
  </action>
  <verify>
    - `Test-Path "apps/web/src/app/(owner)/carrier/dispatches"` returns False
      (directory and all three stub files are gone).
    - apps/web/next.config.ts still contains the line `/carrier/dispatches/:path*`
      and the base `/carrier/dispatches` redirect, both `permanent: true`.
    - `cd apps/web; npx tsc --noEmit` introduces no NEW errors vs. baseline
      (deleting page files cannot create import errors; confirm count unchanged).
  </verify>
  <done>
    The three dispatches stub pages and their directory are deleted, next.config.ts
    redirect rules are untouched and still present, and visiting /carrier/dispatches
    or /carrier/dispatches/:id still resolves to the corresponding /carrier/trips route
    via the next.config permanent redirects.
  </done>
</task>

</tasks>

<verification>
- Directory apps/web/src/app/(owner)/carrier/dispatches/ no longer exists.
- next.config.ts redirects for /carrier/dispatches and /carrier/dispatches/:path* intact (both permanent).
- tsc --noEmit shows no new errors.
- No API route, trips route, component, or internal link was modified.
</verification>

<success_criteria>
- Stub pages removed; redirect behavior preserved entirely by next.config.ts.
- Zero changes to next.config redirect rules, trips routes, API routes, or components.
- No new TypeScript errors.
</success_criteria>

<output>
After completion, create `.planning/quick/436-remove-redundant-dispatches-redirect-stu/436-SUMMARY.md`
</output>
