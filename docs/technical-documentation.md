# DriveCommand — Technical Documentation
*Last updated: April 5, 2026*

---

## 1. Monorepo Structure

```
drivecommand/
  ├── apps/
  │   ├── web/          # Next.js 16 web portal + API backend
  │   └── mobile/       # Expo SDK 55 + React Native 0.83
  ├── packages/
  │   ├── types/        # Shared TypeScript interfaces
  │   ├── validation/   # Shared Zod schemas
  │   └── api-client/   # Typed HTTP client for mobile
  ├── turbo.json        # Turborepo cache config
  ├── package.json      # Root npm workspaces
  └── tsconfig.json     # Base TypeScript config (strict, ES2020)
```

**Build system:** Turborepo 2.0, npm workspaces, TypeScript 5 strict mode, Node 20+.

---

## 2. Web App

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3.4 + shadcn/ui (Radix UI) |
| ORM | Prisma 7.4 + `@prisma/adapter-pg` |
| Auth | Supabase Auth + `@supabase/ssr` (httpOnly cookies) |
| Email | Resend v6.9 + `@react-email/components` |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) |
| Storage | AWS S3 / Cloudflare R2 (presigned URLs, multipart) |
| Maps | Leaflet + react-leaflet |
| Geocoding | Google Maps API |
| Error Tracking | Sentry (`@sentry/nextjs` v10.46) |
| Rate Limiting | Upstash Redis (`@upstash/ratelimit`) |
| Testing | Vitest (unit), Playwright (e2e) |
| Deployment | Vercel |

### Routing

The app uses three role-based layout groups:

```
src/app/
  ├── (auth)/              # Login, accept invitation
  ├── (owner)/             # Owner/manager portal (protected: OWNER, MANAGER)
  │   ├── dashboard/
  │   ├── routes/          # Route planning & dispatch
  │   ├── loads/           # Load management
  │   ├── trucks/          # Fleet inventory
  │   ├── drivers/         # Driver management
  │   ├── fuel/            # Fuel logging
  │   ├── maintenance/     # Service tracking
  │   ├── invoices/        # Billing
  │   ├── payroll/         # Driver pay
  │   ├── crm/             # Customer database
  │   ├── compliance/      # Docs & license expiry
  │   ├── safety/          # Real-time safety alerts
  │   ├── live-map/        # Fleet GPS map
  │   ├── ai-documents/    # PDF → load data extraction
  │   ├── profit-predictor/
  │   ├── lane-analytics/
  │   ├── ifta/            # Fuel tax reporting
  │   ├── tags/
  │   ├── support/
  │   ├── subscription/
  │   └── settings/
  ├── (driver)/            # Driver portal (protected: DRIVER)
  │   ├── index            # Driver dashboard
  │   ├── my-route/
  │   ├── my-load/
  │   ├── hours/           # HOS tracking
  │   ├── incidents/
  │   ├── messages/
  │   └── my-tickets/
  ├── (admin)/             # System admin portal (protected: SYSTEM_ADMIN)
  │   ├── admin-dashboard/
  │   ├── tenants/
  │   ├── billing/
  │   └── admin-support/
  ├── onboarding/
  ├── track/[token]/       # Public shipment tracking (no auth)
  └── api/                 # 75+ REST API endpoints
```

### API Routes

**Auth:**
- `POST /api/auth/login` — Supabase sign-in, sets httpOnly session cookie
- `GET /api/auth/me` — Current user (supports `Bearer` token for mobile)
- `POST /api/auth/logout` — Clears session cookie
- `POST /api/auth/accept-invitation` — Driver invite flow

**Documents (S3/R2):**
- `POST /api/documents/request-upload-url` — Presigned POST URL
- `POST /api/documents/multipart/*` — Multipart upload (initiate / part-url / complete)
- `GET /api/documents/download-url/[id]` — Presigned download URL
- `DELETE /api/documents/delete/[id]` — Soft delete

**GPS & ELD Sync:**
- `POST /api/gps/report` — Mobile GPS reporting
- `GET /api/gps/locations` — GPS history by truck
- `POST /api/integrations/samsara/sync` — Samsara vehicle location sync
- `POST /api/integrations/motive/sync` — Motive vehicle location sync

**Mobile API (75+ endpoints):**
- `/api/mobile/driver/*` — Driver portal (dashboard, loads, routes, messages, HOS, incidents, documents)
- `/api/mobile/owner/*` — Owner portal (fleet, drivers, invoices, payroll, compliance, profit predictor)

**Cron (bearer-token protected):**
- `POST /api/cron/send-reminders` — Invoice reminders via Resend
- `POST /api/cron/mark-overdue-invoices` — Auto-mark past-due
- `POST /api/cron/auto-close-tickets` — Close stale support tickets

**Utilities:**
- `GET /api/health` — Uptime check
- `GET /api/warmup` — Cold start prevention
- `POST /api/push-tokens` — Register device push tokens
- `POST /api/geocoding/autocomplete` — Google Maps address autocomplete
- `GET /api/track/[token]` — Public shipment tracking (geofencing alerts)

---

## 3. Mobile App

### Stack

| Layer | Technology |
|---|---|
| Runtime | Expo SDK 55, React Native 0.83.4 |
| Language | TypeScript 5.9 |
| Navigation | Expo Router v55 (file-based) |
| Styling | NativeWind v4 (Tailwind for RN) |
| Server State | React Query v5 |
| Local Storage | Expo SecureStore (tokens), MMKV (preferences) |
| Maps | react-native-maps 1.27 + clustering |
| Camera | expo-camera + expo-image-picker |
| Location | expo-location (background tracking) |
| Push Notifs | expo-notifications + expo-server-sdk |
| Error Tracking | Sentry (`@sentry/react-native` v7.11) |
| Build | EAS Build (Expo Application Services) |
| OTA Updates | EAS Update (check on every app load) |

### Navigation Structure

```
app/
  ├── _layout.tsx          # Root — auth check, redirect
  ├── index.tsx            # Redirect to login or dashboard
  ├── login.tsx            # Email/password auth
  ├── (driver)/
  │   ├── _layout.tsx      # Bottom tab navigator
  │   ├── index.tsx        # Driver dashboard
  │   ├── hos.tsx          # HOS duty status
  │   ├── documents.tsx    # Uploaded docs
  │   └── messages.tsx     # Fleet messages
  ├── (owner)/
  │   ├── _layout.tsx      # Bottom tab navigator
  │   ├── index.tsx        # Owner dashboard
  │   └── map.tsx          # Live fleet map
  └── +not-found.tsx
```

### Mobile Permissions

| Platform | Permission | Use |
|---|---|---|
| Android | `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` | GPS tracking |
| Android | `CAMERA`, `READ_EXTERNAL_STORAGE` | Photos |
| Android | `FOREGROUND_SERVICE_LOCATION` | Background GPS |
| iOS | Location always + when in use | GPS tracking |
| iOS | Camera + Photo library | Incident/delivery photos |
| iOS | Background modes: location, notifications, fetch | Background services |

### EAS Build Profiles

| Profile | Purpose |
|---|---|
| `development` | Dev client (debug, hot reload) |
| `preview` | Internal distribution |
| `production` | App Store / Play Store (auto-increment version) |

```bash
eas build --profile production --platform all
eas submit --platform ios --latest
eas submit --platform android --latest
```

---

## 4. Shared Packages

### `@drivecommand/types`
Shared TypeScript interfaces: `UserRole`, `Truck`, `Driver`, `Load`, `Route`, `Invoice`, `PayrollRecord`, etc. Used by both web and mobile.

### `@drivecommand/validation`
Shared Zod v4 schemas for request/response validation. Schemas: customer, driver, expense, invoice, load, maintenance, payroll, route, tag, truck, etc. Used in web server actions and mobile API calls.

### `@drivecommand/api-client`
Typed HTTP client for mobile → web API calls.
- `driver.ts` — Driver portal endpoints
- `owner.ts` — Owner portal endpoints
- `client.ts` — HTTP client with auth interceptor (`Bearer` token) and error handling

---

## 5. Database

### Connection
- **Provider:** PostgreSQL via Supabase
- **ORM:** Prisma 7.4 with `@prisma/adapter-pg`
- **Schema:** `apps/web/prisma/schema.prisma`
- **Migrations:** 35+ sequential migrations (Feb–Mar 2026)
- **Auto-deploy:** `scripts/migrate.mjs` runs on Vercel startup

### Data Models

**Multi-tenancy:**
- `Tenant` — Company account (slug, timezone, profit margin threshold)
- `User` — Team members (role: OWNER / MANAGER / DRIVER; per-tenant unique email)
- `DriverInvitation` — Invite workflow (PENDING → ACCEPTED)

**Fleet:**
- `Truck` — VIN, plate, make, model, year, odometer, maintenance status
- `MaintenanceEvent` — Service log (date, type, cost, odometer)
- `ScheduledService` — Preventive maintenance intervals (days or miles)
- `FuelRecord` — Purchases (DIESEL / GASOLINE / ELECTRIC / HYBRID, qty, cost)

**Routing & Dispatch:**
- `Route` — Single/multi-stop route (PLANNED → IN_PROGRESS → COMPLETED)
- `RouteStop` — Stop details (type: PICKUP / DELIVERY, position, geofence flag)
- `RouteDriver` — Co-driver assignment
- `DriverRouteJoin` — Driver pay config (fixed, hourly, per-mile)
- `Load` — Individual shipment (origin, destination, rate, status, public tracking token)

**Finance:**
- `Invoice` — Customer invoice (DRAFT → SENT → PAID)
- `InvoiceItem` — Line items
- `RouteExpense` — Expense by category and amount
- `RoutePayment` — Payment tracking (PENDING / PAID)
- `ExpenseCategory` / `ExpenseTemplate` — Tenant-scoped categories
- `PayrollRecord` — Driver pay period (basePay, bonuses, deductions, miles, loads)

**CRM:**
- `Customer` — Shipper/consignee (company, contact, priority, revenue)
- `CustomerInteraction` — Log (EMAIL, PHONE, MEETING, NOTE, LOAD_UPDATE, ETA_NOTIFICATION)

**Compliance & Safety:**
- `Document` — All files (license, insurance, BOL, rate confirmation; S3 key, expiry)
- `SafetyEvent` — Alerts (HARSH_BRAKING, SPEEDING, DISTRACTION; severity, g-force, speed)
- `DriverHOSEntry` — Hours of Service log (OFF_DUTY, SLEEPER_BERTH, DRIVING, ON_DUTY)
- `DriverIncident` — Incident reports (ACCIDENT, VIOLATION, MECHANICAL, HAZARD; photo S3 key)

**Communications:**
- `FleetMessage` — Dispatch messages (route/load-specific or broadcast)
- `NotificationLog` — Email delivery tracking (idempotency key, retry count, Resend ID)

**Support & Admin:**
- `SupportTicket` — Support cases (category, priority, status, resolution)
- `TicketMessage` — Responses (sender type: OWNER / ADMIN)
- `SysAdminInvoice` / `SysAdminInvoiceItem` — Platform billing to tenants
- `TenantIntegration` — Integration config (QUICKBOOKS, SAMSARA, MOTIVE, TRIUMPH_FACTORING, OTR_SOLUTIONS, SENDGRID, MAILGUN)

**Metadata:**
- `Tag` / `TagAssignment` — Custom color-coded tags on trucks/drivers
- `PushToken` — Device tokens (one per user per platform)
- `GPSLocation` — GPS pings (truckId, lat, lng, timestamp, source ELD)

**Key indexes:** composite on `(tenantId, driverId, scheduledDate)`, `(tenantId, status, archivedAt)`, `(truckId, timestamp)`, `(driverId, startTime)`. Soft-delete via `archivedAt`.

---

## 6. Authentication

### Web
1. `POST /api/auth/login` → Supabase `signInWithPassword`
2. `@supabase/ssr` writes httpOnly session cookie
3. All server actions call `createSupabaseServerClient()` to validate session

### Mobile
1. Login returns Supabase access token
2. Token stored encrypted in `expo-secure-store`
3. Every API request: `Authorization: Bearer <token>`
4. Backend validates via Supabase admin client; Supabase SDK handles refresh

### User Claims (Supabase JWT)
- `app_metadata` (admin-only, secure): `role`, `tenantId`, `companyName`, `permissions`
- `user_metadata` (display only): `firstName`, `lastName`

### Authorization
- **Role-based:** `OWNER`, `MANAGER`, `DRIVER`, `SYSTEM_ADMIN`
- **Permission-based:** JSON field on `User` (e.g., `canViewAIDocuments`, `canApprovePayroll`)
- **Tenant-scoped:** Every query includes `WHERE tenantId = ?`

---

## 7. Third-Party Integrations

| Service | Purpose | Library |
|---|---|---|
| Supabase Auth | Authentication, session management | `@supabase/supabase-js` v2.100 |
| Anthropic Claude | PDF extraction, profit predictor | `@anthropic-ai/sdk` (Haiku model) |
| Resend | Transactional email | `resend` v6.9 |
| AWS S3 / R2 | Document storage | `@aws-sdk/client-s3` |
| Google Maps | Address autocomplete, geocoding | REST API |
| Samsara | ELD GPS sync | REST API v1 |
| Motive | ELD GPS sync | REST API v1 |
| Upstash Redis | Rate limiting (auth endpoints) | `@upstash/ratelimit` |
| Sentry | Error tracking (web + mobile) | `@sentry/nextjs`, `@sentry/react-native` |
| EAS | Mobile builds + OTA updates | `eas-cli` |

**AI document processing:** Claude Haiku reads PDFs (rate confirmations, BOLs) and extracts structured load data (shipper, consignee, commodity, rate). Also powers the profit predictor.

**ELD sync:** Samsara and Motive integrations match vehicles by VIN and write GPS coordinates to the `GPSLocation` table. Triggered via cron or on-demand.

---

## 8. Deployment

### Web (Vercel)

```bash
# Build
prisma generate && next build

# Startup (auto-migrates DB)
node scripts/migrate.mjs && next start

# Deploy
vercel --prod
```

**Security headers (`next.config.ts`):** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=63072000`, `Permissions-Policy` (blocks camera/mic/geo).

**Required environment variables:**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL (Supabase) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key |
| `ANTHROPIC_API_KEY` | Claude AI |
| `RESEND_API_KEY` | Email sending |
| `RESEND_FROM_EMAIL` | Sender address |
| `S3_ENDPOINT` | Storage endpoint (S3 or R2) |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY_ID` | Storage access key |
| `S3_SECRET_ACCESS_KEY` | Storage secret key |
| `S3_REGION` | Storage region |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps/geocoding |
| `UPSTASH_REDIS_REST_URL` | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side error tracking |
| `SENTRY_DSN` | Server-side error tracking |
| `SENTRY_AUTH_TOKEN` | Source map upload |
| `CRON_SECRET` | Protect cron endpoints |
| `ADMIN_SECRET_KEY` | Admin API protection |
| `NEXT_PUBLIC_APP_URL` | Public app URL |

### Mobile (EAS)

```bash
cd apps/mobile

# Development build
eas build --profile development --platform all

# Production build + submit
eas build --profile production --platform all
eas submit --platform ios --latest
eas submit --platform android --latest
```

**OTA update URL:** `https://u.expo.dev/010aaae1-a5ad-455a-bb42-a1d6637e4cf7`

**Pre-submission checklist:**
- [ ] Apple Developer enrollment ($99/yr)
- [ ] Google Play enrollment ($25 one-time)
- [ ] Apple/Google credentials filled in `eas.json`
- [ ] `google-play-key.json` added to EAS Secrets
- [ ] Google Maps API key placeholder replaced in `app.json`

---

## 9. Feature Summary

| Category | Features |
|---|---|
| Fleet Management | Truck inventory, maintenance tracking, fuel logging, odometer |
| Routing & Dispatch | Route creation, multi-stop, driver assignment, ETA updates |
| Load Tracking | Dispatch, status workflow, customer tracking links, geofencing alerts |
| Driver Management | Invite/onboarding, HOS logging, incident reports, safety scoring |
| Finance | Invoice generation, payroll, expense tracking, IFTA fuel tax |
| AI Features | PDF document parsing (rate confirmations), profit predictor |
| Safety & Compliance | Real-time ELD alerts, license expiry, document management |
| Communication | Fleet messaging, push notifications, email reminders, support tickets |
| CRM | Customer database, interaction timeline, revenue analytics |
| ELD Integrations | Samsara GPS sync, Motive GPS sync |
| Admin | Tenant management, platform billing, system-wide support |
| Carrier Operations | Client/contract management, route templates with RRULE recurrence, auto-dispatch, multi-stop execution, BOL/POD enforcement, 6 rate types, 5 pay models, compliance alerts |

---

## 10. Carrier Operations

### Overview

The Carrier Operations module adds a commercial and operational layer for trucking carriers. It separates commercial identity (clients, contracts, rate agreements) from operational execution (dispatches, stops, loads). This enables carriers to manage recurring customer relationships while executing individual dispatch runs independently.

### Entity Hierarchy

| Tier | Level | Entity | Purpose |
|------|-------|--------|---------|
| 1 | Commercial Identity | CarrierClient | Customer companies (shippers, brokers) |
| 2 | Commercial Terms | CarrierContract | Rate agreements with clients (6 rate types) |
| 3 | Operational Blueprint | CarrierRouteTemplate | Reusable route patterns with iCal RRULE recurrence |
| 4 | Operational Instance | CarrierDispatch | Single execution of a template (immutable snapshot) |
| 5 | Execution Steps | CarrierStop | Ordered pickup/delivery stops within a dispatch |
| 6 | Transactional Leaves | CarrierLoad, CarrierDocument, CarrierPayRecord | Revenue items, BOL/POD docs, driver pay records |

### Key API Routes

| Route | Purpose |
|-------|---------|
| `/api/v1/carrier/clients` | Client CRUD |
| `/api/v1/carrier/contracts` | Contract CRUD with rate type support |
| `/api/v1/carrier/facilities` | Facility/location management |
| `/api/v1/carrier/route-templates` | Route template CRUD with RRULE recurrence |
| `/api/v1/carrier/dispatches` | Dispatch CRUD + auto-generation |
| `/api/v1/carrier/stops` | Stop management within dispatches |
| `/api/v1/carrier/loads` | Load CRUD with revenue calculation |
| `/api/v1/carrier/documents` | BOL/POD document upload + enforcement |
| `/api/v1/carrier/pay-records` | Driver pay record generation |
| `/api/v1/carrier/compliance` | Compliance alerts |

### Microflows

1. **Auto-dispatch generation** — Generate dispatches from route templates for N days forward using iCal RRULE evaluation.
2. **Stop completion with BOL/POD enforcement** — API returns 422 if a driver attempts to complete a delivery stop without uploading POD.
3. **Load revenue calculation** — Computes revenue using one of 6 rate types: flat, per-mile, per-hour, per-ton, per-unit, or percentage.
4. **Pay record generation** — Generates driver pay from completed loads using one of 5 pay models: flat, per-mile, percentage, per-stop, or hourly.
5. **Document upload** — Typed document uploads (BOL, POD, rate confirmation) linked to stops or loads.

### Mobile Extension

Driver-facing carrier operations are surfaced in the mobile app. The driver sees assigned carrier dispatches in their dispatch list, can view the stop timeline, update stop status, upload BOL/POD documents via camera, and mark stops as arrived or departed. The feature uses the existing mobile infrastructure (Expo Router, TanStack Query, MMKV offline queue).

### Critical Architectural Rules

1. **No client_id on dispatches** — Dispatches are operational, not commercial. The client relationship lives on the contract, which lives on the route template. A dispatch is an immutable snapshot of a template execution.
2. **No auto-sort stops by stop_type** — The `sequence` field is the source of truth for stop ordering. Pickup and delivery stops can be interleaved in any order the dispatcher sets.
3. **Template edits don't affect existing dispatches** — Once a dispatch is generated from a template, it is an independent entity. Changing the template only affects future generations.
4. **Computed fields stored, not recomputed** — Revenue, pay amounts, and distances are calculated once and stored. No re-computation at query time.
5. **BOL/POD enforcement at API level** — Document requirements are enforced in API route handlers (returning 422), not via database constraints.
6. **Orphan loads blocked** — Every CarrierLoad must have a client_id. The API rejects loads without client association.
