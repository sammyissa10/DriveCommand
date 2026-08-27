# DriveCommand — Technical Documentation
*Last updated: August 26, 2026*

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

---

## 11. Document Import

*Added v6.0.0. Spec: `docs/specs/DocumentImport_TechnicalSpec_v1.md`. Decisions: `.planning/document-import/DECISIONS.md` (DEC-1 … DEC-18). Per-phase records: `.planning/document-import/`.*

### Overview

Document Import turns the paperwork a carrier is sent — a photographed manifest, a rate confirmation PDF, a CSV export — into a `CarrierDispatch` with its stops, quantities, references and documents already populated. It is the fastest path from a 5:30am photo to a dispatched trip, and it exists because typing a twelve-stop manifest by hand is the single largest daily data-entry cost a small carrier has.

Everything it does is a **resolution**: reading a document produces names and addresses, and each one has to be resolved onto an entity the tenant already owns (a client, a contract, a facility, a route template) or onto one a human explicitly creates. No resolution ever creates an entity on its own except where an exact, unambiguous match exists.

### Entity flow

```
 upload (1..n files)  ->  DocumentImport row (UPLOADED)
        |                        |
        |                        v
        |                 DocumentImportPage (one per page, SHA-256 keyed cache)
        v
 extraction (vision model or CSV parse)
        |
        v
 rawExtraction  ->  canonical shape  ->  reviewedExtraction   <- every human edit
        |                                      |
        |                        resolution_provenance (jsonb)
        |                          · client   · contract
        |                          · template · endStop
        |                          · stops[]  (facility links + fingerprints)
        v
 COMMIT (one transaction)
   1 facilities + external references
   2 CarrierDispatch
   3 CarrierStop rows in sequence, end stop last (is_end_stop)
   4 CarrierLoad
   5 CarrierDocument rows (trip level + per-stop page slices)
   6 import -> COMMITTED, created ids recorded
   7 route template create / update
   ---- outside the transaction ----
   8 notifications (trip.assigned)
```

Lifecycle: `UPLOADED → EXTRACTING → NEEDS_REVIEW → READY → COMMITTING → COMMITTED`, with `FAILED` and `CANCELLED` as terminal branches and a full rollback returning a failed commit to `NEEDS_REVIEW`.

**New tables:** `document_imports`, `document_import_pages`, `facility_external_references`, `document_profiles`, `carrier_truck_defects`, `route_matrix_cache`.

**Extended:** `Tenant` (5 settings columns), `route_templates` (`end_stop_policy`, `end_stop_facility_id`, `source_import_id`, `last_applied_at`, `application_count`), `dispatches` (`source_import_id`, `end_stop_policy`, `inspection_required`, three `inspection_overridden_*`), `stops` (`is_end_stop`, `appointment_is_firm`, references/line items/page numbers), `facilities` (`is_driver_residence`, `resident_driver_id`, `driver_residence` type).

### Tenant settings

All five are columns on `Tenant` — there is no tenant-settings table in this schema (audit B3). Defaults verified against `information_schema` on production, per DEC-17.

| Setting | Default | What it changes | Who it affects | UI |
|---|---|---|---|---|
| `requirePreTripInspection` | `false` | A driver must complete the walkaround before `Trip.start` is allowed | Drivers (gated), dispatchers (alerted) | `/settings/operations` |
| `blockTripStartOnFailedInspection` | `true` | A **critical** failure blocks the start; owner/manager may override with a reason. Off = the defect is logged and the trip proceeds. Inert while inspections are off | Drivers, dispatchers | `/settings/operations` |
| `defaultEndStopPolicy` | `'NONE'` | The first rung of end-stop resolution: `RETURN_TO_ORIGIN` · `HOME_BASE` · `DESIGNATED_PARKING` · `DRIVER_RESIDENCE` · `NONE` | Every trip created from an import | **None — database only** |
| `homeBaseFacilityId` | `null` | The facility `HOME_BASE` resolves to | Every trip using `HOME_BASE` | **None — database only** |
| `autoCreateRouteTemplatesFromImports` | `false` | After a commit that used no template, creates one from the committed stops, guarded against near-duplicates | Owners/dispatchers (a new template appears) | **None — database only** |

Three of the five have no settings screen. That is a product gap, recorded in the Phase 12 deferred list, and the help articles say so rather than describing a screen that does not exist.

### API routes added

Every route is mirrored on both surfaces from one transport-neutral handler module (`lib/document-import/handlers.ts`, `lib/carrier/inspection-handlers.ts`): `/api/v1/carrier/*` authenticates by session cookie, `/api/mobile/carrier/*` by Bearer token. 49 route files in total.

| Route (v1; mobile mirrors under `/api/mobile/carrier/owner/`) | Purpose |
|---|---|
| `document-imports` | List · create (dedupe check, 409 on duplicate) |
| `document-imports/upload-url` | Presigned single PUT, tenant-prefixed key, 25MB cap |
| `document-imports/[id]` | Read · cancel |
| `document-imports/[id]/extract` | Run or resume extraction (rate-limited per tenant) |
| `document-imports/[id]/pages` | Re-shoot / replace one page |
| `document-imports/[id]/resolution` | The whole computed view: client, contract, template, end stop, stops |
| `document-imports/[id]/resolution/client` · `/contract` | Select, create-and-select, spot contract |
| `document-imports/[id]/stops` | Facility link (T3 pick) |
| `document-imports/[id]/stops/facility` | Create-and-link (T4) |
| `document-imports/[id]/stops/review` | The 11-field editor writes |
| `document-imports/[id]/stops/bulk` | Bulk apply over `stopIndexes[]` |
| `document-imports/[id]/stops/order` | Reorder (server write; array order *is* running order) |
| `document-imports/[id]/template` · `/template/offer` | Select · apply · reset · post-commit offer |
| `document-imports/[id]/end-stop` | `select` · `reset` (delete the stored key) |
| `document-imports/[id]/optimisation` | Suggestion (GET) · accept (POST) |
| `document-imports/[id]/commit` | The atomic commit |
| `dispatches/[id]/inspection` | Gate state |
| `dispatches/[id]/inspection/checklist` | Open / answer / submit |
| `dispatches/[id]/inspection/override` | Owner-or-manager override with reason |
| `templates/[id]/optimisation` | Template-level suggestion + accept |
| `live-board` | Board facts, three projections |
| `reports/todays-trips` | The report |
| `cron/trip-reminders` | Daily `trip.reminder` |

### Microflows

1. **Extraction with a per-page cache** — each page is hashed independently; a re-run re-reads only the pages that changed. Photos are per-page; a PDF is a single cache unit (no rasteriser on the hot path).
2. **Consignment merge** — same shipment reference on two pages → one stop, quantities summed, page span kept; different reference → repeated stop, not summed; no reference → warn and do not sum.
3. **Dedupe at extraction, not at commit** — SHA-256 over source bytes plus tenant, document number and document date, enforced by a database index. A duplicate offers *open existing* or *import as a correction* (the earlier import is superseded).
4. **Client/contract resolution** — only an exact normalised name match auto-selects (fuzzy is capped at 0.99 and can never reach 1.0). A rate confirmation with no standing contract offers a one-time spot contract, derived-labelled from its one-day term, never from its name or its provenance (DEC-12).
5. **Facility ladder (T1–T4)** — learned external reference → normalised address match (with reference backfilled) → fuzzy proposal requiring a tap → pre-filled create form requiring a tap.
6. **Template matching** — Jaccard over resolved facility IDs, order ignored, ×0.8 when stop counts differ by more than 30%; ≥0.75 auto-selects, 0.45–0.75 offers candidates, below that offers only *continue without*.
7. **End stop** — tenant default → template override → per-trip choice; derived on read, committed at the mutation boundary, materialised at commit as a real `CarrierStop` (`stop_type='layover'`, `is_end_stop=true`, sequence last).
8. **Optimisation** — OSRM `/table` over the resolved facility set, cached L1 (in-process, 24h) + L2 (`route_matrix_cache`, 30 days, written only by the two accept mutations). Offered only above a floor of 5 miles **or** 20 minutes.
9. **Atomic commit** — validation (blocking vs warning), one transaction, full rollback to `NEEDS_REVIEW` on any failure, notifications enqueued outside it.
10. **Inspection gate** — required? → owner override? → a valid one within the rolling 24 hours for this truck by this driver? → otherwise the full-screen walkaround. Outcomes: pass starts · non-critical starts and logs defects · critical blocks when the tenant setting says so.
11. **Notification triggers** — ten on the existing catalogue, dispatched after the response, deduplicated on a rolling 5-minute lookback that fails open.
12. **Board and report** — one data source (`loadBoardFacts`) → three projections; attention rank is a derived number, not a comparator.

### Critical architectural rules

1. **T3 and T4 never create a facility without a human tap.** Enforced by the shape of the verdict union — the T3/T4 members carry no facility id — not by a check an edit could drop. A polluted facility table is unrecoverable and destroys the external-reference table's value permanently.
2. **The end stop is never a consignment.** It is derived, committed at a mutation, and materialised at commit. Putting it in `reviewedExtraction.consignments` breaks template scoring, the template-ghost predicate and reorder, all three at once.
3. **Array order in `reviewedExtraction.consignments` IS the running order.** Reorder is a server write that permutes `resolution_provenance.stops` alongside it, carrying each `stopFingerprint` untouched so a stale link is still dropped.
4. **A skipped stop must not reach the scorer; an unresolved one must.** Opposite rules on the same function. Dropping unresolved stops lets a half-read manifest score 1.0 against a template covering only the half that was read.
5. **Template *selection* auto-collapses; template *application* is always an explicit tap.** Applying rewrites the running order, so reading collapse as apply would put the module's largest write on a GET.
6. **A stored slot decision short-circuits the view on the key's presence, so undoing one means deleting the key.** Client, contract, template and end stop all work this way: a control that changes a stored decision is a POST, never a re-fetch.
7. **Read `pg_constraint` before writing any enum-ish carrier column.** These tables carry CHECKs seeded in early migrations that do not track the app's vocabulary. `facility_external_references.resolved_via` admits only `T1|T2|T3|T4`; `stops.stop_type` admits five values, `route_template_stops.stop_type` only four; `shipper` and `receiver` do not exist as facility types. A faked database in a unit test is not evidence about SQL.
8. **Filter a picker; mask a trip's own stops.** A driver residence is dropped from pickers, but on a trip it stays and is masked — name, street, city, postcode **and coordinates**. Dropping the row would delete the end stop and hide the untracked return leg the feature exists to track.
9. **`driverResidences` is the one default-FALSE permission** and does not go through `hasPermission`, which resolves a manager as default-allow. `fullAccess` does not grant it either.
10. **Optimisation never mutates.** Both accept paths recompute the suggestion server-side rather than applying an order the request carried. Declining is the absence of a request.
11. **A `@db.Date` column is a calendar date.** Render with `formatDateOnly`/`formatDateOnlyShort` and compare with `daysUntilDateOnly`/`isExpiredDateOnly`; `toLocaleDateString` on a Prisma `Date` shows the previous day in every negative UTC offset, and the same defect makes a valid document read as expired for the whole day it was still valid.
12. **A trip inspection is DISPATCH-scoped: one instance per trip.** Truck scope is impossible, not merely undesirable — nothing in this repo ever completes a `PlaybookInstance`, so a truck-keyed instance can never be superseded.
13. **Reads must not write.** The trip gate is a pure read; every side effect of a verdict hangs off the submit. A render-time redirect that skips the submit skips all of them, and no row assertion will ever see it (quick-548/549).
14. **The screen must not assert what it cannot know.** A page rendered from a pure gate read cannot claim a notification was delivered; a checklist with no signature step cannot claim a name was recorded. Both were fixed by changing the sentence, not by fabricating a record.
15. **Every sentence containing a count is built as one string** in `template-copy.ts` / `inspection-handlers.ts`, never assembled from JSX children.
16. **Thresholds and tuned values live in one constants file each** — `facility-constants.ts`, `template-constants.ts`, `optimisation-constants.ts`, `end-stop-constants.ts`, `inspection-constants.ts`, `board-constants.ts`, `notification-constants.ts` — grep-verified single occurrence, imported by the tests rather than restated.
17. **A model that scopes by `orgId` must be added to `EXEMPT_MODELS`** in the same change that adds it to `schema.prisma`, or the tenant extension injects `tenantId` and no query against it can ever succeed.
