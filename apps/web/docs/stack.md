# Technology Stack

Complete reference for every major dependency in DriveCommand, with versions and rationale.

---

## 1. Core Framework: Next.js 16 (App Router)

**Version:** `next@^16.1.6` · `react@^19.0.0` · `react-dom@^19.0.0`

Next.js with the App Router is the foundation of DriveCommand. All pages are React Server Components (RSC) by default. Client interactivity is opt-in via the `'use client'` directive.

**Key conventions in this project:**

- **Route groups** — Three portals, each in a route group so the group name is not part of the URL:
  - `src/app/(owner)/` — Fleet owner portal
  - `src/app/(driver)/` — Driver portal
  - `src/app/(admin)/` — SysAdmin portal
- **API routes** — `src/app/api/` (REST endpoints for GPS, cron jobs, file uploads)
- **Server Actions** — defined in `actions/` subdirectories within each portal's route group. Called directly from Server Components or via `useActionState` in Client Components.
- **Layouts** — each portal has its own `layout.tsx` that enforces authentication and wraps all pages in that group's navigation shell.

---

## 2. ORM: Prisma 7.4

**Version:** `prisma@^7.4.0` · `@prisma/client@^7.4.0` · `@prisma/adapter-pg@^7.4.0`

Prisma is the database ORM. Prisma 7 requires a driver adapter for PostgreSQL connection pooling.

**Key details:**

- Uses the `pg` driver adapter (`@prisma/adapter-pg`) — required for Prisma 7 with PostgreSQL pooling via Supabase.
- Prisma Client is generated to `src/generated/prisma/` via `generator client { output = "../src/generated/prisma" }` in `prisma/schema.prisma`.
- Singleton client pattern in `src/lib/db/prisma.ts` survives Vercel warm function reuse (prevents exhausting connection limits).

**Common commands:**

```bash
# Apply schema changes to the database (dev only — replaces migrations)
npx prisma db push

# Regenerate the Prisma client after any schema change
npx prisma generate

# Open the Prisma data browser
npx prisma studio
```

---

## 3. Database: PostgreSQL via Supabase

Hosted PostgreSQL managed by [Supabase](https://supabase.com). Supabase provides:

- Connection via `pg.Pool` using Supabase's **Session Mode pooler** (port **6543**, not 5432) — required for Vercel serverless deployments.
- Row Level Security (RLS) policies that enforce tenant isolation at the database layer. Every query runs under a `current_tenant_id()` function that reads the active tenant from the session context.
- Direct connection (port 5432) is fine for local development.

---

## 4. Styling: Tailwind CSS + shadcn/ui

**Versions:** `tailwindcss@^3.4.1` · `class-variance-authority@^0.7.1` · `tailwind-merge@^3.4.1` · `clsx@^2.1.1` · `lucide-react@^0.564.0`

- **Tailwind CSS** — utility-first CSS framework. Configuration in `tailwind.config.ts`.
- **shadcn/ui** — unstyled [Radix UI](https://www.radix-ui.com/) primitives styled with Tailwind. Components live in `src/components/ui/`. Add new components with `npx shadcn@latest add <component>`.
- **Radix UI packages** used directly:
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-alert-dialog`
  - `@radix-ui/react-popover`
  - `@radix-ui/react-select`
  - `@radix-ui/react-separator`
  - `@radix-ui/react-slot`
  - `@radix-ui/react-switch`
  - `@radix-ui/react-tabs`
  - `@radix-ui/react-tooltip`
- **`class-variance-authority`** — component variant patterns (e.g. Button sizes/styles).
- **`tailwind-merge`** + **`clsx`** — conditional class composition via the `cn()` utility in `src/lib/utils.ts`.
- **`lucide-react`** — icon library used throughout the UI.

---

## 5. Email: Nodemailer via Gmail SMTP

**Version:** `nodemailer@^8.0.1` · `@react-email/components@^1.0.7` · `@react-email/render@^2.0.4`

DriveCommand sends transactional emails using Gmail SMTP via Nodemailer. Email templates are written as React components and rendered to HTML using `@react-email/render`.

- **Active client:** `src/lib/email/gmail-client.ts`
- **Legacy client:** `src/lib/email/resend-client.ts` (kept for reference, not active)
- **Required env vars:** `GMAIL_USER`, `GMAIL_APP_PASSWORD` (Google App Password — not your account password), `GMAIL_FROM_NAME` (optional display name)

See [Email docs](./email.md) for full setup instructions and all email trigger points.

---

## 6. Validation: Zod

**Version:** `zod@^4.3.6`

Zod is used for schema validation on all server action inputs and API request bodies. Every form submission is validated with a Zod schema before touching the database.

Example pattern:
```typescript
const schema = z.object({
  name: z.string().min(1),
  rate: z.string().transform(val => new Prisma.Decimal(val)),
});
const parsed = schema.parse(Object.fromEntries(formData));
```

---

## 7. File Storage: AWS S3 / Cloudflare R2

**Version:** `@aws-sdk/client-s3@^3.990.0` · `@aws-sdk/s3-request-presigner@^3.990.0`

Supports both Cloudflare R2 (preferred) and AWS S3 via a configurable `S3_ENDPOINT` env var. Used for driver document uploads (PDFs, images).

- **Presigned URLs** — the browser uploads directly to R2/S3 (not through Next.js), avoiding file size limits and unnecessary server load.
- **Multipart upload** for files larger than 5 MB — handled via presigned part URLs.
- Key validation enforces tenant isolation: every s3Key is prefixed with the tenant's ID.
- **Required env vars:** `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`

---

## 8. AI: Anthropic Claude

**Version:** `@anthropic-ai/sdk@^0.77.0`

Used in two features:

1. **AI Documents** (`/ai-documents`) — upload rate confirmations, invoices, and load tenders. Claude reads PDFs and images, extracts structured freight data (origin, destination, rate, dates).
2. **Profit Predictor** (`/profit-predictor`) — AI profitability assessment for a potential load, using historical lane and fuel data.

- **Required env var:** `ANTHROPIC_API_KEY`
- Model used: `claude-sonnet-4-6`

---

## 9. Maps and Geospatial

**Versions:** `leaflet@^1.9.4` · `react-leaflet@^5.0.0` · `react-leaflet-cluster@^4.0.0` · `@turf/bbox@^7.3.4` · `@turf/helpers@^7.3.4`

- **Leaflet + react-leaflet** — interactive maps in the Owner portal (Live Map, Route Map on load detail page). Must be dynamically imported with `ssr: false` in Next.js to avoid SSR issues.
- **react-leaflet-cluster** — clusters nearby truck markers to avoid overcrowding the live map.
- **@turf/bbox + @turf/helpers** — geospatial calculations for geofencing (detecting when a truck arrives within radius of a stop).
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`** — enables address autocomplete fields using the Google Places API.

---

## 10. Charts: Recharts

**Version:** `recharts@^2.15.4`

Used throughout dashboards: fuel analytics, safety reports, lane profitability bar chart, profit predictor UI. Some charts use Recharts directly (not via `shadcn/ui ChartContainer`) to support per-bar coloring and multi-field tooltips.

---

## 11. PDF: @react-pdf/renderer

**Version:** `@react-pdf/renderer@^4.3.2`

Generates PDF documents server-side:

- **Invoice PDFs** — downloadable from the invoice detail page.
- **Payroll payslips** — downloadable from the payroll detail page.
- **Rate confirmation PDFs** — downloadable from the load detail page.

PDF generation runs in a Server Action (`.tsx` extension required for JSX syntax). Uses the built-in Helvetica font to avoid external font downloads.

---

## 12. Testing

**Versions:** `vitest@^4.0.18` · `@playwright/test@^1.58.2`

| Command | Tool | Purpose |
|---|---|---|
| `npm test` | Vitest | Unit tests |
| `npm run test:watch` | Vitest | Unit tests in watch mode |
| `npm run test:e2e` | Playwright | End-to-end browser tests |
| `npm run test:e2e:ui` | Playwright | End-to-end tests with UI |

---

## 13. Other Utilities

| Package | Version | Purpose |
|---|---|---|
| `bcryptjs` | `^3.0.3` | Password hashing for owner/driver login |
| `date-fns` | `^4.1.0` | Date formatting and calculations (e.g. document expiry diffs) |
| `nanoid` | `^5.1.6` | Short unique ID generation (email IDs, tracking tokens) |
| `sonner` | `^2.0.7` | Toast notification system — `<Toaster />` in root layout |
| `@tanstack/react-table` | `^8.21.3` | Data tables with sorting and filtering in list views |
| `file-type` | `^21.3.0` | MIME type detection from magic bytes for uploaded files |
| `pg` | `^8.18.0` | PostgreSQL driver used by Prisma adapter |
| `dotenv` | `^17.3.1` | Environment variable loading in scripts |
| `@faker-js/faker` | `^10.3.0` | (dev) Fake data generation for seed scripts |
