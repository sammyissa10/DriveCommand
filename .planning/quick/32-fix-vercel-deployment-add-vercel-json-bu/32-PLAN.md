---
phase: quick-32
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - vercel.json
  - .env.example
autonomous: true
must_haves:
  truths:
    - "Vercel deploy runs database migrations before building the app"
    - "All required env vars are documented with descriptions in .env.example"
  artifacts:
    - path: "vercel.json"
      provides: "Vercel build configuration with migration + generate + build"
      contains: "buildCommand"
    - path: ".env.example"
      provides: "Complete env var documentation for Vercel setup"
      contains: "DATABASE_URL"
  key_links:
    - from: "vercel.json"
      to: "scripts/migrate.mjs"
      via: "buildCommand references migrate script"
      pattern: "migrate"
---

<objective>
Fix Vercel deployment by adding a buildCommand to vercel.json that runs database migrations before the Next.js build, and update .env.example to document ALL required environment variables.

Purpose: Ensure migrations run automatically on every Vercel deploy, and give the user a complete reference of what env vars to configure in the Vercel dashboard.
Output: Updated vercel.json and .env.example
</objective>

<context>
@.planning/STATE.md
@vercel.json
@.env.example
@package.json
@scripts/migrate.mjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add buildCommand to vercel.json and update .env.example</name>
  <files>vercel.json, .env.example</files>
  <action>
**vercel.json** — Add `buildCommand` to existing config (preserve the existing `crons` array). The build command should:
1. Run `node scripts/migrate.mjs` to apply pending database migrations
2. Run `prisma generate` to generate the Prisma client
3. Run `next build` to build the Next.js app

Use the existing custom `scripts/migrate.mjs` (NOT `prisma migrate deploy`) because the project already has a robust custom migration runner that handles atomic transactions, retry of failed migrations, and graceful error handling. Chain with `&&` so build fails if migration fails.

```json
{
  "buildCommand": "node scripts/migrate.mjs && prisma generate && next build",
  "crons": [
    {
      "path": "/api/cron/send-reminders",
      "schedule": "0 14 * * *"
    }
  ]
}
```

**IMPORTANT**: Do NOT add `prisma migrate deploy` — the project uses a custom migration script at `scripts/migrate.mjs` that manually applies SQL files with transaction wrapping. Using `prisma migrate deploy` could conflict.

**.env.example** — Replace the current incomplete .env.example with a comprehensive version documenting ALL env vars used in the codebase. Group by category. Include descriptions of where to get each value. The complete list from grepping the codebase:

```
# ===========================================
# DriveCommand Environment Variables
# ===========================================
# Copy this file to .env.local for local development
# For Vercel: add these in Settings -> Environment Variables

# -------------------------------------------
# Database (required)
# -------------------------------------------
# Supabase PostgreSQL connection string
# Get from: Supabase Dashboard -> Settings -> Database -> Connection string (URI)
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# -------------------------------------------
# Authentication (required)
# -------------------------------------------
# Random 32+ character secret for JWT signing
# Generate with: openssl rand -base64 32
AUTH_SECRET=change-this-to-a-random-32-char-string

# -------------------------------------------
# App URL (required)
# -------------------------------------------
# Your deployed app URL (no trailing slash)
# Vercel: use your production domain (e.g. https://drivecommand.vercel.app)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# -------------------------------------------
# Email — Resend (required for invitations & notifications)
# -------------------------------------------
# Get from: https://resend.com/api-keys
RESEND_API_KEY=
# Sender address — must be verified in Resend dashboard
RESEND_FROM_EMAIL=DriveCommand <onboarding@resend.dev>

# -------------------------------------------
# AI Features — Anthropic (optional — enables AI document reading & profit predictor)
# -------------------------------------------
# Get from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=

# -------------------------------------------
# File Storage — S3/R2 (optional — enables document uploads)
# -------------------------------------------
# For Cloudflare R2: https://dash.cloudflare.com -> R2 -> Manage R2 API Tokens
# For AWS S3: use your S3 endpoint and credentials
S3_ENDPOINT=
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=

# -------------------------------------------
# Google Maps (optional — enables address autocomplete)
# -------------------------------------------
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

# -------------------------------------------
# Cron Jobs (required for Vercel cron — protects /api/cron/* endpoints)
# -------------------------------------------
# Vercel auto-sets this for Vercel Cron Jobs
# For manual testing: set any random string
CRON_SECRET=
```

Ensure the file has clear section headers, descriptions of where to obtain each value, and marks which vars are required vs optional.
  </action>
  <verify>
Verify vercel.json is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"` from the project root.
Verify .env.example contains all env vars found in codebase: check that DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_APP_URL, RESEND_API_KEY, RESEND_FROM_EMAIL, ANTHROPIC_API_KEY, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, and CRON_SECRET are all present.
  </verify>
  <done>
vercel.json has buildCommand that runs migrate.mjs + prisma generate + next build. .env.example documents all 13 env vars with descriptions, grouped by category, with required/optional labels.
  </done>
</task>

</tasks>

<verification>
- `node -e "const v = JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log(v.buildCommand); console.log(v.crons.length + ' cron(s)')"` shows buildCommand and 1 cron
- .env.example contains all 13 environment variables used in the codebase
- No secrets or actual values leaked in .env.example (only placeholders)
</verification>

<success_criteria>
- vercel.json includes buildCommand: "node scripts/migrate.mjs && prisma generate && next build"
- vercel.json preserves existing crons configuration
- .env.example documents all env vars with descriptions and source links
- Both files are valid and ready to commit
</success_criteria>

<output>
After completion, create `.planning/quick/32-fix-vercel-deployment-add-vercel-json-bu/32-SUMMARY.md`
</output>
