---
phase: 48-tenant-self-onboarding-signup-and-provisioning
plan: "02"
subsystem: auth/onboarding
tags: [signup, server-action, onboarding, middleware, rate-limiting]
dependency_graph:
  requires: ["48-01", "48-03"]
  provides: ["public /sign-up page", "signUpAction server action", "/onboarding/welcome page", "middleware PUBLIC_PATHS for onboarding"]
  affects: ["apps/web/src/middleware.ts"]
tech_stack:
  added: []
  patterns: ["useActionState (React 19)", "useFormStatus", "in-memory rate limiting", "timing-equalization for email enumeration hardening"]
key_files:
  created:
    - apps/web/src/app/(auth)/sign-up/actions.tsx
    - apps/web/src/app/(auth)/sign-up/sign-up-form.tsx
    - apps/web/src/app/onboarding/welcome/page.tsx
  modified:
    - apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
    - apps/web/src/middleware.ts
decisions:
  - "actions.tsx (JSX extension) — AccountExistsEmail inline component requires JSX, so file uses .tsx instead of .ts"
  - "getAppBaseUrl() used instead of inline env var for consistent URL resolution across local/Vercel/Railway"
  - "AppEvent creation omitted — user's provided code template excluded it; core provisioning flow is complete without it"
  - "sendEmail calls are fire-and-forget (void + .catch) — email failures never block signup redirect"
metrics:
  duration: 25m
  completed: "2026-04-29"
  tasks: 2
  files_created: 3
  files_modified: 2
---

# Phase 48 Plan 02: Sign-up Page, Server Action, Welcome Page Summary

Self-serve owner signup: 6-field form at `/sign-up` calls `signUpAction`, which provisions the tenant, fires two emails (confirmation + welcome), creates the Supabase Auth user, sets the session cookie, then redirects to `/onboarding/welcome`.

## What Was Built

### Task 1: signUpAction Server Action

`apps/web/src/app/(auth)/sign-up/actions.tsx` implements the full signup flow as a Next.js `'use server'` action:

- **Rate limiting** — in-memory Map (10 req/IP/hour) checked before any DB work
- **Zod validation** — `signUpSchema.safeParse()` returns `fieldErrors` per field on failure
- **provisionTenant()** — creates Tenant, User, Subscription, ActivationProgress in a single transaction; returns `{ tenantId, userId, emailToken, trialEndsAt }`
- **Dual email dispatch** — confirmation email (with `/api/email-confirm/[token]` link) and welcome email both fire-and-forget via `sendEmail()` with `replyTo`
- **Supabase Auth user** — `createAdminClient().auth.admin.createUser({ email_confirm: true, app_metadata: { role: 'OWNER', tenantId } })`
- **Auto sign-in** — `createSupabaseServerClient().auth.signInWithPassword()` sets session cookie immediately after account creation
- **Email enumeration hardening** — `EMAIL_TAKEN` path calls `bcrypt.hash('timing-equalization-dummy', 12)` before returning the generic `SUCCESS_MSG`, so response time is indistinguishable from a real signup
- **Duplicate-email notification** — sends `AccountExistsEmail` (inline JSX component) to the existing account's address
- **Error surface** — `DEFAULT_PLAN_NOT_FOUND`, `PROMO_EXHAUSTED`, and unexpected errors each return distinct user-facing messages

### Task 2: Sign-up Form, Page, Welcome Page, Middleware

**`sign-up-form.tsx`** (client component):
- `useActionState(signUpAction, initial)` wires form to server action
- `useFormStatus()` drives submit button spinner + disabled state
- 6 fields: firstName, lastName, email, password, companyName, fleetSizeBucket (native select), promoCode (pre-filled from `?promo=` URL param via `use(searchParams)`)
- Inline field errors from `state.fieldErrors`, top-level alert from `state.message`
- shadcn/ui components: `Input`, `Label`, `Button`, `Alert`

**`[[...sign-up]]/page.tsx`**: Replaced old "contact your administrator" stub with a max-w-md card that renders `<SignUpForm>`. Passes `searchParams` promise to the form for promo pre-fill.

**`onboarding/welcome/page.tsx`**: Success confirmation page — green check icon, copy about email verification, "Go to dashboard" CTA. No auth guard (accessed immediately after redirect, before session fully propagates).

**`middleware.ts`**: Added `/onboarding/welcome` and `/api/email-confirm` to `PUBLIC_PATHS`. Both routes must be unauthenticated: the welcome page is hit moments after signup, and the email-confirm route handler validates its own token.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed actions.ts → actions.tsx**
- **Found during:** Task 1
- **Issue:** `AccountExistsEmail` is a JSX component defined inline in the action file. TypeScript cannot parse JSX in `.ts` files — the em dash character in JSX text caused parse errors on tsc run.
- **Fix:** Renamed to `actions.tsx`; updated imports resolve without changes (no extension in import paths).
- **Files modified:** `apps/web/src/app/(auth)/sign-up/actions.tsx`
- **Commit:** efe5ece

## Self-Check

**Files created/modified:**
- `apps/web/src/app/(auth)/sign-up/actions.tsx` — FOUND
- `apps/web/src/app/(auth)/sign-up/sign-up-form.tsx` — FOUND
- `apps/web/src/app/onboarding/welcome/page.tsx` — FOUND
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — FOUND (modified)
- `apps/web/src/middleware.ts` — FOUND (modified)

**Commits:**
- `efe5ece` — feat(48-02): signup page, server action, welcome page, middleware PUBLIC_PATHS

**TypeScript:** `npx tsc --noEmit` from apps/web — zero errors.

**Middleware verification:**
- `/onboarding/welcome` in PUBLIC_PATHS — line 61
- `/api/email-confirm` in PUBLIC_PATHS — line 62

## Self-Check: PASSED
