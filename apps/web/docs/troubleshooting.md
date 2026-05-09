# Web App Troubleshooting Guide

Common failure modes for the DriveCommand Next.js web app, their causes, and fixes.

---

## 1. Prisma Migration Drift

**Symptoms:**
- Prisma client throws errors about unknown columns or tables
- `npx prisma validate` reports schema mismatch
- Runtime errors like `column X does not exist` or `relation X does not exist`
- Queries return unexpected null values where data should exist

**Cause:**
The Prisma schema (`prisma/schema.prisma`) is out of sync with the actual database state. This happens when:
- A manual column or table was added directly in Supabase Dashboard or via SQL editor
- A migration was partially applied or rolled back
- A developer applied a migration locally but it was not pushed to production
- The migration history in `_prisma_migrations` is out of sync

**Fix:**

For development (local database):
```bash
cd apps/web

# Inspect differences between schema and database
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --shadow-database-url $SHADOW_DATABASE_URL

# Push schema directly (dev only — skips migration history)
npx prisma db push

# Regenerate the Prisma client
npx prisma generate
```

For production (Supabase):
```bash
# Deploy pending migrations
npx prisma migrate deploy

# Regenerate client
npx prisma generate
```

**Prevention:** Never modify the production database schema via the Supabase Dashboard directly. Always create migrations via `npx prisma migrate dev --name description`.

---

## 2. TypeScript Errors on Vercel Deploy

**Symptoms:**
- Local `npm run dev` works fine
- Vercel build fails with TypeScript compilation errors
- Error messages in Vercel build logs like `Type 'X' is not assignable to type 'Y'`

**Cause:**
Vercel runs `next build` during deployment, which includes TypeScript type checking. Errors that are suppressed or not caught by your local editor may still fail the build.

**Fix:**
Always run a local type check before deploying:

```bash
cd apps/web
npx tsc --noEmit
```

Fix all reported errors, then deploy:

```bash
vercel --prod
```

**Prevention:** Run `npx tsc --noEmit` as part of your pre-deploy checklist. Never use `// @ts-ignore` or `as any` without a comment explaining why it's necessary.

---

## 3. RLS Blocking Queries (Empty Results or 403)

**Symptoms:**
- Database queries return empty arrays when data should exist
- API routes return 403 or empty data for authenticated users
- Queries work in Prisma Studio (which connects with a superuser) but not via API

**Cause:**
Supabase Row-Level Security (RLS) policies block the query. This happens when:
- A new route or data access pattern doesn't include the `bypass_rls` transaction block
- The `tenantId` in the WHERE clause doesn't match the authenticated user's tenant
- A new table was created without RLS policies being applied

**Fix:**
Check that the route uses the `bypass_rls` pattern:

```typescript
const data = await prisma.$transaction(async (tx) => {
  // This MUST be the first line of every mobile API transaction
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`

  return tx.someModel.findMany({
    where: { tenantId }, // Always filter by tenantId
  })
}, TX_OPTIONS)
```

For web routes (which use session-cookie auth), verify the session middleware is populating `tenantId` correctly and that the WHERE clause includes it.

**Debugging RLS issues:**
```sql
-- Run in Supabase SQL editor to check if RLS is blocking
SELECT current_setting('app.bypass_rls', TRUE);

-- Test a query with RLS bypassed
SET app.bypass_rls = 'on';
SELECT * FROM "Load" WHERE "tenantId" = 'your-tenant-id';
```

---

## 4. Environment Variable Issues

**Symptoms:**
- Runtime errors: `Cannot read property 'X' of undefined` on env-related code
- `process.env.SOME_VAR` is `undefined` at runtime
- Features that require secrets (email sending, S3 uploads, Supabase) silently fail or throw

**Cause:**
- Missing entries in `.env.local` for local development
- Variable added to `.env.local` but not to Vercel's environment variables dashboard
- Variable name typo (case-sensitive)
- `NEXT_PUBLIC_` prefix missing for client-side variables

**Fix:**

Check that all required variables from `.env.example` are present:
```bash
# Compare your .env.local against the example
diff .env.example .env.local
```

For production, verify in the Vercel dashboard:
1. Go to your Vercel project → Settings → Environment Variables
2. Check that all variables from `.env.example` are present
3. After adding or changing variables, redeploy:

```bash
vercel --prod
```

**Note:** `NEXT_PUBLIC_*` variables are embedded at build time. Changes to them require a full redeploy even if you update them in the Vercel dashboard.

---

## 5. Middleware Redirect Loops

**Symptoms:**
- Browser shows "Too many redirects" or ERR_TOO_MANY_REDIRECTS
- A new route immediately redirects back to login even when authenticated
- A new API route that should be public requires authentication (401)

**Cause:**
The `middleware.ts` file contains a `PUBLIC_PATHS` array. Any path not in this array is treated as protected. When a new route (e.g., a new API endpoint, webhook, or public page) is added without updating `PUBLIC_PATHS`, the middleware redirects or returns 401.

**Fix:**

Open `apps/web/src/middleware.ts` and find the `PUBLIC_PATHS` array:

```typescript
const PUBLIC_PATHS = [
  '/sign-in',
  '/api/auth',
  '/api/mobile',    // All mobile API routes are public to session middleware
  '/api/health',
  // ... add your new path here
]
```

Add the new path and redeploy.

**Common paths that need to be public:**
- New `/api/mobile/*` endpoints (already covered by the `/api/mobile` prefix)
- Webhook endpoints
- Public landing pages
- Accept-invitation pages

---

## 6. Supabase Connection Errors

**Symptoms:**
- `PrismaClientInitializationError: Can't reach database server`
- `Error: Connection pool timeout`
- API routes hang indefinitely then return 500

**Cause:**
- Wrong `DATABASE_URL` or `DIRECT_URL` in environment variables
- Supabase project is paused (free tier projects pause after inactivity)
- Connection pool exhausted due to too many concurrent connections or a connection leak
- The Prisma client is being instantiated on every request instead of being a singleton

**Fix:**

For a paused Supabase project:
1. Go to your Supabase project dashboard
2. If shown a "Resume project" banner, click it and wait ~30 seconds for the database to start

For connection pool issues:
```bash
# Check current Prisma client setup — should be a singleton
cat apps/web/src/lib/db/prisma.ts
```

The Prisma client should be a singleton using the global pattern:
```typescript
// In apps/web/src/lib/db/prisma.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

For incorrect connection strings, verify in Vercel dashboard and check that `DATABASE_URL` uses the connection pooler URL from Supabase (port 6543, not 5432 for pooled connections).

---

## 7. Rate Limiting Errors (429)

**Symptoms:**
- API returns `429 Too Many Requests`
- Mobile app shows rate limit error messages
- Specific routes stop responding after rapid repeated calls

**Cause:**
The mobile API routes use a Redis-based rate limiter (`mobileLimiter`). The rate limit is triggered when a user makes too many requests in a short window.

**Fix:**

In development, if Redis is not running, rate limiting may throw errors or silently fail depending on the configuration. Verify:

```bash
# Check if Redis is running locally
redis-cli ping
# Should return: PONG
```

If Redis is not available locally, the `applyRateLimit` function should gracefully fall through (check `apps/web/src/lib/rate-limit.ts` for the fallback behavior).

For production rate limit issues:
- Check that `REDIS_URL` is set in Vercel environment variables
- The mobile `mobileLimiter` is configured for reasonable limits — if legitimate usage is hitting the limit, the limit thresholds can be adjusted in `apps/web/src/lib/rate-limit.ts`
- A warning is logged if Redis is not configured in production: "Redis URL not configured — rate limiting disabled"

**Checking rate limit config:**
```bash
grep -n "mobileLimiter\|applyRateLimit" apps/web/src/lib/rate-limit.ts
```
