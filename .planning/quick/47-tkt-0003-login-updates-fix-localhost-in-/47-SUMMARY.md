---
phase: quick-47
plan: "01"
subsystem: auth
tags: [invitation, password-manager, autofill, env-config, api]
dependency_graph:
  requires: []
  provides: [GET /api/auth/accept-invitation, accept-invitation email prefill]
  affects: [invitation flow, driver onboarding, password manager autofill]
tech_stack:
  added: []
  patterns: [GET route handler, useEffect fetch on mount, read-only autofill input]
key_files:
  created: []
  modified:
    - src/app/api/auth/accept-invitation/route.ts
    - src/app/(auth)/accept-invitation/page.tsx
decisions:
  - Used autoComplete="username" on email field per WHATWG autofill spec for broadest password manager compatibility
  - Read-only email rendered with opacity-60 + cursor-not-allowed to signal non-editable visually
  - GET handler reuses same bypass_rls transaction pattern as POST for consistency
  - firstName used for personalised greeting with generic fallback
metrics:
  duration: ~8 minutes
  completed: 2026-03-10
  tasks: 2
  files: 2
---

# Quick-47: TKT-0003 Login Updates — Fix localhost in Invitation Links

Added a GET endpoint to the accept-invitation API route and updated the accept-invitation page to prefetch and display a read-only email field, enabling browser password manager autofill on account creation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add GET handler to accept-invitation API route | dc3ee0b | src/app/api/auth/accept-invitation/route.ts |
| 2 | Add pre-filled email field to accept-invitation page | 8637cb3 | src/app/(auth)/accept-invitation/page.tsx |

## What Was Built

**Task 1 — GET /api/auth/accept-invitation:**
- New `GET` export on the existing route file
- Reads `?id=` query param, bypasses RLS the same way as `POST`
- Returns 400 (missing id), 404 (not found), 410 (used/expired/cancelled), 200 `{ email, firstName }`
- Only exposes `email` and `firstName` — no other invitation fields leaked
- Added module-level `console.warn` when `NEXT_PUBLIC_APP_URL` is unset, making the localhost-link misconfiguration immediately visible in production server logs

**Task 2 — Accept-invitation page email field:**
- `useEffect` fetches GET endpoint on mount using the `?id=` from search params
- Shows a `Loader2` spinner while fetching
- If fetch returns an error (404/410), renders an "Invitation Unavailable" card with the error message — form is not shown
- Adds a read-only email `<input>` as the first field in the form with `autoComplete="username"`, `readOnly`, `tabIndex={-1}`, `opacity-60`, `cursor-not-allowed`
- Personalises greeting: "Set a password to complete your account setup, {firstName}." with generic fallback
- Both password inputs retain `autoComplete="new-password"`
- POST submit logic unchanged — still sends only `{ invitationId, password }`

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria Verification

1. Production localhost links: Existing server actions already read `NEXT_PUBLIC_APP_URL`. The new `console.warn` makes the missing env var immediately visible in server logs so operators know to set it.
2. Password manager autofill: The accept-invitation page now renders `email (read-only) → password → confirm password` — browsers see a complete username+password form and can offer to save credentials.

## Self-Check

- [x] `src/app/api/auth/accept-invitation/route.ts` — modified, GET handler added
- [x] `src/app/(auth)/accept-invitation/page.tsx` — modified, email field + fetch logic added
- [x] Commit dc3ee0b exists (Task 1)
- [x] Commit 8637cb3 exists (Task 2)
- [x] `npx tsc --noEmit` — passes with no errors

## Self-Check: PASSED
