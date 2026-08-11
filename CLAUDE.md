# GSD (Get Shit Done) Workflow

Always use the GSD system for development tasks:
- For new projects: use `/gsd:new-project`
- For quick tasks and bug fixes: use `/gsd:quick`
- For feature work: follow the full phase workflow (`/gsd:discuss-phase` → `/gsd:plan-phase` → `/gsd:execute-phase` → `/gsd:verify-work`)
- For progress checks: use `/gsd:progress`

When the user asks you to build, fix, or change code, default to the appropriate GSD command rather than working ad-hoc.

# UI/UX Pro Max — Auto-Trigger

When the user asks about anything design-related, **automatically run the UI UX Pro Max skill** before responding. This includes requests involving:

- Building, designing, or improving UI components or pages
- Choosing colors, fonts, typography, or styles
- Landing pages, dashboards, forms, modals, navbars, sidebars, cards
- Reviewing UI/UX quality, accessibility, or responsiveness
- Dark mode, light mode, theming, or visual polish
- Charts, data visualization, or layout decisions
- Any mention of: design, UI, UX, style, palette, theme, look and feel, visual, aesthetic, responsive, accessibility

**Workflow:**
1. Analyze the request to extract product type, industry, style keywords, and stack
2. Run the design system generator: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --design-system -p "DriveCommand"`
3. For stack-specific guidance: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --stack nextjs`
4. Apply the recommendations when writing code
5. Before delivering, verify against the Pre-Delivery Checklist in the skill's SKILL.md

**DriveCommand defaults:**
- Stack: `nextjs` (Next.js + Tailwind + shadcn/ui)
- Industry: logistics / fleet management / SaaS
- Style: professional, modern, dark mode supported

---

# Project Overview

**DriveCommand** is a multi-tenant SaaS fleet management platform for small-to-mid-size trucking companies. It covers the full owner + driver workflow: trucks, drivers, routes, loads, compliance documents, invoicing, payroll, CRM, GPS tracking, HOS logging, and AI-powered tools (profit predictor, document reading, auto-comms).

- **Competitor/inspiration:** TorqueAI / KordovaTek (https://www.kordovatek.com/)
- **Current milestone:** v5.0 — Mobile App (React Native / Expo)
- **Deployed at:** Vercel (web), EAS (mobile)
- **Total LOC:** 71,500+ TypeScript across ~1,400 commits

---

# Architecture

## Monorepo (Turborepo)
```
DriveCommand/
├── apps/
│   ├── web/          — Next.js 15 App Router (owner + driver + sysadmin portals)
│   └── mobile/       — React Native 0.76, Expo SDK 52, Expo Router v4
├── packages/
│   ├── types/        — Shared TypeScript interfaces
│   ├── validation/   — Shared Zod schemas (17 schemas migrated from apps/web)
│   └── api-client/   — Bearer token REST client for mobile → web API
└── turbo.json
```

## Web Stack (`apps/web`)
- **Framework:** Next.js 15 App Router
- **UI:** Tailwind CSS + shadcn/ui components
- **DB ORM:** Prisma 7 (schema at `apps/web/prisma/schema.prisma`)
- **Database:** Supabase PostgreSQL (session pooler, IPv4+IPv6)
- **Auth:** Supabase Auth — sessions stored server-side, claims in `app_metadata`
- **Storage:** Cloudflare R2 (S3-compatible) for document/photo uploads
- **Email:** Gmail SMTP via Nodemailer
- **Cron:** `/api/cron/` routes (send-reminders, geofencing, IFTA)
- **Rate limiting:** Upstash Redis
- **Error monitoring:** Sentry
- **Logging:** Structured logger (222 console.* replaced)

## Mobile Stack (`apps/mobile`)
- **Framework:** React Native 0.76 + Expo SDK 52 + Expo Router v4
- **Styling:** NativeWind v4 (Tailwind for RN) + `useThemeColors()` token system
- **Auth:** Supabase Auth + AES-256-GCM Bearer tokens → MMKV session persistence
- **Navigation:** Expo Router file-system routing with `(driver)/` and `(owner)/` route groups
- **Maps:** Mapbox (`@rnmapbox/maps`) — replaced react-native-maps
- **Directions:** OSRM (open-source routing, `lib/geo/osrm.ts`)
- **Lists:** FlashList (high-performance, replaced all FlatLists)
- **Images:** expo-image
- **State/cache:** TanStack Query (server state), MMKV (local persistence)
- **Offline:** MMKV-backed mutation queue with exponential backoff flush on reconnect
- **Push notifications:** Expo Push Notifications (expo-server-sdk)
- **Background tasks:** expo-task-manager (GPS tracking)
- **OTA updates:** EAS Update (configured for preview + production)
- **Error monitoring:** Sentry (mobile)

---

# Auth System

## Web
- **Provider:** Supabase Auth
- **Session:** Server-side cookie, validated via `lib/auth/supabase.ts`
- **Claims location:** `app_metadata` (NOT `user_metadata`) — security hardened in Phase 37.6
- **Key file:** `apps/web/lib/auth/supabase.ts` — consolidated from session.ts + server.ts + require-permission.ts
- **Roles:** `owner`, `driver`, `sysadmin`
- **Permissions:** RBAC system with `require-permission.ts` guard (added quick-90)

## Mobile
- **Tokens:** AES-256-GCM Bearer tokens generated at login, validated by `validateMobileToken` utility
- **Session:** MMKV-persisted, 401 interceptor auto-logs out on expiry
- **Role routing:** `(driver)/` and `(owner)/` route groups based on decoded role
- **API auth:** All `/api/mobile/*` routes validate Bearer token

---

# Database (Prisma Schema — Key Models)

- **Tenant** — multi-tenant root (all data scoped by tenantId)
- **User** — linked to Supabase Auth, has role + tenantId in app_metadata
- **Truck** — fleet vehicles, auto-status badges (In Use / In Maintenance / Expired Docs / Ready to Use)
- **Driver** — driver profile, linked to User
- **Route** — multi-stop route with leg sequencing
- **RouteStop** — stops with lat/lng, contactName/Phone, bolNumber, poNumber, loadId link
- **Load** — individual load/shipment, pickupStopId + deliveryStopId FKs, routeId FK, sequence
- **DriverHOSEntry** — Hours of Service logs (14h driving / 11h duty math)
- **DriverIncident** — incident reports with photo attachments
- **FleetMessage** — owner↔driver messaging (recipientId + isBroadcast, loadId scoped)
- **Document** — driver/truck compliance docs + RATE_CONFIRMATION type, R2 storage
- **Invoice** — trucking-standard with freight fields (BOL/PRO/PO/commodity/weight/pieces/loaded miles), FSC
- **InvoiceItem** — typed items (LINEHAUL/FSC/DETENTION/STOP_OFF etc.) with unitType
- **PushToken** — Expo push tokens per user for notifications
- **GpsReport** — periodic GPS pings from mobile background task
- **SysAdminInvoice** — billing from sysadmin to tenants
- **SupportTicket** — in-app support with screenshot capture + file attachment

Migration strategy: Prisma migrate deploy via hook on every migration.sql write.

---

# Web Portals (`apps/web/src/app`)

## Owner Portal (`/owner/`)
- **Dashboard** — KPI grid (revenue, loads, active drivers, compliance alerts), notification panel, 6-metric financial cards, live map
- **Routes** — create/edit/view routes with multi-stop leg sequencing, continuity warnings
- **Loads** — CRUD, status workflow, route assignment, truck assignment, driver assignment, revert status, rate confirmation PDF, load documents section, load-scoped messages
- **Drivers** — invite flow (accept-invitation), driver list with compliance dots, driver detail
- **Trucks** — CRUD, document upload, auto-status badges, maintenance logs, safety alerts
- **Invoices** — trucking-standard invoicing: freight details (BOL/PRO/PO/commodity/weight/pieces/miles), FSC%, typed line items, PDF
- **Payroll** — payroll records per driver
- **CRM** — customer/contact management
- **Compliance** — document expiry dashboard
- **Integrations** — ELD (Samsara, Motive/KeepTruckin), accounting, factoring
- **Profit Predictor** — AI lane profitability before accepting loads (AddressAutocomplete + OSRM distances)
- **IFTA** — quarterly fuel tax report (miles/fuel by state)
- **Team & Permissions** — RBAC, invite drivers, set permissions before invite
- **Customer Tracking** — public `/track/[token]` page for shipment visibility
- **Support** — SupportTicketFAB on every page, screenshot capture, file attachment

## Driver Portal (`/driver/`)
- **Dashboard** — active load card, stat chips, My Route card
- **Loads** — load list + detail, status update modal, stop timeline
- **History** — completed loads + completed routes
- **Documents** — upload/view compliance docs (R2 + presigned URLs)
- **Messages** — load-scoped chat with owner/dispatcher, unread badge polling
- **HOS** — Hours of Service: 2×2 status grid, day bar, countdown clocks, status change modal
- **Incidents** — report incidents with photo capture + severity toggle

## SysAdmin Portal (`/sysadmin/`)
- **Tenants** — manage all tenant accounts
- **Support Tickets** — view/resolve all tenant tickets, platform badge, AI suggestion
- **Invoicing** — billing to tenants, email delivery, overdue cron

---

# Mobile App (`apps/mobile`)

## Driver Portal (`(driver)/`)
- **Home/Dashboard** — active load card, 3 stat chips, alerts, My Route shortcut
- **Loads** — Active/History tabs, LoadCard, load detail with stop timeline + status update modal
- **My Route** — route detail with loads timeline, truck card, route messages thread
- **Map** — full MapView (Mapbox) with OSRM polyline, route info panel, Start Navigation button
- **HOS** — status grid, day bar (14h/11h), countdown clocks, status change confirmation
- **Incidents** — form with SeverityToggle + photo capture
- **Documents** — FlashList, DocumentDetailSheet (expo-web-browser), DocumentUploadSheet
- **Messages** — iMessage-style chat UI, 30s polling, mark-read on focus, unread badge
- **More** — settings, nav preference, appearance (dark/light), support ticket

## Owner Portal (`(owner)/`)
- **Dashboard** — 4 KPI tiles (revenue/loads/drivers/compliance), tappable driver status chips, tappable load cards
- **Loads** — 4-tab filter (All/Active/Pending/Delivered), CreateLoadSheet, load detail with assign driver/change status/cancel
- **Drivers** — list with compliance dots, driver detail (current load, docs, incidents, quick actions), edit bottom sheet
- **Trucks** — list with status badges, truck detail with maintenance log + edit bottom sheet
- **Map** — live fleet map (Mapbox), VehicleMarker (status-colored), VehicleDetailSheet
- **Fleet Messages** — RecipientSelector (broadcast or individual driver), compose + history, push notification delivery
- **Routes** — list + detail with 4-tab filter
- **CRM** — contact list + tappable detail/edit screen
- **Invoices** — list screen (stub)
- **Payroll** — list + detail bottom sheet + create FAB
- **Compliance** — list (stub)
- **Profit Predictor** — AddressInput + OSRM distance auto-fill, recommendation banner
- **Fuel Log** — FlashList, AddFuelModal with truck picker
- **More** — Settings, Appearance, Nav Preference, Support

## Mobile Infrastructure
- **useThemeColors()** — token system (background/surfaceCard/surfaceElevated/border/brand/text*) — applied across all 29+ screens
- **Dark/Light mode** — AsyncStorage persisted, NativeWind dark mode class toggling
- **Offline queue** — MMKV-backed, exponential backoff, auto-flush on NetInfo reconnect, SyncStatusBar
- **Background GPS** — expo-task-manager, adaptive intervals (30s active / 5min idle / 10min off-duty)
- **Push notifications** — PushToken table, deep-link tap handler, NotificationPermissionModal
- **Skeleton loaders** — all list/detail screens have skeleton variants (no spinners)
- **Haptics** — 14 trigger points across both portals
- **Animations** — AnimatedScreen FadeIn 200ms on all screens, spring BottomSheet
- **Accessibility** — accessibilityLabel + accessibilityRole on all icon-only interactive elements

---

# Key Conventions

## API Routes
- Web API routes: `apps/web/src/app/api/`
- Mobile API routes: `apps/web/src/app/api/mobile/` — all require Bearer token via `validateMobileToken`
- Rate limiting: all `/api/mobile/*` routes have Upstash rate limiting
- Auth claims: always read from `app_metadata`, never `user_metadata`

## File Patterns
- Server actions: `apps/web/src/actions/` — use `ActionState<T>` from `packages/types`
- Shared types: `packages/types/src/` — import as `@drivecommand/types`
- Shared validation: `packages/validation/src/` — import as `@drivecommand/validation`
- API client: `packages/api-client/src/` — used by mobile only
- **Rebuild package `dist/` before typechecking or running** (`npx tsc` in `packages/validation` / `packages/api-client`) — `main` points at gitignored `dist/`, so new exports are invisible until built; hides well because type-only imports still resolve. Recurring: bit Document Import phases 1, 2 and 3

## Mobile Patterns
- All screens import `useThemeColors()` from `@/hooks/useThemeColors` for styling
- Lists use FlashList, not FlatList
- Images use expo-image, not Image from react-native
- Bottom sheets use the shared `BottomSheet` component from `components/ui/`
- FABs use `TouchableOpacity` with `haptics.medium()` on press
- Never use Expo Go — always test on Android emulator (native modules: MMKV, Mapbox)

## Geocoding & Distances
- Address autocomplete: `/api/geocoding/autocomplete` (Nominatim proxy, 60s cache)
- Road distances: `/api/geocoding/distance` (OSRM proxy, replaces haversine)
- OSRM utility: `apps/web/lib/geo/osrm.ts`

## Testing
- Android emulator only (native modules incompatible with Expo Go)
- Web E2E: Playwright (Phase 27), unit tests: Vitest (quick-132)
- Run `tsc --noEmit` before every Vercel deploy

## Deployment
- **Web:** `vercel --prod` (Vercel CLI only — never `git push` for deploys)
- **Mobile:** EAS Build + EAS Update for OTA
- **After every commit:** `git push origin master` to keep GitHub in sync

---

# Phase History (v5.0 Mobile — Phases 29–37.x)

| Phase | What was built |
|-------|---------------|
| 29 | Turborepo monorepo setup, Expo scaffold, shared packages (types/validation/api-client) |
| 30 | Mobile auth (AES-256-GCM Bearer tokens, MMKV session, login screen, AuthContext, role routing), navigation shell (tab navigators, 9-component UI library) |
| 31 | Driver REST API endpoints, TanStack Query, driver dashboard, loads list + detail, status update modal |
| 32 | DriverHOSEntry + DriverIncident DB models, HOS REST endpoints + full screen, incident report form + photo capture |
| 33 | Background GPS (expo-task-manager, adaptive intervals), push notifications (PushToken, expo-server-sdk, deep linking), offline mutation queue (MMKV, backoff, SyncStatusBar) |
| 34 | Driver documents screen (R2 presigned URLs, upload sheet), driver messaging screen (load-scoped, polling, unread badge) |
| 35 | Owner dashboard (KPI REST + KPICard + DriverStatusChip), owner loads management (4-tab, CreateLoadSheet, detail actions), owner driver management |
| 36 | Owner live map (Mapbox VehicleMarker + VehicleDetailSheet, 60s refresh), fleet messaging (RecipientSelector, broadcast + targeted, push delivery) |
| 37 | Polish: touch targets, FlashList audit, skeleton loaders, animations + haptics + dark mode, thumb-friendliness, NativeWind migration, accessibility labels, form validation |
| 37.1 | Driver portal gaps: My Route detail screen, MessageBubble, SupportTicketFAB |
| 37.1.1 | Data pipeline: RouteStop ↔ Load links (loadId FK, pickupStopId/deliveryStopId), geocoding utility, RouteStop auto-sync |
| 37.1.2 | Invoicing trucking standard: InvoiceItemType/InvoiceItemUnit enums, 7 freight header fields, FSC auto-calc, quick-add buttons, detail + edit UI |
| 37.6 | Web auth security hardening: claims migrated to app_metadata, auth helpers consolidated to supabase.ts (74 imports updated) |
| 37.7 | Driver map + navigation: Mapbox migration, OSRM directions backend, full MapView with polyline + info panel, tab bar restructure (5+More), Start Route → nav deep link, nav-settings screen |

---

# Phase History (Document Import — spec `docs/specs/DocumentImport_TechnicalSpec_v1.md`)

Own numbering, separate from v5.0 Mobile above. Plans and per-phase summaries in `.planning/document-import/`.

| Phase | What was built |
|-------|---------------|
| 1 | Data model + extraction service (spec §5/§6): 4 new tables (`document_imports`, `document_import_pages`, `facility_external_references`, `document_profiles`) + 23 additive columns, canonical Zod schema in `packages/validation`, 8-state lifecycle, SHA-256 dedupe as a real DB index, per-page extraction cache, consignment merge (same shipment ref → page span, union; different ref → repeat, sum; none → warn, do not sum), CSV via papaparse. `.xlsx` deferred — no library and none may be installed |
| 2 | Upload + intake: one transport-neutral `handlers.ts` under both surfaces (11 route files mirrored, session cookie vs Bearer), presigned upload + `assertTenantKey`, `persistence.ts`, start/extract/cancel/re-shoot/summarise/resume, web wizard with dnd-kit reorder + mobile staging screens, duplicate upload → 409 offering open-existing or import-as-correction |
| 3 | Client + contract resolution and the summary card (spec §4.1/§4.2): the whole view computed on read, nothing stored — only an exact normalised name match auto-selects (fuzzy capped at 0.99, never 1.0), document-profile alias learning, one-time spot contract for rate confirmations, "why" affordance on every auto-resolved row, 6 route files. Followed by quick-508 (commit the auto-resolved client at the mutation boundary), quick-509 (resolution provenance stored at write time, not inferred at read), quick-510 (the contract twin `ensureContractCommitted` + removal of the footer's false "saved" claim) |
| 4 | Facility resolution ladder (spec §7): T1 learned external reference `(tenant, client, code)` → silent link · T2 normalised address exact match within tenant → silent link + backfill ref · T3 fuzzy ≥ threshold → PROPOSE, requires a human tap · T4 nothing → pre-filled create form, requires a human tap. Shared address normaliser (`address.ts`), external refs written on every confirmation and T2 backfill, stop links + provenance under `resolution_provenance.stops` (no DDL) |
| 5 | Stop review (spec §10): the list (drag on web via installed `@dnd-kit`, **arrows on mobile — no gesture handler is installed and none may be**), the 11-field detail editor, bulk apply, and blocking validation. `Review stops` is live on both surfaces; the summary card is still the only way in. Pure `stop-review.ts` + writing `stop-review-service.ts`, 6 mirrored route files, 4 additive keys on `consignmentSchema` (jsonb, **no DDL**) |
| 6 | Route template matching (spec §8): candidates on the contract, widened to the client only when it has none and **visibly labelled** · Jaccard over **resolved facility IDs**, ordering ignored, ×0.8 when stop counts differ >30% · thresholds 0.75 / 0.45 in `template-constants.ts` and nowhere else · the three presentations · application (template supplies order/windows/documents/standing notes; import supplies quantities/references/per-stop notes) · post-commit offer, auto-create behind the tenant setting with the near-duplicate guard, one-tap save. Pure `template-matching.ts`, read-only `template-lookup.ts`, writing `template-service.ts`, 4 mirrored route files, 3 additive keys on `consignmentSchema` + a `template` key on `resolution_provenance` (jsonb, **no DDL**). Items 5–7 are built and reachable but **cannot fire until Phase 8's commit calls `runPostCommitTemplateStep`**. Followed by quick-515 (render standing notes, defer window materialisation to commit) and quick-516 (`Change` opens a chooser over the new uncapped `TemplateSlotView.alternatives` instead of declining; `Look again` becomes `clearTemplateDecision` / `action: 'reset'`) |

**Hard rule:** T3 and T4 **never create a facility without an explicit human tap** — enforced by the verdict union's shape (T3/T4 members carry no facility id) and by `autoLinkTarget()`, not by a check an edit could drop. A polluted facility table is unrecoverable.

- **The 31-pair address fixture is the matcher's permanent guardrail.** `__fixtures__/facility-address-pairs.fixture.json`, read from disk and driven through the real normaliser and scorer. 11 negatives, including same-street/different-number and N-vs-W on the Chicago grid. Weakening a NO_MATCH pair to make a run green is a task failure, not a fix. Integrity guard asserts contiguous ids + a length floor, so adding pairs is free and deleting them is not.
- **Threshold and weights live in `facility-constants.ts` and nowhere else** — grep-verified single occurrence. Tests import the constant rather than restating it.
- **DEC-14 — `facility_external_references.resolved_via` admits only `T1|T2|T3|T4`.** Writing the richer provenance vocabulary there is a Postgres 23514 on every confirmation. **Read `pg_constraint` before writing any enum-ish carrier column** — these tables carry CHECKs seeded in early migrations that do not track the app's vocabulary (same class as `facility_type`, where `shipper`/`receiver` were deleted by TKT-0016; consignee → `customer_site`, origin → `warehouse`). A faked DB in a unit test is not evidence about SQL.
- **Stop review state is `document_imports.reviewed_extraction`, and array order IS the running order.** Reorder is a server write, never component state (Phase 5's stated drift risk). Reorder **permutes `resolution_provenance.stops` alongside the consignments** so a human's T3/T4 confirmation moves with its stop; the `stopFingerprint` is carried untouched, so an already-stale link is still dropped. That is not the "re-key on position" Phase 4 warned against — position is precisely what changed, and the permutation was handed to us.
- **Bulk apply takes `stopIndexes[]` — the selection — and the server walks the whole array.** There is no rendered-row list below the component layer on either surface. Do not "optimise" it into anything that knows what is on screen.
- **`stops.stop_type` admits only `pickup|delivery|fuel_stop|layover|relay_handoff`**, and **`stops."bolRequired"`/`"podRequired"` are camelCase** — `bol_required` does not exist, unlike every snake_case neighbour on that table. Same class as DEC-1 and DEC-14: read `pg_constraint` and `information_schema`, never infer a name from the convention around it.
- **Template matching scores over resolved facility IDs, never names** — "RUSS DARROW HONDA" is three dealerships in one metro. An **unresolved** stop contributes a synthetic member that cannot match, rather than being dropped: dropping them lets a half-resolved manifest score 1.0 against a template covering only the resolved half. Thresholds and the ×0.8 downweight live in `template-constants.ts`, grep-verified.
- **Template SELECTION auto-collapses at 0.75 and commits at the mutation boundary; template APPLICATION is always an explicit tap.** Applying rewrites the running order, so reading "collapse" as "apply" would put the module's biggest write on a GET. `resolution_provenance.template.appliedAt` distinguishes them on the row.
- **quick-518 — a stop a previous template inserted is NOT part of the import.** `buildTemplateDiff` filters `templateInserted`, so a ghost cannot be MATCHED by the next template (which is how `mergeTemplateStop` used to clear its `skipped` and promote it into the trip), is not appended as IMPORT_ONLY, and — since the merge walks `diff.rows` — is dropped with its provenance link and re-derived by the incoming template. Signal is `isTemplateInsertedStop`: `templateOrigin === 'TEMPLATE_ONLY'` AND `skipped` AND no document backing, a **conjunction so every direction of doubt keeps the row** (a kept ghost, one with typed freight, a skipped document stop, a pre-Phase-6 row are all untouchable). **Never widen that predicate to a disjunction** — deleting a customer's freight is unrecoverable, a stale ghost is a glance. Also the reason a deferral needs checking against the paths the *same* session added: 517 called this unreachable from one component's conditional while 516's chooser was the way in.
- **quick-517 — a SKIPPED stop must not reach the scorer; an UNRESOLVED one must.** Two opposite rules on the same function. `facilitySetForImport` filters `skipped` (not on today's run at all) and keeps unresolved stops as synthetic members (on the run, location unknown — dropping them lets a half-read manifest score 1.0). Applying a template inserts its TEMPLATE_ONLY rows as `skipped: true`, and the next read resolves them at T2, so before the filter one applied template silently pushed every later score down twice over: an extra union member AND a stop-count difference past the tolerance, firing the ×0.8. **`buildTemplateDiff` deliberately still sees every stop** — `applyTemplateToConsignments` walks it, so filtering there deletes consignments off the stop list. Scoring and merging want different inputs.
- **quick-517 — sentences with a count go through `template-copy.ts`, never inline JSX.** `<p>{n} stop{n===1?'':'s'} will take …</p>` is four children, three of them whitespace-sensitive, and the dialog rendered "4 stopswill" on screen twice across two investigations that both blamed JSX trimming and were both wrong (the compiled output always had the space). One string per sentence removes the boundary rather than the suspect. The mirror lives at `apps/mobile/lib/template-copy.ts`; keep the wording in step.
- **quick-516 — a stored slot decision short-circuits the view on the KEY'S PRESENCE, so "undo the decision" means DELETING the key, never writing another one.** `buildTemplateSlot` returns `DECLINED` before it scores anything when `resolution_provenance.template` exists with `via: 'NONE'`. That is correct — a stored answer must outrank anything computed — and it is why "Look again" looked dead: it was wired to a re-fetch, which re-read the decision instead of clearing it. **A control that has to change a stored decision is a POST, always.** Same trap waits on the client, contract and stop slots. Also: `TemplateSlotView.candidates` is the middle band's list and is CAPPED at three; `alternatives` is the chooser's and is deliberately uncapped — do not unify them.
- **quick-519 — `DialogContent` is a GRID, and an `auto` grid track's minimum is the MAX of its items' min-content widths.** A `truncate`d chip's min-content is its **whole string** (`truncate` sets `white-space: nowrap`, and nowrap makes min-content = max-content), and **percentage max-widths are ignored during intrinsic sizing**, so `max-w-full` constrains nothing at track-sizing time. One 54-char facility name therefore widened the whole dialog past its own `max-w-lg`, which produced BOTH a horizontal scrollbar (`overflow-y-auto` forces `overflow-x` to `auto` — a `visible`/`auto` pair is illegal in CSS) AND a subtitle that appeared to clip mid-word (`DialogHeader` is a sibling grid item stretched to the same over-wide track). **Two symptoms, one cause, and neither was in the element that looked wrong** — the subtitle was never broken. The fix is `grid-cols-[minmax(0,1fr)]` on the dialog: an explicit zero-minimum track, after which `max-w-full` + `truncate` work again because percentages resolve normally at layout time. Fix it on the *consumer*, never on the shared `ui/dialog.tsx` primitive. **On mobile the same class of bug needs a different fix: RN defaults `flexShrink` to 0, unlike web** — so `numberOfLines={1}` alone does NOT stop a long string sizing to its full width and pushing a row past 360pt. Shrink first, then ellipsise.
- **`route_template_stops.stop_type` admits FOUR values (`pickup|delivery|fuel_stop|layover`) — `relay_handoff` is legal on `stops` and a 23514 here.** Also `route_templates.schedule_type ∈ fixed_days|frequency|on_call` and `equipment_type ∈ dry_van|flatbed|reefer|tanker|step_deck|other`. The tenant setting is `Tenant."autoCreateRouteTemplatesFromImports"` — camelCase column on a PascalCase table. All four read off production, not inferred.
- **The route-template save path is `lib/carrier/route-template-save.ts`** — lifted out of the `saveRouteTemplate` server action, which is now a wrapper. Do not fork it; a server action cannot serve `/api/mobile/*` (no cookie, no `x-tenant-id`).
- **quick-511 — the ladder context must derive the *effective* client**, via the shared deterministic resolver (`resolveEffectiveClientId`), never `record.clientId` alone. That column is null whenever a client auto-resolved and no mutation has fired (quick-508), and scoping the reference lookup by it makes T1 unreachable — every learned code silently falls to T2. View and commit paths must reach the same client or the card's tier is not the tier that gets written.

---

# Completed Web Features (Pre-Mobile Phases 1–28)

- **v1.0:** Core CRUD — trucks, drivers, routes, loads, documents, basic dashboard
- **v2.0:** Financial layer — expenses, payments, revenue tracking, cost-per-mile, profit alerts
- **v3.0:** Compliance, route improvements, driver document expiry notifications
- **v4.0:** SysAdmin portal, SysAdmin invoicing (email delivery + overdue cron), QA scripts, Playwright E2E tests, driver history, RBAC permissions
- **Quick tasks 1–150:** 150+ quick tasks shipped including: invoice UI, payroll UI, dispatch/load management, automated comms, AI document reading, AI profit predictor, profit-per-lane analysis, compliance dashboard, integrations framework, GPS tracking (Samsara, Motive, browser geolocation), geofencing alerts, IFTA reporting, customer tracking public page, rate confirmation PDF, support tickets with screenshots, DriveCommand logo system, Supabase Auth migration, iMessage fleet messaging, security hardening (CSRF, structured logging, zero @ts-ignore, OpenAPI spec), code quality audit, performance audit (pagination, FlashList, aggregate stats), 3 missing composite indexes, production readiness (Sentry, EAS OTA, rate limiting), OSRM real road distances, dark/light theme toggle

---

# Current State (as of 2026-04-04)

- **Active milestone:** v5.0 Mobile App
- **Last completed phase:** 37.7 — Driver Map + Navigation (Mapbox, OSRM, tab restructure, nav deep links)
- **Also completed same day:** Phase 37.1.2 — Invoicing Trucking Standard (freight fields, FSC, typed items)
- **Next up:** Continue v5.0 mobile — see `.planning/STATE.md` for exact position
- **Pre-store checklist:** Apple Developer ($99), Google Play ($25), EAS credentials, Google Maps API key in app.json — must be done before Phase 38

---

# Important Reminders

- **Figma token expires May 17, 2026** — regenerate in Figma Settings → Personal Access Tokens
- **Store enrollment** — Apple Developer ($99), Google Play ($25), EAS (free) — must complete before Phase 38
- **Before Phase 38** — fill in eas.json Apple/Google credentials, add google-play-key.json to EAS Secrets, replace Google Maps API key placeholder in app.json
- **Deploy:** Always `vercel --prod`, never GitHub push for deploys
- **Mobile terminal:** Always `cd apps/mobile` before running Expo/EAS commands
- **TypeScript:** Run `tsc --noEmit` before every Vercel deploy — **and check it is not lying.** `tsconfig.json` includes `.next/dev/types/**/*.ts`, so a Next-generated file left corrupt by an interrupted `next dev` (quick-517 found one truncated mid-write) puts a SYNTAX error in the program, and tsc then reports only that file and **silently skips semantic checking of all source**. If the only errors are inside `.next/`, the gate is blind, not green: delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then re-run. **The rule is broader than `.next/`, and quick-519 proved it: a PARSE error (TS1110/TS1161/TS1354) in ANY file in the program — including an untracked, half-written file belonging to work you are not doing — suppresses semantic checking of everything.** 519 hit 10 untracked files carrying literal stray tool-output text (`</content>`, `</invoke>`) appended after real source, from a concurrently-running session. So: **whenever the reported errors are all syntax errors, or all in files you did not touch, the gate is blind.** **Always probe rather than infer** — inject `const x: number = 'y'` into the file you actually edited and confirm tsc reports THAT error before believing a clean run. Delete your probe afterwards; 519 found a previous run's `__probe.ts` still sitting in `src/lib/document-import/`.
- **Git:** Always `git push origin master` after every commit

---

# Workflow Engine Spec — Always Load

 

When any task touches Checklists & Workflows, Playbooks, Step Templates, Active Checklists, Tasks, Auto-Start Rules, or DVIR flows:

1. Read docs/specs/workflow-engine.md in full before writing code.

2. Section 14 defines scope per phase — do not build ahead.

3. UI copy uses only user-facing names (Section 3 naming table).

4. Follow existing codebase conventions — do not introduce new patterns.