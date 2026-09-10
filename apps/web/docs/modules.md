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

### 4. Loads / Dispatch — `/loads`

Manage freight loads through the full dispatch lifecycle: `PENDING` → `DISPATCHED` → `PICKED_UP` → `IN_TRANSIT` → `DELIVERED` → `INVOICED`. Loads are linked to customers, drivers, trucks, and routes. Each load gets a unique `trackingToken` that powers the public shipment tracking page at `/track/[token]`.

**Key files:**
- `src/app/(owner)/loads/`
- `src/app/track/` (public tracking page)

---

### 5. Invoices — `/invoices`

Create and manage invoices for customers. Invoices can be linked to a load or route. Supports line items, tax, due dates, and status tracking (`DRAFT` → `SENT` → `PAID` → `OVERDUE`). PDF generation for download and email delivery.

**Key files:**
- `src/app/(owner)/invoices/`

---

### 6. Payroll — `/payroll`

Track driver pay periods. Each `PayrollRecord` covers a period with base pay, bonuses, deductions, and miles logged. Status lifecycle: `DRAFT` → `APPROVED` → `PAID`. PDF payslip generation for download.

**Key files:**
- `src/app/(owner)/payroll/`

---

### 7. CRM — `/crm`

Customer relationship management. Track shippers and brokers as `Customer` records with contact info, load history, and revenue totals. Log interactions (calls, emails, meetings). Automated interactions are created when loads are updated or ETA notification emails are sent.

**Key files:**
- `src/app/(owner)/crm/`

---

### 8. Compliance — `/compliance`

Document expiry tracking. Shows upcoming expiry dates for truck documents (registration, insurance) and driver documents (licenses, applications). Aggregates safety events per driver over the last 90 days for a compliance score. Triggers email reminders via the daily cron job.

**Key files:**
- `src/app/(owner)/compliance/`
- `src/lib/email/send-document-expiry-reminder.ts`
- `src/lib/email/send-driver-document-expiry-reminder.ts`

---

### 9. AI Documents — `/ai-documents`

Upload and AI-read rate confirmations, invoices, and load tenders. Uses Claude claude-sonnet-4-6 to extract structured freight data (origin, destination, rate, dates) from PDF or image uploads. Magic-byte validation runs before the Claude API call. Extracted data can be used to auto-populate load and route forms.

**Key files:**
- `src/app/(owner)/ai-documents/`
- `src/app/api/documents/`

---

### 10. Profit Predictor — `/profit-predictor`

AI-powered profitability analysis for potential loads. Owner inputs a load (origin, destination, rate, weight) and receives an AI assessment: Accept (≥15% margin), Caution (0–14.9%), or Reject (negative margin). Uses historical lane performance and the tenant's `profitMarginThreshold` setting.

**Key files:**
- `src/app/(owner)/profit-predictor/`

---

### 11. Lane Analytics — `/lane-analytics`

Profitability analysis by route lane (origin–destination pair). Aggregates revenue, expenses, and margin per lane across all completed routes. Displays the top 10 lanes in a bar chart and the full list in a sortable table. Helps owners identify their most and least profitable lanes.

**Key files:**
- `src/app/(owner)/lane-analytics/`

---

### 12. Live Map — `/live-map`

Real-time truck location map. Displays GPS pings from the `GPSLocation` table on a Leaflet map. Truck positions update on a 30-second polling interval. GPS data is submitted by the driver app (browser geolocation) or a connected ELD (Samsara, Motive) via the GPS API endpoint.

**Key files:**
- `src/app/(owner)/live-map/`
- `src/app/api/gps/`

---

### 13. Fuel Dashboard — `/fuel`

Fuel economy tracking. Log fill-ups (quantity, cost, odometer) per truck. Dashboard shows MPG trends, cost per mile, and total fuel spend over time. Supports estimated fuel records for routes without explicit fill-up data.

**Key files:**
- `src/app/(owner)/fuel/`

---

### 14. Safety Analytics — `/safety`

Driver safety scoring. `SafetyEvent` records (harsh braking, speeding, etc.) are logged per truck, driver, and route. Dashboard shows event counts by type and severity, safety scores per driver, and trend charts.

**Key files:**
- `src/app/(owner)/safety/`

---

### 15. IFTA — `/ifta`

International Fuel Tax Agreement reporting. Aggregates miles driven and fuel purchased per jurisdiction using GPS ping data to detect state crossings (bounding-box method). Helps prepare quarterly IFTA filings. CSV export available.

**Key files:**
- `src/app/(owner)/ifta/`

---

### 16. Tags — `/tags`

Color labels for organizing trucks and drivers. Tags are tenant-scoped. Can be applied to trucks or users for filtering and grouping in list views.

**Key files:**
- `src/app/(owner)/tags/`

---

### 17. Settings — `/settings`

Tenant configuration. Set tenant name, timezone, and profit margin threshold. Manage third-party integrations (QuickBooks, Samsara, KeepTruckin/Motive, factoring services, email providers). Includes operations settings (pre-trip inspection requirements). Only accessible to users with the `OWNER` role.

**Key files:**
- `src/app/(owner)/settings/`

---

### 18. Support (Owner) — `/support`

Owner submits support tickets to the DriveCommand team. Each ticket has a title, description, category, and priority. Owners and the DriveCommand team can message back and forth through a `TicketMessage` thread. Ticket numbers are auto-generated in `TKT-NNNN` format.

**Key files:**
- `src/app/(owner)/support/`

---

### 19. Carrier Operations — `/carrier/*`

The carrier operations module covers the full dispatch workflow using the `Trip`/`CarrierLoad`/`CarrierStop` data model (as distinct from the legacy `Route`/`Load` model). Includes: trip management, live board (driver + truck views), document import, facility management, client/contract management, route templates, driver pay, and the pre-trip inspection gate.

**Key files:**
- `src/app/(owner)/carrier/`

---

### 20. Checklists & Workflows — `/checklists`

Owner-facing management of playbooks (checklist templates), step templates, and automation triggers. Owners configure pre-trip inspection checklists, onboarding workflows, and DVIR requirements. Backed by the Workflow Engine (see `docs/specs/workflow-engine.md`).

**Key files:**
- `src/app/(owner)/checklists/`

---

### 21. Help — `/help`

In-app help center with feature documentation articles. Articles are rendered from `docs-content/client/` MDX files. Article index is driven by the feature registry; only articles with a registered entry and a matching file are linked.

**Key files:**
- `src/app/(owner)/help/`

---

### 22. Subscription — `/subscription`

Owner-facing subscription and billing management. Displays the current plan, usage, and allows upgrading or managing the tenant's subscription.

**Key files:**
- `src/app/(owner)/subscription/`

---

## Driver Portal

Driver portal modules live under `src/app/(driver)/` and are accessible to users with the `DRIVER` role.

---

### 23. Driver Portal — `/home`, `/my-route`, `/my-load`, `/my-tickets`, `/hours`, `/incidents`, `/messages`, `/documents`, `/pay`, `/tasks`

Driver-facing interface for active operations:

- **Home** (`/home`) — driver dashboard: active load card, stat chips, alerts.
- **My Route** (`/my-route`) — current assigned route with stop timeline; Mark Departed button for each stop.
- **My Load** (`/my-load`) — current load status with forward-only status advancement buttons (`DISPATCHED` → `PICKED_UP` → `IN_TRANSIT` → `DELIVERED`).
- **My Tickets** (`/my-tickets`) — driver's support tickets and message threads.
- **Hours** (`/hours`) — log Hours of Service (HOS) records.
- **Incidents** (`/incidents`) — report safety incidents with description and severity.
- **Messages** (`/messages`) — in-app messaging.
- **Documents** (`/documents`) — view and upload driver compliance documents.
- **Pay** (`/pay`) — view driver pay records and settlements.
- **Tasks** (`/tasks`) — driver task list from workflow engine (checklists, pre-trip inspections).
- **GPS** — browser geolocation tracked in the background and submitted to `/api/gps` on an interval.

**Key files:**
- `src/app/(driver)/`

---

## SysAdmin Portal

SysAdmin portal lives under `src/app/(admin)/`. Login is at `/admin/login` using the `ADMIN_SECRET_KEY` — no tenant account required.

---

### 24. SysAdmin Portal — `/admin-dashboard`, `/admin-support`, `/tenants`, `/users`, `/billing`, `/plans`, `/promos`, `/automations`, `/notifications`, `/docs`

DriveCommand internal tools for the platform team:

- **Dashboard** (`/admin-dashboard`) — platform metrics: total tenants, active users, system health.
- **Tenants** (`/tenants`) — view all tenants with status (Pending / Active / Suspended). Create new tenants with owner invitation flow. Activate, suspend, or reactivate tenants.
- **Support** (`/admin-support`) — cross-tenant support ticket queue. Filter by status (Open / In Progress / Closed). Reply to tickets and update status on behalf of the DriveCommand team.
- **Users** (`/users`) — cross-tenant user management.
- **Billing** (`/billing`) — platform billing management.
- **Plans** (`/plans`) — manage subscription plan definitions.
- **Promos** (`/promos`) — manage promotional discount codes.
- **Automations** (`/automations`) — platform-level automation rule management.
- **Notifications** (`/notifications`) — platform notification template management.
- **Docs** (`/docs`) — internal documentation viewer.

Access requires the `ADMIN_SECRET_KEY` env var to be set. The admin session is managed separately from tenant sessions and uses a cookie named `admin_session`.

**Key files:**
- `src/app/(admin)/`

---

### 25. SysAdmin Invoicing — `/admin-dashboard` (invoices section)

Billing management for DriveCommand to charge tenants. Create, edit, and send invoices from DriveCommand to fleet operators. Supports line items, recurring billing flags, and status lifecycle (`DRAFT` → `SENT` → `PAID` → `OVERDUE`). Uses the `SysAdminInvoice` and `SysAdminInvoiceItem` models.

**Key files:**
- `src/app/(admin)/` (invoicing pages within admin portal)

---

## Shared / Public

### 26. Shipment Tracking — `/track/[token]`

Public page (no login required) for customers to track their shipment. Accessible via a unique `trackingToken` on each load. Shows GPS map position, status timeline, and estimated delivery info. Polling updates the map every 30 seconds.

**Key files:**
- `src/app/track/`
- `src/app/api/track/`
