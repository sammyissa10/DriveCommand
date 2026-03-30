# DriveCommand — Web App Developer Documentation

DriveCommand is a multi-tenant SaaS fleet management platform for trucking operators. It provides three separate portals: an Owner portal for fleet owners/managers, a Driver portal for drivers, and a SysAdmin portal for the DriveCommand team.

This is the **web app** (`apps/web`) within a Turborepo monorepo. See [Monorepo Context](#monorepo-context) below.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Supabase |
| ORM | Prisma 7 with @prisma/adapter-pg |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Custom AES-256-GCM session cookie |
| Email | Gmail SMTP via Nodemailer |
| File Storage | Cloudflare R2 / AWS S3 |
| AI | Anthropic Claude (document reading, profit predictor) |
| Maps | Leaflet + react-leaflet, Google Maps (autocomplete) |
| Deployment | Vercel |

---

## Portal Map

DriveCommand routes users into one of three portals based on their role and session state.

### Owner Portal

Fleet owners and managers. URL prefix: `/`

Pages: `/dashboard`, `/trucks`, `/drivers`, `/routes`, `/loads`, `/invoices`, `/payroll`, `/crm`, `/compliance`, `/ai-documents`, `/profit-predictor`, `/lane-analytics`, `/ifta`, `/live-map`, `/fuel`, `/safety`, `/tags`, `/settings`, `/support`

### Driver Portal

Drivers. URL prefix: `/my-*`, `/hours`, `/incidents`, `/messages`

Pages: `/my-route`, `/my-load`, `/my-tickets`, `/hours`, `/incidents`, `/messages`

### SysAdmin Portal

DriveCommand internal staff. URL prefix: `/admin*`, `/tenants`

Pages: `/admin-dashboard`, `/admin-support`, `/tenants`, `/admin`

---

## Table of Contents

- [Architecture](./architecture.md) — System design, portal routing, multi-tenancy, RLS, middleware flow
- [Authentication](./auth.md) — Session management, role model, auth helpers, guard patterns
- [Database](./database.md) — Schema reference, Prisma setup, RLS policies, bypass_rls, migrations
- [Tech Stack](./stack.md) — Dependency versions, library rationale, environment variables
- [Modules](./modules.md) — Feature modules (CRM, dispatch, finance, compliance, AI, integrations)
- [Local Setup](./setup.md) — Prerequisites, environment variables, database setup, running locally
- [Deployment](./deployment.md) — Vercel deployment, build command, environment variables, cron jobs
- [Email](./email.md) — Gmail SMTP setup, Nodemailer client, email templates, notification log, idempotency

---

## Monorepo Context

This web app is one of two apps in the DriveCommand Turborepo monorepo. It serves as both the web frontend AND the API backend for the mobile app.

| Workspace | Description |
|---|---|
| `apps/web` | This app — Next.js 16 web portals + API backend for mobile |
| `apps/mobile` | Expo/React Native mobile app |
| `packages/types` | Shared TypeScript interfaces (`@drivecommand/types`) |
| `packages/validation` | Shared Zod schemas (`@drivecommand/validation`) |
| `packages/api-client` | Typed HTTP client for mobile → web API (`@drivecommand/api-client`) |

Mobile-specific API routes live under `src/app/api/mobile/` and are consumed by `@drivecommand/api-client` from the mobile app.

**Related documentation:**
- [Monorepo root README](../../../README.md) — monorepo overview, shared packages, dev commands
- [Mobile app docs](../../mobile/docs/) — mobile architecture, auth flow, navigation, build process

---

## Quick Start

See [Local Setup](./setup.md) to get the app running locally.

For running the full monorepo (web + mobile together), use `npm run dev` from the monorepo root.
