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
- **TypeScript:** Run `tsc --noEmit` before every Vercel deploy
- **Git:** Always `git push origin master` after every commit

---

# Workflow Engine Spec — Always Load

 

When any task touches Checklists & Workflows, Playbooks, Step Templates, Active Checklists, Tasks, Auto-Start Rules, or DVIR flows:

1. Read docs/specs/workflow-engine.md in full before writing code.

2. Section 14 defines scope per phase — do not build ahead.

3. UI copy uses only user-facing names (Section 3 naming table).

4. Follow existing codebase conventions — do not introduce new patterns.