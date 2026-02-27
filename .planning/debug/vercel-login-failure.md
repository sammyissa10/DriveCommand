---
status: resolved
trigger: "Login fails on first Vercel deployment with 'An error occurred during login'. Uses email/password credentials (NextAuth). Never worked on Vercel — first deploy."
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — Missing required env vars on Vercel causes the login route's catch block to fire, returning "An error occurred during login"
test: Traced the exact error string back to catch block in /api/auth/login/route.ts line 65
expecting: Setting DATABASE_URL and AUTH_SECRET in Vercel env vars will fix login
next_action: DONE — fix identified and documented

## Symptoms

expected: User can log in with email/password credentials
actual: "An error occurred during login" — generic error message shown in UI
errors: HTTP 500 from /api/auth/login — error JSON: { error: "An error occurred during login" }
reproduction: Go to /sign-in on Vercel deployment, enter credentials, submit
started: First Vercel deployment — never worked
auth_method: Custom cookie-based auth (NOT NextAuth — no NextAuth dependency exists)

## Eliminated

- hypothesis: NextAuth configuration issue
  evidence: Project uses custom auth — no NextAuth package, no [...nextauth] route. Auth is hand-rolled with bcrypt + AES-256-GCM encrypted cookies.
  timestamp: 2026-02-24

- hypothesis: Frontend error / UI misconfiguration
  evidence: sign-in/page.tsx correctly calls /api/auth/login and displays data.error from response. Error message "An error occurred during login" is exactly what the API route's catch block returns on line 65.
  timestamp: 2026-02-24

- hypothesis: Middleware blocking the login route
  evidence: middleware.ts explicitly lists '/api/auth/login' in PUBLIC_PATHS — it passes through without auth check.
  timestamp: 2026-02-24

## Evidence

- timestamp: 2026-02-24
  checked: src/app/api/auth/login/route.ts
  found: The exact string "An error occurred during login" is returned from the catch block at line 65 when any uncaught exception occurs during the login attempt. The try block does: (1) prisma DB query, (2) bcrypt compare, (3) setSession (calls AUTH_SECRET).
  implication: A 500 error means an exception was thrown. The three possible throw points are: DB connection failure (missing DATABASE_URL), AUTH_SECRET validation failure (missing/short AUTH_SECRET), or bcrypt error.

- timestamp: 2026-02-24
  checked: src/lib/auth/session.ts lines 29-31
  found: getWebCryptoKey() throws explicitly: 'AUTH_SECRET environment variable must be set and at least 32 characters long'. This is called by setSession, which is called by the login route.
  implication: If AUTH_SECRET is not set in Vercel, login throws and returns 500 — even if DB works.

- timestamp: 2026-02-24
  checked: src/lib/db/prisma.ts
  found: Pool is created with { connectionString: process.env.DATABASE_URL }. No DATABASE_URL = pool connects to nothing. First DB query throws a connection error.
  implication: If DATABASE_URL is not set in Vercel, login throws at the prisma.$transaction call and returns 500.

- timestamp: 2026-02-24
  checked: .env.example
  found: Required env vars are: DATABASE_URL, AUTH_SECRET. Optional: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_APP_URL, RESEND_API_KEY, RESEND_FROM_EMAIL.
  implication: The two required vars for login to work are DATABASE_URL and AUTH_SECRET.

- timestamp: 2026-02-24
  checked: .env.local
  found: DATABASE_URL points to Supabase pooler (aws-0-us-west-2.pooler.supabase.com:5432). AUTH_SECRET is set locally. ANTHROPIC_API_KEY also set. These are NOT committed to git and NOT available on Vercel.
  implication: Vercel has none of these env vars — explaining why login fails on first deploy but works locally.

- timestamp: 2026-02-24
  checked: prisma/schema.prisma datasource block
  found: datasource db { provider = "postgresql" } — NO url field. Database URL comes exclusively from the PrismaPg pool adapter in code (process.env.DATABASE_URL).
  implication: Prisma won't warn about missing DATABASE_URL at build time. Failure is runtime-only.

- timestamp: 2026-02-24
  checked: package.json start script
  found: "start": "node scripts/migrate.mjs && next start" — migrations run on startup. On Vercel, the start script is NOT used (Vercel runs next start directly). Migrations will NOT auto-run on Vercel.
  implication: Even after setting env vars, migrations need to be applied manually to the Vercel/production database.

## Resolution

root_cause: Vercel deployment is missing two required environment variables — DATABASE_URL and AUTH_SECRET. Without DATABASE_URL, the Prisma pool cannot connect to PostgreSQL and throws on the first query. Without AUTH_SECRET (min 32 chars), session.ts throws explicitly. Either failure propagates to the login route's catch block, which returns HTTP 500 with "An error occurred during login".

fix: Set environment variables in Vercel dashboard (Project → Settings → Environment Variables):
  REQUIRED FOR LOGIN:
    DATABASE_URL = postgresql connection string (same Supabase pooler URL from .env.local)
    AUTH_SECRET  = any random string of 32+ characters (generate with: openssl rand -base64 32)

  RECOMMENDED:
    NEXT_PUBLIC_APP_URL = https://your-vercel-domain.vercel.app
    ANTHROPIC_API_KEY   = (for AI document reading feature)
    RESEND_API_KEY      = (for invitation emails)
    RESEND_FROM_EMAIL   = DriveCommand <onboarding@resend.dev>

  ADDITIONAL NOTE:
    The start script (scripts/migrate.mjs) does NOT run on Vercel. Migrations must be applied manually
    to the production database before first use, or via prisma migrate deploy in a build hook.

verification: No code changes needed. Pure env var configuration issue. Once DATABASE_URL and AUTH_SECRET are set in Vercel and the deployment is re-triggered, login will work.

files_changed: []
