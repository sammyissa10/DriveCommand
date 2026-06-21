# Feature Modules

Reference guide for every major feature module in DriveCommand. Each entry includes the URL path, a description of what the module does, and the key source files.

---

## Owner Portal

All owner portal modules live under `src/app/(owner)/` and are accessible to users with the `OWNER` or `MANAGER` role.

---

### 1. Trucks — `/trucks`

Manage the fleet. Add trucks with VIN, make, model, year, and odometer reading. Track truck documents (registration, insurance) with expiry date alerts. View maintenance history and scheduled services per truck.

**Key files:**
- `src/app/(owner)/trucks/`

---

### 2. Drivers — `/drivers`

Manage drivers within the tenant. Invite new drivers via email (creates a `DriverInvitation` record and sends an invitation email with an accept link). View driver profiles, assigned routes, documents, and safety scores. Drivers accept their invitation and set their password via `/accept-invitation`.

**Key files:**
- `src/app/(owner)/drivers/`
- `src/lib/email/send-driver-invitation.ts`

---

### 3. Routes — `/routes`

Create and track trips. A Route connects a driver, a truck, an origin, and a destination with a scheduled date. Supports multi-stop routes via the `RouteStop` model (ordered stops with address, type, and arrival status). Owners can track route status (`PLANNED` → `IN_PROGRESS` → `COMPLETED`) and attach expenses and payments to each route.

**Key files:**
- `src/app/(owner)/routes/`

---

### 4. Loads — `/loads`

Manage freight loads through the full dispatch lifecycle: `PENDING` → `DISPATCHED` → `PICKED_UP` → `IN_TRANSIT` → `DELIVERED` → `INVOICED`. Loads are linked to customers, drivers, trucks, and routes. Each load gets a unique `trackingToken` that powers the public shipment tracking page at `/track/[token]`.

**Key files:**
- `src/app/(owner)/loads/`
- `src/app/track/` (public tracking page)

---

### 5. Trips / Dispatch — `/carrier/trips`

Schedule and manage driver assignments. A Trip connects a driver, truck, and sequence of stops into a single dispatchable unit. Supports multi-stop routes, multi-load trips (LTL scenarios), template-based recurring dispatches, stop reordering via drag-drop, and driver pay generation on completion.

Status workflow: `planned` → `in_progress` → `completed` (or `cancelled` / `tonu`). Starting a trip locks the driver and truck assignments. Completing a trip auto-generates driver pay records and can trigger the next recurring dispatch if created from a template.

**Key features:**
- Dispatch number auto-generation (`DC-YYYY-NNNNN`)
- Route template inheritance for recurring trips
- Stop sequencing with appointment windows
- BOL/POD document tracking per stop
- Load attachment and pending stop persistence
- Driver readiness enforcement (Phase 45)
- Workflow playbook triggers (`ON_DISPATCH_CREATE`, `ON_DISPATCH_DEPART`, `ON_DISPATCH_DELIVER`)

**Key files:**
- `src/app/(owner)/carrier/trips/` — Trip list, detail, plan editor pages
- `src/app/(owner)/carrier/driver/trips/` — Driver-facing trip pages
- `src/lib/carrier/trips.ts` — Core trip library (988 lines)
- `src/app/api/v1/carrier/dispatches/` — Trip API routes
- `docs/specs/trips.md` — Full technical specification

---

### 6. Invoices — `/invoices`

Create and manage invoices for customers. Invoices can be linked to a load or route. Supports line items, tax, due dates, and status tracking (`DRAFT` → `SENT` → `PAID` → `OVERDUE`). PDF generation for download and email delivery.

**Key files:**
- `src/app/(owner)/invoices/`

---

### 7. Payroll — `/payroll`

Track driver pay periods. Each `PayrollRecord` covers a period with base pay, bonuses, deductions, and miles logged. Status lifecycle: `DRAFT` → `APPROVED` → `PAID`. PDF payslip generation for download.

**Key files:**
- `src/app/(owner)/payroll/`

---

### 8. CRM — `/crm`

Customer relationship management. Track shippers and brokers as `Customer` records with contact info, load history, and revenue totals. Log interactions (calls, emails, meetings). Automated interactions are created when loads are updated or ETA notification emails are sent.

**Key files:**
- `src/app/(owner)/crm/`

---

### 9. Compliance — `/compliance`

Document expiry tracking. Shows upcoming expiry dates for truck documents (registration, insurance) and driver documents (licenses, applications). Aggregates safety events per driver over the last 90 days for a compliance score. Triggers email reminders via the daily cron job.

**Key files:**
- `src/app/(owner)/compliance/`
- `src/lib/email/send-document-expiry-reminder.ts`
- `src/lib/email/send-driver-document-expiry-reminder.ts`

---

### 10. AI Documents — `/ai-documents`

Upload and AI-read rate confirmations, invoices, and load tenders. Uses Claude claude-sonnet-4-6 to extract structured freight data (origin, destination, rate, dates) from PDF or image uploads. Magic-byte validation runs before the Claude API call. Extracted data can be used to auto-populate load and route forms.

**Key files:**
- `src/app/(owner)/ai-documents/`
- `src/app/api/documents/`

---

### 11. Profit Predictor — `/profit-predictor`

AI-powered profitability analysis for potential loads. Owner inputs a load (origin, destination, rate, weight) and receives an AI assessment: Accept (≥15% margin), Caution (0–14.9%), or Reject (negative margin). Uses historical lane performance and the tenant's `profitMarginThreshold` setting.

**Key files:**
- `src/app/(owner)/profit-predictor/`

---

### 12. Lane Analytics — `/lane-analytics`

Profitability analysis by route lane (origin–destination pair). Aggregates revenue, expenses, and margin per lane across all completed routes. Displays the top 10 lanes in a bar chart and the full list in a sortable table. Helps owners identify their most and least profitable lanes.

**Key files:**
- `src/app/(owner)/lane-analytics/`

---

### 13. Live Map — `/live-map`

Real-time truck location map. Displays GPS pings from the `GPSLocation` table on a Leaflet map. Truck positions update on a 30-second polling interval. GPS data is submitted by the driver app (browser geolocation) or a connected ELD (Samsara, Motive) via the GPS API endpoint.

**Key files:**
- `src/app/(owner)/live-map/`
- `src/app/api/gps/`

---

### 14. Fuel Dashboard — `/fuel`

Fuel economy tracking. Log fill-ups (quantity, cost, odometer) per truck. Dashboard shows MPG trends, cost per mile, and total fuel spend over time. Supports estimated fuel records for routes without explicit fill-up data.

**Key files:**
- `src/app/(owner)/fuel/`

---

### 15. Safety Analytics — `/safety`

Driver safety scoring. `SafetyEvent` records (harsh braking, speeding, etc.) are logged per truck, driver, and route. Dashboard shows event counts by type and severity, safety scores per driver, and trend charts.

**Key files:**
- `src/app/(owner)/safety/`

---

### 16. IFTA — `/ifta`

International Fuel Tax Agreement reporting. Aggregates miles driven and fuel purchased per jurisdiction using GPS ping data to detect state crossings (bounding-box method). Helps prepare quarterly IFTA filings. CSV export available.

**Key files:**
- `src/app/(owner)/ifta/`

---

### 17. Tags — `/tags`

Color labels for organizing trucks and drivers. Tags are tenant-scoped. Can be applied to trucks or users for filtering and grouping in list views.

**Key files:**
- `src/app/(owner)/tags/`

---

### 18. Settings — `/settings`

Tenant configuration. Set tenant name, timezone, and profit margin threshold. Manage third-party integrations (QuickBooks, Samsara, KeepTruckin/Motive, factoring services, email providers). Only accessible to users with the `OWNER` role.

**Key files:**
- `src/app/(owner)/settings/`

---

### 19. Support (Owner) — `/support`

Owner submits support tickets to the DriveCommand team. Each ticket has a title, description, category, and priority. Owners and the DriveCommand team can message back and forth through a `TicketMessage` thread. Ticket numbers are auto-generated in `TKT-NNNN` format.

**Key files:**
- `src/app/(owner)/support/`

---

## Driver Portal

Driver portal modules live under `src/app/(driver)/` and are accessible to users with the `DRIVER` role.

---

### 20. Driver Portal — `/my-route`, `/my-load`, `/my-tickets`, `/hours`, `/incidents`, `/messages`

Driver-facing interface for active operations:

- **My Route** (`/my-route`) — current assigned route with stop timeline; Mark Departed button for each stop.
- **My Load** (`/my-load`) — current load status with forward-only status advancement buttons (`DISPATCHED` → `PICKED_UP` → `IN_TRANSIT` → `DELIVERED`).
- **My Tickets** (`/my-tickets`) — driver's support tickets and message threads.
- **Hours** (`/hours`) — log Hours of Service (HOS) records.
- **Incidents** (`/incidents`) — report safety incidents with description and severity.
- **Messages** (`/messages`) — in-app messaging.
- **GPS** — browser geolocation tracked in the background and submitted to `/api/gps` on an interval.

**Key files:**
- `src/app/(driver)/`

---

## SysAdmin Portal

SysAdmin portal lives under `src/app/(admin)/`. Login is at `/admin/login` using the `ADMIN_SECRET_KEY` — no tenant account required.

---

### 21. SysAdmin Portal — `/admin-dashboard`, `/admin-support`, `/tenants`

DriveCommand internal tools for the platform team:

- **Dashboard** (`/admin-dashboard`) — platform metrics: total tenants, active users, system health.
- **Tenants** (`/tenants`) — view all tenants with status (Pending / Active / Suspended). Create new tenants with owner invitation flow. Activate, suspend, or reactivate tenants.
- **Support** (`/admin-support`) — cross-tenant support ticket queue. Filter by status (Open / In Progress / Closed). Reply to tickets and update status on behalf of the DriveCommand team.

Access requires the `ADMIN_SECRET_KEY` env var to be set. The admin session is managed separately from tenant sessions and uses a cookie named `admin_session`.

**Key files:**
- `src/app/(admin)/`

---

### 22. SysAdmin Invoicing — `/admin-dashboard` (invoices section)

Billing management for DriveCommand to charge tenants. Create, edit, and send invoices from DriveCommand to fleet operators. Supports line items, recurring billing flags, and status lifecycle (`DRAFT` → `SENT` → `PAID` → `OVERDUE`). Uses the `SysAdminInvoice` and `SysAdminInvoiceItem` models.

**Key files:**
- `src/app/(admin)/` (invoicing pages within admin portal)

---

## Shared / Public

### 23. Shipment Tracking — `/track/[token]`

Public page (no login required) for customers to track their shipment. Accessible via a unique `trackingToken` on each load. Shows GPS map position, status timeline, and estimated delivery info. Polling updates the map every 30 seconds.

**Key files:**
- `src/app/track/`
- `src/app/api/track/`
