---
phase: quick-350
plan: "01"
subsystem: web/auth/navigation
tags: [auth, UX, user-menu, display-name, helper]
dependency_graph:
  requires: []
  provides: [getDisplayName helper, user-menu name display]
  affects: [apps/web/src/components/navigation/user-menu.tsx]
tech_stack:
  added: []
  patterns: [pure helper extracted from component, fallback chain]
key_files:
  created:
    - apps/web/src/lib/auth/display-name.ts
  modified:
    - apps/web/src/components/navigation/user-menu.tsx
decisions:
  - "Snake_case full_name field accepted by DisplayNameUser for future-proofing even though current AuthUser does not expose it"
  - "Email local-part used as fallback (step 4) to avoid leaking full addresses in display contexts"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-16"
  tasks_completed: 2
  files_changed: 2
---

# Quick-350 Summary: Display User Name (Not Email) in Web Header

**One-liner:** Extracted a pure `getDisplayName()` helper with a 6-step fallback chain and wired the web header user menu to show first+last name as the primary label, with email demoted to muted secondary text.

## What Was Built

### Task 1 — `apps/web/src/lib/auth/display-name.ts` (created)

New pure helper with no React dependencies. Exports:

- **`DisplayNameUser`** — input type (`firstName?`, `lastName?`, `full_name?`, `email?`; all optional/nullable)
- **`getDisplayName(user)`** — applies this fallback chain, returning the first non-empty result after trim:
  1. `firstName + " " + lastName` — if both are non-empty
  2. `firstName` alone
  3. `full_name` (future-proofing)
  4. email local-part (everything before `@`)
  5. full email string
  6. `"User"` — safety fallback; callers never receive an empty string

Defensive: `null`/`undefined`/whitespace-only treated as missing at every step. Strict TypeScript — no `any`, no `@ts-ignore`.

### Task 2 — `apps/web/src/components/navigation/user-menu.tsx` (modified)

- Added `import { getDisplayName } from "@/lib/auth/display-name";`
- Replaced the 3-line inline ternary with `const displayName = getDisplayName(user);`
- Both `user?.email` renders (trigger row + dropdown header) kept with `text-muted-foreground` — email visible as secondary muted line
- `getInitials` helper and all sign-out / open-close logic unchanged

## TypeScript Check

```
npx tsc --noEmit  →  exit 0 (zero errors)
```

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 7fb9ee0 | feat(quick-350): Task 1 — add pure getDisplayName helper with fallback chain |
| 2 | 672dc6b | feat(quick-350): Task 2 — wire user-menu to getDisplayName, email stays secondary muted |

## Deviations from Plan

None — plan executed exactly as written.

## Scope Confirmation

- No changes to `auth-context.tsx`, `supabase.ts`, middleware, RLS, DB schema, or mobile app.
- No Vercel deploy triggered.
- Only the two listed files were touched.

## Self-Check: PASSED

- `apps/web/src/lib/auth/display-name.ts` — exists, exports `getDisplayName` + `DisplayNameUser`
- `apps/web/src/components/navigation/user-menu.tsx` — imports and calls `getDisplayName(user)`
- Commits `7fb9ee0` and `672dc6b` present in git log
- `tsc --noEmit` clean
