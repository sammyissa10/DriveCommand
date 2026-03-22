# DriveCommand — Developer Documentation

DriveCommand is a multi-tenant SaaS fleet management platform for trucking operators. It provides three separate portals: an Owner portal for fleet owners/managers, a Driver portal for drivers, and a SysAdmin portal for the DriveCommand team.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
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

## Quick Start

See [Local Setup](./setup.md) to get the app running locally.
