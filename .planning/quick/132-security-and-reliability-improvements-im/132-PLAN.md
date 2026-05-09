# Quick Task 132 — Security & Reliability Improvements Plan

## Goal

Implement all 15 audit items from the DriveCommand security/reliability review, sequenced by risk tier to ensure zero regressions. The web app and mobile app must remain fully functional after every wave.

## Platform Safety Rules

1. **Shared packages are READ-ONLY in this plan.** `packages/types` and `packages/validation` source files MUST NOT be modified. Tests may import from them (read-only consumers).
2. **Every wave ends with a TypeScript check:** `cd apps/web && npx tsc --noEmit` AND `cd apps/mobile && npx tsc --noEmit` (if shared packages were touched — they will not be in this plan).
3. **Mobile app (`apps/mobile/`) is only touched in Wave 6, Item 13** (Jest config setup). All other waves are web-only (`apps/web/`).
4. **No changes to Prisma schema** — all type fixes are wrapper/cast improvements in TypeScript only.
5. **`.gitignore` changes** apply at repo root level. Verify no tracked files need untracking.

## Execution Waves

---

### Wave 1 — Critical / Zero-Risk (Items 1, 2)

**Goal:** Ensure no secrets are exposed and .env files are properly ignored.

#### Item 1: Verify .env files are not tracked in git

- **Files:** (verification only — no changes needed)
- **Current state:** `.gitignore` at repo root already contains `.env`, `.env*.local`, and `.env.local` entries (lines 39-41). `git ls-files --cached` confirms NO `.env` files are tracked.
- **Action:** Verify with `git ls-files --cached | grep '\.env'` — should return only `apps/web/.env.example`. If any actual `.env` files appear tracked, run `git rm --cached <file>` to untrack them.
- **Safety:** Zero risk — read-only verification.
- **Acceptance test:** `git ls-files --cached | grep '\.env'` returns only `.env.example` files.

#### Item 2: Rotate/audit credentials in apps/web/.env

- **Files:** `apps/web/.env`, `apps/web/.env.local`
- **Action:** These files exist on disk but are NOT tracked in git (confirmed). No git history exposure. However, the executor should:
  1. Print a reminder to the user that if these files were EVER committed in git history, credentials should be rotated (DATABASE_URL, SUPABASE keys, etc.).
  2. Verify `apps/web/.env.example` contains only placeholder values (no real secrets).
  3. Check git log for any historical commits of `.env` files: `git log --all --diff-filter=A -- "*.env" "*.env.local"`. If any found, warn user to rotate those credentials.
- **Safety:** Zero risk — verification and user advisory only.
- **Acceptance test:** `git log --all --diff-filter=A -- "apps/web/.env" "apps/web/.env.local" "apps/mobile/.env.local"` returns no results (files were never committed), OR user is warned to rotate.

---

### Wave 2 — Isolated Web Infrastructure (Items 3, 4, 7, 8)

**Goal:** Add CSRF protection, structured logging, unhandled rejection handler, and bypass_rls documentation.

#### Item 3: Add CSRF protection via Origin header validation

- **Files to create:** `apps/web/src/lib/security/csrf.ts`
- **Files to modify:** `apps/web/src/middleware.ts`
- **Action:**
  1. Create `apps/web/src/lib/security/csrf.ts` with a function `validateOrigin(request: NextRequest): boolean` that:
     - Extracts the `Origin` header from the request.
     - Compares against allowed origins: `process.env.NEXT_PUBLIC_APP_URL`, `process.env.VERCEL_URL` (with `https://` prefix), and `http://localhost:3000` (dev).
     - Returns `true` if Origin matches or if the request is a GET/HEAD/OPTIONS (safe methods).
     - Returns `false` if Origin is missing or mismatched on POST/PUT/DELETE/PATCH.
  2. In `apps/web/src/middleware.ts`, after the public path check (line 66-68) and before the Supabase client creation (line 71), add:
     ```
     // CSRF: validate Origin header on state-changing requests
     if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
       // Skip CSRF for mobile API routes (use Bearer tokens, not cookies)
       if (!pathname.startsWith('/api/mobile/') && !pathname.startsWith('/api/gps/')) {
         if (!validateOrigin(request)) {
           return new NextResponse('Forbidden', { status: 403 });
         }
       }
     }
     ```
  3. Skip CSRF for `/api/mobile/*` routes (they use Bearer token auth, not cookies) and `/api/gps/*` (device GPS reports).
  4. Skip CSRF for `/api/webhooks` and `/api/cron/*` (server-to-server calls).
- **Why safe:** Only affects cookie-authenticated POST/PUT/DELETE routes on the web app. Mobile API routes are excluded. GET requests are unaffected.
- **Acceptance test:** `curl -X POST http://localhost:3000/api/auth/login -H "Origin: https://evil.com"` returns 403. Normal browser requests from the app domain succeed. Mobile API routes with Bearer tokens still work (no Origin check).

#### Item 4: Structured logging — replace console.log/error with logger wrapper

- **Files to create:** `apps/web/src/lib/logger.ts`
- **Files to modify:** ~119 files across `apps/web/src/` (see list below)
- **Action:**
  1. Create `apps/web/src/lib/logger.ts`:
     ```typescript
     import * as Sentry from '@sentry/nextjs';

     type LogLevel = 'debug' | 'info' | 'warn' | 'error';

     function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
       const timestamp = new Date().toISOString();
       const ctx = context ? ` ${JSON.stringify(context)}` : '';
       return `[${timestamp}] ${level.toUpperCase()}: ${message}${ctx}`;
     }

     export const logger = {
       debug(message: string, context?: Record<string, unknown>) {
         if (process.env.NODE_ENV === 'development') {
           console.debug(formatMessage('debug', message, context));
         }
       },
       info(message: string, context?: Record<string, unknown>) {
         console.log(formatMessage('info', message, context));
       },
       warn(message: string, context?: Record<string, unknown>) {
         console.warn(formatMessage('warn', message, context));
         Sentry.captureMessage(message, { level: 'warning', extra: context });
       },
       error(message: string, error?: unknown, context?: Record<string, unknown>) {
         const errorObj = error instanceof Error ? error : new Error(String(error ?? message));
         console.error(formatMessage('error', message, context), errorObj);
         Sentry.captureException(errorObj, { extra: { ...context, originalMessage: message } });
       },
     };
     ```
  2. Find-and-replace across `apps/web/src/`:
     - `console.error('...',` err `)` -> `logger.error('...', err)`
     - `console.error('...')` (no error object) -> `logger.error('...')`
     - `console.log('...')` -> `logger.info('...')` (or `logger.debug(...)` for verbose/dev-only messages)
     - `console.warn(...)` -> `logger.warn(...)`
     - Add `import { logger } from '@/lib/logger';` to each modified file.
  3. There are 226 occurrences across 119 files. Process systematically — actions files first, then API routes, then components, then lib/.
  4. Skip files in `src/generated/` (auto-generated Prisma code).
- **Why safe:** Purely a logging wrapper change. Same output in dev, added Sentry forwarding in prod. No behavioral changes to any business logic.
- **Acceptance test:** `grep -r "console\.\(log\|error\|warn\)" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "generated/" | grep -v "logger.ts"` returns 0 results (all replaced). App still builds: `cd apps/web && npx next build`.

#### Item 7: Add unhandledRejection handler in instrumentation.ts

- **Files to create:** `apps/web/src/instrumentation.ts`
- **Action:**
  1. Create `apps/web/src/instrumentation.ts` (Next.js instrumentation hook):
     ```typescript
     import * as Sentry from '@sentry/nextjs';

     export async function register() {
       // Sentry configs are loaded via sentry.*.config.ts files
       // This hook adds process-level error handling

       if (process.env.NEXT_RUNTIME === 'nodejs') {
         process.on('unhandledRejection', (reason, promise) => {
           const error = reason instanceof Error ? reason : new Error(String(reason));
           console.error('[FATAL] Unhandled promise rejection:', error);
           Sentry.captureException(error, {
             extra: { type: 'unhandledRejection' },
           });
         });

         process.on('uncaughtException', (error) => {
           console.error('[FATAL] Uncaught exception:', error);
           Sentry.captureException(error, {
             extra: { type: 'uncaughtException' },
           });
           // Let Node.js exit naturally after Sentry flush
         });
       }
     }
     ```
  2. Verify `next.config.ts` does NOT already set `experimental.instrumentationHook` (Next.js 15+ enables it by default).
- **Why safe:** Instrumentation hook runs once at server startup. Only adds error catching — cannot break existing functionality.
- **Acceptance test:** `cd apps/web && npx next build` succeeds. File exists at `apps/web/src/instrumentation.ts`.

#### Item 8: Audit and document all bypass_rls usage with JSDoc

- **Files to modify:** 51 files that use `bypass_rls` (see grep results). Key files:
  - `apps/web/src/lib/auth/server.ts` (getCurrentUser)
  - `apps/web/src/lib/db/repositories/tenant.repository.ts` (3 usages)
  - `apps/web/src/actions/support-tickets.ts` (9 usages — cross-tenant support)
  - `apps/web/src/lib/geofencing/geofence-check.ts` (8 usages — system-level GPS processing)
  - `apps/web/src/app/api/cron/send-reminders/route.ts` (1 usage — cross-tenant cron)
  - `apps/web/src/app/api/auth/accept-invitation/route.ts` (4 usages — pre-tenant user creation)
  - `apps/web/src/app/(driver)/layout.tsx` (1 usage — driver session bootstrap)
  - Plus ~35 mobile API route handlers under `apps/web/src/app/api/mobile/`
- **Action:**
  1. For each `bypass_rls` usage, add a JSDoc comment ABOVE the transaction block explaining:
     - **WHY** RLS is bypassed (e.g., "Cross-tenant query: support tickets span all tenants", "System operation: cron job processes all tenants", "Pre-auth: user not yet assigned to a tenant").
     - **SCOPE** what data is accessed (e.g., "Reads SupportTicket across tenants", "Writes GPSLocation for any tenant").
     - **SAFETY** why this is acceptable (e.g., "Gated by requireAuth + isSystemAdmin check above", "Gated by validateMobileToken — only accesses own tenant's data").
  2. Categorize each usage into one of these patterns and use consistent JSDoc format:
     - `@bypass_rls reason: cross-tenant` — SupportTickets, cron jobs, system admin operations
     - `@bypass_rls reason: pre-auth` — Invitation acceptance, onboarding before tenant assignment
     - `@bypass_rls reason: system-operation` — GPS processing, push notifications, geofencing
     - `@bypass_rls reason: mobile-api` — Mobile routes that set tenant context from JWT instead of RLS extension
  3. For mobile API routes: these bypass RLS because they use `validateMobileToken()` to extract `tenantId` from the JWT and then set it via `set_config('app.bypass_rls')` + `set_config('app.current_tenant_id')`. Document this pattern once in a comment at the top of a shared helper, then reference it.
- **Why safe:** JSDoc comments only — zero code changes.
- **Acceptance test:** `grep -B2 "bypass_rls" apps/web/src/lib/auth/server.ts` shows JSDoc comment. Spot-check 5 other files. `cd apps/web && npx tsc --noEmit` passes.

---

### Wave 3 — Performance & Quality (Items 9, 10, 11)

**Goal:** Optimize dashboard queries, replace raw img tags, reduce client boundary sprawl.

#### Item 9: Profile and optimize dashboard server action queries

- **Files to modify:**
  - `apps/web/src/app/(owner)/actions/dashboard.ts` (main dashboard queries)
  - `apps/web/src/app/(owner)/dashboard/page.tsx` (4 console.log calls — already addressed by Item 4)
  - `apps/web/src/app/api/mobile/owner/dashboard/route.ts` (mobile dashboard)
  - `apps/web/src/app/api/mobile/driver/dashboard/route.ts` (driver dashboard)
- **Action:**
  1. Read `apps/web/src/app/(owner)/actions/dashboard.ts` and identify N+1 query patterns. Common patterns to look for:
     - Sequential queries that could be `Promise.all()`
     - Fetching related data in a loop instead of using `include` or `_count`
     - Missing `select` clauses (fetching all columns when only a few are needed)
  2. Add timing instrumentation using `performance.now()` (or `logger.info` from Item 4) around each major query block:
     ```typescript
     const start = performance.now();
     const result = await db.truck.findMany({ ... });
     logger.debug('dashboard: trucks query', { durationMs: Math.round(performance.now() - start) });
     ```
  3. Apply optimizations found:
     - Parallelize independent queries with `Promise.all()`
     - Add `select` to limit columns where full model is not needed
     - Replace N+1 with `include` for related data
  4. Apply same analysis to mobile dashboard routes.
- **Why safe:** Query optimization only. Same data returned, faster. If `select` narrows columns, verify all consumers use only the selected fields.
- **Acceptance test:** Dashboard loads without errors. Timing logs visible in dev console. `cd apps/web && npx tsc --noEmit` passes.

#### Item 10: Replace raw `<img>` tags with next/image

- **Files to modify:** `apps/web/src/app/(admin)/admin-support/ticket-list.tsx` (line 326)
- **Action:**
  1. Only 1 file uses raw `<img>` — the admin support ticket list screenshot display.
  2. Replace:
     ```tsx
     <img src={screenshotUrl} alt="Full page screenshot" className="w-full rounded-md" />
     ```
     With:
     ```tsx
     import Image from 'next/image';
     // ... in JSX:
     <Image src={screenshotUrl} alt="Full page screenshot" width={800} height={600} className="w-full rounded-md" unoptimized />
     ```
  3. Use `unoptimized` because screenshot URLs are dynamic (external S3/Supabase storage URLs that change per ticket). The `next/image` component still provides lazy loading and proper HTML semantics.
  4. If the screenshot URL is from an external domain, add that domain to `images.remotePatterns` in `apps/web/next.config.ts`.
- **Why safe:** Single file change, purely presentational. `unoptimized` means no image optimization pipeline changes.
- **Acceptance test:** Admin support page loads, screenshots render correctly. No console warnings about missing image config.

#### Item 11: Reduce "use client" boundary sprawl

- **Files to audit:** 21 files currently have `"use client"` directive.
- **Current state:** Only 21 files — NOT the 162 claimed in the audit. This is actually very lean already. Breakdown:
  - `components/ui/*` (11 files) — shadcn/ui components, MUST keep "use client" (they use React hooks).
  - `components/navigation/*` (3 files) — sidebar, shell, user-menu — use client state/effects, MUST keep.
  - `components/landing/*` (2 files) — landing page + fade-in animation — landing-page.tsx could potentially be server component.
  - `lib/auth/*` (2 files) — auth-context.tsx (context provider) and guards.tsx (client guard) — MUST keep.
  - `app/(auth)/*` (2 files) — sign-in and accept-invitation pages — use form state, MUST keep.
  - `app/(admin)/admin-support/ticket-list.tsx` (1 file) — client interactivity, MUST keep.
- **Action:**
  1. Audit `apps/web/src/components/landing/landing-page.tsx` — if it uses hooks (useState, useEffect, onClick), keep "use client". If it's purely presentational, remove the directive to make it a server component.
  2. For all other files: keep "use client" — they legitimately need it.
  3. Document the audit result as a comment in the PR description: "Audited 21 'use client' files. All are legitimate client components except possibly landing-page.tsx."
- **Why safe:** Removing "use client" from a file that doesn't need it is safe (it becomes a server component). If wrong, TypeScript will error on hook usage.
- **Acceptance test:** `cd apps/web && npx next build` succeeds. Landing page renders correctly.

---

### Wave 4 — TypeScript / Type Safety (Item 5)

**Goal:** Fix Prisma `withTenantRLS` type inference to eliminate 63 `@ts-ignore` comments.

#### Item 5: Create a typed wrapper for withTenantRLS extended Prisma client

- **Files to create:** `apps/web/src/lib/db/tenant-client.ts`
- **Files to modify:**
  - `apps/web/src/lib/db/repositories/base.repository.ts`
  - `apps/web/src/lib/db/repositories/truck.repository.ts` (6 @ts-ignore)
  - `apps/web/src/lib/db/repositories/document.repository.ts` (8 @ts-ignore)
  - `apps/web/src/lib/notifications/notification-deduplication.ts` (4 @ts-ignore)
  - `apps/web/src/lib/notifications/check-upcoming-maintenance.ts` (2 @ts-ignore)
  - `apps/web/src/lib/notifications/check-expiring-driver-documents.ts` (2 @ts-ignore)
  - `apps/web/src/lib/notifications/check-expiring-documents.ts` (2 @ts-ignore)
  - `apps/web/src/app/(owner)/actions/tags.ts` (6 @ts-ignore)
  - `apps/web/src/app/(owner)/actions/maintenance.ts` (@ts-ignore)
  - `apps/web/src/app/(owner)/actions/dashboard.ts` (@ts-ignore)
  - `apps/web/src/app/(owner)/actions/notifications.ts` (@ts-ignore)
  - Plus ~20 other action files with `as any` casts related to Prisma enums
- **Action:**
  1. The root problem: `prisma.$extends(withTenantRLS(tenantId))` returns a type that TypeScript cannot fully infer — it loses model-level type info. This is a known Prisma 7 issue with `$extends`.
  2. Create `apps/web/src/lib/db/tenant-client.ts`:
     ```typescript
     import { PrismaClient } from '@/generated/prisma/client';
     import { prisma } from './prisma';
     import { withTenantRLS } from './extensions/tenant-rls';

     /**
      * Create a tenant-scoped Prisma client with full type inference.
      *
      * Workaround for Prisma 7's $extends type inference issue:
      * Instead of using the extended client's inferred type (which loses model types),
      * we cast it back to PrismaClient. This is safe because withTenantRLS only adds
      * a query middleware (set_config before each query) — it does not change the
      * client's API surface.
      */
     export function createTenantClient(tenantId: string): PrismaClient {
       return prisma.$extends(withTenantRLS(tenantId)) as unknown as PrismaClient;
     }
     ```
  3. Update `apps/web/src/lib/db/repositories/base.repository.ts`:
     ```typescript
     import { PrismaClient } from '@/generated/prisma/client';
     import { createTenantClient } from '../tenant-client';

     export class TenantRepository {
       protected db: PrismaClient;

       constructor(tenantId: string) {
         this.db = createTenantClient(tenantId);
       }
     }
     ```
  4. Update all repository files (`truck.repository.ts`, `document.repository.ts`) — remove every `// @ts-ignore` comment. The `this.db` is now typed as `PrismaClient` so `this.db.truck.findMany(...)` etc. will have full type inference.
  5. Update notification helper files — they create their own tenant client inline. Replace:
     ```typescript
     const db = prisma.$extends(withTenantRLS(tenantId));
     // @ts-ignore
     const results = await db.model.findMany(...);
     ```
     With:
     ```typescript
     const db = createTenantClient(tenantId);
     const results = await db.model.findMany(...);
     ```
  6. Update action files (`tags.ts`, `maintenance.ts`, `dashboard.ts`, `notifications.ts`) similarly.
  7. For `as any` casts on Prisma enum values (e.g., `status: newStatus as any`): these are a separate issue — Zod-validated strings being passed to Prisma which expects enum types. Fix by importing the enum from Prisma:
     ```typescript
     import { RouteStatus } from '@/generated/prisma/client';
     // then: status: newStatus as RouteStatus
     ```
     This replaces `as any` with a specific enum cast that TypeScript can verify.
  8. For `as any[]` casts on raw SQL results (`$queryRaw`): these are legitimate — raw SQL results are untyped. Replace with a typed interface:
     ```typescript
     interface FuelRow { truckId: string; totalGallons: number; /* ... */ }
     const results = await db.$queryRaw<FuelRow[]>`SELECT ...`;
     ```
- **Why safe:** All changes are web-only TypeScript type improvements. The `as unknown as PrismaClient` cast is safe because `withTenantRLS` only wraps queries in a transaction with `set_config` — it does not add/remove any client methods. No runtime behavior changes.
- **Watch out for:** If any code uses methods added by the extension (there are none — `withTenantRLS` only adds a query middleware), the cast would hide that. Verify with `npx tsc --noEmit`.
- **Acceptance test:** `cd apps/web && npx tsc --noEmit` passes with zero errors. `grep -rn "@ts-ignore" apps/web/src/ | grep -v generated/ | grep -v node_modules/` returns 0 results. `grep -c "as any" apps/web/src/**/*.ts` is significantly reduced (goal: eliminate all Prisma-related `as any`, keep only legitimate ones like ReactPDF `as any`).

---

### Wave 5 — Documentation & Low-Risk (Items 12, 14, 15)

**Goal:** Generate OpenAPI docs, document EAS env vars, add ISR to landing page.

#### Item 12: Generate OpenAPI documentation from Zod schemas

- **Files to create:** `apps/web/src/lib/openapi/index.ts`, `apps/web/scripts/generate-openapi.ts`
- **Dependencies to install:** `@asteasolutions/zod-to-openapi` in `apps/web/`
- **Action:**
  1. Install: `cd apps/web && npm install @asteasolutions/zod-to-openapi`
  2. Create `apps/web/src/lib/openapi/index.ts` that:
     - Imports Zod schemas from `packages/validation/src/*.ts` (read-only — no changes to the package)
     - Registers each schema with `OpenAPIRegistry` from `zod-to-openapi`
     - Defines API paths for mobile endpoints (`/api/mobile/driver/*`, `/api/mobile/owner/*`)
     - Generates the OpenAPI 3.1 spec as JSON
  3. Create `apps/web/scripts/generate-openapi.ts` — a script runnable via `npx tsx scripts/generate-openapi.ts` that writes `apps/web/public/openapi.json`.
  4. Add a `"generate:openapi"` script to `apps/web/package.json`.
  5. Scope to mobile API routes only (they are the public-ish contract for the mobile app). Server actions are internal and don't need OpenAPI docs.
- **Why safe:** Adds a dev-time script and a new dependency. Does not modify any existing code or shared packages. `packages/validation` is imported read-only.
- **Acceptance test:** `cd apps/web && npx tsx scripts/generate-openapi.ts` produces `public/openapi.json` with valid OpenAPI 3.1 content. Paste into https://editor.swagger.io to verify.

#### Item 14: Document EAS environment variable strategy

- **Files to create:** `apps/mobile/docs/eas-environment-variables.md`
- **Files to modify:** `apps/mobile/eas.json` (add comments via a companion doc — JSON doesn't support comments)
- **Action:**
  1. Create `apps/mobile/docs/eas-environment-variables.md` documenting:
     - **Build profiles:** `development` (localhost:3000), `preview` (staging URL), `production` (production URL)
     - **Required env vars:** `EXPO_PUBLIC_API_URL` — the only env var currently used
     - **How to set secrets:** `eas secret:create --name SECRET_NAME --value "..." --scope project`
     - **Production checklist:** Update `EXPO_PUBLIC_API_URL` in `eas.json` preview/production profiles from placeholder to real URL before first build
     - **Submit config:** Apple/Google credentials needed for store submission (reference to `eas.json` submit section)
  2. Note in the doc that `eas.json` currently has placeholder values (`your-production-url.vercel.app`, `your-apple-id@email.com`, etc.) that MUST be replaced before first production build.
- **Why safe:** Documentation only. No code changes.
- **Acceptance test:** File exists at `apps/mobile/docs/eas-environment-variables.md`. Content covers all EAS build profiles and their env vars.

#### Item 15: Add ISR revalidation to public/marketing pages

- **Files to modify:** `apps/web/src/app/page.tsx` (landing/home page)
- **Action:**
  1. The landing page (`apps/web/src/app/page.tsx`) is currently dynamically rendered (it calls `getSession()` which reads cookies).
  2. The page cannot use static ISR because it conditionally redirects authenticated users. This is correct behavior — it MUST be dynamic.
  3. However, the `LandingPage` component itself (`apps/web/src/components/landing/landing-page.tsx`) is static content. It's already a client component for animations.
  4. **Revised action:** Add a separate static route for marketing content if needed in the future. For now, the current architecture is correct — the root page must be dynamic to handle auth redirects.
  5. If there are other purely static pages (e.g., `/terms`, `/privacy`), add `export const revalidate = 3600;` (1 hour ISR) to those pages.
  6. Check for existence of these pages: `ls apps/web/src/app/(public)/` or similar. If they don't exist, skip this item — there are no purely static marketing pages to optimize.
- **Why safe:** Adding `revalidate` export to a static page is a Next.js performance optimization with no behavioral change.
- **Acceptance test:** If static pages exist, verify they have `revalidate` export. If none exist, document that this item is N/A — no static marketing pages to optimize.

---

### Wave 6 — Testing (Items 6, 13)

**Goal:** Add unit tests for critical auth/validation functions and set up mobile test infrastructure.

#### Item 6: Add unit tests for auth, validation, and rate limiting

- **Files to create:**
  - `apps/web/tests/unit/auth/require-auth.test.ts`
  - `apps/web/tests/unit/auth/require-role.test.ts`
  - `apps/web/tests/unit/auth/validate-mobile-token.test.ts`
  - `apps/web/tests/unit/validation/schemas.test.ts`
  - `apps/web/tests/unit/rate-limit.test.ts`
- **Files to reference (read-only):**
  - `apps/web/src/lib/auth/server.ts` (requireAuth, requireRole)
  - `apps/web/src/lib/auth/mobile-auth.ts` (validateMobileToken)
  - `apps/web/src/lib/rate-limit.ts` (authLimiter, gpsLimiter, mobileLimiter, applyRateLimit)
  - `packages/validation/src/*.ts` (Zod schemas — READ-ONLY import, no source changes)
- **Action:**
  1. Vitest is already configured (`apps/web/vitest.config.ts`), test dir: `apps/web/tests/**/*.test.ts`.
  2. **requireAuth tests** — mock `getSession` from `@/lib/auth/session`:
     - Returns userId when session exists
     - Throws "Unauthorized" when session is null
  3. **requireRole tests** — mock `getSession`:
     - Returns role when role is in allowedRoles
     - Throws "Unauthorized" when role is not in allowedRoles
     - Throws when session is null
  4. **validateMobileToken tests** — mock `createAdminClient` from `@/lib/supabase/admin`:
     - Returns MobileAuthContext when token is valid
     - Returns null when no Authorization header
     - Returns null when token is invalid (Supabase returns error)
     - Sets driverId when role is DRIVER
     - Does not set driverId when role is OWNER
  5. **Zod schema tests** — import schemas from `packages/validation` (read-only):
     - Test each schema's `.parse()` with valid data (should not throw)
     - Test each schema's `.safeParse()` with invalid data (should return success: false with specific error)
     - Cover at minimum: load schema, route schema, driver schema, truck schema, invoice schema
  6. **Rate limiter tests** — mock `@upstash/ratelimit` and `@upstash/redis`:
     - `applyRateLimit` returns null when limiter is null (dev mode)
     - `applyRateLimit` returns null when under limit (success: true)
     - `applyRateLimit` returns 429 NextResponse when over limit (success: false)
     - Verify Retry-After header is set on 429 response
  7. Use `vi.mock()` for all external dependencies. Tests must be fast (no DB, no network).
- **Why safe:** New test files only. No production code changes. Imports from `packages/validation` are read-only.
- **Acceptance test:** `cd apps/web && npx vitest run` passes all tests. `npx vitest run --coverage` shows coverage for auth and rate-limit modules.

#### Item 13: Add mobile unit test setup (Jest + React Native Testing Library)

- **Files to create:**
  - `apps/mobile/jest.config.js`
  - `apps/mobile/jest.setup.js`
  - `apps/mobile/tests/example.test.tsx`
- **Files to modify:** `apps/mobile/package.json` (add devDependencies and test script)
- **Action:**
  1. Install dev dependencies in `apps/mobile/`:
     ```
     cd apps/mobile && npx expo install -- --save-dev jest @testing-library/react-native @testing-library/jest-native jest-expo @types/jest
     ```
  2. Create `apps/mobile/jest.config.js`:
     ```javascript
     module.exports = {
       preset: 'jest-expo',
       setupFilesAfterSetup: ['./jest.setup.js'],
       transformIgnorePatterns: [
         'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|react-native-reanimated|react-native-mmkv))',
       ],
       moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
     };
     ```
  3. Create `apps/mobile/jest.setup.js`:
     ```javascript
     import '@testing-library/jest-native/extend-expect';
     ```
  4. Create `apps/mobile/tests/example.test.tsx` — a minimal test that renders a Text component and asserts it's visible.
  5. Add to `apps/mobile/package.json` scripts: `"test": "jest"`
- **Why safe:** Mobile-only changes. No shared package modifications. No web app changes.
- **Acceptance test:** `cd apps/mobile && npm test` runs and passes the example test.

---

## Tasks

The executor should process this plan wave-by-wave. Within each wave, items can be done in any order (they are independent of each other within the wave).

<task type="auto">
  <name>Task 1: Execute Waves 1-3 (Critical security, infrastructure, performance)</name>
  <files>
    apps/web/src/lib/security/csrf.ts
    apps/web/src/middleware.ts
    apps/web/src/lib/logger.ts
    apps/web/src/instrumentation.ts
    apps/web/src/app/(admin)/admin-support/ticket-list.tsx
    ~119 files for console.log replacement
    ~51 files for bypass_rls JSDoc comments
    apps/web/src/app/(owner)/actions/dashboard.ts
    apps/web/src/components/landing/landing-page.tsx
  </files>
  <action>
    Execute Items 1, 2 (verify .env safety), then Items 3, 4, 7, 8 (CSRF, logger, instrumentation, bypass_rls docs), then Items 9, 10, 11 (dashboard optimization, img replacement, use-client audit).
    Follow the specific instructions for each item above.
    After each wave, run: cd apps/web && npx tsc --noEmit
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit
    cd apps/web && npx next build
    grep -r "console\.\(log\|error\|warn\)" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v generated/ | grep -v logger.ts | wc -l (should be 0)
  </verify>
  <done>CSRF middleware active, all console.* calls replaced with logger, instrumentation.ts created, all bypass_rls sites documented with JSDoc, dashboard queries optimized, raw img replaced, use-client audit complete.</done>
</task>

<task type="auto">
  <name>Task 2: Execute Wave 4 (TypeScript type safety fixes)</name>
  <files>
    apps/web/src/lib/db/tenant-client.ts
    apps/web/src/lib/db/repositories/base.repository.ts
    apps/web/src/lib/db/repositories/truck.repository.ts
    apps/web/src/lib/db/repositories/document.repository.ts
    apps/web/src/lib/notifications/notification-deduplication.ts
    apps/web/src/lib/notifications/check-upcoming-maintenance.ts
    apps/web/src/lib/notifications/check-expiring-driver-documents.ts
    apps/web/src/lib/notifications/check-expiring-documents.ts
    apps/web/src/app/(owner)/actions/tags.ts
    apps/web/src/app/(owner)/actions/maintenance.ts
    apps/web/src/app/(owner)/actions/dashboard.ts
    apps/web/src/app/(owner)/actions/notifications.ts
    ~20 other action files with as-any enum casts
  </files>
  <action>
    Create createTenantClient wrapper. Update base repository. Replace all @ts-ignore and as-any Prisma-related casts. Follow Item 5 instructions above.
    CRITICAL: Do NOT touch any files in packages/types or packages/validation.
    After all changes: cd apps/web && npx tsc --noEmit
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit (zero errors)
    grep -rn "@ts-ignore" apps/web/src/ | grep -v generated/ | grep -v node_modules/ (should be 0)
  </verify>
  <done>Zero @ts-ignore comments in non-generated web app code. Prisma withTenantRLS has full type inference via createTenantClient wrapper. as-any casts replaced with specific enum types.</done>
</task>

<task type="auto">
  <name>Task 3: Execute Waves 5-6 (Documentation, OpenAPI, testing)</name>
  <files>
    apps/web/src/lib/openapi/index.ts
    apps/web/scripts/generate-openapi.ts
    apps/mobile/docs/eas-environment-variables.md
    apps/web/src/app/page.tsx (ISR check)
    apps/web/tests/unit/auth/require-auth.test.ts
    apps/web/tests/unit/auth/require-role.test.ts
    apps/web/tests/unit/auth/validate-mobile-token.test.ts
    apps/web/tests/unit/validation/schemas.test.ts
    apps/web/tests/unit/rate-limit.test.ts
    apps/mobile/jest.config.js
    apps/mobile/jest.setup.js
    apps/mobile/tests/example.test.tsx
  </files>
  <action>
    Execute Items 12 (OpenAPI), 14 (EAS docs), 15 (ISR — likely N/A), 6 (vitest unit tests), 13 (mobile Jest setup).
    Follow the specific instructions for each item above.
    Install @asteasolutions/zod-to-openapi in apps/web.
    Install jest-expo and testing-library in apps/mobile.
  </action>
  <verify>
    cd apps/web && npx vitest run (all tests pass)
    cd apps/web && npx tsx scripts/generate-openapi.ts (produces openapi.json)
    cd apps/mobile && npm test (example test passes)
    cd apps/web && npx tsc --noEmit
  </verify>
  <done>Unit tests exist and pass for auth, validation, and rate limiting. OpenAPI spec generated. EAS env vars documented. Mobile test infrastructure ready.</done>
</task>

## Success Criteria

1. **Security:** CSRF validation active on all cookie-auth mutation routes. No .env files in git history.
2. **Observability:** All console.log/error/warn replaced with structured logger that forwards to Sentry. Unhandled rejections caught.
3. **Type safety:** Zero `@ts-ignore` in non-generated code. `as any` reduced to only legitimate cases (raw SQL results, ReactPDF).
4. **Documentation:** All `bypass_rls` sites have JSDoc. EAS env vars documented. OpenAPI spec generated.
5. **Testing:** Vitest unit tests for auth, validation, rate limiting. Mobile Jest infrastructure ready.
6. **Performance:** Dashboard queries optimized. Raw `<img>` replaced with `next/image`.
7. **No regressions:** `cd apps/web && npx tsc --noEmit` passes. `cd apps/web && npx next build` succeeds. Mobile TypeScript compilation unaffected (no shared package changes).
