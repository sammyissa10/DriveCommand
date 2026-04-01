# Vercel Deployment Guide

How to deploy DriveCommand to Vercel production.

---

## Overview

DriveCommand deploys to [Vercel](https://vercel.com). The canonical deploy command is:

```bash
npx vercel --prod
```

**Do NOT deploy via GitHub push.** Always use the Vercel CLI. See project workflow preferences.

---

## Prerequisites

- A Vercel account with the DriveCommand project linked
- Vercel CLI installed:
  ```bash
  npm i -g vercel
  ```
- All environment variables set in the Vercel Dashboard → Settings → Environment Variables

---

## Environment Variables on Vercel

Set every variable from `.env.example` in the Vercel dashboard. Key differences from local development:

| Variable | Local value | Vercel value |
|---|---|---|
| `DATABASE_URL` | Port 5432 (direct connection) | Port **6543** (Session Mode pooler) — required for serverless |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Your production domain, e.g. `https://drivecommand.vercel.app` |
| `CRON_SECRET` | Any random string | Vercel sets this automatically — do not set manually |

**Supabase Session Mode pooler URL format:**
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Get this from: Supabase Dashboard → Settings → Database → Connection string → **Session mode**.

All other variables (`ADMIN_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, S3 vars, Supabase vars, Gmail SMTP vars, etc.) use the same values as local — just add them to the Vercel dashboard.

---

## Build Command

Defined in `vercel.json`:

```json
{
  "buildCommand": "node scripts/migrate.mjs && prisma generate && next build"
}
```

This runs three steps in sequence:

1. **`node scripts/migrate.mjs`** — runs SQL migration files atomically. Fails fast with a non-zero exit code if any migration fails (which stops the Vercel build).
2. **`prisma generate`** — generates the Prisma client to `src/generated/prisma/`.
3. **`next build`** — compiles the Next.js application.

If any step fails, the build fails and the current deployment is not replaced.

---

## Deploying

```bash
npx vercel --prod
```

This deploys to the **production URL**. Always use `--prod` — without it, Vercel creates a preview deployment on a separate URL, which does not replace production.

---

## Cron Jobs

Defined in `vercel.json`. Vercel schedules these automatically:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/send-reminders` | Daily at 14:00 UTC (`0 14 * * *`) | Sends document expiry alerts and maintenance reminder emails to owners |
| `/api/warmup` | Daily at 08:00 UTC (`0 8 * * *`) | Keeps serverless functions warm to reduce cold start latency |
| `/api/cron/auto-close-tickets` | Daily at 02:00 UTC (`0 2 * * *`) | Auto-closes support tickets that have been resolved for 7+ days |

Cron routes are protected by checking the `Authorization: Bearer <CRON_SECRET>` header. Vercel injects this header automatically when triggering cron jobs.

To trigger a cron manually for testing:

```bash
curl -X POST https://your-domain.vercel.app/api/cron/send-reminders \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## First Deployment Checklist

- [ ] All env vars set in Vercel Dashboard → Settings → Environment Variables
- [ ] `DATABASE_URL` uses Supabase **Session Mode pooler** at port **6543** (not 5432)
- [ ] `NEXT_PUBLIC_APP_URL` set to the production domain
- [ ] `ADMIN_SECRET_KEY` set (needed to access `/admin/login`)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` set (Supabase Dashboard → Settings → API)
- [ ] Gmail SMTP credentials set (`GMAIL_USER`, `GMAIL_APP_PASSWORD` — see [Email docs](./email.md))
- [ ] R2/S3 bucket created and credentials set (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`)
- [ ] `ANTHROPIC_API_KEY` set (if AI features are needed)
- [ ] Run `npx vercel --prod` to deploy

---

## Post-Deployment Verification

After deploying:

1. Visit `https://your-domain.vercel.app` — confirm the landing page loads.
2. Visit `https://your-domain.vercel.app/admin/login` — confirm sysadmin login works with `ADMIN_SECRET_KEY`.
3. Create a tenant and send an owner invitation — confirm the invitation email is delivered.
4. Log into the owner portal — confirm the dashboard loads and database queries return data.
5. Check Vercel Dashboard → Functions → Logs for any runtime errors.

---

## Troubleshooting

**Build fails at `node scripts/migrate.mjs`**
The `DATABASE_URL` may be wrong or unreachable from Vercel's build environment. Confirm the Supabase project is not paused and the connection string is correct.

**502 / Function timeout errors in production**
The serverless function may be hitting cold start latency. The warmup cron at 08:00 UTC mitigates this. If the issue persists, check Vercel's function duration limits.

**"Invalid DATABASE_URL" or Prisma P1000 errors**
Ensure `DATABASE_URL` uses the Session Mode pooler (port 6543). The direct connection (port 5432) is not supported in Vercel's serverless environment.
