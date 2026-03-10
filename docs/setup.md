# Local Development Setup

A complete guide from zero to a running local instance of DriveCommand. Follow these steps in order.

---

## Prerequisites

Before cloning, make sure you have the following installed:

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm** (bundled with Node.js) or **pnpm**
- **Git**
- A **Supabase account** — [supabase.com](https://supabase.com) (free tier is sufficient). Create a project before the Database Setup step.
- A **Gmail account with a Google App Password** — optional. Required only if you want to test email notifications locally. See the env vars table below for instructions.

---

## 1. Clone and Install

```bash
git clone <repo-url>
cd drivecommand
npm install
```

---

## 2. Environment Variables

Copy the example file:

```bash
cp .env.example .env.local
```

Then fill in the values. The table below documents every variable in `.env.example`:

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | Supabase Dashboard → Settings → Database → Connection string (URI). Use port **5432** (direct connection) for local dev. Use port **6543** (Session Mode pooler) for Vercel. |
| `AUTH_SECRET` | Yes | 32+ character secret for session encryption | Run: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Yes | App base URL (no trailing slash) | `http://localhost:3000` for local dev |
| `RESEND_API_KEY` | Email | Resend API key (legacy email provider) | [resend.com/api-keys](https://resend.com/api-keys) — leave blank if using Gmail SMTP |
| `RESEND_FROM_EMAIL` | Email | Sender address verified in Resend | e.g. `DriveCommand <onboarding@resend.dev>` |
| `ANTHROPIC_API_KEY` | AI features | Enables AI document reading and profit predictor | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `S3_ENDPOINT` | File uploads | S3-compatible storage endpoint | Cloudflare R2: `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | File uploads | Storage region (`auto` for R2) | `auto` for Cloudflare R2, or your AWS region |
| `S3_ACCESS_KEY_ID` | File uploads | S3 access key ID | Cloudflare Dashboard → R2 → Manage R2 API Tokens |
| `S3_SECRET_ACCESS_KEY` | File uploads | S3 secret access key | Same as above |
| `S3_BUCKET` | File uploads | Bucket name | Your R2 or S3 bucket name |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Address autocomplete | Google Maps API key | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials |
| `ADMIN_SECRET_KEY` | Yes | Password for the sysadmin portal at `/admin/login` | Run: `openssl rand -base64 32` |
| `CRON_SECRET` | Yes (Vercel) | Protects `/api/cron/*` endpoints | Any random string for local testing. Vercel sets this automatically for Vercel Cron Jobs. |

**Note on email:** The `.env.example` uses Resend (`RESEND_API_KEY`). The active email implementation in `src/lib/email/gmail-client.ts` uses Gmail SMTP instead (requires `GMAIL_USER` and `GMAIL_APP_PASSWORD` set in `.env.local` — not shown in `.env.example`). See [Email docs](./email.md) for Gmail setup.

**Minimum required variables for local dev without optional features:**

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `ADMIN_SECRET_KEY`
- `CRON_SECRET`

---

## 3. Database Setup

Push the Prisma schema to your Supabase database:

```bash
npx prisma db push
```

Generate the Prisma client:

```bash
npx prisma generate
```

The Prisma client is generated to `src/generated/prisma/` (not the default location).

**(Optional) Seed with realistic fake data:**

```bash
# Standard seed — owners, drivers, trucks, routes, loads
npm run seed

# Extended seed — adds fleet intelligence data (fuel records, safety events, GPS pings)
npm run seed:fleet
```

---

## 4. Run the Development Server

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

---

## 5. Creating the First Admin User

The sysadmin portal is at `/admin/login`. Use the value of `ADMIN_SECRET_KEY` as the password. From the sysadmin portal you can:

- Create a new tenant
- Send an owner invitation email to set up the owner's account

Alternatively, register at `/sign-up` to create an owner account directly, bypassing the invitation flow.

---

## 6. Running Tests

```bash
# Unit tests (Vitest)
npm test

# Unit tests in watch mode
npm run test:watch

# End-to-end tests (Playwright — requires app running)
npm run test:e2e

# End-to-end tests with Playwright UI
npm run test:e2e:ui
```

---

## 7. Common Issues

**"AUTH_SECRET must be set and at least 32 characters"**
Check that `AUTH_SECRET` is set in `.env.local` and is at least 32 characters. Generate one with `openssl rand -base64 32`.

**Prisma query errors / RLS violations**
Ensure `DATABASE_URL` points to your Supabase project with the correct credentials. For local dev, use the direct connection URL (port 5432). The Session Mode pooler (port 6543) is for Vercel only.

**`npx prisma db push` fails with "drift detected"**
This can happen if the schema and database are out of sync. Run `npx prisma migrate resolve --applied <migration-name>` to mark the existing state as resolved, then retry `db push`.

**Email not sending**
The active email client requires `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env.local`. The App Password is a 16-character code from Google's security settings — not your Gmail login password. See [Email docs](./email.md).

**`MODULE_NOT_FOUND` or import errors after `git pull`**
Run `npm install` to install any new dependencies, then `npx prisma generate` to regenerate the client if `prisma/schema.prisma` changed.
