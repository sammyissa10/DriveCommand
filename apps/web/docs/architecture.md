# Architecture

This document describes DriveCommand's system design: how its three portals are structured, how tenants are isolated, how the middleware enforces access control, and how a typical request flows from browser to database.

---

## Monorepo Architecture

DriveCommand is a Turborepo monorepo. The web app (`apps/web`) is one of two apps:

```
drivecommand/
  apps/
    web/      # This app — Next.js 16, serves web portals AND mobile API
    mobile/   # Expo/React Native mobile app
  packages/
    types/        # @drivecommand/types — shared TypeScript interfaces
    validation/   # @drivecommand/validation — shared Zod schemas
    api-client/   # @drivecommand/api-client — mobile HTTP client
```

**The web app is the single backend.** It serves:
1. Web portals (owner, driver, sysadmin) via Next.js pages and server actions
2. REST API for the mobile app via `src/app/api/mobile/` route handlers

Mobile API routes are secured with Supabase JWT verification (not the custom session cookie used by web portals). See [Mobile app docs](../../mobile/docs/architecture.md) for mobile auth details.

---

## System Overview

DriveCommand is a Next.js App Router application with three distinct user portals sharing a single PostgreSQL database. Each portal is implemented as a route group under `src/app/`:

| Route Group | Portal | Users |
|---|---|---|
| `(owner)/` | Owner portal | Fleet owners and managers |
| `(driver)/` | Driver portal | Truck drivers |
| `(admin)/` | SysAdmin portal | DriveCommand internal staff |

All three portals share the same Prisma client, the same session cookie, and the same PostgreSQL database. Isolation between fleet operators is enforced at the database level with Row Level Security (RLS).

---

## Multi-Tenancy Design

Every fleet operator is a **Tenant** — one row in the `Tenant` table. All data entities (trucks, routes, drivers, loads, etc.) carry a `tenantId UUID` foreign key referencing `Tenant.id`.

### How tenant isolation is enforced

1. **Row Level Security (RLS)** is enforced at the PostgreSQL level via Supabase RLS policies. Every tenant-scoped table has a policy that checks `current_setting('app.tenant_id') = "tenantId"::text` on all operations (SELECT, INSERT, UPDATE, DELETE).

2. **`app.tenant_id` session variable** is set at the start of each API route or server action via:
   ```sql
   SELECT set_config('app.tenant_id', '<tenantId>', TRUE)
   ```
   The `TRUE` parameter scopes this setting to the current transaction only.

3. **Middleware injects `x-tenant-id`** as a request header from the validated session cookie. Server actions and API routes read this header to get the tenant ID without calling `getSession()` again.

### bypass_rls pattern

Some operations must bypass RLS because they run before a tenant context exists (login) or need to span tenants (sysadmin):

```typescript
// Set bypass_rls=on as the first statement in a transaction:
const [, user] = await prisma.$transaction([
  prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
  prisma.user.findUnique({ where: { id: session.userId } }),
]);
```

The RLS policy checks `current_setting('app.bypass_rls', TRUE) = 'on'` and permits access if true. The `TRUE` parameter ensures the bypass flag is scoped to the current transaction and does not leak across requests.

For `$queryRaw` calls (outside a transaction), RLS is bypassed entirely because `$queryRaw` runs as the database superuser.

---

## Middleware Flow

The middleware (`src/middleware.ts`) runs on every request except static assets. It enforces authentication, tenant context, and role-based routing.

**5-step flow:**

1. **Public paths pass through.** Requests to `/sign-in`, `/sign-up`, `/api/auth/*`, `/api/warmup`, `/api/webhooks`, `/track`, `/accept-invitation`, and static files (`/_next/static`, `/_next/image`, `/favicon.*`) skip all checks.

2. **Unauthenticated requests are redirected.** If no valid `session` cookie exists (or decryption fails), the user is redirected to `/sign-in?redirect_url=<original path>`.

3. **Authenticated users with no `tenantId` are redirected to `/onboarding`.** A session without a `tenantId` means the user exists but has not been assigned to a tenant yet (e.g., sysadmin in a broken state, or an edge case during tenant creation). API paths and `/onboarding` itself are excluded from this redirect.

4. **System admins are restricted to the admin portal.** If `session.isSystemAdmin` is true, the user may only access paths starting with `/admin`, `/admin-support`, `/admin-dashboard`, `/tenants`, `/unauthorized`, `/onboarding`, or `/api`. Any other path redirects to `/admin-support`.

5. **DRIVER role users are redirected away from owner paths.** If the session role is `DRIVER` and the requested path matches the `OWNER_PATHS` list (`/dashboard`, `/trucks`, `/drivers`, `/routes`, `/loads`, `/invoices`, `/payroll`, `/crm`, `/settings`, `/compliance`, `/ai-documents`, `/profit-predictor`, `/lane-analytics`, `/ifta`, `/live-map`, `/fuel`, `/safety`, `/tags`), the user is redirected to `/my-route`.

6. **Authenticated tenant users get `x-tenant-id` injected.** All authenticated requests that pass the above checks have `x-tenant-id: <tenantId>` added as a request header before being forwarded to the Next.js server.

---

## Request Lifecycle

A typical owner portal page request flows:

```
Browser
  → Middleware (validates session cookie, injects x-tenant-id header)
  → Next.js Server Component (calls getSession() for role/userId)
  → Server Action or API Route
      (reads x-tenant-id header, calls set_config to set tenant context)
      (runs Prisma query through RLS-filtered PostgreSQL)
  → Returns data to Server Component
  → Renders HTML to client
```

**Key points:**
- Server components call `getSession()` (cached per request with `React.cache()`) to read role and userId from the session cookie.
- Server actions call `requireAuth()` and `requireRole()` at the top of each function as defense-in-depth guards, even though middleware already enforces role routing.
- Prisma queries run through RLS — no explicit `WHERE tenantId = ?` is needed in most queries because RLS filters rows automatically once `app.tenant_id` is set.

---

## File Structure Overview

```
src/
  app/
    (owner)/       # Owner portal pages and server actions
    (driver)/      # Driver portal pages and server actions
    (admin)/       # SysAdmin portal pages
    api/           # API routes (auth, cron, GPS, documents, webhooks, etc.)
      mobile/      # REST API for mobile app (owner/*, driver/*, support/*)
  lib/
    auth/          # session.ts, server.ts, roles.ts
    db/            # prisma.ts (singleton Prisma client + connection pool)
    email/         # Resend client, email sender functions, templates
    notifications/ # Notification log utilities (idempotent email tracking)
    storage/       # S3/R2 file upload helpers (presigned URLs, multipart)
    finance/       # Revenue/expense calculation helpers (Decimal.js)
    safety/        # Safety event scoring utilities
    geo/           # Geofencing utilities (bounding-box state detection)
prisma/
  schema.prisma    # Single schema file — all models and enums
scripts/
  migrate.mjs      # Raw SQL migration runner (used in Vercel build command)
docs/              # Developer documentation (this directory)
```

---

## Key Design Decisions

**Next.js App Router server components** are used for initial data fetching. No client-side fetch on first load — data arrives already rendered. Client components are used only for interactivity (forms, modals, live maps, polling).

**Prisma with `@prisma/adapter-pg`** uses a singleton `pg.Pool` (max 5 connections) stored on `globalThis`. This survives Vercel's serverless module-level warm reuse between invocations, avoiding a new TCP handshake to Supabase on every request.

**`DATABASE_URL` must use Supabase's Session Mode pooler** on port **6543** (not 5432). Transaction mode drops connections after each transaction, which defeats pooling and causes `app.tenant_id` config to be lost.

**Custom AES-256-GCM session cookie** uses the Web Crypto API, which works in both Edge Runtime (middleware) and Node.js (server components). No third-party auth library is used — the implementation is in `src/lib/auth/session.ts` and is fully transparent.

**No Prisma migrations in production.** Schema changes are applied via `scripts/migrate.mjs`, which runs raw SQL migration files from a `migrations/` directory as part of the Vercel build command: `node scripts/migrate.mjs && prisma generate && next build`.

**Prisma client output** is `src/generated/prisma/` (not the default `node_modules`). This is required for Vercel deployment compatibility.
