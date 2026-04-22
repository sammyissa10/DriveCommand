# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Logistics owners can manage their entire operation — trucks, drivers, routes, finances, and compliance documents — from one platform, with fleet intelligence dashboards providing real-time visibility into vehicle location, driver safety, and fuel efficiency.
**Current focus:** v3.0 milestone complete — planning next milestone

## Current Position

Milestone: v5.0 Mobile App — IN PROGRESS
Phase: Phase 37.2 Owner Route Maintenance — COMPLETE
Current Plan: Plan 4 of 4 complete — 37.2-04 DONE
Status: Plan 04 complete — Maintenance UI: MaintenanceServicePicker, ScheduleServiceSheet, top-level maintenance screen with Due Soon alerts, scheduled services on truck detail with mark-complete flow, warning badge on truck list
Last activity: 2026-04-22 - Completed quick task 281: Tenant settings, user list, password reset, role change for sysadmin
Last session: 2026-04-22T18:50:00Z
Stopped at: Completed quick-281-PLAN.md — 3 tasks, 9 files modified, zero TypeScript errors

Progress: [████████████████████████████████████████████████████████] 100% (3 milestones shipped)

## Performance Metrics

**v1.0 metrics:**
- Phases: 1-10 (22 plans)
- Average duration: 4.3 min per plan
- Total execution time: 1.54 hours

**v2.0 metrics:**
- Phases: 11-15 (12 plans)
- Total execution time: 68m 59s
- Files modified: 103
- Lines added: 19,316

**v3.0 metrics:**
- Phase 16-01 (2026-02-16): Database foundation — 470s, 2 tasks, 4 files affected
- Phase 16-02 (2026-02-16): Expense line-item CRUD — 368s, 3 tasks, 5 files affected
- Phase 16-03 (2026-02-16): Payment & revenue tracking — 438s, 3 tasks, 7 files affected
- Phase 16-04 (2026-02-16): Expense category and template management — 351s, 2 tasks, 10 files affected
- Phase 16-05 (2026-02-16): Cost-per-mile analysis and profit alerts — 211s, 2 tasks, 6 files affected
- Phase 17-01 (2026-02-17): Client components for unified route view/edit — 188s, 2 tasks, 4 files affected
- Phase 17-02 (2026-02-17): Server integration with optimistic locking — 220s, 2 tasks, 3 files affected
- Phase 18-01 (2026-02-17): Driver document storage foundation — 373s, 2 tasks, 10 files affected
- Phase 18-02 (2026-02-17): Upload UI components — 396s, 2 tasks, 6 files affected
- Phase 18-03 (2026-02-17): Driver document expiry notifications — 342s, 2 tasks, 4 files affected

**v4.0 metrics:**
- Phase 25-01 (2026-03-11): SysAdminInvoice schema + server actions — 3 tasks, 5 files
- Phase 25-02 (2026-03-11): Admin billing UI (list + detail + create + edit) — 3 tasks, 8 files
- Phase 25-03 (2026-03-13): Email delivery + overdue cron — 2 tasks, 6 files
- Phase 26-01 (2026-03-13): SysAdmin portal QA test scripts — 1 task, 1 file, 3min
- Phase 26-02 (2026-03-13): Owner portal QA test scripts — 1 task, 1 file, 5min
- Phase 26-03 (2026-03-13): Driver portal QA test scripts + README — 2 tasks, 2 files, 4min
- Phase 27-01 (2026-03-16): Multi-role Playwright auth + SysAdmin E2E tests — 2 tasks, 14 files, 7min
- Phase 27-02 (2026-03-16): Owner portal E2E tests — 2 tasks, 6 files, 5min
- Phase 27-06 (2026-04-12): Carrier facilities, reports, and access boundary E2E tests — 2 tasks, 3 files, 186s
- Phase 28-01 (2026-03-21): Driver history server actions (getMyCompletedLoads + getMyCompletedRoutes) — 2 tasks, 2 files, 67s
- Phase 28-02 (2026-03-21): Driver history UI — CompletedLoadHistory + CompletedRouteHistory components, page wiring — 4 tasks, 4 files, ~5min

- Phase 29-01 (2026-03-22): Turborepo monorepo setup — Next.js migrated to apps/web/, turbo.json, stub shared packages — 10 tasks, 530 files moved, ~5min
- Phase 29-02 (2026-03-22): Expo app scaffold + NativeWind v4 + EAS config — Expo SDK 55, Expo Router v4, (driver)/(owner) route groups, Poppins font, eas.json — 10 tasks, 33 files, ~6min
- Phase 29-03 (2026-03-22): Shared packages (types, validation, api-client) — TypeScript interfaces, 17 Zod schemas migrated from apps/web, Bearer token REST client — 3 tasks, 46 files, ~7min
- Phase 30-01 (2026-03-22): Mobile auth system — AES-256-GCM Bearer tokens, MMKV session, login screen, AuthContext, 401 guard, role-based routing — 8 tasks, 8 files, ~4min
- Phase 30-02 (2026-03-22): Navigation shell — driver/owner tab navigators (lucide icons), 9-component shared UI library (Button/Card/Badge/Input/LoadingSpinner/EmptyState/Typography/ScreenWrapper/BottomSheet) — 6 tasks, 22 files, 198s
- Phase 31-01 (2026-03-23): Driver REST API endpoints — validateMobileToken utility + 4 endpoints (dashboard, loads list, load detail, status update) — 3 tasks, 5 files, 181s
- Phase 31-02 (2026-03-23): API client + driver dashboard — driverApi (4 methods), TanStack Query infrastructure, dashboard screen (load card + 3 stat chips + alerts) — 2 tasks, 9 files, ~5min
- Phase 31-03 (2026-03-22): Loads workflow — loads list (Active/History + FlashList + LoadCard), load detail (info grid + stop timeline + truck), status update confirmation modal + haptic feedback + toast errors — 3 tasks, 10 files, 325s
- Phase 32-01 (2026-03-23): DB schema foundation — DriverHOSEntry + DriverIncident models, HOSDutyStatus/IncidentCategory/IncidentSeverity enums, db push applied, HOSData + CreateIncidentPayload types — 3 tasks, 3 files, 168s
- Phase 32-02 (2026-03-23): HOS REST endpoints — GET + POST /api/mobile/driver/hos with 14h/11h clock math; api-client getHOS, updateHOSStatus, createIncident; fixed types + api-client tsconfig inheritance — 3 tasks, 4 files, ~12min
- Phase 32-03 (2026-03-23): HOS screen — HOSStatusCard + HOSDayBar + HOSClock components, full hos.tsx with 2x2 status grid, day bar, countdown clocks, confirmation modal — 2 tasks, 4 files, 162s
- Phase 32-04 (2026-03-23): Incident reporting — POST /api/mobile/driver/incidents + upload-photo endpoint, SeverityToggle (traffic light), IncidentPhotoCapture, uploadPhotoToS3 utility, incidents/new.tsx full form, dashboard button — 4 tasks, 8 files, ~5min
- Phase 33-01 (2026-03-23): Background GPS reporting — expo-task-manager background task, useBackgroundGPS hook (adaptive intervals: 30s/5min/10min), GPSPermissionModal, GET /api/mobile/driver/tracking-token, GPS status dot in tab bar — 7 tasks, 7 files, 257s
- Phase 33-02 (2026-03-23): Push notifications — PushToken model, /api/push-tokens endpoint, sendPushToUser (expo-server-sdk), fleet message + load dispatch triggers, registerPushToken hook, deep-link tap handler, NotificationPermissionModal — 7 tasks, 10 files, 333s
- Phase 33-03 (2026-03-23): Offline mutation queue — MMKV offlineQueue, flushQueue (exponential backoff), callOrQueue wrapper, SyncStatusBar (amber/blue/red), useOfflineSync (NetInfo auto-flush on reconnect), StatusUpdateButton offline-wired — 7 tasks, 7 files, 133s
- Phase 34-01 (2026-03-25): Driver documents screen — 4 REST endpoints (GET list, GET presigned URL, POST upload-url, POST create), DriverDocument types in api-client, FlashList screen with FAB, DocumentDetailSheet (expo-web-browser), DocumentUploadSheet (S3 upload + progress) — 7 tasks, 8 files, ~7min
- Phase 34-02 (2026-03-25): Driver messaging screen — unread-count + mark-read REST endpoints, getUnreadCount + markMessagesRead in api-client, 30s polling in messages screen, MMKV last-read tracking, unread badge on Messages tab icon, AppState foreground refresh — 6 tasks, 5 files, 237s
- Phase 35-01 (2026-03-24): Owner dashboard — KPI aggregates REST endpoint, KPICard + DriverStatusChip components, owner dashboard screen with 4 KPI tiles + driver status list — 3 tasks, 6 files, ~4min
- Phase 35-02 (2026-03-24): Owner loads management — 4-tab filtered loads list (All/Active/Pending/Delivered) + FAB, CreateLoadSheet (customer/driver pickers + date/rate), POST create load, PATCH status/driver/notes, GET customers + GET active drivers endpoints, load detail with assign driver/change status/cancel actions — 6 tasks, 9 files, 317s
- Phase 35-03 (2026-03-25): Owner driver management — driver list screen (FlashList, compliance dots, filter tabs), driver detail (current load card, compliance docs, mailto/tel deep links, incidents, quick actions), GET /drivers + GET /drivers/[id] endpoints with compliance computation, tappable dashboard driver chips — 5 tasks, 8 files, 421s
- Phase 36-01 (2026-03-25): Owner live map — GET /api/mobile/owner/map/vehicles with MOVING/IDLE/OFFLINE status computation, VehicleMarker (status-colored circle), VehicleDetailSheet (Modal bottom sheet with stats grid), full-screen MapView with dark style on Android, 60s auto-refresh, manual refresh button — 3 tasks, 6 files, 241s
- Phase 36-02a (2026-03-25): Fleet messaging backend — FleetMessage schema extended (recipientId + isBroadcast + senderId index), GET/POST /api/mobile/owner/fleet/messages with push notification delivery (broadcast + targeted), FleetMessageSummary + SendFleetMessagePayload types + ownerApi methods in api-client — 3 tasks, 4 files, 184s
- Phase 36-02b (2026-03-25): Fleet messaging UI — RecipientSelector bottom sheet (All Drivers broadcast + individual driver list), fleet.tsx compose/history toggle (char counter, loading send, pre-select from driverId param, pull-to-refresh history) — 2 tasks, 2 files, 151s
- Phase 37-01 (2026-03-25): Touch targets + FlashList audit + skeleton loaders — 48px touch targets enforced on 5 elements, FlatList→FlashList in messages+fleet, Skeleton base component + 5 skeleton variants, spinners→skeletons on 11 screens — 6 tasks, 20 files, 439s
- Phase 37-02 (2026-03-25): Animations, haptics, dark mode — AnimatedScreen FadeIn on 15 screens, spring BottomSheet, haptics.ts with 14 trigger points, dark/light ScreenWrapper, Android ripple on all Pressables, KAV on fleet+HOS modal, React.memo on LoadCard/KPICard/DriverStatusChip — 8 tasks, 25 files, 817s
- Phase 37-03 (2026-03-25): Thumb-friendliness & navigation clarity — tab labels on both portals (height 72px), LoadCard 96px, avatar 40px, login sky-500, owner pill targets py-3 — 8 tasks, 6 files, ~8min
- Phase 37-04 (2026-03-27): StyleSheet-to-NativeWind migration for 7 owner/shared screens (login, more/index, crm, trucks, compliance, payroll, invoices) — 3 tasks, 7 files
- Phase 37-05 (2026-03-27): Owner portal skeleton loaders — 6 skeleton components (TruckCard, InvoiceRow, ComplianceRow, PayrollRow, CRMCard, LoadDetail), replaced ActivityIndicator spinners in 5 list screens + load detail — 2 tasks, 12 files, ~8min
- Phase 37-06 (2026-03-27): Accessibility label coverage — accessibilityLabel + accessibilityRole on all icon-only FABs, back buttons, send/compose buttons; KPICard composite labels with live data values; auto-fixed SyncStatusBar invalid role — 2 tasks, 11 files, 3min
- Phase 37.1-02 (2026-03-29): My Route detail screen + MessageBubble extraction — loads timeline, route/truck details card, route messages thread with send, MessageBubble shared component — 2 tasks, 3 files, 128s
- Phase 37.1-03 (2026-03-28): Support Ticket FAB — POST /api/mobile/support/ticket, SupportTicketFAB (LifeBuoy FAB + BottomSheet form), wired in driver + owner layouts — 2 tasks, 6 files, ~5min
- Phase 37.6-01 (2026-03-31): Security claims to app_metadata — 6 auth files updated (accept-invitation, session, middleware, login, me, mobile-auth), AUTH_SECRET removed, docs updated — 2 tasks, 14 files, 372s
- Phase 37.6-02 (2026-03-31): Auth helper consolidation — session.ts + server.ts + require-permission.ts merged into supabase.ts, 74 import paths updated, production build verified — 2 tasks, 76 files, 566s
- Phase 37.7-01 (2026-04-03): Mapbox foundation — @rnmapbox/maps installed, react-native-maps removed, driver VehicleMarker created, owner VehicleMarker migrated, Mapbox.setAccessToken at module level in driver layout, iOS URL schemes added — 2 tasks, 5 files, 198s
- Phase 37.1.1-01 (2026-04-04): Route/Load/Stop schema links + backfill — RouteStop: loadId/contactName/contactPhone/bolNumber/poNumber + named back-refs; Load: pickupStopId/deliveryStopId + named FK relations; migration applied with idempotent backfill (pickups-first sequencing); pre-existing migration drift resolved — 2 tasks, 2 files, ~4min
- Phase 37.1.2-01 (2026-04-04): Invoicing trucking standard data layer — InvoiceItemType/InvoiceItemUnit enums, 7 freight header fields on Invoice, itemType/unitType on InvoiceItem, Zod validation exports (arrays+label maps), PERCENT calculation fix in createInvoice/updateInvoice — 2 tasks, 4 files, 18min
- Phase 37.1.2-02 (2026-04-04): Invoicing trucking standard UI — collapsible Freight Details section (7 fields), item type + unit type selectors per line item, FSC auto-calculation (percent-of-linehaul helper text), PER_MILE preview, quick-add buttons (Linehaul/FSC/Detention/Stop-Off), detail page freight display + type labels, edit page round-trips all fields, new invoice load auto-populate — 2 tasks, 5 files, ~25min
- Phase 37.2-02 (2026-04-13): ScheduledService CRUD API + maintenance constants — GET/POST/PATCH per-truck endpoint, GET cross-truck listing, server-side status computation (overdue/due_soon/ok), completion flow with MaintenanceEvent audit trail, 4 typed api-client methods, MAINTENANCE_SERVICE_TYPES constant (21 items) — 2 tasks, 4 files, 231s
- Phase 37.2-03 (2026-04-13): Multi-step route creation screen — RouteCreationSheet (Step 1: name/driver/truck/date; Step 2: multi-stop with AddressInput, type toggle, delete button), submits via ownerApi.createRoute — 1 task, 1 file, 215s
- Phase 37.2-04 (2026-04-13): Maintenance UI — MaintenanceServicePicker (21 predefined types), ScheduleServiceSheet (date/mileage triggers), top-level maintenance screen with Due Soon alerts + grouped fleet view, Scheduled Services section on truck detail with mark-complete flow, warning badge on truck list — 2 tasks, 7 files, ~8min

- Phase 37.7-02 (2026-04-03): Directions backend — getOSRMDirections added to osrm.ts (overview=full&geometries=geojson, [lng,lat] GeoJSON polyline), POST /api/geocoding/directions endpoint with validation + rate limiting (dir: prefix), RouteStop.lat/lng + DirectionsResult + driverApi.getDirections in api-client — 2 tasks, 3 files, ~3min
- Phase 37.7-05 (2026-04-03): Start Route nav deep link + nav-settings screen — lib/navigation.ts (getNavPreference/setNavPreference/buildNavUrl/openNavigation), StatusUpdateButton EN_ROUTE triggers router.navigate to Map tab + openNavigation, map.tsx Start Navigation wired, nav-settings.tsx (iOS 3-option picker / Android static Google Maps card) — 2 tasks, 4 files, 121s

**Combined:**
- Total: 23 phases complete, 57 plans
- Total project LOC: 71,500+ TypeScript

**Quick tasks:**
- Quick-1 (2026-02-16): Management pages bugs + seed data — 457s, 3 tasks, 7 files affected
- Quick-6 (2026-02-18): Fix truck save/view errors and route driver dropdown — 133s, 2 tasks, 4 files affected
- Quick-7 (2026-02-18): Build Invoice/Billing UI and Payroll UI — ~900s, 3 tasks, 20 files affected
- Quick-8 (2026-02-18): Build Dispatch and Load Management — ~25min, 3 tasks, 14 files affected
- Quick-9 (2026-02-18): Build Automated Customer Communications — 334s, 2 tasks, 8 files affected
- Quick-10 (2026-02-18): Build Profit Per Lane Analysis — ~10min, 3 tasks, 6 files affected
- Quick-11 (2026-02-18): Build Compliance Dashboard — ~6min, 2 tasks, 7 files affected
- Quick-12 (2026-02-18): Build AI Document Reading — ~8min, 2 tasks, 6 files affected
- Quick-13 (2026-02-18): Build AI Profit Predictor — ~6min, 2 tasks, 4 files affected
- Quick-14 (2026-02-18): Build Third-Party Integrations Framework — ~8min, 2 tasks, 8 files affected
- Quick-16 (2026-02-19): Wire up driver invitation flow — 475s, 3 tasks, 5 files affected
- Quick-17 (2026-02-20): Wire up real Samsara GPS provider integration — ~194s, 2 tasks, 5 files affected
- Quick-18 (2026-02-20): Add driver app GPS tracking with browser geolocation — ~136s, 2 tasks, 3 files affected
- Quick-19 (2026-02-23): Add license plate label below each vehicle marker — ~41s, 1 task, 1 file affected
- Quick-20 (2026-02-23): Geofencing alerts — auto-detect truck arrival at stops — ~8min, 2 tasks, 5 files affected
- Quick-21 (2026-02-23): IFTA fuel tax reporting — automated quarterly miles/fuel by state from GPS+FuelRecord — 291s, 2 tasks, 6 files affected
- Quick-22 (2026-02-23): Motive (KeepTruckin) ELD integration — GPS sync library, API endpoint, generalized UI — 149s, 2 tasks, 3 files affected
- Quick-23 (2026-02-23): Customer shipment tracking page (public) — /track/[token], public API, trackingToken on dispatch — 196s, 3 tasks, 7 files affected
- Quick-24 (2026-02-24): Real-time GPS polling on live map and customer tracking page — 256s, 2 tasks, 6 files affected
- Quick-25 (2026-02-24): Rate confirmation PDF generator — @react-pdf/renderer server-side PDF, download button on load detail page — ~360s, 2 tasks, 6 files affected
- Quick-26 (2026-02-24): Revert status button — REVERSE_STATUS_TRANSITIONS server action + Undo2 revert button on load detail page — 122s, 2 tasks, 3 files affected
- Quick-27 (2026-02-24): Dashboard financial metrics upgrade — getDashboardMetrics, getNotificationAlerts, NotificationsPanel, 6-card grid — 189s, 2 tasks, 5 files affected
- Quick-29 (2026-02-24): Fix dashboard slow loading — synchronous DashboardPage + getAuthContext() helper, session decrypts ~9→4 — 231s, 2 tasks, 3 files affected
- Quick-55 (2026-03-13): TKT-0013 Fix "a.split is not a function" error on truck document upload with expiry — 1 task, 1 file
- Quick-56 (2026-03-13): TKT-0014 Fix dashboard alerts navigating to /trucks instead of /trucks/[id] — 1 task, 1 file
- Quick-57 (2026-03-13): TKT-0015 Add automated status badges to trucks (In Use / In Maintenance / Expired Docs / Ready to Use) — 3 tasks, 4 files
- Quick-58 (2026-03-13): TKT-0016 Add Route Name column to routes list page — 1 task, 2 files
- Quick-59 (2026-03-14): TKT-0017 DriverRouteJoin payment tracking — 375s, 3 tasks, 8 files
- Quick-98 (2026-03-22): TKT-0044 Screenshot auto-capture on support ticket — ~25min, 3 tasks, 4 files
- Quick-113 (2026-03-26): Production readiness hardening — debug route deleted, Upstash rate limiting (auth/GPS/mobile), Sentry web+mobile, EAS OTA — ~5min, 3 tasks, 13 files
- Quick-118 (2026-03-29): Add routeId FK to load create/edit — Route dropdown on web form + mobile API accepts routeId — ~4min, 2 tasks, 6 files
- Quick-126 (2026-03-29): Add multi-leg load sequencing to routes — sequence Int? on Load, migration, route-page-client.tsx leg labels + sequence editing + continuity warnings, mobile driver "Leg N" timeline — 3 tasks, ~6 files
- Quick-127-01 (2026-03-30): Server-side Nominatim proxy at /api/geocoding/autocomplete with 60s in-memory cache, web AddressAutocomplete switched from direct Nominatim to proxy, RouteStop lat/lng coordinates now populated in DB — 2 tasks, 5 files
- Quick-131-01 (2026-03-30): Rebuild driver and owner dashboards with extracted components — TripCard, StatsRow, KPIGrid, SpeedDial extracted; dashboards rebuilt with StyleSheet + tokens; CHIP_WIDTH removed, FAB safe-area insets — 2 tasks, 6 files, ~5min
- Quick-132 (2026-03-30): Security & reliability improvements — CSRF Origin validation, structured logger (222 console.* replaced), bypass_rls JSDoc, createTenantClient() wrapper, zero @ts-ignore (32 removed), Prisma enum type casts, OpenAPI 3.1 spec (4 paths), EAS env docs, 31 Vitest unit tests, mobile jest-expo setup — 15 items, 130+ files, ~45min
- Quick-135 (2026-03-30): Code quality audit fixes — ActionState type (warning+values) in packages/types, all prevState:any/catch:any eliminated across 17 action files + 11 form components, withMobileAuth HOF (5 mobile routes refactored), typed SQL interfaces in fuel/live-map, landing-page.tsx split to 8 section components (936→26 lines), ESLint/Prettier config, dark 404 page — ~55 files, ~120min
- Quick-140 (2026-03-31): Mobile owner portal edit actions — PATCH API routes for drivers/trucks, UpdateDriverPayload + UpdateTruckPayload types, ownerApi.updateDriver + ownerApi.updateTruck, EditDriverSheet + EditTruckSheet bottom sheets with pre-filled forms — 3 tasks, 6 files, ~25min
- Quick-141 (2026-03-31): Mobile owner portal routes section — GET list/detail endpoints, OwnerRouteSummary + OwnerRouteDetail types, routes list screen with 4-tab filter, route detail screen, More menu entry — 3 tasks, 7 files, ~30min
- Quick-142 (2026-03-31): Mobile owner portal Profit Predictor + Fuel Log — POST profit-predictor endpoint (lane+fleet avg Decimal math), GET+POST fuel endpoints, 5 new types in api-client, ProfitPredictor screen (useMutation + recommendation banner + stat grid), Fuel Log screen (FlashList + FAB + AddFuelModal + truck picker), FuelRowSkeleton, More menu entries — 2 tasks, 8 files, ~40min
- Quick-143 (2026-03-31): Mobile owner portal CRM contact detail/edit + payroll detail/create — GET+PATCH crm/[id], GET payroll/[id], POST payroll routes; 4 new api-client types+methods; crm/[id].tsx detail+edit screen; tappable CRM cards; payroll detail bottom sheet + create FAB form with driver picker — 3 tasks, 8 files, ~35min
- Quick-145 (2026-03-31): Move sign-out button from bottom-left sidebar to top-right header across all web portals — UserMenu dropdown component (owner/driver/admin), removed sidebar footer sign-out — 2 tasks, 4 files, ~15min
- Quick-146 (2026-03-31): Audit and update all technical documentation — auth.md (session.ts→supabase.ts, requirePermission added), architecture.md (AES-256-GCM→Supabase Auth, lib/auth/ + lib/db/ listings updated), mobile architecture.md (full API tree + navigation tree, ADR-001 updated), setup.md + deployment.md (Gmail SMTP primary, SUPABASE_SERVICE_ROLE_KEY added), modules.md (SysAdmin Invoicing added), stack.md (bcryptjs legacy), local-development.md (sign-in.tsx→login.tsx) — 2 tasks, 8 files, ~25min
- Quick-147 (2026-04-03): Geocoding autocomplete + OSRM real road distances — OSRM utility (lib/geo/osrm.ts), /api/geocoding/distance proxy, profit-predictor-form.tsx (AddressAutocomplete + OSRM auto-fill), load-form.tsx + route-form.tsx (haversine→OSRM), mobile profit-predictor.tsx + crm/[id].tsx (AddressInput + OSRM proxy) — 3 tasks, 7 files, ~25min
- Quick-148 (2026-04-03): Add global appearance setting for light/dark mode — useThemeColors() hook, color token system (background/surfaceCard/surfaceElevated/surfaceInput/border/brand/brandDark/text*), AppearanceSheet bottom sheet, AsyncStorage persistence, appearance setting in More menu — 3 tasks, ~10 files, ~30min
- Quick-149 (2026-04-03): Migrate all mobile screens to useThemeColors — replaced all bg-slate-*/text-slate-*/border-slate-*/hardcoded hex values with useThemeColors() tokens across 29 files (7 driver screens, 17 owner screens, 5 shared components); fixed 2 variable name collisions + 2 recursive goBack() bugs — 3 tasks, 29 files, ~90min
- Quick-153 (2026-04-05): Carrier Ops — migrations 005-006 — driver catalog (carrier_drivers + carrier_driver_schedules) — 2 tasks, 2 files
- Quick-154 (2026-04-05): Carrier Ops — migrations 007-009 — equipment catalog (carrier_trucks + carrier_trailers + carrier_truck_maintenance) — 3 tasks, 3 files
- Quick-155 (2026-04-05): Carrier Ops — migrations 010-012 — clients, contracts, facilities tables — 3 tasks, 3 files
- Quick-156 (2026-04-05): Carrier Ops — migration 013 — RLS policies for all carrier tables — 1 task, 1 file
- Quick-157 (2026-04-05): Carrier Ops — migration 014 + Prisma schema — 14 carrier models appended to schema.prisma — 2 tasks, 2 files
- Quick-158 (2026-04-05): Carrier Ops — API routes for clients + contracts CRUD — 3 lib files + 4 route files, clients.ts, contracts.ts, withCarrierAuth HOF — 3 tasks, 7 files, ~5min
- Quick-159 (2026-04-05): Carrier Ops — API routes for facilities + route templates + dispatch generator — facilities lib+routes, route-templates lib+routes, dispatch-generator engine (RRULE parser, conflict detection, address snapshot, load creation) — 3 tasks, 8 files, ~5min
- Quick-160 (2026-04-05): Carrier Ops — API routes for dispatches + loads + revenue calculator — revenue-calculator.ts (6 rate types + FSC), dispatches.ts (state machine: planned→in_progress/cancelled/tonu, in_progress→completed), loads.ts (clientId required, contract auto-populate, LD-YYYY-NNNNN ref), 6 API route files — 3 tasks, 9 files, ~5min
- Quick-162 (2026-04-05): Carrier Ops — documents, expenses, pay-records API routes + nightly cron — documents.ts (Supabase Storage upload, path pattern {orgId}/{parentType}/{parentId}/{docType}/{uuid}.ext, org scoping through parent chain), expenses.ts (CRUD + auto-reimbursable on driver_cash + clientId propagation), pay-calculator.ts (5 pay models: per_mile/percentage_gross/hourly/flat_rate/team_split + relay mile-split at handoff stop), 9 API route files, carrier-auto-dispatch cron, stop-completion.ts + dispatches.ts wired — 3 tasks, 12 files created + 3 modified, ~7min
- Quick-164 (2026-04-05): Carrier Ops — facilities management web UI — FacilityList (search+type filter table), FacilityForm (controlled state POST/PATCH), FacilitySearchModal (Dialog+debounce, exports FacilitySearchResult type), 3 server pages (/carrier/facilities list+create+[id]), DeleteFacilityButton, Carrier Ops sidebar section (8 items gated to OWNER/MANAGER) — 2 tasks, 8 files, ~20min
- Quick-172 (2026-04-05): Carrier Ops — Reports pages and carrier dashboard — compliance-alerts API (CDL/registration/insurance/license/contract expiry), AlertBar + TodayDispatches + KPIStrip dashboard components, carrier dashboard page, 4 report pages (revenue w/ Recharts bar chart + CSV export, driver-pay w/ bulk approve, aging w/ credit-limit highlight + summary row, performance w/ on-time % color coding) — 2 tasks, 10 files, ~7min
- Quick-173 (2026-04-05): Carrier Ops — Compliance alert cron job — POST /api/cron/carrier-compliance-alerts (CRON_SECRET guard, auto-creates carrier_compliance_alert_log table, iterates all active orgs with isolated try/catch, logs alerts via parameterized SQL), vercel.json cron at 0 6 * * * (06:00 UTC daily) — 1 task, 2 files, ~76s
- Quick-174 (2026-04-05): Carrier Ops Mobile — Auth flow and home screen for carrier driver dispatches — GET /api/mobile/carrier/driver/dispatches (list + detail), carrierDriverApi (6 typed methods in packages/api-client), carrier Stack navigator + home screen (active dispatch card, upcoming FlashList, pull-to-refresh, empty state), hidden carrier tab route — 2 tasks, 5 files, ~20min
- Quick-175 (2026-04-05): Carrier Ops Mobile — Stop list and stop detail screens — StopListItem (sequence badge, type icon, status badge, doc indicator), dispatch detail page (progress bar, accent-highlighted active stop, FlashList), StopStatusButtons (Arrived/Complete with doc enforcement + 422 surfacing + haptics), stop detail page (facility info, Open in Maps, tappable phone, doc list, placeholders); added bolRequired/podRequired to CarrierStop schema + migration — 2 tasks, 4 files + 1 migration, ~7min
- Quick-176 (2026-04-05): Carrier Ops Mobile — Document upload screen for stops — POST /api/mobile/carrier/driver/stops/[stopId]/documents (multipart, R2 presigned PUT, CarrierDocument record), StopDocumentUpload component (3-step: source→preview→upload, camera/gallery/PDF picker, progress bar, offline MMKV + NetInfo reconnect flush, haptic success + auto-back), upload.tsx screen, stop detail wired with correct documentType (BOL/POD) per stop type — 2 tasks, 4 files, ~7min
- Quick-177 (2026-04-05): Carrier Ops Mobile — Expense log screen for drivers — POST /api/mobile/carrier/driver/dispatches/[id]/expenses (validates 8 types + 4 paid-by + stop ownership), ExpenseLogForm (44px chip selects for type+paid-by, decimal-pad amount, auto-computed reimbursable badge, optional notes + receipt), expenses.tsx (header + form + pull-to-refresh list with type/amount/paidBy/reimbursable/timestamp), stop detail Expense Log button wired — 3 tasks, 4 files, ~5min
- Quick-178 (2026-04-05): Carrier Ops — Fleet management pages (carrier drivers and carrier trucks) — fleet-drivers.ts + fleet-trucks.ts lib modules (CRUD, 400 on duplicate user link), 4 API routes (GET/POST list + GET/PATCH detail), CarrierDriverList + CarrierTruckList (expiry color coding: green/amber/red, AlertTriangle on near-expiry), CarrierDriverForm + CarrierTruckForm, 4 server pages (list + detail for drivers + trucks, dispatch history on detail pages) — 3 tasks, 14 files, ~25min
- Quick-179 (2026-04-05): Carrier Ops — Sidebar navigation wiring and route guard — DispatchBadge client component (60s poll, needs_assignment count capped at "9+"), sidebar restructured with Fleet sub-group (Drivers/Trucks/Facilities) + Reports sub-group (Revenue/Driver Pay/AR Aging/Performance), CarrierBreadcrumb (pathname→display name mapping), carrier layout.tsx (DRIVER→/my-load redirect, non-OWNER/MANAGER→/unauthorized) — 2 tasks, 4 files, ~15min
- Quick-186 (2026-04-05): Fix all carrier ops bugs found during QA — 19 bugs fixed: dashboard timeout resilience (.catch() on all 7+4 queries), sidebar label uniqueness (Carrier Dashboard/Loads/Drivers/Trucks), MANAGER role gates on New Contract+New Client+ClientDetail contracts tab, driver layout redirect →/my-route, facility types aligned to spec (shipper/receiver/terminal/fuel_stop/other), contacts JSON array in facility list, paymentTerms+creditLimit added to CarrierClient (db push), Billing section in ClientForm+ClientDetail, portal email shown when access=true — 3 tasks, 18 files, ~25min
- Quick-215 (2026-04-15): Fix 6 High findings from carrier operations audit 213 — per_load enum added to loads API + LoadForm, getFacility/updateFacility guard against inactive_ soft-deleted records, FK ownership checks on createExpense (dispatch/stop/driver), createRouteTemplate (client/contract/driver/truck), saveRouteTemplate (same 4 + batch facility check), createStop (load/client) — 6 tasks, 8 files, ~18min
- Quick-218 (2026-04-14): Upgrade live fleet map — 3 tenant-isolated API routes (vehicles with LEFT JOIN LATERAL, history by truck+date, trips paginated), two-panel layout, VehicleSidebar (click-to-fly, last-seen, driver name), VehicleFilterBar (client-side multi-select), LiveMapTabs (Live/History/Trips), HistoryTab (GPS trail + timeline), TripsTab (paginated completed routes), 30s polling on Live tab only, no-location trucks in sidebar but not on map — 2 tasks, 8 files created, 8 files modified, 11 min
- Quick-224 (2026-04-16): Add email notifications for all carrier lifecycle events — 5 React Email templates (dispatch-assigned, load-delivered, pay-record-ready, invoice-generated, compliance-alert), notifications.ts helper with full idempotency via NotificationLog, triggers wired in dispatches.ts (create+reassign), stop-completion.ts (delivered cascade), pay-calculator.ts (pay records), loads.ts (invoiced status), compliance-alerts cron — 2 tasks, 6 files created, 6 files modified, ~20min
- Quick-228 (2026-04-17): In-app notification center for owner portal — InAppNotification table + RLS, createNotification() fire-and-forget helper wired into 5 send* functions, GET/PATCH notification API routes, NotificationBell (polling badge) + NotificationCenter (dropdown with type icons, relative timestamps, deep links) in owner shell header — 4 tasks, 6 files created, 3 files modified, ~75min
- Quick-231 (2026-04-16): Rebuild carrier load form + stop builder — 5-section form (Client & Contract, Freight Details, Stops, Rate & Financials, References), removed PRO Number/Pallets/FSC editable fields/Appointments, StopBuilder in both create+edit modes, info banner for no-dispatch, R2 rate confirmation upload wired, LoadFinancials hides zero rows, LoadList uses client.name from API, stop persistence via persistStops helper (tenant isolation + transaction diff) — 2 tasks, 7 files
- Quick-232 (2026-04-17): Complete driver portal redesign — Dashboard landing page (greeting, dispatch card, quick actions, HOS widget, messages preview), browser GPS pinging (watchPosition+30s throttle), notification bell (60s poll, unread badge, dropdown panel), 5-tab nav (Dashboard/Route/Load/Messages/More, 60px height), More menu page (Hours/Documents/Incidents/Support/LogOut), dark branded header (bg-slate-900), GPS logging endpoint, driver-scoped notifications API — 2 tasks, 18 files created, 3 files modified
- Quick-239 (2026-04-17): Fix driver portal stop state machine — getStopAction() helper (5 states), navigatingStopId in DispatchDetail, Begin Navigation opens Google Maps + sets navigating state, Mark Arrived calls arriveAtStop + clears state, Complete Stop auto-opens Maps to next pending stop, navigating circle pulses blue, all buttons full-width — 1 task, 1 file modified
- Quick-246 (2026-04-18): Fix GPS tracking — ping on all pages, accurate movement detection, auto-update live map — DriverGpsPing moved to driver layout (all tabs), haversine calculateSpeed(), setInterval 15s backup ping, calculatedSpeed stored in GPSLocation.speed, vehicles endpoint uses stored speed, live map polls 15s + manual Refresh button — 2 tasks, 6 files modified
- Quick-247 (2026-04-18): Fix live map History tab — history endpoint was querying truckId but carrier trucks use carrierTruckId FK; added fallback CarrierTruck ownership check + conditional FK in GPS query — 1 task, 1 file modified
- Quick-248 (2026-04-18): Add VIN auto-fill from NHTSA API and auto-generated vehicle ID with editable display name to carrier trucks — vehicleId (VH-YYYY-NNNNN globally unique) + displayName columns, migration backfills existing trucks, VIN Lookup button calls vpic.nhtsa.dot.gov client-side, display_name shown across trucks list, live map sidebar, dispatch detail, driver route tab — 3 tasks, 16 files modified
- Quick-253 (2026-04-18): Rebuild team permissions with 16 route-based keys, default-all-true, middleware/sidebar enforcement, grouped toggle UI — 3 tasks, 18 files modified
- Quick-254 (2026-04-18): Notification z-index above Leaflet (z-[1001]), Full Access master RBAC toggle wired to Prisma + Supabase, map fitBounds ref-guarded to fire once on initial load — 3 tasks, 5 files modified
- Quick-262 (2026-04-19): Forgot password flow + sysadmin password override — forgot-password page (anti-enumeration), reset-password page (PASSWORD_RECOVERY event, show/hide toggles, 5s timeout), "Forgot password?" link on sign-in, /api/auth/admin-reset-password (send_reset via generateLink + set_password via updateUserById, sysadmin-only), ResetPasswordButton modal on tenant detail — 2 tasks, 6 files
- Quick-269 (2026-04-22): Document upload and storage enhancements — CarrierDocumentType model + migration, auto-seed 10 defaults per tenant on first GET, CRUD API + settings page at /owner/carrier/templates/document-types, DocumentUploadModal lazy-fetches active types (requires selection), context FKs auto-derived in uploadDocument(), DocumentList shows type name + uploader + date — 4 tasks, 12 files
- Quick-278 (2026-04-22): Comprehensive carrier dashboard overhaul — revenue KPI fix (totalRevenue + rate-field fallback), actionable alerts API (7 parallel counts: expired/expiring CDLs, registrations, contracts, pending pay, unstarted dispatches), activity feed API (15 items merged from 6 sources), drivers-status API (HOS via DISTINCT ON raw query), messages API (GET last 5 + POST broadcast); 3 new UI components (DriverStatusStrip, RecentActivity, QuickMessageBoard); updated KPIStrip + AlertBar; new 5-col two-column dashboard layout — 2 tasks, 11 files
- Quick-280 (2026-04-22): Add dispatch option to load create form — "Dispatch immediately" toggle in LoadForm (create mode only), collapsible dispatch section (driver, truck, departure, co-driver, planned miles, route template with auto-populate), dual-path submit (toggle OFF = existing flow unchanged; toggle ON = create load → create dispatch → PATCH load with dispatchId → redirect to dispatch detail with DC-XXXX toast), NewLoadPage fetches active drivers + trucks in parallel — 2 tasks, 2 files
- Quick-281 (2026-04-22): Add tenant settings, user list, password reset, and role change to sysadmin tenant detail — contactEmail+plan schema fields, TenantSettingsForm (contactEmail/timezone/plan), GET /api/admin/tenants/[id]/users, TenantUsersSection (role badges, status dots, actions dropdown), ChangeRoleModal, PATCH /api/admin/users/[id]/role (blocks OWNER + updates Supabase Auth app_metadata), Prisma client regenerated — 3 tasks, 9 files

## Accumulated Context

### Roadmap Evolution

- Phase 01 added + COMPLETE: Database Integrity Hardening — RLS on 5 tables, tenantId backfill on InvoiceItem/ExpenseTemplateItem, Load/TenantIntegration migration SQL, migrate.mjs fail-fast
- Phase 19 added: Multi-Stop Routes — ordered RouteStop model, dispatcher stop editor, driver app active-stop view, geofence auto-arrival
- Phase 37.1.1 inserted after Phase 37.1 (URGENT): Data Pipeline — Routes, Loads, and Stops — schema (RouteStop.loadId + contact fields, Load.pickupStopId/deliveryStopId), geocoding on load save, auto-create RouteStops when load assigned to route, driver map reads populated stops
- Phase 37.1.2 inserted after Phase 37.1.1 (URGENT): Invoicing — Trucking Standard — Invoice freight header fields (BOL/PRO/PO/commodity/weight/pieces/miles), InvoiceItem type+unit enums, UI for freight-standard line items with FSC auto-calc
- Phase 20 added: Driver Pay Settlement — DriverPayConfig, DriverSettlement, SettlementLine models, pay calculation engine, PDF statement
- Phase 21 added: QuickBooks Online Integration — OAuth2 connect flow, invoice/expense/settlement sync to QBO
- Phase 22 added: Support Ticket System — in-owner-portal ticket submission and threaded replies, DriveCommand team manages via admin portal
- Phase 23 added: System Admin Portal — super-admin /admin/* with ADMIN_SECRET_KEY auth, tenant CRUD, system metrics, cross-tenant support ticket queue

### Decisions

**Phase 37.1.1-01 decisions (Route/Load/Stop schema links):**
- DEFERRABLE INITIALLY DEFERRED FK constraints used for circular Load↔RouteStop relationship — allows RouteStop insert with loadId then Load UPDATE with stopIds in same transaction without constraint violations
- Backfill idempotent with NOT EXISTS guards — safe to re-run
- Sequencing: all PICKUPs first (1..N ordered by pickupDate), then DELIVERYs (N+1..N+M ordered by deliveryDate) per route — matches locked sequencing decision
- Pre-existing migration drift (20260329000001_add_load_sequence column already existed) resolved with migrate resolve --applied before deploying new migration

**Phase 37.1.2-01 decisions (Invoicing trucking standard data layer):**
- InvoiceItem defaults itemType=OTHER, unitType=FLAT — existing items render identically, no data migration needed
- loadedMiles uses Decimal(10,2) consistent with project monetary/measurement field convention
- PERCENT unit: quantity=percentage number (e.g., 15 for 15%), unitPrice=base amount; amount=(qty/100)*price — industry standard for FSC calculation
- Validation package exports INVOICE_ITEM_TYPES/UNITS const arrays + label maps for UI component reuse without enum duplication

**Phase 37.1.1-02 decisions (Geocoding + RouteStop auto-sync):**
- Nominatim is the geocoding API (NOT Google Maps) — confirmed by codebase; CONTEXT.md had incorrect claim
- Geocoding runs BEFORE Prisma $transaction blocks — no network calls inside DB transactions (connection pool + timeout risk)
- RouteStop rebuild on address change: delete old stops then re-create with new coordinates (simpler than in-place lat/lng updates)
- Web updateLoad fetches existing load before transaction to detect routeId transition type (set/clear/change/address-change-with-same-route)

**Phase 37.7-02 decisions (Directions backend):**
- Return 200 with all-null payload when OSRM fails — allows mobile map to render without route polyline gracefully (not a 500)
- Rate limit key prefix dir: (not dist:) to isolate directions quota from distance quota on shared geocodingLimiter
- Coordinate order [lng, lat] preserved end-to-end — GeoJSON standard, matches Mapbox ShapeSource natively, no swap needed on mobile

**Phase 37.7-05 decisions (Start Route navigation deep link):**
- router.navigate cast as 'never' to avoid expo-router strict typing on dynamic string route
- openNavigation is fire-and-forget after query invalidation — does not block onStatusUpdated()
- Android locked to Google Maps regardless of stored preference — enforced in getNavPreference()

**Quick-162 decisions (Carrier Ops — documents/expenses/pay-records):**
- Decimal import: Prisma.Decimal (from @/generated/prisma) not decimal.js — consistent with Prisma schema types
- CarrierDocument has no orgId column — org scoping done by verifying parent chain (stop→dispatch→orgId, load→orgId, dispatch→orgId)
- percentage_gross creates one DriverPayRecord per load on the dispatch (not one per dispatch)
- dispatches.ts transitionDispatchStatus completion path also wired to generateDriverPayRecords (plan only mentioned stop-completion.ts)
- Waze fallback goes to Apple Maps (iOS only) since Waze may not be installed

**Quick-215 decisions (Fix 6 High findings from carrier audit 213):**
- App-layer soft-delete guard instead of schema migration — facilityType inactive_ prefix convention preserved; getFacility/updateFacility now exclude inactive_ prefixed records without touching schema
- Batch facility ownership check in saveRouteTemplate — single findMany for all stop facilityIds is more efficient than N individual queries
- createStop returns null (not error object) for FK ownership failures — matches existing null-returns-404 pattern in the function

**Quick-231 decisions (Rebuild carrier load form + stop builder):**
- CarrierStop.dispatchId is required (non-nullable) — stops only persist when load has dispatchId; info banner shown otherwise (no schema change needed)
- FSC removed from load form entirely — inherited from contract and computed read-only in LoadFinancials; editing FSC per-load was confusing and redundant
- persistStops uses $transaction for atomic diff (delete removed pending + update changed + create new) — prevents partial state on network error
- LoadFinancials hides zero rows: FSC only shown if >0 or has note, Accessorial only if >0, Detention removed entirely — cleaned up visual noise

**Quick-228 decisions (In-app notification center):**
- RLS INSERT policy uses WITH CHECK (true) — app always writes via service role key, not JWT claims; SELECT/UPDATE use org_id = (auth.jwt() ->> 'org_id')::uuid
- Compliance alerts create one in-app notification per alert (not one batch row) — individual actionability
- entityId defaults to orgId for compliance alerts without extractable entity UUID from the link
- Mark-all-read uses optimistic local state update — avoids second fetch round-trip

**Quick-186 decisions (Fix all carrier ops QA bugs):**
- Used prisma db push (not migrate) to add paymentTerms/creditLimit — no migration file created, no constraint changes
- Facility type values (shipper/receiver/terminal/fuel_stop/other) enforced at application layer only — facilityType is a plain String column
- Portal email field shown whenever portalAccess is true (not conditional on email existing) — allows user to enter email after toggling access ON

**Phase 37.2-04 decisions (Maintenance UI):**
- ScheduleServiceSheet uses <>form BottomSheet + MaintenanceServicePicker</> fragment pattern — picker modal must be sibling of parent sheet, not nested, to layer correctly above it
- Mark Complete sheet is inline BottomSheet inside TruckDetailScreen (not extracted) — completeService mutation and completingService state are naturally co-located with truck detail
- Truck list warning uses AlertTriangle icon at size=15 (not a dot) — more visible on small card rows; amber=due_soon, red=overdue; useMemo builds worst-status map from getAllScheduledServices
- api-client dist must be rebuilt after exporting new types — ScheduledServiceSummary/ScheduledServiceWithTruck/CreateScheduledServicePayload/CompleteScheduledServicePayload were in owner.ts since 37.2-02 but not re-exported from index.ts
- BottomSheet only accepts 40%/60%/80%/full snapPoints — plan specified "70%" for MaintenanceServicePicker; used "80%"

**Quick-253 decisions (Rebuild team permissions system):**
- Default-all-true: MANAGER permissions default to true, owner restricts by toggling off (reversed from old all-false default)
- Legacy server actions: removed requirePermission calls from old routes (payroll, invoices, crm, ifta, lane-analytics, profit-predictor) since those routes are not in the new carrier ops system
- Settings pages (expense categories, templates, integrations) always accessible to managers — no permission gate
- Subscription and Team Permissions: owner-only enforced in both middleware OWNER_ONLY_PATHS and sidebar role check
- Supabase app_metadata sync: use admin.auth.admin.listUsers() email lookup to find Supabase auth UID — DB User.id is not the same as Supabase auth UID

**Quick-269 decisions (Document upload and storage enhancements):**
- documentTypeId is nullable on CarrierDocument — existing documents remain valid without backfill; no sentinel "Unclassified" row in migration (each tenant needs org-scoped row)
- Auto-seed 10 default types on first GET per tenant (not on tenant creation) — simpler, no onboarding hook needed
- Default types blocked from deletion and rename; isActive can be toggled — prevents catalog corruption
- Context FKs auto-derived from parent chain in uploadDocument() — callers don't need to pass them explicitly
- document_type (slug) still sent in upload formData for backward compat during transition period
- listDocuments() maps Prisma fields to UI-friendly names (filename→fileName, fileSizeBytes→fileSize) — fixes pre-existing silent bug where field names didn't match component interface

**Quick-254 decisions (Notification z-index, Full Access toggle, map auto-zoom):**
- fullAccess not in DEFAULT_MANAGER_PERMISSIONS — optional boolean defaults to undefined/false for backward compat with all existing managers
- getPermissions() merge explicitly preserves fullAccess key (filtered in via || key === 'fullAccess') since it's not in DEFAULT_MANAGER_PERMISSIONS
- middleware wraps gated-route block in if (!permissions.fullAccess) — owner-only paths remain blocked regardless
- FitBoundsOnMount adds vehicles to useEffect deps and hasFitted ref ensures single fire — handles async vehicle arrival after map mount
- maxZoom lowered from 15 to 14 for more geographic context on initial auto-zoom

**Quick-149 decisions (Migrate all mobile screens to useThemeColors):**
- useThemeColors() called in each sub-component (not passed as prop) — hooks must be called inside React function components
- Variable name collisions resolved: 'c' param in find callbacks renamed to 'cat'/'cust', STATUS_COLORS const renamed to 'statusColors' in trucks/[id].tsx
- LoadingSpinner color prop default changed to c.brand so it picks up theme; explicit color override still supported
- Pre-existing TypeScript errors (FlashList estimatedItemSize, _layout args) confirmed not introduced by this task

**Quick-143 decisions (Mobile CRM contact detail/edit + payroll detail/create):**
- BottomSheet snapPoint="80%" for all edit/create sheets — component only accepts 40%/60%/80%/full; plan specified 85%/90% which are invalid
- Pill-button selectors (Pressable rows in a row) for priority and status in CRM edit sheet — no nested BottomSheet needed
- Full-field update on save (all fields sent in PATCH) rather than delta-only to avoid stale-data edge cases
- New api-client types added to index.ts exports and dist rebuilt after finding mobile TypeScript errors

**Quick-142 decisions (Mobile Profit Predictor + Fuel Log):**
- Replicated lane analytics and fleet avg cost-per-mile queries inline in the profit-predictor route rather than calling server actions — server actions use cookie-based requireRole which is incompatible with mobile Bearer token auth
- Added Fuel Log to FLEET section (logical: fleet operations) and Profit Predictor to BUSINESS section (logical: financial decisions) in More menu
- Used React Native Modal (slide-from-bottom) for fuel entry bottom sheet, matching the pattern used in other mobile screens

**Quick-140 decisions (Mobile owner portal edit actions):**
- BottomSheet snapPoint="80%" used for both sheets — component only accepts 40%/60%/80%/full; plan specified 70%/85% which are invalid
- Driver detail API returns a combined `name` string; parse it into firstName/lastName on client for form pre-fill (parseName helper)
- Truck edit sheet only sends changed fields to minimize API payload (diff against initialData before calling PATCH)
- UpdateDriverPayload and UpdateTruckPayload added to api-client/src/index.ts exports and dist/ rebuilt

**Phase 37.6-02 decisions (Auth helper consolidation):**
- All server-side auth helpers live in a single file: src/lib/auth/supabase.ts — no more fragmented session.ts + server.ts + require-permission.ts
- Client-side auth files (auth-context.tsx, guards.tsx) remain separate — they use "use client" and cannot be in the same module as server helpers
- mobile-auth.ts, permissions.ts, roles.ts remain separate — different concerns, not auth helpers

**Phase 37.6-01 decisions (Web auth security migration):**
- Security claims (role, tenantId, isSystemAdmin, permissions) moved to app_metadata — admin-only write, prevents user privilege escalation via supabase.auth.updateUser()
- Display fields (firstName, lastName) remain in user_metadata — user-editable, no security impact
- AUTH_SECRET fully removed — session encryption now handled by Supabase Auth, no custom AES needed

**Quick-135 decisions (Code quality audit fixes):**
- ActionState extended with warning?: string and values?: Record<string, unknown> — driver invite form uses warning for email-send failures; truck form uses values for field repopulation after validation error
- withMobileAuth HOF covers 5 demonstration routes — validates pattern without migrating all 40; remaining routes can be migrated incrementally
- fieldErrors narrowing is per-component (typeof state?.error === 'object' check) — self-contained, no shared utility import needed
- vals typed cast in TruckForm (state?.values as typed shape) preserves type safety for input defaultValue props without changing ActionState.values to a more specific type

**Quick-127-01 decisions (Geocoding proxy + RouteStop coordinates):**
- Proxy uses 60s in-memory Map cache keyed by lowercase-trimmed query; response gets Cache-Control: public, max-age=300
- Internal Place interface in address-autocomplete.tsx left unchanged to avoid breaking all consumers; proxy response mapped at call site
- stopCoords stored as Map<clientId, Coords> so stop reordering doesn't corrupt coordinate associations
- Graceful degradation: proxy returns empty array on any upstream error, never propagates 500 to client
- packages/types dist is gitignored; must run npm run build in packages/types before tsc --noEmit on apps/web

**Phase 37.1-01 decisions (My Route backend + RouteCard):**
- Route endpoint returns { route: null } with 200 (not 404) when no active route assigned — consistent with dashboard pattern, prevents error states in mobile client
- route-thread is a separate endpoint from general messages — scoped exclusively to routeId to avoid conflating load and route message threads
- ListHeaderComponent memoized with useMemo to prevent FlashList re-render loops (per research pitfall 7)
- api-client dist must be rebuilt after source changes — tsc -p packages/api-client/tsconfig.json needed before mobile tsc verification

**Phase 37.1-03 decisions (Support Ticket FAB):**
- platform hardcoded as MOBILE in API endpoint — not sent from client to prevent spoofing
- createSupportTicket re-exported from api-client index.ts as a wrapper function (not direct re-export of driverApi method) to avoid module scope issue — used _driverApi import alias
- api-client dist rebuilt via tsc after source changes — mobile TS resolves to dist/index.d.ts via symlinked workspace package

**Quick-131-01 decisions (Dashboard component extraction):**
- CREATE_ACTIONS accent colors kept as hex data props in owner dashboard — intentional color data values passed into SpeedDial, not structural inline styles
- View wrappers used for empty state and alert cards instead of Card component — Card does not accept a style prop
- SectionHeader wrapped with marginHorizontal: -spacing.lg to cancel ScrollView horizontal padding — prevents double-padding without modifying SectionHeader
- Line count did not shrink to plan target (~150/~120) — switching from NativeWind className to StyleSheet.create adds style definition lines; functional JSX complexity reduction is the real measure

**Quick-113 decisions (Production readiness hardening):**
- Rate limiters return null when env vars absent so local dev works without Redis
- GPS limiter keyed by userId (not IP) because drivers share IPs via fleet networks
- Auth limiter keyed by IP to catch credential-stuffing before userId is known
- Sentry enabled only in production (NODE_ENV=production / !__DEV__) to reduce dev noise
- EAS Update uses appVersion runtime policy for predictable native/JS compatibility

**Phase 37-07 decisions (Form validation standardization):**
- text-red-500 is the canonical validation color; text-red-400 was incorrect in CreateLoadSheet (all 8 occurrences fixed)
- borderStyle: 'dashed' must remain as inline style (NativeWind does not support dashed borders); only borderColor migrated to className
- expiryDate in DocumentUploadSheet is optional — no error-state border needed; left with hardcoded border
- setField clears per-field errors onChange in CreateLoadSheet — acceptable; "submit-only" means errors SET only on submit, not triggered by input

**Phase 37-06 decisions (Accessibility label coverage):**
- Incidents "Report" button skipped — has Text child "Report" so screen reader reads it automatically; adding accessibilityLabel would be redundant
- fleet.tsx compose (PenSquare) and chat back (ChevronLeft) buttons added even though not listed in plan — icon-only interactives that clearly need labels
- SyncStatusBar accessibilityRole="status" auto-fixed to "alert" — "status" is not a valid RN AccessibilityRole type

**Phase 37-04 decisions (StyleSheet-to-NativeWind migration):**
- Dynamic hex+alpha colors (statusColor+'22', '#f59e0b40') cannot be expressed in NativeWind at runtime; kept as style props
- contentContainerStyle left as inline style object — NativeWind className does not apply to contentContainerStyle prop
- map.tsx already had AnimatedScreen wrap in place; plan anticipated adding it but it was pre-existing (no-op)
- Custom font families (Poppins-ExtraBold/SemiBold) kept as style prop — className cannot set custom fontFamily in RN

**Phase 37-03 decisions (Thumb-friendliness):**
- Avatar enlarged to 40x40px (Option A) rather than hitSlop approach — cleaner visually, no invisible tap zones
- Owner fleet tab icon changed from Radio to MessageSquare — Radio was ambiguous without a label, MessageSquare aligns with the messaging function
- Driver loads toggle already at py-3 (no change needed); owner loads pills upgraded py-2→py-3 for ≥44px compliance
- Send button in driver messages already compliant (p-3 + hitSlop) — no change needed

**Phase 36-01 decisions (Owner live map):**
- Used React Native Modal (built-in) for bottom sheet instead of @gorhom/bottom-sheet — avoids native module dependency; animationType="slide" provides native sheet feel
- truckName built from make+model+licensePlate in endpoint, marker label shows plate only for compact display
- fitToCoordinates fires once on initial load (hasFitted flag) to avoid re-centering on every 60s auto-refresh
- MapVehicle.speed stored as km/h in GPS data, converted to mph for display in VehicleDetailSheet

**Phase 35-02 decisions (Owner loads management):**
- 4-tab status filter: `active` = DISPATCHED+PICKED_UP+IN_TRANSIT; `pending` = PENDING only; `delivered` = DELIVERED+INVOICED; `all` = no filter — corrects prior 2-tab (active|history) grouping
- Load number generation in POST endpoint uses same LD-NNNN pattern as web owner portal — consistent across channels
- Owner can change load to any status (no sequential restriction) — more permissive than driver flow
- Nested BottomSheet for customer/driver pickers in CreateLoadSheet — separate Modal overlays to avoid z-index conflicts
- Cancel confirmation is a distinct sheet from status picker — prevents accidental cancellation

**Phase 34-02 decisions (Driver messaging):**
- Used MMKV client-side last-read timestamp instead of DB readAt field — avoids schema migration; unread count computed as non-driver messages newer than stored ISO timestamp passed as ?since= query param
- Unread badge clears after messages screen marks all read and next 30s poll fires — no tab press listener needed (Expo Router Tabs.Screen doesn't expose listeners prop)

**Phase 34-01 decisions (Driver documents):**
- Mobile document type (CDL, MEDICAL_CARD etc.) stored in Document.description field — DB DocumentType enum (DRIVER_LICENSE, GENERAL etc.) is for web portal categories only
- Date input uses YYYY-MM-DD text field — @react-native-community/datetimepicker not installed, text input avoids native module dependency
- Driver uploads set uploadedBy = driverId — drivers upload their own documents, no need for separate uploader user ID
- s3Key ownership validated with tenant-{tenantId}/drivers/ prefix check in both upload-url and POST /documents endpoints

**Phase 33-02 decisions (Push notifications):**
- Used db push instead of migrate dev — accumulated schema drift from prior phases blocks migrate dev; db push syncs schema directly (consistent with Phase 32-01 approach)
- void sendPushToUser() pattern in server actions — push is best-effort, never blocks user-facing operations or server action responses
- @@unique([userId, platform]) upsert — prevents stale token accumulation when Expo rotates device push tokens
- NotificationPermissionModal uses 1.2s mount delay — allows driver dashboard to render before showing system permission dialog

**Phase 32-04 decisions (Incident reporting):**
- Created dedicated /api/mobile/driver/incidents/upload-photo endpoint with Bearer token auth — existing document multipart endpoints require OWNER/MANAGER web session auth via requireRole, incompatible with mobile Bearer tokens
- Used expo-file-system/legacy import for getInfoAsync/readAsStringAsync/EncodingType — SDK 52 new API uses class-based File/Directory approach that doesn't accept bare URI strings
- Used ActionSheetIOS on iOS + Modal fallback on Android for photo source picker — native feel without @expo/react-native-action-sheet dependency
- Severity MEDIUM uses black text on yellow-500 background for WCAG contrast compliance

**Phase 32-03 decisions (HOS screen):**
- HOSDayBar uses onLayout to get pixel width then positions current-time marker with absolute left in pixels — avoids RN percentage string casts and is robust across layouts
- HOSClock resets totalSeconds when hoursRemaining prop changes via separate useEffect — prevents drift between 60s refetch cycles
- Active status card border: sky-500 (#0ea5e9) per brand blue, individual status colors reserved for icons/text only
- Gap/unfilled time in day bar: rendered as transparent flex children, not SVG — no extra dependencies

**Phase 32-02 decisions (HOS REST endpoints):**
- 14-hour window starts from first non-OFF_DUTY/non-SLEEPER_BERTH entry of the day, not midnight — matches FMCSA HOS rules
- Packages/types and api-client tsconfigs needed standalone configs (module: CommonJS, moduleResolution: node) — root tsconfig's expo/tsconfig.base inheritance with moduleResolution:bundler prevented dist emission
- Duplicate status guard: transaction returns null (not thrown error) so 400 response can be issued cleanly outside transaction scope
- api-client re-exports all HOS/Incident types so mobile only needs @drivecommand/api-client as import

**Phase 32-01 decisions (DB schema foundation):**
- Used `prisma db push` instead of `prisma migrate dev` — pre-existing migration drift (11 modified migrations) blocks migrate dev; db push syncs schema directly without migration history checks, appropriate for dev environment
- IncidentSeverity is its own enum (LOW/MEDIUM/HIGH only) — not reusing SafetyEventSeverity which has CRITICAL; incidents are driver-reported events, not AI-detected safety alerts

**Phase 31-03 decisions (Loads workflow):**
- [Phase 31-03]: Built-in React Native Modal used for status update confirmation (not third-party bottom sheet)
- [Phase 31-03]: FlashList v2+ new arch: estimatedItemSize prop removed (not supported)
- [Phase 31-03]: RouteStop interface added to api-client with full Prisma schema fields; truck.licensePlate fixed (was plateNumber)

**Phase 31-02 decisions (API client + driver dashboard):**
- apiRequest exported from client.ts so driver.ts and future api modules reuse auth/error handling without duplication
- api-client tsconfig.json requires noEmit:false — root tsconfig extends expo/tsconfig.base which sets noEmit:true, preventing dist emission without this override
- QueryProvider wraps above AuthProvider in root layout — QueryClient initialized before auth queries run
- Navigation to loads tab uses router.push with 'as any' cast — Expo Router typed routes don't include route group paths, matching existing pattern in app/index.tsx

**Phase 31-01 decisions (Driver REST API endpoints):**
- No separate Driver model — driverId on Load equals User.id for DRIVER role users; validateMobileToken sets ctx.driverId = user.id for DRIVER role
- Driver-facing status labels (ACCEPTED, EN_ROUTE) map to DB enum values (DISPATCHED, IN_TRANSIT) inside POST /status — mobile API contract is schema-agnostic
- Load stops surfaced via route.stops (RouteStop[] on Route model), flattened to top-level stops[] in load detail response
- Customer model uses companyName not name (corrected from plan spec)

**Phase 30-01 decisions (Mobile auth flow):**
- Reused existing AES-256-GCM encrypt() from lib/auth/session.ts as Bearer token — no separate JWT library needed; same payload works for both cookie (web) and Bearer (mobile)
- /api/auth/me Bearer path hits DB for fresh user+companyName; cookie path returns cached session for web performance
- AuthGuard is a child of AuthProvider so it has stable logout reference for 401 handler registration

**Phase 29-01 decisions (Turborepo monorepo setup):**
- npm workspaces chosen over pnpm — project already uses npm, zero toolchain disruption
- turbo@^2.0.0 installed at workspace root only — individual apps don't need it
- .env copied (not symlinked) to apps/web/ — Vercel reads env from app root at deploy time
- All file content inside apps/web/src/ left completely unchanged — only directory location changed
- IMPORTANT: Vercel Root Directory must be updated to apps/web/ before next deployment

**Phase 27-01 decisions (Playwright multi-role auth + SysAdmin E2E):**
- API-based login for all 3 roles: POST /api/auth/login — faster than UI login, avoids React hydration delays
- Per-spec storageState (test.use) over global config — enables mixed-role runs without project duplication
- Legacy .playwright/auth.json kept for backward compat — existing specs need only a single added line
- TEST_SYSADMIN_EMAIL/PASSWORD env vars required — no hardcoded admin credentials in repo
- Invoice lifecycle tests each create their own DRAFT invoice — eliminates test ordering dependencies
- Admin support tests use expand-in-place pattern — matches inline ticket-list component (no separate /admin-support/[id] detail route)

**Phase 27-02 decisions (Owner portal E2E tests):**
- test.describe.serial() for load lifecycle — guarantees PENDING→DISPATCHED→...→INVOICED sequential progression on one load
- Graceful skip over hard fail when DB prerequisites absent — enables running against fresh tenants without blocking CI
- testLoadUrl module variable shared across serial block — captures URL from dispatch test for subsequent status tests
- Plain text input for route origin/destination — AddressAutocomplete accepts text without Google Places API resolution in test env
- No data-testid additions needed — existing forms use proper htmlFor label associations, getByLabel() works throughout

**Phase 28-02 decisions (Driver history UI — COMPLETE):**
- Restructured empty-state branches to return full page with history — ensures drivers with no active assignment can still see past work
- History fetches are non-fatal (try/catch default to []) — page never fails due to history query errors
- Used toLocaleDateString() for history dates (acceptable minor inconsistency vs tenant timezone utility per plan)
- Human-verified in browser: history sections render correctly, read-only constraint confirmed

**Quick-98 decisions (TKT-0044 Screenshot auto-capture):**
- screenshotKey stored as separate DB field from attachmentKey — both can coexist independently on one ticket
- Screenshot upload failure is non-fatal — ticket submits without screenshotKey rather than blocking user
- html2canvas dynamically imported to avoid SSR bundle bloat and Next.js window/document errors
- Capture happens BEFORE setOpen(true) so Sheet is not rendered, capturing actual page state user was viewing

**Quick-59 decisions (TKT-0017 DriverRouteJoin):**
- Hard delete (no soft delete) for DriverRouteJoin — model has no deletedAt field; assignments are simple join records
- Per-method null logic enforced at server action level: fields irrelevant to the chosen paymentMethod are explicitly null on create/update
- Controlled useState form for checkbox + payment method select; avoids useActionState re-mount issues with dynamic conditional fields

**Phase 26-03 decisions (QA test scripts — Driver portal + README):**
- Driver documents section uses explicit "NOTE TO TESTER" callout block — makes view/download-only constraint unmissable
- GPS section (TC-DR-GPS-001 through TC-DR-GPS-004) covers four perspectives: driver map view, public tracking URL, status-change update, owner TC-OW-LOD-012 cross-reference
- README explicitly calls out Playwright as Phase 27 (out of scope) to prevent testers from attempting automation with manual scripts
- 7-step seeding sequence written in full so brand-new testers can set up from scratch without tribal knowledge

**Phase 26-02 decisions (QA test scripts — Owner portal):**
- Load lifecycle tests are individual test cases per status transition (not one mega-test) — enables targeted regression testing at each state boundary
- Smoke tests reference TC IDs only — testers jump to the full test case for exact steps
- TC-OW-NOT-xxx notifications section written as UI tests (page load, event-triggered, mark-as-read) per plan specification
- TC-OW-CRM-003 (duplicate company name) observes behavior rather than prescribing outcome — uniqueness constraint not confirmed in codebase
- N/A checkbox added to conditionally-present feature tests (multi-stop route UI, CRM messaging UI)

**Phase 26-01 decisions (QA test scripts — SysAdmin):**
- Test case preconditions specify HOW to achieve required state (not just "a tenant exists") — testers are self-sufficient
- ADMIN_SECRET_KEY auth documented in intro paragraph so testers see it before any test case
- Invoice number format `SINV-XXXX` documented so testers know what to look for when verifying creation
- Email warning toast on invoice send is expected behavior (not failure) — documented per actual server action
- TC-SA-{AREA}-NNN test ID scheme established: AUTH, DASH, TEN, SUP, BILL, USR

**v3.0 architectural decisions (from research):**
- Use Decimal.js for all financial calculations (matching Prisma.Decimal pattern from FuelRecord) — prevents floating-point errors
- Implement optimistic locking via version field on Route model — prevents concurrent edit race conditions
- Use soft delete pattern (deletedAt) for financial records — preserves audit trail for tax/compliance
- Defense-in-depth s3Key validation for driver documents — tenant prefix + entity ownership checks
- Multipart upload for files >5MB — handles large scanned driver compliance documents

**Phase 18-01 decisions:**
- Use DocumentType enum only for driver documents (DRIVER_LICENSE, DRIVER_APPLICATION, GENERAL) - existing truck documents use JSONB metadata to avoid migration complexity
- Increase MAX_FILE_SIZE from 10MB to 100MB to support large scanned compliance PDFs
- Implement multipart upload using presigned URLs per part (client uploads directly to R2) rather than server-side streaming
- Enforce defense-in-depth s3Key validation in 4 locations (tenant prefix + drivers category check)
- Abort multipart upload on validation failure to prevent orphaned parts in R2
- Make all new Document fields optional for backwards compatibility with existing truck/route documents

**Phase 18-02 decisions:**
- Used date-fns for expiry date calculations (differenceInDays) - clean date math API
- XMLHttpRequest instead of fetch for part uploads - required for progress event tracking
- 5MB threshold for small vs multipart uploads - balances simplicity with large file support
- Inline edit form for document metadata - faster than modal dialog UX
- 30-day threshold for "expiring soon" status - standard compliance warning window

**Phase 18-03 decisions:**
- Milestone filter (90/60/30/0 days) prevents daily notifications - only sends at key intervals
- Used driver-document-expiry notification type (distinct from truck document-expiry) for independent idempotency tracking
- Dashboard link points to /drivers/{driverId} where documents are now visible (per Plan 02)
- formatDocumentType helper converts enum values to human-readable strings for email subject/body

**Quick-1 decisions:**
- Wrapped ALL DriverInvitation queries in webhook with RLS-bypassed transactions (3 locations)
- Used form key remounting pattern for driver invite form reset instead of controlled inputs
- Moved redirect() calls outside try/catch blocks to avoid catching NEXT_REDIRECT errors
- Created comprehensive seed script with production-realistic data (names, cities, license plates)

**Phase 16-01 decisions:**
- Used Decimal(10,2) for all money amounts matching existing FuelRecord pattern
- Applied RLS tenant_isolation_policy to all financial tables with tenantId
- ExpenseTemplateItem does not have RLS directly (inherits through ExpenseTemplate)
- Used raw SQL for financial seed data to avoid tsx Prisma client caching issues
- Implemented soft delete pattern (deletedAt) on RouteExpense and RoutePayment for audit trail
- Added Route.version field for optimistic locking to prevent concurrent edit race conditions

**Phase 16-02 decisions:**
- Used Prisma.Decimal (imported from @/generated/prisma) for all money calculations to avoid floating-point errors
- Enforced COMPLETED route protection at server action level (not just UI) for security
- Used soft delete pattern (deletedAt check) in all query and mutation actions
- Implemented inline edit/add forms in RouteExpensesSection instead of modal dialogs for better UX
- Used window.confirm() for delete confirmation (simple and effective for v1)
- Calculated total operating cost client-side using parseFloat for display purposes (server handles accurate Decimal calculations)
- Used Promise.all to fetch expenses and categories in parallel on route detail page for performance

**Phase 16-03 decisions:**
- Created centralized route-calculator.ts library for all financial math (single source of truth)
- Used local state (useState) in PaymentForm to track status and conditionally render paidAt field
- Applied green badge for PAID status, yellow/amber badge for PENDING status for visual distinction
- Calculated margin as (profit / totalRevenue) * 100 with zero-division protection
- Set default profitMarginThreshold to 10% (can be made configurable from Tenant model later)
- Auto-set paidAt to current date when status changes to PAID without explicit date in server action
- Used parseFloat ONLY for display formatting (Intl.NumberFormat), never for calculations

**Phase 16-04 decisions:**
- Reused listCategories instead of creating duplicate listExpenseCategories action
- Used JSON serialization in hidden field for dynamic template items (itemsJson)
- Protected system default categories from deletion at action level (not just UI)
- Hard delete for categories and templates (configuration, not financial records)
- Applied applyTemplate in transaction to ensure atomicity of multi-expense creation
- Used dropdown menu pattern for template selection on route detail page
- Showed system default vs custom badges with blue/gray color distinction

**Phase 16-05 decisions:**
- Fleet average calculated from COMPLETED routes in last 90 days (rolling window for relevance)
- Used Prisma query + TypeScript iteration for fleet analytics (simpler than raw SQL aggregation)
- Fleet average requires MANAGER or OWNER role (DRIVER role cannot see fleet-wide data)
- Cost per mile returns null when odometer data missing (graceful degradation)
- Profit margin alert only renders when isLowMargin is true (conditional rendering)
- Zero-division protection for both fleet average and cost-per-mile calculations

**Phase 17-01 decisions:**
- Used event delegation (onInput/onChange on wrapper div) for dirty tracking instead of controlled inputs to avoid re-render loops with RouteForm's defaultValue pattern
- Used window.history.replaceState instead of Next.js router.replace to avoid server roundtrips for URL state sync
- Added extraHiddenFields prop to RouteForm as backwards-compatible way to inject version field for optimistic locking
- Kept updateRoute's existing redirect behavior (redirects to /routes/[id] without mode param) which naturally returns to view mode after save
- Used window.confirm for unsaved changes dialog (simple, effective, matches existing pattern in expenses/payments sections)

**Phase 17-02 decisions:**
- Used searchParams to determine initial edit mode (server-side decision before rendering client component)
- Fetch drivers/trucks conditionally only when in edit mode for performance optimization (avoid unnecessary DB queries in view mode)
- Version field is optional in updateRoute for backwards compatibility with existing route forms that don't use optimistic locking
- Prisma P2025 error code indicates version mismatch (optimistic locking conflict) — return user-friendly error message
- Keep old /routes/[id]/edit page as redirect rather than removing (preserves bookmarks and existing links)

**Quick-6 decisions:**
- Keep revalidatePath/redirect outside try/catch blocks — Next.js redirect throws NEXT_REDIRECT internally and must not be caught
- Handle Prisma P2002 unique constraint violation with field-level error for VIN duplicates (vin: ['A truck with this VIN already exists'])
- Use .catch on listDocuments within Promise.all to isolate S3 failures without breaking other data fetches
- Wrap edit-mode driver/truck queries in try/catch so route edit renders with empty dropdowns if DB query fails

**Quick-7 decisions:**
- Used prisma db push + migrate resolve --applied due to drift detection from modified migration file (safer than reset on production DB)
- JSON hidden field (itemsJson) for invoice line items serialization — matches expense-templates pattern from Phase 16-04
- InvoiceItem has no direct RLS — inherits through Invoice cascade delete (same pattern as ExpenseTemplateItem)
- Status-gated deletion: only DRAFT invoices/payroll records deletable — enforced in both server action and UI (conditional render)
- Auto-generate invoice number from latest invoice + increment (INV-NNNN padded format)
- Include inactive driver in payroll edit dropdown if record was created for them (backwards compatibility)

**Quick-8 decisions:**
- Auto-generate loadNumber from latest load + increment (LD-0001 format) inside createLoad action
- Status transitions validated via explicit map: DISPATCHED->PICKED_UP->IN_TRANSIT->DELIVERED->INVOICED; CANCELLED available from any non-terminal status
- Hard delete for loads (not financial records) — unlike invoices/expenses which use soft delete
- Dispatch modal uses useActionState with bound server action (dispatchLoad.bind(null, id))
- In Transit tab covers both PICKED_UP and IN_TRANSIT statuses for simpler dispatcher UX
- Decimal.js (Prisma.Decimal) used for rate field to prevent floating-point errors

**Quick-9 decisions:**
- Fire-and-forget pattern for email sends: do NOT await sendNotificationAndLogInteraction so load status changes are never delayed by email latency
- Email failures caught inside helper with console.error — never propagate to block load operations
- Only send notifications for PICKED_UP, IN_TRANSIT, DELIVERED from updateLoadStatus; DISPATCHED handled separately in dispatchLoad
- INVOICED and CANCELLED skipped — not customer-facing milestones
- z.preprocess to convert FormData checkbox string 'true' to boolean in Zod schema
- Prisma client regenerated with prisma generate after schema change to fix TypeScript types

**Quick-10 decisions:**
- Normalize lane keys with trim+toUpperCase so "Chicago, IL" and "CHICAGO, IL" aggregate to the same lane
- Sort lanes by profit using Decimal.comparedTo (not parseFloat) to preserve precision in sort
- Display only top 10 lanes in bar chart to avoid overcrowding; full detail available in table
- Use -Infinity sentinel for null profitPerMile values during client-side table sort
- Raw Recharts BarChart/Bar/Cell used directly (not ChartContainer) to support per-bar coloring and multi-field tooltips

**Quick-11 decisions:**
- Classify compliance items as OK/EXPIRING_SOON/EXPIRED using 30-day threshold (consistent with Phase 18-02)
- Query driver documents, truck documentMetadata JSONB, and safety events in parallel with Promise.all
- HIGH/CRITICAL safety events aggregated per driver over last 90 days for compliance scoring
- Alerts panel sorted by priority: EXPIRED first, then soonest expiry date
- Sidebar link under Intelligence section with ClipboardCheck icon (OWNER/MANAGER only)

**Quick-12 decisions:**
- Use anthropic.beta.messages.create with betas=['pdfs-2024-09-25'] for PDFs (separate code path from images) to avoid TypeScript union type error on response.content
- claude-haiku-4-5-20251001 model — fast and cost-efficient for structured extraction tasks
- Magic-byte file validation before Claude call — prevents spoofed MIME type attacks and invalid API calls
- Return ExtractedFreightData as typed interface — enables future load form pre-fill without raw JSON

**Quick-13 decisions:**
- Use 365-day window for getLaneAnalytics (vs 90-day default) to maximize lane coverage for prediction accuracy
- accept>=15%, caution 0-14.9%, reject<0% — thresholds match freight dispatcher decision-making standards
- dataSource=none returns caution (not reject) — no historical data is uncertain, not inherently bad
- State variables used in lane data source label (not echoed from server) to keep PredictionResult interface minimal
- Calculator icon chosen for Profit Predictor sidebar link to distinguish from TrendingUp (Lane Profitability)

**Quick-14 decisions:**
- Use db push (not migrate dev) to handle drift — consistent with quick-7 pattern for this project
- Fire-and-forget toggle (no loading state) with optimistic UI revert on error for v1 simplicity
- comingSoon cards show toast on entire card click; Switch uses stopPropagation to avoid conflict
- Sonner Toaster added to root layout so toasts are available across all pages globally
- Settings section in sidebar gated to OWNER only (not MANAGER) per plan spec — settings are owner-only

**Quick-16 decisions:**
- Email send failure does not roll back invitation record (inner try/catch pattern for non-critical side effects)
- RLS bypassed for accept-invitation API since driver has no session yet (same set_config pattern as login route)
- Auto-login after accepting invitation via setSession (driver does not need to sign in separately)
- Skipped GET-based invitation pre-validation on page load for simplicity; POST validates everything
- Used EMAIL_CONFLICT throw/catch pattern to return 409 status when email already exists in tenant

**Quick-17 decisions:**
- Direct fetch() for Samsara API — no external SDK needed for simple REST calls
- VIN normalization (trim + uppercase) for reliable vehicle matching across systems
- Dual auth on sync endpoint: CRON_SECRET for automation, OWNER session for manual UI trigger
- saveIntegrationConfig restricted to OWNER role only (not MANAGER) — API keys are sensitive
- configMap passed from server page to client component to display masked existing tokens

All milestone decisions logged in PROJECT.md Key Decisions table.
- [Phase quick-18]: Server-side timestamp for GPS records to prevent tampering; RLS bypass in API route; auto-disable tracking on no active route
- [Phase quick-19]: pointer-events:none on plate label to preserve marker clicks; iconSize height 40->56px for label room; iconAnchor kept [20,20] so circle center stays on GPS coordinate; top:100%+translate-x-1/2 for centered sub-icon label
- [Phase quick-20]: Nominatim (OSM) for geocoding — free, no API key, lazy geocode on first ping then cache on Load; geofenceFlags JSONB on Load (not separate table) for lightweight idempotency; fire-and-forget geofence check after GPS save — endpoint never delayed; dynamic import for sendLoadStatusEmail avoids circular dependency; dispatcher alert targets ALL OWNER+MANAGER users in tenant
- [Phase quick-21]: Bounding-box state detection (not polygon) — intentionally approximate for IFTA, avoids complex dependency; states ordered by area ascending so smaller states win border overlaps; generateIFTACSV made async (use server constraint); native HTML table used (no shadcn table component in project); GPS segment mileage attributed to starting-ping state (standard IFTA convention); UNKNOWN bucket for unresolvable fuel records
- [Phase quick-22]: Motive API uses lat/lon/bearing/located_at fields (vs Samsara lat/longitude/heading/time); per-provider EldProviderState record replaces single-Samsara state — scales to future ELD providers; KEEP_TRUCKIN enum preserved (no migration needed); generic ELD config panel driven by ELD_PROVIDERS array — adding third provider requires only array entry + catalog + route
- [Phase quick-23]: Public tracking page queries prisma directly (no auth/RLS) — intentional for public access; --accept-data-loss safe for nullable unique field; globalThis.crypto.randomUUID() for token generation (no import needed); dynamic import ssr:false for Leaflet (requires browser APIs); customer stepper shows only 4 statuses (DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED) — internal statuses excluded; no financial data on public page/API
- [Phase quick-24]: Skip fetch inside setInterval when visibilityState=hidden (simpler than pause/resume interval); visibilitychange listener for immediate catch-up on tab focus; useRef for tagId in closure (avoids stale ref without adding to interval deps); reuse existing /api/track/[token] for tracking page polling (no new endpoint needed); server component keeps initial fetch for SEO/first paint
- [Phase quick-25]: Server action file uses .tsx extension (not .ts) to allow JSX syntax for react-pdf element creation; cast renderToBuffer argument `as any` to satisfy ReactElement<DocumentProps> generic constraint; status validation in server action as defense-in-depth (not just UI gating); Helvetica font chosen (built-in, no download needed for server-side PDF rendering)
- [Phase quick-26]: Revert DISPATCHED->PENDING clears driverId/truckId/trackingToken (symmetric with dispatchLoad); no customer email on revert (dispatcher correction only); INVOICED status included in StatusUpdateButton render condition (revert-only state, no advance); Undo2 icon + muted/outline style distinguishes revert from primary advance button
- [Phase quick-29]: Remove page-level requireRole() from DashboardPage — layout enforces auth, page-level call blocked all Suspense boundaries causing blank white screen; make DashboardPage synchronous; getAuthContext() combines role+tenantId into single getSession() call per data function, reducing dashboard session decrypts from ~9 to ~4
- [Phase quick-30]: emailSent boolean tracks email outcome inside try/catch; warning field returned (not error) when email fails so invitation record persists and user gets actionable amber banner; tenant name fetched in separate try/catch — falls back to 'your fleet' if DB fails; resend-client.ts error message links to https://resend.com/api-keys
- [Phase quick-32]: Use custom scripts/migrate.mjs (not prisma migrate deploy) — project uses manual SQL runner with atomic transactions and retry; buildCommand chains with && so Vercel build fails fast if migration fails
- [Phase quick-33]: accept-invitation hardcodes /my-route (DRIVER-only endpoint); login route uses role conditional; OWNER_PATHS array in middleware guards all owner-portal paths as safety net for direct navigation/bookmarks
- [Phase quick-34]: Use prisma.$queryRaw SELECT 1 for warmup DB check — minimal round-trip without RLS/tenant context; schedule */5 every 5 min to prevent Vercel cold starts; add /api/warmup to PUBLIC_PATHS so Vercel cron caller bypasses session auth redirect
- [Phase quick-35]: Controlled AlertDialog open state (!!pendingDeactivate) instead of AlertDialogTrigger — avoids table nesting complexity
- [Phase quick-37]: Edit hidden on PAID and CANCELLED (both terminal statuses — no further editing needed); Mark as Paid only on SENT; markInvoicePaid validates status server-side as defense-in-depth; useTransition over useState for pending state (idiomatic React 18)
- [Phase quick-38]: Use any[] for prisma.findMany() empty default — Awaited<ReturnType<...>> returns base type without include fields causing TS2322; any[] is correct empty-fallback approach; try/catch preferred over per-item .catch for dashboard aggregates with complex return types; zero-value defaults preferred over notFound() for analytics dashboards
- [Phase quick-40]: Forward-only status progression map (DISPATCHED->PICKED_UP->IN_TRANSIT->DELIVERED) enforced at server action level; driver ownership verified via driverId: user.id in findFirst before update; DELIVERED shows green checkmark (no button) — terminal state; LoadStatusButton in separate file to respect server/client module boundary; DRIVER_STATUS_LIFECYCLE excludes INVOICED (not a driver-visible status)
- [Phase 01-database-integrity-hardening]: InvoiceItem and ExpenseTemplateItem get direct tenantId for RLS — enables row filtering without JOIN via current_tenant_id() policy evaluation
- [Phase 01-database-integrity-hardening]: CREATE TABLE IF NOT EXISTS used for Load and TenantIntegration — these tables exist in prod via db push so migration must be idempotent; same for enum DO/EXCEPTION blocks
- [Phase 01-database-integrity-hardening]: Backfill pattern (nullable ADD COLUMN -> UPDATE -> SET NOT NULL) chosen to safely add tenantId to existing rows
- [Phase 01-database-integrity-hardening]: process.exit(1) in outer catch of migrate.mjs replaces 'Starting app anyway...' — migration failures now terminate with non-zero exit code so Vercel buildCommand fails fast
- [Phase 19-01]: Keep Route.origin/destination unchanged — RouteStops are additive intermediate stops; avoids migrating existing data and breaking 10+ display components
- [Phase 19-01]: Flat FormData keys (stops_N_address, stops_N_type) not JSON blob — idiomatic with Next.js useActionState + FormData; server action loops i=0..N until no stops_i_address
- [Phase 19-01]: stops_submitted=true hidden field distinguishes "no stops section in form" from "stops cleared to zero" in updateRoute
- [Phase 19-01]: Atomic stop replacement in updateRoute (deleteMany + createMany in same try block) — position gaps cannot occur, positions always 1-based sequential
- [Phase 19]: Address field uses name=stops_N_address on AddressAutocomplete so typed values submit without requiring map selection
- [Phase 19]: StopStatusBadge defined inline in route-detail.tsx — colocated helper, not exported, no separate file
- [Phase 19]: stops? optional on all route interfaces so routes without stops render correctly (timeline section conditionally hidden)
- [Phase 19]: DEPARTED is manual-only: geofence exit does NOT trigger departed status — driver must press button
- [Phase 19]: MarkDepartedButton uses dynamic import for markStopDeparted to avoid server action in use-client module boundary
- [Phase 19]: No dispatcher alert for RouteStop arrival: stop-level tracking only, not load-level status change
- [Phase quick-41]: No RLS on SupportTicket — system admins need cross-tenant visibility; tenant-scoped queries use WHERE submittedBy/tenantId in server actions
- [Phase quick-41]: bypass_rls transaction for ticket number generation — ensures cross-tenant uniqueness (TKT-NNNN format padded to 4 digits)
- [Phase quick-41]: SupportTicketModal in root layout — single instance covers owner, driver, and admin portals; only renders if user is authenticated
- [Phase quick-41]: No Prisma relations on SupportTicket to Tenant/User — avoids cluttering existing model relation arrays; FK constraints enforced at SQL level only
- [Phase quick-42]: role field defaults to DRIVER so all existing invitations remain driver invitations without data migration
- [Phase quick-42]: Inner try/catch email pattern — invitation persists even if email fails; emailWarning returned so admin sees amber banner
- [Phase quick-42]: licenseNumber conditionally null for non-DRIVER roles — owners don't have CDL license numbers
- [Phase quick-42]: invitation.role fallback to 'DRIVER' in accept-invitation for backwards compatibility with pre-migration invitations
- [Phase quick-43]: Check for OWNER-role user existence (not invitation) — user record means they completed account setup (accept-invitation creates User)
- [Phase quick-43]: Suspended takes precedence over Pending in status priority order — admin-disabled tenant shows Suspended regardless of owner status
- [Phase quick-43]: No schema changes — ownerSetupComplete computed from existing User.role field in tenant query via nested select
- [Phase 22-01]: No RLS on TicketMessage — admin needs cross-tenant visibility; consistent with SupportTicket pattern from quick-41
- [Phase 22-01]: No @relation on TicketMessage — FK enforced at SQL level only, avoids polluting SupportTicket model with relation arrays (same pattern as SupportTicket/quick-41)
- [Phase 22-01]: SupportTicketType enum removed from schema.prisma only, not dropped in SQL — DB system catalog may reference it; safe to leave as unused SQL type
- [Phase 22-01]: SupportTicketCategory replaces SupportTicketType with 4-value set (BILLING, BUG, FEATURE, GENERAL) — cleaner than old 5-value set
- [Phase 22-02]: Fire-and-forget email for team notifications: await inside separate try/catch block so failures are logged but never block ticket operations
- [Phase 22-02]: OwnerReplyForm in dedicated owner-reply-form.tsx with 'use client' — colocated with server page, clean module boundary
- [Phase 22-02]: DRIVECOMMAND_SUPPORT_EMAIL env var with GMAIL_USER fallback — no breakage until dedicated support email is provisioned
- [Phase 22-02]: Both CLOSED and RESOLVED hide owner reply form — both are terminal statuses requiring no further action
- [Phase 22-02]: params typed as Promise<{id: string}> — required by Next.js 15 App Router async params
- [Phase 22-03]: SupportBadge as isolated server component passed via Suspense from OwnerLayout — sidebar is use client, server actions cannot be called in component body; props-as-children pattern maintains correct server/client boundary
- [Phase 22-03]: WAITING_ON_CUSTOMER included in IN_PROGRESS tab count — both statuses represent active in-flight conversations from admin perspective
- [Phase 23-01]: ADMIN_SECRET_KEY plain string compare + 500ms delay for brute-force resistance; decryptAdminSession is pure Web Crypto (Edge-safe for middleware); admin_session guard in middleware bypasses tenant session checks entirely
- [Phase 23-01]: UserMenu conditionally rendered only when tenant session exists — admin-session-only users see Logout link; /admin added to ADMIN_ALLOWED_PATHS for legacy isSystemAdmin DB access to new /admin/* routes
- [Phase 23-02]: getSystemMetrics uses Promise.all for 4 parallel cross-tenant Prisma queries — minimizes admin dashboard load latency
- [Phase 23-02]: params typed as Promise<{ id: string }> for Next.js 15 async params (consistent with Phase 22-02)
- [Phase 23-02]: TenantStatusControls in separate file to maintain clean server/client module boundary
- [Phase 23-03]: Tab counts based on unfiltered list; priority/tenant filters only affect visible list and heading count
- [Phase 23-03]: queryRawUnsafe with positional params for optional WHERE clause composition in getAllTickets -- Prisma tagged literals cannot conditionally compose WHERE
- [Phase 24-01]: Tech stack corrected in docs — Next.js 15 (not 16) and Resend (not Gmail SMTP) per actual .env.example and codebase
- [Phase 24-01]: Admin portal ADMIN_SECRET_KEY auth documented in auth.md (not in original spec but required for developer completeness)
- [Phase 24-01]: 29 models documented in database.md (not 25+ as estimated — counted all models including RouteStop and TicketMessage)
- [Phase 24-02]: docs/setup.md documents both Resend (.env.example) and Gmail SMTP (active gmail-client.ts) — the .env.example was not updated when the project migrated from Resend
- [Phase 24-02]: docs/modules.md includes Shipment Tracking (/track) as entry 21 — significant public-facing surface not in plan spec but required for completeness
- [Phase 24-02]: docs/email.md flags resend-client.ts as legacy and gmail-client.ts as active to prevent developer confusion from two client files existing
- [Phase quick-45]: prisma db push used (not migrate dev) due to existing migration history drift — multiple prior migrations modified after application
- [Phase quick-45]: coDriverIds serialized as comma-separated hidden form field; parsed and saved inline in updateRoute/createRoute to avoid unreachable call after redirect()
- [Phase quick-45]: Primary driver select changed to controlled value so co-driver checkbox list can exclude selected primary driver in real time
- [Phase quick-45]: useEffect([initialDocuments]) sync pattern required in RouteDocumentsSection — router.refresh() delivers new props but React does not re-initialize state from changed props
- [Phase quick-46]: Used db push instead of migrate dev due to migration history drift from prior direct DB operations
- [Phase quick-46]: Driver detail page shows System for createdBy/updatedBy since User model uses invitation-based creation without audit fields
- [Phase quick-47]: Used autoComplete=username on read-only email field per WHATWG autofill spec for broadest password manager compatibility on accept-invitation page
- [Phase quick-49]: Used prisma db push instead of prisma migrate dev due to pre-existing schema drift in development database
- [Phase quick-51]: New fields added to DriverInvitation only; User model update deferred for full edit support
- [Phase quick-52]: Use z.preprocess in Zod schema for odometer/year string-to-number coercion rather than parseInt in actions
- [Phase quick-52]: Server actions return { error, values } on validation failure; form uses key prop to remount and apply sticky defaultValues
- [Phase quick-53]: Use React state (odometerRaw) instead of ref for hidden input — React resets hidden inputs on re-render
- [Phase 25]: SysAdminInvoice.invoiceNumber globally unique (SINV-XXXX sequence spans all tenants, not tenant-scoped)
- [Phase 25]: decimal.js installed for monetary arithmetic precision in invoice line item calculations
- [Phase 25]: updateSysAdminInvoice uses prisma.$transaction to atomically delete and recreate line items
- [Phase 25]: MarkOverdueButton placed in separate file to keep server component clean
- [Phase 25]: InvoiceActions uses window.confirm for destructive actions matching existing admin portal patterns
- [Phase 25-03]: DB status committed to SENT before email attempt — consistent state even if email service is down
- [Phase 25-03]: Email failure is non-fatal: returns emailWarning in success response, shown as yellow banner in UI
- [Phase 25-03]: Cron uses base prisma (no bypass_rls) — SysAdminInvoice RLS only restricts rows when app.current_tenant_id is set; cron runs without tenant context
- [Phase quick-57]: Status is computed from pre-fetched Prisma includes — no schema changes, priority: In Use > In Maintenance > Expired Docs > Ready to Use
- [Phase quick-60]: Nullable loadId FK (not required) preserves all existing invoice data without migration
- [Phase quick-65]: Fleet message emails are fire-and-forget: try/catch after DB insert so email failures never block message saving
- [Phase quick-70]: Overdue service threshold: intervalDays met (date+days <= now) OR intervalMiles met (baselineOdometer+miles <= odometer)
- [Phase quick-72]: Keep TruckWithRelations.documentMetadata as unknown and cast to DocumentMetadata | null only at the hasExpiredMetadataDate call site, avoiding TS2322 from Prisma JsonValue callers
- [Phase quick-74]: Used idempotent SQL throughout so migration is safe on dev DBs that already ran prisma db push
- [Phase quick-75]: DriverRouteJoin entries win over Route.driverId duplicates (join records carry payment data); Primary Driver entries have no delete button
- [Phase quick-80]: Block admin reply emails by domain (not per-address) using UNDELIVERABLE_DOMAINS Set — silent early return preserves fire-and-forget contract
- [Phase 27-automated-playwright-tests]: Driver access boundaries: test.describe blocks with separate test.use() per role — cleanest Playwright pattern for multi-role tests in one file
- [Phase 27-automated-playwright-tests]: Access denial assertions use URL exclusion (not.toContain) not exact match — resilient across different redirect targets per role
- [Phase quick-81]: getRouteStatusClasses refactored to return a single class string instead of separate bgColor/textColor to ensure dark mode variants always travel with light variants
- [Phase 29]: Used Expo SDK 55 (latest stable via create-expo-app, ships React 19 + RN 0.83.2)
- [Phase 29]: NativeWind v4 requires nativewind-env.d.ts type reference for className prop TS support
- [Phase 29]: Notification icon is placeholder logo-192.png — replace with proper 96x96 PNG before Phase 38
- [Phase 29-03]: packages/* are pure TypeScript/Zod with no React Native or Next.js imports
- [Phase 29-03]: Shared Zod schemas in @drivecommand/validation — single source of truth for both web and mobile validation
- [Phase 30]: Used lucide-react-native for SVG tab icons (New Architecture native)
- [Phase 30]: BottomSheet uses React Native Modal (no third-party dep) — simpler for Phase 30 scope
- [Phase 31-03]: Built-in React Native Modal used for status update confirmation (not third-party bottom sheet)
- [Phase 31-03]: FlashList v2+ new arch: estimatedItemSize prop removed (not supported)
- [Phase 31-03]: RouteStop interface added to api-client with full Prisma schema fields; truck.licensePlate fixed (was plateNumber)
- [Phase 33]: trackingToken is per-load (Load.trackingToken) not per-driver; endpoint returns active load token for GPS supplementary context
- [Phase 33]: GPS interval adapts to HOSStatus: 30s DRIVING/ON_DUTY, 5min idle, 10min low-battery (<20%)
- [Phase 33]: GPSStatusDot overlaid on home tab icon (not separate header bar) — minimal UI footprint
- [Phase 33]: callOrQueue returns null when offline so callers show 'saved offline' feedback without structural error handling changes
- [Phase 33]: SyncStatusBar mounted at driver layout root for app-wide offline visibility without per-screen wiring
- [Phase 35-01]: openAlertsCount = expiring docs (30 days) + trucks in maintenance, no separate alerts model
- [Phase 35-01]: revenueThisMonth uses updatedAt on DELIVERED/INVOICED loads as proxy for completion month
- [Phase 36]: RecipientSelector uses Modal bottom sheet (VehicleDetailSheet pattern) — consistent with codebase, no new dependencies
- [Phase 37]: Skeleton base component uses opacity pulse (0.3→0.8 repeat) via react-native-reanimated; map loading overlay keeps ActivityIndicator since skeleton doesn't apply over MapView
- [Phase quick-126]: Load sequence uses onBlur server action pattern for inline editing without form submission
- [Phase quick-134]: Offset pagination (page/limit default 50) added to 5 mobile list APIs; cursor pagination on fleet messages
- [Phase quick-134]: Dashboard queries parallelized into 2 Promise.all batches; cron uses single IN query for dedup; groupBy replaces full-table stats scans
- [Phase quick-134]: 4 composite indexes: Load(tenantId,status,archivedAt), Invoice(tenantId,status), Document(tenantId,driverId), FleetMessage(tenantId,createdAt)
- [Phase quick-147]: OSRM for road distance over haversine — 20-40% more accurate for route/load distance estimates
- [Phase 37.7]: Use UserTrackingMode.Follow enum (not string literal 'normal') for Mapbox Camera followUserMode — Mapbox types require enum values
- [Phase 37.7]: Two-query pattern for map screen: dashboard query for activeLoad summary, getLoad query for full RouteStop coords (lat/lng not in dashboard stops)
- [Phase quick-161]: recalculateAndStore wrapped in try/catch so revenue calc failure does not block stop completion
- [Phase quick-161]: role check for skip (driver=403) placed in API route layer, not lib function
- [Phase quick-182]: v4.0 MILESTONES entry added after v3.0 to maintain logical milestone document order
- [Phase 27-04]: Used id-based locators for shadcn Select components (#payModel, #payPeriod) rather than nth(combobox) indexing for stability across forms with multiple Selects
- [Phase 27]: LoadForm labels lack htmlFor — commodity field located via placeholder text; client field via getByRole combobox
- [Phase 27]: Button text in create mode: 'Create Client', 'Create Load', 'Create Contract' — not generic Save/Create
- [Phase 27]: FacilityForm State field is plain Input (not shadcn Select) — getByLabel('State').fill() used; driver redirect from /carrier/* is /my-route per CarrierLayout; Mark as Paid requires window.confirm dialog accept before PATCH
- [Phase 37.2-01]: Route list queries status=all always and groups client-side (Active/Scheduled/Completed); Completed collapsed by default
- [Phase 37.2-01]: getTruckOptions is a named alias of getTrucks reusing /api/mobile/owner/trucks endpoint for semantic clarity in picker contexts
- [Phase 37.2]: Swipeable replaced with Trash2 delete icon button since react-native-gesture-handler is not installed in mobile app
- [Phase quick-207]: Application-layer tenantId injection chosen over RLS-only: Supabase postgres role has BYPASSRLS defeating RLS entirely; findUnique/findUniqueOrThrow use post-query verification since unique-where cannot include tenantId
- [Phase quick-209]: ALLOWED_TYPES for uploads set to PDF/JPEG/PNG only; SVG blocked at support attachment route (XSS vector via embedded scripts)
- [Phase quick-210]: Use tenantId as rate limit key for document routes; publicLimiter on track endpoint uses IP from x-forwarded-for
- [Phase quick-241]: updateMany with status filter for in_transit cascade — idempotent, won't downgrade a load already past in_transit
- [Phase quick-243]: Used getSession() instead of requireRole() to get userId and tenantId in a single call for HOS actions
- [Phase quick]: Single-vehicle map centering uses setView(zoom 13) instead of fitBounds to avoid point-bbox over-zoom
- [Phase quick-275]: Stop display uses stopType+sequenceOrder (CarrierStop has no name field); Dispatch display uses UUID prefix (no dispatchNumber field)

### Pending Todos

None.

### Blockers/Concerns

**v3.0 Financial Features Critical Requirements:**
- All money calculations MUST use Decimal.js (never JavaScript number type) to prevent rounding errors
- Financial records MUST use soft delete only (never hard delete) for audit trail preservation
- s3Key validation MUST enforce tenant isolation for driver document uploads

**Phase 16 Notes:**
- .env file created by copying .env.local (not committed - contains secrets)
- tsx caching issue with Prisma client worked around using raw SQL in seed script

None blocking immediate progress.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Audit and fix all Management pages with Playwright tests | 2026-02-16 | f543014 | [1-audit-and-fix-all-management-pages-with-](./quick/1-audit-and-fix-all-management-pages-with-/) |
| 2 | Change login method - remove Google, create owner login | 2026-02-17 | a6d016f | [2-change-login-method-remove-google-create](./quick/2-change-login-method-remove-google-create/) |
| 3 | Investigate and fix all broken pages in the app | 2026-02-18 | 3f30f62 | [3-investigate-and-fix-all-broken-pages-in-](./quick/3-investigate-and-fix-all-broken-pages-in-/) |
| 5 | Remove Clerk and replace with custom email/password auth | 2026-02-18 | 886f262 | [5-remove-clerk-and-replace-with-custom-ema](./quick/5-remove-clerk-and-replace-with-custom-ema/) |
| 6 | Fix truck save/view errors and improve route driver dropdown | 2026-02-18 | ae7797b | [6-fix-truck-save-view-errors-improve-truck](./quick/6-fix-truck-save-view-errors-improve-truck/) |
| 7 | Build Invoice/Billing UI and Payroll UI with migration and sidebar navigation | 2026-02-18 | 9e9a67f | [7-build-invoice-billing-ui-and-payroll-ui-](./quick/7-build-invoice-billing-ui-and-payroll-ui-/) |
| 7 | Build Invoice/Billing UI and Payroll UI | 2026-02-18 | 5bbef95 | [7-build-invoice-billing-ui-and-payroll-ui-](./quick/7-build-invoice-billing-ui-and-payroll-ui-/) |
| 8 | Build Dispatch and Load Management with dispatch modal, status lifecycle, and sidebar | 2026-02-18 | d3e26fd | [8-build-dispatch-and-load-management-with-](./quick/8-build-dispatch-and-load-management-with-/) |
| 9 | Build Automated Customer Communications with load status emails and CRM interaction logging | 2026-02-18 | 41c0ba7 | [9-build-automated-customer-communications-](./quick/9-build-automated-customer-communications-/) |
| 10 | Build Profit Per Lane Analysis with sortable table, bar chart, and summary cards | 2026-02-18 | 4cc3422 | [10-build-profit-per-lane-analysis](./quick/10-build-profit-per-lane-analysis/) |
| 11 | Build compliance dashboard with driver/truck expiry tracking, safety events, and alerts | 2026-02-18 | 4fbb6b9 | [11-build-compliance-dashboard](./quick/11-build-compliance-dashboard/) |
| 12 | Build AI document reading with Claude-powered freight data extraction | 2026-02-18 | 30d354d | [12-build-ai-document-reading](./quick/12-build-ai-document-reading/) |
| 13 | Build AI profit predictor with lane-based and fleet-average cost estimation | 2026-02-18 | eee9707 | [13-build-ai-profit-predictor](./quick/13-build-ai-profit-predictor/) |
| 14 | Build third-party integrations framework with settings UI and TenantIntegration model | 2026-02-18 | 7462229 | [14-build-third-party-integrations-framework](./quick/14-build-third-party-integrations-framework/) |
| 15 | Comprehensive UI/UX redesign — semantic status tokens, glassmorphism, dark mode fixes across 17 files | 2026-02-19 | 4bacefd | [15-comprehensive-ui-ux-redesign](./quick/15-comprehensive-ui-ux-redesign/) |
| 16 | Wire up driver invitation flow to send email and accept-invitation page | 2026-02-19 | 65c9274 | [16-wire-up-driver-invitation-flow-to-send-e](./quick/16-wire-up-driver-invitation-flow-to-send-e/) |
| 17 | Wire up real Samsara GPS provider integration | 2026-02-20 | 907bdf5 | [17-wire-up-real-gps-provider-integration-to](./quick/17-wire-up-real-gps-provider-integration-to/) |
| 18 | Add driver app GPS tracking with browser geolocation | 2026-02-20 | a069193 | [18-add-driver-app-gps-tracking-with-browser](./quick/18-add-driver-app-gps-tracking-with-browser/) |
| 19 | Add license plate label under each vehicle marker on the live map | 2026-02-23 | dee78b1 | [19-add-license-plate-label-under-each-vehic](./quick/19-add-license-plate-label-under-each-vehic/) |
| 19 | Add license plate label below each vehicle marker on live map | 2026-02-23 | dee78b1 | [19-add-license-plate-label-under-each-vehic](./quick/19-add-license-plate-label-under-each-vehic/) |
| 20 | Geofencing alerts — auto-detect truck arrival at pickup and delivery stops | 2026-02-23 | 92c69f0 | [20-geofencing-alerts-auto-detect-truck-arri](./quick/20-geofencing-alerts-auto-detect-truck-arri/) |
| 21 | IFTA fuel tax reporting — automated quarterly miles/fuel per state with CSV export | 2026-02-23 | a06caf8 | [21-ifta-fuel-tax-reporting-automate-quarter](./quick/21-ifta-fuel-tax-reporting-automate-quarter/) |
| 22 | Motive (KeepTruckin) ELD integration — GPS sync, API endpoint, generalized integrations UI | 2026-02-23 | 1344a36 | [22-motive-keeptruckin-eld-integration-secon](./quick/22-motive-keeptruckin-eld-integration-secon/) |
| 23 | Customer shipment tracking page — public /track/[token] with GPS map, status timeline, Copy Link | 2026-02-23 | 50c360e | [23-customer-shipment-tracking-page-public-t](./quick/23-customer-shipment-tracking-page-public-t/) |
| 24 | Real-time GPS polling on live map and customer tracking — 30s polling, visibility-aware, "Updated Xs ago" | 2026-02-24 | 8b8be7c | [24-real-time-gps-polling-on-live-map-and-cu](./quick/24-real-time-gps-polling-on-live-map-and-cu/) |
| 25 | Rate confirmation PDF generator — @react-pdf/renderer server action, download button on load detail page | 2026-02-24 | 7bdf210 | [25-rate-confirmation-pdf-generator-for-disp](./quick/25-rate-confirmation-pdf-generator-for-disp/) |
| 26 | Revert status button on load detail page — step load back one lifecycle stage with confirmation dialog | 2026-02-24 | d63c9dd | [26-add-revert-status-button-on-load-detail-](./quick/26-add-revert-status-button-on-load-detail-/) |
| 27 | Upgrade dashboard with financial metrics — 6 stat cards (active loads, unpaid invoices, revenue/mile) and unified notifications panel | 2026-02-24 | 244af36 | [27-upgrade-dashboard-with-financial-metrics](./quick/27-upgrade-dashboard-with-financial-metrics/) |
| 28 | Dashboard UI polish — premium stat cards with colored top-border accents, left-accent severity alert rows, fleet health badge header | 2026-02-24 | b580e72 | [28-dashboard-ui-polish-premium-stat-cards-w](./quick/28-dashboard-ui-polish-premium-stat-cards-w/) |
| 29 | Fix dashboard slow loading — eliminate ~9→4 session decrypts, remove blocking page-level auth, synchronous DashboardPage for instant skeletons | 2026-02-24 | c92341b | [29-fix-dashboard-slow-loading-performance-i](./quick/29-fix-dashboard-slow-loading-performance-i/) |
| 30 | Fix driver invitation email not being sent — surface email failures with amber warning, fetch tenant name from DB, document RESEND env vars | 2026-02-24 | 062a260 | [30-fix-driver-invitation-email-not-being-se](./quick/30-fix-driver-invitation-email-not-being-se/) |
| 32 | Fix Vercel deployment — add buildCommand to vercel.json (migrate.mjs + prisma generate + next build), comprehensive .env.example with all 13 env vars | 2026-02-25 | d8bf617 | [32-fix-vercel-deployment-add-vercel-json-bu](./quick/32-fix-vercel-deployment-add-vercel-json-bu/) |
| 33 | Fix driver onboarding Access Denied bug — role-aware redirects in accept-invitation, login, root page, onboarding page; OWNER_PATHS middleware guard | 2026-02-25 | ac87ccf | [33-fix-driver-onboarding-access-denied-bug-](./quick/33-fix-driver-onboarding-access-denied-bug-/) |
| 34 | Add warmup cron job — /api/warmup with CRON_SECRET auth and SELECT 1 DB check, vercel.json cron every 5 min, middleware PUBLIC_PATHS bypass | 2026-02-25 | fdf3f06 | [34-add-warmup-cron-job-that-pings-api-warmu](./quick/34-add-warmup-cron-job-that-pings-api-warmu/) |
| 35 | Replace window.confirm with AlertDialog for Remove/Reactivate driver confirmations — controlled dialog state, destructive button styling, accessible modals | 2026-02-25 | a996df9 | [35-add-remove-deactivate-driver-functionali](./quick/35-add-remove-deactivate-driver-functionali/) |
| 36 | Mobile responsiveness audit and fix — flex stop badges, 44px touch targets, overflow-x-auto routes table, dark mode tokens in driver portal | 2026-02-27 | fbcafa5 | [36-audit-and-fix-mobile-responsiveness-for-](./quick/36-audit-and-fix-mobile-responsiveness-for-/) |
| 37 | Fix audit issues — sidebar Expense Categories/Templates links, remove Maintenance duplicate, invoice conditional Edit + Mark as Paid button | 2026-02-27 | 02676cd | [37-fix-audit-issues-sidebar-links-for-expen](./quick/37-fix-audit-issues-sidebar-links-for-expen/) |
| 38 | Fix all 35 audit issues — .catch/try-catch DB error handling on 29 pages, requireRole on live-map, null guards on payroll driver names, remove use client from trucks/new and drivers/invite | 2026-02-28 | cc48a9c | [38-fix-all-35-audit-issues-add-catch-error-](./quick/38-fix-all-35-audit-issues-add-catch-error-/) |
| 39 | Fix all driver portal issues — force-dynamic on layout, hooks violation in gps-tracker, try/catch on 3 pages, null guard on truckId, dark mode tokens in document-list-readonly, dead imports removed, error boundary created | 2026-02-28 | 8ace0ae | [39-fix-all-driver-portal-issues-found-in-au](./quick/39-fix-all-driver-portal-issues-found-in-au/) |
| 40 | Add driver load status page to driver portal — My Load page with status timeline, forward-only status advancement, getMyActiveLoad and advanceLoadStatus server actions, nav link | 2026-03-03 | a218e8a | [40-add-driver-load-status-page-to-driver-po](./quick/40-add-driver-load-status-page-to-driver-po/) |
| 41 | Implement global support ticketing system — SupportTicket table, TKT-NNNN auto-numbering, floating modal in root layout, My Tickets pages (owner+driver), admin cross-tenant dashboard | 2026-03-03 | a9cdab7 | [41-implement-a-global-support-ticketing-sys](./quick/41-implement-a-global-support-ticketing-sys/) |
| 42 | Extend create tenant flow with owner invitation — role on DriverInvitation, OwnerInvitationEmail template, sendOwnerInvitation, owner fields on create-tenant form, role-aware accept-invitation (OWNER->dashboard, DRIVER->my-route) | 2026-03-04 | 8e92f1b | [42-extend-create-tenant-flow-with-owner-inv](./quick/42-extend-create-tenant-flow-with-owner-inv/) |
| 43 | Change tenant status to Pending until owner accepts invitation — ownerSetupComplete via OWNER-role user check, three-state badge (Pending/Active/Suspended) in admin tenant list | 2026-03-04 | 7b3a6f1 | [43-change-tenant-status-to-pending-until-ow](./quick/43-change-tenant-status-to-pending-until-ow/) |
| 44 | Add ticket status filtering to sysadmin support dashboard — All/Open/In Progress/Closed tab bar with per-tab counts, RESOLVED+CLOSED combined into Closed bucket | 2026-03-07 | f393887 | [44-add-ticket-status-filtering-to-sysadmin-](./quick/44-add-ticket-status-filtering-to-sysadmin-/) |
| 45 | TKT-0011 Routes UX — condensed title (short ID badge), document upload list fix (useEffect sync), co-driver multi-select with RouteDriver join table | 2026-03-10 | c9f7141 | [45-tkt-0011-routes-ux-condense-route-page-t](./quick/45-tkt-0011-routes-ux-condense-route-page-t/) |
| 46 | TKT-0008 UX Standards — double-click row navigation on 6 list pages, soft-delete with archivedAt on 5 models, audit trail (createdById/updatedById) on 6 detail pages, driver doc upload form collapsed by default | 2026-03-10 | 9508608 | [46-tkt-0008-ux-standards-double-click-to-op](./quick/46-tkt-0008-ux-standards-double-click-to-op/) |
| 47 | TKT-0003 Login updates — NEXT_PUBLIC_APP_URL missing-var warning in server logs, pre-filled read-only email field on accept-invitation page for browser credential saving | 2026-03-10 | 8637cb3 | [47-tkt-0003-login-updates-fix-localhost-in-](./quick/47-tkt-0003-login-updates-fix-localhost-in-/) |
| 48 | TKT-0004 Dashboard updates — removed Total Trucks + Maintenance Alerts KPIs, added Late Loads card with danger variant, 5-card grid, dynamic value text scaling for dollar amounts, Alerts panel subtitle | 2026-03-10 | e543fc9 | [48-tkt-0004-dashboard-updates-remove-total-](./quick/48-tkt-0004-dashboard-updates-remove-total-/) |
| 49 | TKT-0007 Truck document upload — fixed state sync bug (useEffect), upload modal with name/description/link/file/expiry fields, description+externalUrl added to Document schema, list shows description/link/expiry | 2026-03-10 | acb0f10 | [49-tkt-0007-truck-document-upload-not-savin](./quick/49-tkt-0007-truck-document-upload-not-savin/) |
| 50 | TKT-0006 Fix VIN validation error on truck edit page — VIN made read-only on edit form (permanent identifier), generateVIN() fixed to exclude I/O/Q per ISO 3779, updateTruck no longer processes VIN | 2026-03-10 | 44cd0cf | [50-tkt-0006-fix-vin-validation-error-on-tru](./quick/50-tkt-0006-fix-vin-validation-error-on-tru/) |
| 51 | TKT-0009 Fix new driver creation — expand DriverInvitation with middleName, fullName (auto-computed), dateOfBirth, phoneNumber, address, licenseNumber, licenseExpirationDate; live full-name preview in invite form | 2026-03-10 | 111bd70 | [51-tkt-0009-fix-new-driver-creation-email-e](./quick/51-tkt-0009-fix-new-driver-creation-email-e/) |
| 52 | TKT-0005 Fix new truck creation — strip commas in odometer via z.preprocess, return values on error from createTruck/updateTruck, sticky form fields via key remount pattern | 2026-03-10 | 22555b4 | [52-tkt-0005-fix-new-truck-creation-odometer](./quick/52-tkt-0005-fix-new-truck-creation-odometer/) |
| 53 | Playwright audit — 12 passed, 2 skipped for TKT-0003 through TKT-0011; auto-fixed latent odometer hidden input bug (ref→controlled state) found during testing | 2026-03-10 | 25d521d | [53-playwright-audit-to-verify-tkt-0005-and-](./quick/53-playwright-audit-to-verify-tkt-0005-and-/) |
| 54 | Full mobile redesign — driver + owner bottom nav bars, larger text, full-width cards, bigger tap targets on mobile; desktop untouched | 2026-03-13 | a489c92 | [54-full-mobile-redesign-of-the-driver-porta](./quick/54-full-mobile-redesign-of-the-driver-porta/) |
| 55 | TKT-0013 Fix "a.split is not a function" when uploading truck document with expiry date — completeUpload no longer returns Prisma document with Date fields (unused by client, caused RSC serialization failure) | 2026-03-13 | a3df0eb | [55-tkt-0013-fix-a-split-is-not-a-function-e](./quick/55-tkt-0013-fix-a-split-is-not-a-function-e/) |
| 56 | TKT-0014 Fix dashboard truck expiry alerts — href was hardcoded to /trucks (all trucks page); changed to /trucks/${truck.id} so alert navigates to the specific truck | 2026-03-13 | 557d6e5 | [56-tkt-0014-fix-home-page-dashboard-alerts-](./quick/56-tkt-0014-fix-home-page-dashboard-alerts-/) |
| 57 | TKT-0015 Add automated truck status badges — computeTruckStatus() utility (In Use/In Maintenance/Expired Docs/Ready to Use), Status column on trucks list, badge on truck detail page | 2026-03-14 | 00c70c5 | [57-tkt-0015-add-automated-status-to-trucks-](./quick/57-tkt-0015-add-automated-status-to-trucks-/) |
| 61 | TKT-0020 Add driver ticket detail page at /driver/my-tickets/[id] — thread view, reply form, clickable list cards | 2026-03-14 | 4516248 | [61-tkt-0020-add-driver-ticket-detail-page-a](./quick/61-tkt-0020-add-driver-ticket-detail-page-a/) |
| 63 | TKT-0021 Add status filtering tabs to owner support page — All/Open/In Progress/Closed with count badges, client-side filtering | 2026-03-14 | 09122ce | [63-tkt-0021-add-status-filtering-to-owner-s](./quick/63-tkt-0021-add-status-filtering-to-owner-s/) |
| 64 | TKT-0020 Fix driver portal messaging — FleetMessage model + RLS, driver MessagingPanel on /my-route with real persistence, owner RouteMessagesSection on route detail with reply | 2026-03-14 | a21c741 | [64-tkt-0020-fix-driver-portal-messaging-sen](./quick/64-tkt-0020-fix-driver-portal-messaging-sen/) |
| 65 | TKT-0020 follow-up: Fleet message email notifications — owner emailed when driver sends, driver emailed when owner replies; fire-and-forget pattern | 2026-03-14 | c9a7dc6 | [65-tkt-0020-follow-up-send-email-notificati](./quick/65-tkt-0020-follow-up-send-email-notificati/) |
| 66 | TKT-0022 Cross-reference routes and loads — Active Load card on /my-route (load#, addresses, status, link), Active Route card on /my-load (route name, origin/dest, link) | 2026-03-14 | 1c06c97 | [66-tkt-0022-cross-reference-routes-and-load](./quick/66-tkt-0022-cross-reference-routes-and-load/) |
| 67 | Add routeId FK to Load — dispatch modal route picker, driver portal uses explicit routeId (not driverId guess), owner route detail shows linked loads | 2026-03-14 | c165ba5 | [67-add-routeid-fk-to-load-model-nullable-fo](./quick/67-add-routeid-fk-to-load-model-nullable-fo/) |
| 68 | Add Resend Invitation feature for expired owner invitations on tenant detail page | 2026-03-15 | 0f87116 | [68-add-resend-invitation-feature-for-expire](./quick/68-add-resend-invitation-feature-for-expire/) |
| 69 | TKT-0022 Add edit functionality for scheduled services on truck maintenance page | 2026-03-15 | a7e8c30 | [69-tkt-0022-add-edit-functionality-for-sche](./quick/69-tkt-0022-add-edit-functionality-for-sche/) |
| 70 | TKT-0023: Truck Status Logic — fix scheduled service status bug and add status legend to UI | 2026-03-15 | 26e577c | [70-tkt-0023-truck-status-logic-fix-schedule](./quick/70-tkt-0023-truck-status-logic-fix-schedule/) |
| 71 | TKT-0024: Add manual In Maintenance toggle — inMaintenance DB field, MaintenanceToggleButton on truck detail + maintenance pages, manual override priority in computeTruckStatus | 2026-03-15 | 2780dd6 | [71-tkt-0024-add-manual-in-maintenance-toggl](./quick/71-tkt-0024-add-manual-in-maintenance-toggl/) |
| 72 | TKT-0025: Fix Expired Docs status not triggering — parse documentMetadata JSONB registrationExpiry/insuranceExpiry in computeTruckStatus alongside Document model | 2026-03-15 | d612c1d | [72-tkt-0025-fix-expired-docs-status-not-tri](./quick/72-tkt-0025-fix-expired-docs-status-not-tri/) |
| 73 | TKT-0026: Add routes history section to truck detail page — listTruckRoutes action, TruckRoutesHistory component with status badges, dates, and links | 2026-03-15 | 1d07847 | [73-tkt-0026-add-routes-history-section-to-t](./quick/73-tkt-0026-add-routes-history-section-to-t/) |
| 74 | TKT-0025: Fix Drivers Page Route Assignments not working — create DriverRouteJoin migration SQL with enum, indexes, FK constraints, and RLS so production DB has the table | 2026-03-15 | 6436e8e | [74-tkt-0025-drivers-page-route-assignments-](./quick/74-tkt-0025-drivers-page-route-assignments-/) |
| 75 | TKT-0025 follow-up: Fix Driver Route Assignments section — merge Route.driverId (Primary Driver) and DriverRouteJoin (Main Driver/Co-Driver) sources with deduplication and role badges | 2026-03-15 | c2248b5 | [75-tkt-0025-follow-up-fix-driver-route-assi](./quick/75-tkt-0025-follow-up-fix-driver-route-assi/) |
| 76 | TKT-0028: Fix mobile UX — tables and pages are not horizontally scrollable on phone | 2026-03-15 | 5177744 | [76-tkt-0028-fix-mobile-ux-tables-and-pages-](./quick/76-tkt-0028-fix-mobile-ux-tables-and-pages-/) |
| 77 | TKT-0028 follow-up: Mobile-first card layouts replacing tables on small screens for trucks, drivers, loads, routes, invoices, payroll | 2026-03-16 | 5f80830 | [77-tkt-0028-follow-up-mobile-first-card-lay](./quick/77-tkt-0028-follow-up-mobile-first-card-lay/) |
| 78 | TKT-0028 comprehensive mobile fix — all owner-portal pages mobile-friendly at 390px (CRM, compliance, lane analytics, profit predictor, IFTA, settings, truck/driver detail headers) | 2026-03-15 | a930ed4 | [78-tkt-0028-comprehensive-mobile-fix](./quick/78-tkt-0028-comprehensive-mobile-fix/) |
| 79 | TKT-0028 mobile audit and fix ALL sidebar pages — detail page action headers flex-col on mobile, responsive h1 on all form pages, support tab bar overflow fix (17 files) | 2026-03-16 | 56d44ed | [79-tkt-0028-mobile-audit-and-fix-all-sideba](./quick/79-tkt-0028-mobile-audit-and-fix-all-sideba/) |
| 80 | TKT-0018 fix: skip admin reply emails to non-deliverable domains (drivecommand.com, example.com, test.com) — guard in sendAdminReplyNotification, diagnostic warn in addAdminReply | 2026-03-16 | 186727d | [80-tkt-0018-fix-support-ticket-reply-emails](./quick/80-tkt-0018-fix-support-ticket-reply-emails/) |
| 81 | Fix mobile layout on loads and routes list pages to match the card-based pattern used on other fixed pages | 2026-03-18 | 1a029ed | [81-fix-mobile-layout-on-loads-and-routes-li](./quick/81-fix-mobile-layout-on-loads-and-routes-li/) |
| 82 | TKT-0032: Fix invoice line items — unit price not populating correctly, improve description field with predefined dropdown + ability to add custom items | 2026-03-19 | 4b6bda5 | [82-tkt-0032-fix-invoice-line-items-unit-pri](./quick/82-tkt-0032-fix-invoice-line-items-unit-pri/) |
| 83 | TKT-0034: Make updateLoadStatus idempotent — return success silently when load is already at target status, eliminating "Cannot transition from X to X" race condition errors | 2026-03-20 | c90e044 | [83-tkt-0034-fix-redundant-status-transition](./quick/83-tkt-0034-fix-redundant-status-transition/) |
| 84 | TKT-0035: Fix CRM Performance section not updating — increment totalLoads/totalRevenue/lastLoadDate on Customer when load transitions to INVOICED | 2026-03-20 | caf2da3 | [84-tkt-0035-fix-crm-performance-section-not](./quick/84-tkt-0035-fix-crm-performance-section-not/) |
| 85 | TKT-0035 follow-up: Compute CRM Performance stats live from INVOICED loads via prisma.load.aggregate — fixes historical loads and eliminates stored-field drift | 2026-03-20 | e13b9c4 | [85-tkt-0035-follow-up-fix-crm-performance-s](./quick/85-tkt-0035-follow-up-fix-crm-performance-s/) |
| 86 | Display tenant business name in owner portal sidebar — fetch Tenant.name in OwnerLayout, thread through OwnerShell → AppSidebar, fallback to "DriveCommand" | 2026-03-20 | 7d03cde | [86-display-tenant-business-name-in-sidebar](./quick/86-PLAN.md) |
| 87 | Implement DriveCommand logo system — DC Chevron SVG icon + Forward D wordmark across app-logo component, all layout headers (admin/driver/owner), login/landing page, favicon, metadata, Poppins font | 2026-03-21 | a3f73ec | [87-implement-drivecommand-logo-system-dc-ch](./quick/87-implement-drivecommand-logo-system-dc-ch/) |
| 88 | Update browser tab favicon to the new DriveCommand logo | 2026-03-22 | 96ea4eb | [88-update-browser-tab-favicon-to-the-new-dr](./quick/88-update-browser-tab-favicon-to-the-new-dr/) |
| 89 | Support ticket: add file attachment and mobile/desktop platform field | 2026-03-22 | bded3aa | [89-support-ticket-add-file-attachment-and-m](./quick/89-support-ticket-add-file-attachment-and-m/) |
| 90 | Owner Portal RBAC — permissions system for OwnerUser/MANAGER role with settings UI, route guards, and sidebar filtering | 2026-03-22 | 46cf9ad | [90-owner-portal-rbac-permissions-system-for](./quick/90-owner-portal-rbac-permissions-system-for/) |
| 91 | TKT-0041: Left Navigation auto collapse on selection — auto-close mobile sidebar on nav link click | 2026-03-22 | 5f20e46 | [91-tkt-0041-left-navigation-auto-collapse-o](./quick/91-tkt-0041-left-navigation-auto-collapse-o/) |
| 92 | TKT-0042: Fix driver document upload on mobile iOS Safari (MIME type + HEIC validation) | 2026-03-22 | — | [92-tkt-0042-fix-driver-document-upload-on-m](./quick/92-tkt-0042-fix-driver-document-upload-on-m/) |
| 93 | TKT-0042: Fix multipart upload content type resolution and S3 error reporting | 2026-03-22 | — | [93-tkt-0042-fix-multipart-upload-content-ty](./quick/93-tkt-0042-fix-multipart-upload-content-ty/) |
| 94 | TKT-0042: Eliminate browser→R2 CORS by uploading driver documents server-side | 2026-03-22 | — | [94-tkt-0042-eliminate-browser-r2-cors-by-up](./quick/94-tkt-0042-eliminate-browser-r2-cors-by-up/) |
| 95 | TKT-0043: Fix document download — force inline view, rename Download → View | 2026-03-22 | — | [95-tkt-0043-fix-document-download-force-inl](./quick/95-tkt-0043-fix-document-download-force-inl/) |
| 96 | TKT-0043: Fix iOS Safari View button + redesign mobile document card | 2026-03-22 | — | [96-tkt-0043-fix-ios-safari-view-button-and-](./quick/96-tkt-0043-fix-ios-safari-view-button-and-/) |
| 97 | TKT-0044: Add rate confirmation upload to /loads/[id] page | 2026-03-22 | — | [97-tkt-0044-add-rate-confirmation-upload-to](./quick/97-tkt-0044-add-rate-confirmation-upload-to/) |
| 98 | TKT-0044: Screenshot auto-capture on support ticket creation | 2026-03-22 | 4581048 | [98-tkt-0044-screenshot-auto-capture-on-supp](./quick/98-tkt-0044-screenshot-auto-capture-on-supp/) |
| 99 | TKT-0045: AI auto-resolution field on support tickets (diagnosis + draft reply via Claude Haiku) | 2026-03-22 | 8e7c4d6 | [99-tkt-0045-ai-auto-resolution-field-on-sup](./quick/99-tkt-0045-ai-auto-resolution-field-on-sup/) |
| 100 | Remove AI suggestion feature from admin support tickets | 2026-03-22 | f7b1be4 | [100-remove-the-ai-suggestion-feature-entirel](./quick/100-remove-the-ai-suggestion-feature-entirel/) |
| 101 | Add driver ↔ dispatcher messaging to the mobile app | 2026-03-24 | 37fa5b9 | [101-add-driver-dispatcher-messaging-to-the-m](./quick/101-add-driver-dispatcher-messaging-to-the-m/) |
| 102 | Move fleet messaging from Routes to Loads | 2026-03-24 | 871462b | [102-move-fleet-messaging-from-routes-to-load](./quick/102-move-fleet-messaging-from-routes-to-load/) |
| 103 | Add truck selection to individual loads on mobile | 2026-03-25 | 3bfa105 | [103-add-truck-selection-to-individual-loads-](./quick/103-add-truck-selection-to-individual-loads-/) |
| 104 | Edit truck on load + fleet map live driver positions | 2026-03-25 | beaf249 | [104-edit-truck-on-load-fleet-map-live-driver](./quick/104-edit-truck-on-load-fleet-map-live-driver/) |
| 105 | Revert status + rate confirmation PDF on mobile driver load detail | 2026-03-25 | a64b8d3 | [105-revert-status-rate-confirmation-pdf-on-m](./quick/105-revert-status-rate-confirmation-pdf-on-m/) |
| 107 | Fix GPS report endpoint to accept mobile Bearer token auth | 2026-03-25 | 699dc96 | [107-fix-gps-report-endpoint-to-accept-mobile](./quick/107-fix-gps-report-endpoint-to-accept-mobile/) |
| 108 | Build More hub tab for mobile owner portal with sub-screens and settings | 2026-03-25 | af50acc | [108-build-more-hub-tab-for-mobile-owner-port](./quick/108-build-more-hub-tab-for-mobile-owner-port/) |
| 110 | Remove route requirement for fleet messaging in web and mobile | 2026-03-26 | 020b306 | [110-remove-route-requirement-for-fleet-messa](./quick/110-remove-route-requirement-for-fleet-messa/) |
| 111 | Fix production dark overlay blocking UI on drive-command.vercel.app | 2026-03-26 | 7118f9b | [111-fix-production-dark-overlay-blocking-ui-](./quick/111-fix-production-dark-overlay-blocking-ui-/) |
| 112 | Redesign mobile Fleet Messages screen to iMessage/WhatsApp style chat UI | 2026-03-26 | 7e98c3a | [112-redesign-mobile-fleet-messages-screen-to](./quick/112-redesign-mobile-fleet-messages-screen-to/) |
| 113 | Production readiness hardening (debug route deletion, rate limiting, Sentry, EAS OTA) | 2026-03-26 | 5f6cf1c | [113-production-readiness-hardening](./quick/113-production-readiness-hardening/) |
| 114 | Add rate limiting to all /api/mobile/* routes and fix @ts-ignore in the send-reminders cron endpoint | 2026-03-27 | 21a84e9 | [114-add-rate-limiting-to-all-api-mobile-rout](./quick/114-add-rate-limiting-to-all-api-mobile-rout/) |
| 115 | Enable RLS on _prisma_migrations and Tenant tables to fix Supabase security advisor warnings | 2026-03-28 | ff323b6 | [115-enable-rls-on-prisma-migrations-and-tena](./quick/115-enable-rls-on-prisma-migrations-and-tena/) |
| 116 | Fix Unknown Driver name in mobile messages list | 2026-03-28 | 534adb5 | [116-fix-unknown-driver-name-in-mobile-messag](./quick/116-fix-unknown-driver-name-in-mobile-messag/) |
| 117 | Fix owner mobile Messages tab to show load and route scoped messages with working thread view | 2026-03-28 | f13449c | [117-fix-owner-mobile-messages-tab-to-show-lo](./quick/117-fix-owner-mobile-messages-tab-to-show-lo/) |
| 118 | Add routeId FK to Load model so loads can be linked to routes. Migration, API update (route endpoint fetches linked loads), owner load creation/edit UI to assign a load to a route, and the My Route detail screen then shows real loads in the timeline. | 2026-03-29 | 5001517 | [118-add-routeid-fk-to-load-model-so-loads-ca](./quick/118-add-routeid-fk-to-load-model-so-loads-ca/) |
| 119 | Add My Route card to driver home screen — emerald card above Active Load, shows route name/origin/destination/status badge, navigates to my-route screen, hidden when no route assigned | 2026-03-29 | 95d091f | [119-add-my-route-card-to-driver-home-screen-](./quick/119-add-my-route-card-to-driver-home-screen-/) |
| 120 | Date conflict validation: block driver double-booking on same scheduledDate in route create/edit; amber warning in load form when load dates don't align with assigned route's scheduledDate | 2026-03-29 | 3249478 | [120-date-conflict-validation-1-when-creating](./quick/120-date-conflict-validation-1-when-creating/) |
| 121 | Support ticket page label mapping and screenshot attachment to SupportTicketFAB | 2026-03-29 | d6cde24 | [121-support-ticket-improvements-1-convert-ra](./quick/121-support-ticket-improvements-1-convert-ra/) |
| 122 | Rework SupportTicketFAB screenshot UX to pre-capture flow | 2026-03-29 | 38b0f64 | [122-rework-supportticketfab-screenshot-ux-re](./quick/122-rework-supportticketfab-screenshot-ux-re/) |
| 123 | Mobile owner dashboard visual refresh — make the UI feel native mobile instead of web-browsery | 2026-03-29 | c212088 | [123-mobile-owner-dashboard-visual-refresh-ma](./quick/123-mobile-owner-dashboard-visual-refresh-ma/) |
| 124 | Move Support button into dashboard Quick Create speed dial | 2026-03-29 | 95eeaae | [124-move-support-button-into-dashboard-quick](./quick/124-move-support-button-into-dashboard-quick/) |
| 125 | Add Get Support to every owner page FAB as a speed dial | 2026-03-29 | 510126d | [125-add-get-support-to-every-owner-page-fab-](./quick/125-add-get-support-to-every-owner-page-fab-/) |
| 128 | Update docs folder fix stale content README email row database missing models | 2026-03-30 | a3a9b36 | [128-update-docs-folder-fix-stale-content-rea](./quick/128-update-docs-folder-fix-stale-content-rea/) |
| 129 | Update technical documentation to reflect current state | 2026-03-30 | d5c4306 | [129-update-technical-documentation-to-reflec](./quick/129-update-technical-documentation-to-reflec/) |
| 130 | Make DriveCommand mobile app look more like a native mobile app with better mobile UX patterns | 2026-03-30 | 8d52523 | [130-make-drivecommand-mobile-app-look-more-l](./quick/130-make-drivecommand-mobile-app-look-more-l/) |
| 131 | Rebuild driver and owner dashboards with proper native mobile layout structure | 2026-03-30 | 62d2280 | [131-rebuild-driver-and-owner-dashboards-with](./quick/131-rebuild-driver-and-owner-dashboards-with/) |
| 133 | Fix security audit findings: open redirect, auth on geocoding, rate limiting, error message sanitization, security headers, MMKV audit, middleware docs | 2026-03-31 | 173a54b | [133-fix-security-audit-findings-open-redirec](./quick/133-fix-security-audit-findings-open-redirec/) |
| 134 | Fix performance and scalability audit findings: pagination, parallel queries, composite indexes, Suspense boundaries, FlashList, expo-image, loading skeletons | 2026-03-31 | 9513973 | [134-fix-performance-and-scalability-audit-fi](./quick/134-fix-performance-and-scalability-audit-fi/) |
| 135 | Fix code quality audit findings: ActionState type, dead code removal, withMobileAuth wrapper, typed SQL, ESLint/Prettier, landing page split, not-found page | 2026-03-31 | cb0c893 | [135-fix-code-quality-audit-findings-actionst](./quick/135-fix-code-quality-audit-findings-actionst/) |
| 136 | Add 3 missing composite indexes to Prisma schema and generate migration: User(tenantId, role, isActive), Route(tenantId, driverId, scheduledDate), DriverInvitation(tenantId, status) | 2026-03-31 | f6aaf1a | [136-add-3-missing-composite-indexes-to-prism](./quick/136-add-3-missing-composite-indexes-to-prism/) |
| 137 | Three deployment hardening fixes: /api/health endpoint, Redis unavailability production warning, apps/mobile/.env.example template | 2026-03-31 | 6e8eedf | [137-three-deployment-hardening-fixes-1-add-u](./quick/137-three-deployment-hardening-fixes-1-add-u/) |
| 138 | Fill documentation gaps: mobile API reference (52 endpoints), domain glossary (30+ terms), local dev guide, 3 ADRs, web + mobile troubleshooting guides, CONTRIBUTING.md | 2026-03-31 | 995a865 | [138-fill-documentation-gaps-mobile-api-docs-](./quick/138-fill-documentation-gaps-mobile-api-docs-/) |
| 139 | Fix mobile auth refresh token error and SupportTicketProvider context crash | 2026-03-31 | 0c591e9 | [139-fix-mobile-auth-refresh-token-error-and-](./quick/139-fix-mobile-auth-refresh-token-error-and-/) |
| 140 | Mobile owner portal: add edit actions to Load, Driver, and Truck detail screens | 2026-03-31 | 39cdf75 | [140-mobile-owner-portal-add-edit-actions-to-](./quick/140-mobile-owner-portal-add-edit-actions-to-/) |
| 141 | Mobile owner portal: add Routes section with list, detail, edit, and navigation | 2026-03-31 | ef9b18b | [141-mobile-owner-portal-add-routes-section-w](./quick/141-mobile-owner-portal-add-routes-section-w/) |
| 142 | Mobile owner portal: add Profit Predictor and Fuel log screens | 2026-03-31 | 8340114 | [142-mobile-owner-portal-add-profit-predictor](./quick/142-mobile-owner-portal-add-profit-predictor/) |
| 143 | Mobile owner portal: complete CRM contact detail/edit and Payroll detail/create | 2026-03-31 | fa328ed | [143-mobile-owner-portal-complete-crm-contact](./quick/143-mobile-owner-portal-complete-crm-contact/) |
| 144 | Mobile owner portal: add truck maintenance logging and safety alerts screen | 2026-03-31 | d82bdff | [144-mobile-owner-portal-add-truck-maintenanc](./quick/144-mobile-owner-portal-add-truck-maintenanc/) |
| 145 | Move sign-out button from bottom-left sidebar to top-right header across all web portals | 2026-04-01 | 9212d31 | [145-move-sign-out-button-from-bottom-left-si](./quick/145-move-sign-out-button-from-bottom-left-si/) |
| 146 | Audit and update all technical documentation to reflect Phase 37.6 state | 2026-04-03 | 04b7b6d | [146-audit-and-upgrade-all-address-input-fiel](./quick/146-audit-and-upgrade-all-address-input-fiel/) |
| 147 | Geocoding autocomplete + OSRM real road distances | 2026-04-03 | 760b6ed | [147-audit-and-upgrade-all-address-input-fiel](./quick/147-audit-and-upgrade-all-address-input-fiel/) |
| 148 | Add a global appearance setting that allows users to seamlessly switch between Light Mode and Dark Mode | 2026-04-03 | b7c3e8b | [148-add-a-global-appearance-setting-that-all](./quick/148-add-a-global-appearance-setting-that-all/) |
| 149 | Migrate all mobile screens to use useThemeColors() for full Light/Dark mode support | 2026-04-03 | aa86e4e | [149-migrate-all-mobile-screens-to-use-usethe](./quick/149-migrate-all-mobile-screens-to-use-usethe/) |
| 150 | Add Start Navigation button to driver my-route screen | 2026-04-04 | f30a85a | [150-add-start-navigation-button-to-driver-my](./quick/150-add-start-navigation-button-to-driver-my/) |
| 152 | Carrier Ops — Migrations 001–004 (clients, contracts, facilities, carrier_drivers, carrier_trucks) | 2026-04-05 | bf5e763 | [152-carrier-ops-migrations-001-004](./quick/152-carrier-ops-migrations-001-004/) |
| 153 | Carrier Ops — Migrations 005–006 (route_templates, route_template_stops) | 2026-04-05 | 2619106 | [153-carrier-ops-migrations-005-006](./quick/153-carrier-ops-migrations-005-006/) |
| 154 | Carrier Ops — Migrations 007–009 (dispatches, loads, stops) | 2026-04-05 | 4a42981 | [154-carrier-ops-migrations-007-009](./quick/154-carrier-ops-migrations-007-009/) |
| 155 | Carrier Ops — Migrations 010–012 (carrier_documents, carrier_expenses, driver_pay_records) | 2026-04-05 | 0f0870b | [155-carrier-ops-migrations-010-012](./quick/155-carrier-ops-migrations-010-012/) |
| 156 | Carrier Ops — Migration 013 (RLS policies — 13 tables, 59 policies) | 2026-04-05 | 52a5d8e | [156-carrier-ops-migration-013-rls](./quick/156-carrier-ops-migration-013-rls/) |
| 157 | Carrier Ops — Migration 014 + Prisma schema (carrier_catalog_meta + 14 models, 93 seed rows) | 2026-04-05 | 0863dc4 | [157-carrier-ops-migration-014-prisma-schema](./quick/157-carrier-ops-migration-014-prisma-schema/) |
| 158 | Carrier Ops — API routes for clients and contracts | 2026-04-05 | 7fcf704 | [158-carrier-ops-api-routes-for-clients-and-c](./quick/158-carrier-ops-api-routes-for-clients-and-c/) |
| 159 | Carrier Ops — API routes for facilities and route templates | 2026-04-05 | 0d02de2 | [159-carrier-ops-api-routes-for-facilities-an](./quick/159-carrier-ops-api-routes-for-facilities-an/) |
| 160 | Carrier Ops — API routes for dispatches and loads | 2026-04-05 | 327c373 | [160-carrier-ops-api-routes-for-dispatches-an](./quick/160-carrier-ops-api-routes-for-dispatches-an/) |
| 161 | Carrier Ops — API routes for stops including the Stop Completion Microflow | 2026-04-05 | 5196430 | [161-carrier-ops-api-routes-for-stops-includi](./quick/161-carrier-ops-api-routes-for-stops-includi/) |
| 162 | Carrier Ops — documents, expenses, pay-records API routes + nightly cron | 2026-04-05 | — | [162-carrier-ops-documents-expenses-pay-recor](./quick/162-carrier-ops-documents-expenses-pay-recor/) |
| 163 | Carrier Ops — 4 report API endpoints (revenue, driver-pay, aging, performance) | 2026-04-05 | 3f990c9 | [163-carrier-ops-reports-api-endpoints](./quick/163-carrier-ops-reports-api-endpoints/) |
| 165 | Carrier Ops — Clients and Contracts pages | 2026-04-05 | 5a94658 | [165-carrier-ops-clients-and-contracts-pages](./quick/165-carrier-ops-clients-and-contracts-pages/) |
| 166 | Carrier Ops — Stop Builder drag-and-drop component | 2026-04-05 | 57ae2a5 | [166-carrier-ops-stop-builder-drag-and-drop-c](./quick/166-carrier-ops-stop-builder-drag-and-drop-c/) |
| 167 | Carrier Ops — Route Templates create/edit pages | 2026-04-05 | 8da9d19 | [167-carrier-ops-route-templates-create-edit-](./quick/167-carrier-ops-route-templates-create-edit-/) |
| 168 | Carrier Ops — Dispatches list page | 2026-04-05 | 747d404 | [168-carrier-ops-dispatches-list-page](./quick/168-carrier-ops-dispatches-list-page/) |
| 169 | Carrier Ops — Loads list, create, and detail pages | 2026-04-05 | 4718cba | [169-carrier-ops-loads-list-create-and-detail](./quick/169-carrier-ops-loads-list-create-and-detail/) |
| 170 | Carrier Ops — Dispatch detail page with stop timeline | 2026-04-05 | fc6c3ef | [170-carrier-ops-dispatch-detail-page-with-st](./quick/170-carrier-ops-dispatch-detail-page-with-st/) |
| 171 | Carrier Ops — Document upload modal and expense log components | 2026-04-05 | 0186336 | [171-carrier-ops-document-upload-modal-and-ex](./quick/171-carrier-ops-document-upload-modal-and-ex/) |
| 180 | Carrier Ops end-to-end integration test: contracted recurring route journey | 2026-04-05 | 9bdd5a6 | [180-carrier-ops-end-to-end-integration-test-](./quick/180-carrier-ops-end-to-end-integration-test-/) |
| 181 | Carrier Ops — Multi-tenancy and financial integrity audit | 2026-04-05 | 4de9f89 | [181-carrier-ops-multi-tenancy-and-financial-](./quick/181-carrier-ops-multi-tenancy-and-financial-/) |
| 182 | Carrier Ops — Update technical documentation | 2026-04-05 | e123c39 | [182-carrier-ops-update-technical-documentati](./quick/182-carrier-ops-update-technical-documentati/) |
| 183 | Create QA seed script for carrier operations test accounts | 2026-04-05 | 797e683 | [183-create-qa-seed-script-for-carrier-operat](./quick/183-create-qa-seed-script-for-carrier-operat/) |
| 184 | Fix carrier facilities form: type dropdown, boolean toggles, dynamic contacts JSONB | 2026-04-06 | 623e7f0 | [184-fix-carrier-facilities-form-type-dropdow](./quick/184-fix-carrier-facilities-form-type-dropdow/) |
| 185 | fix facility search modal bugs in route template stop builder | 2026-04-06 | c0c9aed | [185-fix-facility-search-modal-bugs-in-route-](./quick/185-fix-facility-search-modal-bugs-in-route-/) |
| 186 | Fix all carrier ops bugs found during QA testing | 2026-04-06 | b5d9118 | [186-fix-all-carrier-ops-bugs-found-during-qa](./quick/186-fix-all-carrier-ops-bugs-found-during-qa/) |
| 187 | Fix carrier contract form: query DB for exact CHECK constraint values, update dropdowns to match, add missing fields (contract_name, detention_free_minutes, detention_rate_per_hour, tonu_rate, layover_rate_per_day, payment_terms_override, auto_renew) | 2026-04-06 | 7b3e58c | [187-fix-carrier-contract-form-query-db-for-e](./quick/187-fix-carrier-contract-form-query-db-for-e/) |
| 188 | Fix route template form dropdowns to match DB check constraints for schedule_type and equipment_type | 2026-04-07 | 56f4781 | [188-fix-route-template-form-dropdowns-to-mat](./quick/188-fix-route-template-form-dropdowns-to-mat/) |
| 189 | Fix Regenerate button on route template detail page — no loading state, no dispatches generated, no error shown | 2026-04-07 | 85fe9f9 | [189-fix-regenerate-button-on-route-template-](./quick/189-fix-regenerate-button-on-route-template-/) |
| 190 | Fix route_templates FK constraints: default_truck_id and default_driver_id point to wrong tables, need to reference carrier_trucks and carrier_drivers | 2026-04-07 | 37b674d | [190-fix-route-templates-fk-constraints-defau](./quick/190-fix-route-templates-fk-constraints-defau/) |
| 191 | Fix dispatch numbers not generating or displaying — dispatch list and detail show — instead of DC-YYYY-NNNNN | 2026-04-07 | 15731cf | [191-fix-dispatch-numbers-not-generating-or-d](./quick/191-fix-dispatch-numbers-not-generating-or-d/) |
| 192 | Backfill dispatch numbers for existing dispatches — rewrite old format notes to new [DISPATCH_NUMBER=DC-...] format | 2026-04-07 | — | [192-backfill-dispatch-numbers-for-existing-d](./quick/192-backfill-dispatch-numbers-for-existing-d/) |
| 193 | Fix Edit button on dispatch detail page — does nothing when clicked, need edit form for scheduled_departure, planned_miles, notes, odometer fields | 2026-04-07 | eaf97b1 | [193-fix-edit-button-on-dispatch-detail-page-](./quick/193-fix-edit-button-on-dispatch-detail-page-/) |
| 194 | Fix document upload on dispatch detail page — Storage upload failed error | 2026-04-07 | 2095dd3 | [194-fix-document-upload-on-dispatch-detail-p](./quick/194-fix-document-upload-on-dispatch-detail-p/) |
| 195 | Fix dispatch stop timeline — add Arrived button (Bug 35) and Skip Stop button (Bug 34) | 2026-04-07 | 283d5bf | [195-fix-dispatch-stop-timeline-add-arrived-b](./quick/195-fix-dispatch-stop-timeline-add-arrived-b/) |
| 196 | Fix BOL/POD upload — router.refresh() after upload, relax stop-completion OR→AND logic | 2026-04-07 | 7c7a801 | [196-fix-bol-pod-upload-to-set-stop-bol-uploa](./quick/196-fix-bol-pod-upload-to-set-stop-bol-uploa/) |
| 197 | Fix contract dropdown name display (Bug 24) and dispatch preview truncated UUIDs (Bug 29) | 2026-04-07 | 4382d4a | [197-fix-contract-dropdown-shows-contract-num](./quick/197-fix-contract-dropdown-shows-contract-num/) |
| 198 | Fix Bugs 25,32,38,39,40,41,42,43 — recurrence UI, template status toggle, FAB position, load redirect, loads list display fixes, per-mile/per-stop form fields | 2026-04-07 | dc55c51 | [198-fix-bugs-25-32-38-39-40-41-42-43-recurre](./quick/198-fix-bugs-25-32-38-39-40-41-42-43-recurre/) |
| 199 | Fix reimbursements not flowing into driver pay records | 2026-04-07 | 7337e33 | [199-fix-reimbursements-not-flowing-into-driv](./quick/199-fix-reimbursements-not-flowing-into-driv/) |
| 200 | Add tenant UUID display with copy-to-clipboard to sysadmin tenant detail page | 2026-04-10 | a03dbc6 | [200-add-tenant-uuid-display-with-copy-to-cli](./quick/200-add-tenant-uuid-display-with-copy-to-cli/) |
| 201 | Add Mark as Paid action to driver pay records | 2026-04-10 | c62a386 | [201-add-mark-as-paid-action-to-driver-pay-re](./quick/201-add-mark-as-paid-action-to-driver-pay-re/) |
| 203 | Add tap-to-open navigation button to web driver portal stop detail | 2026-04-13 | a00e35e | [203-add-tap-to-open-navigation-button-to-web](./quick/203-add-tap-to-open-navigation-button-to-web/) |
| 204 | Add AddressAutocomplete to carrier facilities and client forms | 2026-04-14 | 4241e51 | [204-add-addressautocomplete-to-carrier-facil](./quick/204-add-addressautocomplete-to-carrier-facil/) |
| 205 | Fix account deactivation so it actually blocks login | 2026-04-14 | 1d5af5a | [205-fix-account-deactivation-so-it-actually-](./quick/205-fix-account-deactivation-so-it-actually-/) |
| 206 | Multi-tenant data isolation security breach — audit and fix all tenantId filter gaps | 2026-04-14 | d3d8af4 | [206-multi-tenant-data-isolation-security-bre](./quick/206-multi-tenant-data-isolation-security-bre/) |
| 207 | P0 CRITICAL: rewrite withTenantRLS to inject tenantId at application layer — postgres BYPASSRLS defeated all PostgreSQL RLS policies | 2026-04-14 | 528da2d | [207-fix-critical-multi-tenant-breach-rewrite](./quick/207-fix-critical-multi-tenant-breach-rewrite/) |
| 208 | Full multi-tenant security audit — clean bill of health across 150+ files (17 carrier libs, 40 carrier routes, 54 mobile routes, 5 cron, 68 bypass_rls usages) | 2026-04-14 | 91adc36 | [208-full-multi-tenant-security-audit-find-ev](./quick/208-full-multi-tenant-security-audit-find-ev/) |
| 209 | Security audit: SQL injection (clean), file upload MIME validation (2 fixes), RBAC gap on rate-confirmation PDF (1 fix) | 2026-04-14 | 9ca3853 | [209-security-audit-and-fix-1-raw-sql-injecti](./quick/209-security-audit-and-fix-1-raw-sql-injecti/) |
| 210 | Security audit batch 2: rate limiting added to 11 routes (public track + uploads), error.message leakage fixed in 8 routes; tokens/NEXT_PUBLIC_ vars/sensitive responses all clean | 2026-04-14 | 444f0e3 | [210-security-audit-and-fix-batch-2-rate-limi](./quick/210-security-audit-and-fix-batch-2-rate-limi/) |
| 211 | Fix null string fields and tenant isolation on truck creation — formString() helpers + null-tolerant Zod schema; tenant isolation confirmed via requireTenantId() + security comment | 2026-04-14 | 9d6e2f2 | [211-fix-null-string-fields-and-tenant-isolat](./quick/211-fix-null-string-fields-and-tenant-isolat/) |
| 212 | Fix 500 on contract creation — status field missing from Zod schema (Prisma NOT NULL constraint); add client_id ownership check for cross-tenant isolation | 2026-04-14 | 4d13ac7 | [212-fix-internal-server-error-on-contract-cr](./quick/212-fix-internal-server-error-on-contract-cr/) |
| 213 | Carrier Operations audit: 21 findings across 4 audits (CHECK constraints, Zod vs NOT NULL, null string inits, tenant isolation) — report only, no fixes | 2026-04-14 | 5c08a4d | [213-carrier-operations-server-actions-audit-](./quick/213-carrier-operations-server-actions-audit-/) |
| 214 | Fix 4 Critical audit-213 findings: payModel enum mismatch (drivers), clientId+contractId ownership (createLoad), driver+truck ownership (createDispatch), parentId ownership check for all 5 parent types (uploadDocument) | 2026-04-15 | 14b0049 | [214-fix-4-critical-findings-from-carrier-ope](./quick/214-fix-4-critical-findings-from-carrier-ope/) |
| 215 | Fix 6 High audit-213 findings: per_load rateType enum, facility soft-delete guard, FK ownership checks on createExpense/createRouteTemplate/saveRouteTemplate/createStop (loadId+clientId), batch facilityId ownership in saveRouteTemplate stops | 2026-04-15 | 99c0398 | [215-fix-6-high-findings-from-carrier-operati](./quick/215-fix-6-high-findings-from-carrier-operati/) |
| 216 | Fix all 5 Medium findings from Carrier Operations audit 213: stopType enum, documents FormData safe extraction + parentType enum, scheduleType/equipmentType enums in route-templates, homeTerminalId/userId FK ownership in fleet-drivers | 2026-04-15 | b197d3d | [216-fix-all-5-medium-findings-from-carrier-o](./quick/216-fix-all-5-medium-findings-from-carrier-o/) |
| 217 | Fix duplicate contract/dispatch/load number generators — replace COUNT-based with MAX-based sequence query (findFirst orderBy desc) in contracts.ts, dispatches.ts, loads.ts; preserve P2002 retry loop in contracts | 2026-04-15 | 624d6b2 | [217-fix-duplicate-contract-number-unique-con](./quick/217-fix-duplicate-contract-number-unique-con/) |
| 218 | Upgrade Live Fleet Map — fully functional implementation, all 7 features connected to real data | 2026-04-15 | fb849bd | [218-upgrade-live-fleet-map-fully-functional-](./quick/218-upgrade-live-fleet-map-fully-functional-/) |
| 219 | Add active dispatch and load context to Live Fleet Map sidebar rows | 2026-04-15 | f902e26 | [219-add-active-dispatch-and-load-context-to-](./quick/219-add-active-dispatch-and-load-context-to-/) |
| 220 | Fix "Truck not found" 500 error on live map marker click | 2026-04-15 | 1a1bd39 | [220-fix-truck-not-found-500-error-on-live-ma](./quick/220-fix-truck-not-found-500-error-on-live-ma/) |
| 221 | Fix blinking marker tooltip on Live Fleet Map | 2026-04-15 | 881de28 | [221-fix-blinking-marker-tooltip-on-live-flee](./quick/221-fix-blinking-marker-tooltip-on-live-flee/) |
| 222 | Fix carrier driver creation to send invitation email on account creation | 2026-04-16 | a9ec1e5 | [222-fix-carrier-driver-creation-to-send-invi](./quick/222-fix-carrier-driver-creation-to-send-invi/) |
| 223 | Add hard delete and resend invitation to carrier driver management | 2026-04-16 | 8278b41 | [223-add-hard-delete-and-resend-invitation-to](./quick/223-add-hard-delete-and-resend-invitation-to/) |
| 224 | Add email notifications for all Carrier Ops events | 2026-04-16 | 24bc849 | [224-add-email-notifications-for-all-carrier-](./quick/224-add-email-notifications-for-all-carrier-/) |
| 225 | Fix carrier driver creation to write user_id back to carrier_drivers record | 2026-04-16 | 5c40d3b | [225-fix-carrier-driver-creation-to-write-use](./quick/225-fix-carrier-driver-creation-to-write-use/) |
| 226 | Replace fire-and-forget notification calls with after() across Carrier Ops triggers | 2026-04-16 | d95496e | [226-replace-fire-and-forget-notification-cal](./quick/226-replace-fire-and-forget-notification-cal/) |
| 230 | Reconnect web driver portal to Carrier Ops data | 2026-04-17 | 60e2d7f | [230-reconnect-web-driver-portal-to-carrier-o](./quick/230-reconnect-web-driver-portal-to-carrier-o/) |
| 233 | Fix React hydration error #418 on driver dashboard — greeting useEffect pattern | 2026-04-17 | 93e0264 | [233-fix-react-hydration-error-418-on-driver-](./quick/233-fix-react-hydration-error-418-on-driver-/) |
| 234 | Fix all remaining React hydration mismatches on driver portal dashboard | 2026-04-17 | ba4f573 | [234-fix-all-remaining-react-hydration-mismat](./quick/234-fix-all-remaining-react-hydration-mismat/) |
| 235 | Fix driver portal default landing tab and notification dropdown mobile positioning | 2026-04-17 | 0ee5488 | [235-fix-driver-portal-default-landing-tab-an](./quick/235-fix-driver-portal-default-landing-tab-an/) |
| 236 | Fix rate_type enum mismatch between contracts and loads blocking Load form submission | 2026-04-17 | 4126b16 | [236-fix-rate-type-enum-mismatch-between-cont](./quick/236-fix-rate-type-enum-mismatch-between-cont/) |
| 237 | Fix driver portal stop flow — correct button labels, navigation triggers, dispatch query, BOL bypass | 2026-04-17 | 577595f | [237-fix-driver-portal-stop-flow-correct-butt](./quick/237-fix-driver-portal-stop-flow-correct-butt/) |
| 238 | Add client portal notifications for Carrier Ops events — pickup, delivery, invoice | 2026-04-17 | c1676ca | [238-add-client-portal-notifications-for-carr](./quick/238-add-client-portal-notifications-for-carr/) |
| 239 | Fix driver portal stop state machine — Begin Navigation, Mark Arrived, Complete Stop flow | 2026-04-17 | 304d43b | [239-fix-driver-portal-stop-state-machine-beg](./quick/239-fix-driver-portal-stop-state-machine-beg/) |
| 240 | Add in-app notification to driver when owner starts trip | 2026-04-17 | 117ec81 | [240-add-in-app-notification-to-driver-when-o](./quick/240-add-in-app-notification-to-driver-when-o/) |
| 241 | Fix 5 driver portal issues — load status sync, auto-navigation on stop completion, wrong dispatch query, timestamps, and Route tab cleanup | 2026-04-17 | decc4d3 | [241-fix-5-driver-portal-issues-load-status-s](./quick/241-fix-5-driver-portal-issues-load-status-s/) |
| 242 | Fix driver portal GPS ping to write to GPSLocation using carrier_trucks instead of legacy Truck table | 2026-04-17 | 687c71b | [242-fix-driver-portal-gps-ping-to-write-to-g](./quick/242-fix-driver-portal-gps-ping-to-write-to-g/) |
| 243 | Fix driver dashboard HOS duty status not saving to database | 2026-04-18 | 3a41a08 | [243-fix-driver-dashboard-hos-duty-status-not](./quick/243-fix-driver-dashboard-hos-duty-status-not/) |
| 244 | Fix live map vehicle detail panel and sidebar active route display | 2026-04-18 | 432735b | [244-fix-live-map-vehicle-detail-panel-and-si](./quick/244-fix-live-map-vehicle-detail-panel-and-si/) |
| 245 | Fix live map vehicles endpoint wrong table name carrier_facilities → facilities | 2026-04-18 | fb08ecc | [245-fix-live-map-vehicles-endpoint-wrong-tab](./quick/245-fix-live-map-vehicles-endpoint-wrong-tab/) |
| 249 | Remove old dashboard and fix owner navigation to carrier dashboard | 2026-04-18 | c55762c | [249-remove-old-dashboard-and-fix-owner-navig](./quick/249-remove-old-dashboard-and-fix-owner-navig/) |
| 250 | Add mobile bottom nav to owner portal | 2026-04-18 | e42c9e0 | [250-add-mobile-bottom-nav-to-owner-portal](./quick/250-add-mobile-bottom-nav-to-owner-portal/) |
| 251 | Comprehensive mobile responsive overhaul for owner portal | 2026-04-18 | c27408c | [251-comprehensive-mobile-responsive-overhaul](./quick/251-comprehensive-mobile-responsive-overhaul/) |
| 252 | Driver portal quick actions carousel, GPS indicator fix, owner portal mobile header fix, and dashboard KPI replacement | 2026-04-19 | e6b567f | [252-driver-portal-quick-actions-carousel-gps](./quick/252-driver-portal-quick-actions-carousel-gps/) |
| 253 | Rebuild Team Permissions to reflect current Carrier Ops pages and fix enforcement | 2026-04-19 | 771e3c3 | [253-rebuild-team-permissions-to-reflect-curr](./quick/253-rebuild-team-permissions-to-reflect-curr/) |
| 254 | Fix notification z-index over map, Full Access toggle on Team Permissions, map marker auto-zoom | 2026-04-19 | c05c4ca | [254-fix-notification-z-index-over-map-full-a](./quick/254-fix-notification-z-index-over-map-full-a/) |
| 255 | Fix dispatch detail page not showing stops from attached loads | 2026-04-19 | af79aee | [255-fix-dispatch-detail-page-not-showing-sto](./quick/255-fix-dispatch-detail-page-not-showing-sto/) |
| 256 | Fix load edit form not pre-populating existing stops and persistStops deleting stops on save | 2026-04-19 | 99523b6 | [256-fix-load-edit-form-not-pre-populating-ex](./quick/256-fix-load-edit-form-not-pre-populating-ex/) |
| 257 | Fix live map centering, driver dashboard dispatch card state, greeting punctuation, and owner stop completion notification | 2026-04-19 | 7fd216f | [257-fix-live-map-centering-driver-dashboard-](./quick/257-fix-live-map-centering-driver-dashboard-/) |
| 258 | Add show/hide password toggle to login page | 2026-04-19 | 33faaa1 | [258-add-show-hide-password-toggle-to-login-p](./quick/258-add-show-hide-password-toggle-to-login-p/) |
| 259 | Fix notification dropdown z-index on live map page | 2026-04-19 | 4e798f8 | [259-fix-notification-dropdown-z-index-on-liv](./quick/259-fix-notification-dropdown-z-index-on-liv/) |
| 260 | Debug dispatch detail stop timeline not showing stops after load attachment | 2026-04-19 | b34c37c | [260-debug-dispatch-detail-stop-timeline-not-](./quick/260-debug-dispatch-detail-stop-timeline-not-/) |
| 261 | Add route template attachment to dispatch with stop inheritance and recurring schedule | 2026-04-19 | dbb74e5 | [261-add-route-template-attachment-to-dispatc](./quick/261-add-route-template-attachment-to-dispatc/) |
| 262 | Forgot password flow + sysadmin password override for tenant owners | 2026-04-19 | 2a5fd11 | [262-forgot-password-flow-sysadmin-password-override](./quick/262-forgot-password-flow-sysadmin-password-override/) |
| 263 | Build complete owner-driver messaging system with conversations inbox, threaded messages, dispatch context, broadcast, and sidebar unread badge | 2026-04-20 | f20b9f3 | [263-build-complete-owner-driver-messaging-sy](./quick/263-build-complete-owner-driver-messaging-sy/) |
| 264 | Fix nightly dispatch generator to auto-create loads and stops from route templates — transactional dispatch+load+stops, contract rate copy, appointment offsets, needs_assignment flag, manual generate endpoint, after() notifications | 2026-04-20 | 29ee753 | [264-fix-nightly-dispatch-generator-to-auto-c](./quick/264-fix-nightly-dispatch-generator-to-auto-c/) |
| 265 | Driver portal enhancements — loading skeletons, force-dynamic, dispatch history tab, hide rate fields, per-stop document upload (active + completed stops) | 2026-04-22 | 54d8597 | [265-driver-portal-enhancements-nav-performan](./quick/265-driver-portal-enhancements-nav-performan/) |
| 266 | Fix pendingStopsJson column name mismatch — verified @map("pending_stops_json") present, regenerated Prisma client, fixed 3 Playwright E2E Locator.not() type errors, tsc clean | 2026-04-22 | 3633b7b | [266-fix-pendingstopsjson-column-name-mismatc](./quick/266-fix-pendingstopsjson-column-name-mismatc/) |
| 267 | Fix load edit page not reading stops from pendingStopsJson when no dispatch attached — Branch C fallback parses JSON, batch-fetches facilities with org_id isolation, maps to StopBuilderStop[] | 2026-04-22 | 9a03d56 | [267-fix-load-edit-page-not-reading-stops-fro](./quick/267-fix-load-edit-page-not-reading-stops-fro/) |
| 268 | Fix 500 when attaching second load to dispatch — sequenceOrder offset by existingStopCount to avoid @@unique([dispatchId, sequenceOrder]) collision; improved PATCH error serialization | 2026-04-22 | 9c7080b | [268-fix-attach-second-load-to-dispatch-retur](./quick/268-fix-attach-second-load-to-dispatch-retur/) |
| 269 | Document upload enhancements — CarrierDocumentType catalog (per-tenant, auto-seed 10 defaults), CRUD API + settings page, required type selection on upload, context FKs (load/dispatch/contract), uploader name + timestamp in document lists | 2026-04-22 | 718b4f8 | [269-document-upload-and-storage-enhancements](./quick/269-document-upload-and-storage-enhancements/) |
| 270 | Fix document upload error logging — logger.error signature mismatch was stringifying Supabase StorageError as [object Object]; now passes raw error as second arg + context as third | 2026-04-22 | f9d270a | [270-fix-document-upload-storage-failure-and-](./quick/270-fix-document-upload-storage-failure-and-/) |
| 271 | Fix carrier document upload to use R2 — replaced Supabase Storage (non-existent bucket) with PutObjectCommand/DeleteObjectCommand via existing s3Client; storage path format unchanged | 2026-04-22 | b228caa | [271-fix-carrier-document-upload-to-use-r2-in](./quick/271-fix-carrier-document-upload-to-use-r2-in/) |
| 272 | Fix carrier document upload to use Supabase Storage bucket drivecommand-files — replaced R2 with Supabase Storage admin client, createSignedUrl for viewing, bucket drivecommand-files | 2026-04-22 | f52edff | [272-fix-carrier-document-upload-to-use-supab](./quick/272-fix-carrier-document-upload-to-use-supab/) |
| 273 | Add view/download button to uploaded documents on dispatch detail stop cards — StopDocumentList component, signed-url endpoint, View/Delete actions with refresh | 2026-04-22 | 0e63d3e | [273-add-view-download-button-to-uploaded-doc](./quick/273-add-view-download-button-to-uploaded-doc/) |
| 274 | Propagate client_id and contract_id to CarrierDocument on upload — universal resolution for all parent types (stop/load/dispatch/contract), fail-safe try/catch | 2026-04-22 | 3f4daba | [274-propagate-client-id-and-contract-id-to-c](./quick/274-propagate-client-id-and-contract-id-to-c/) |
| 275 | Add documents tab to client detail page and documents section to contract detail page — 2 new API endpoints, ClientDetail Documents tab, ContractDetail Documents section, View/Download | 2026-04-22 | 403f7e2 | [275-add-documents-tab-to-client-detail-page-](./quick/275-add-documents-tab-to-client-detail-page-/) |
| 276 | Add document upload capability to client and contract detail pages — client parentType in upload pipeline, DocumentUploadModal on ClientDetail Documents tab and ContractDetail Documents section, immediate list refresh | 2026-04-21 | a590952 | [276-add-document-upload-capability-to-client](./quick/276-add-document-upload-capability-to-client/) |
| 277 | Drop carrier_documents_document_type_check constraint (catalog-managed types), restyle upload trigger to primary button with Upload icon, add 5-minute session cache to /api/auth/me to prevent Supabase Auth 429 | 2026-04-22 | 3ab0735 | [277-fix-carrier-documents-check-constraint-i](./quick/277-fix-carrier-documents-check-constraint-i/) |
| 278 | Comprehensive Carrier Dashboard overhaul — alerts, activity feed, message board, driver status, and revenue fix | 2026-04-22 | e647c24 | [278-comprehensive-carrier-dashboard-overhaul](./quick/278-comprehensive-carrier-dashboard-overhaul/) |
| 279 | Add "Dispatch This Load" button to load detail page — DispatchLoadModal with 7 fields, dispatch badge link after dispatching | 2026-04-22 | c54223c | [279-add-dispatch-this-load-button-to-load-de](./quick/279-add-dispatch-this-load-button-to-load-de/) |
| 280 | Add "Dispatch immediately" toggle to load create form — 6 dispatch fields, lazy template fetch, dual-path submit, redirects to dispatch detail on success | 2026-04-22 | 0e33b09 | [280-add-dispatch-option-to-load-create-form](./quick/280-add-dispatch-option-to-load-create-form/) |
| 281 | Add tenant settings, user list, password reset, and role management to sysadmin tenant detail page | 2026-04-22 | 9fe7743 | [281-add-tenant-settings-user-list-password-r](./quick/281-add-tenant-settings-user-list-password-r/) |

**Phase 01 metrics:**
- Phase 01-01 (2026-02-26): RLS policies + migration SQL for Load/TenantIntegration + tenantId on InvoiceItem/ExpenseTemplateItem — 192s, 2 tasks, 4 files affected
- Phase 01-02 (2026-02-26): migrate.mjs fail-hard error handling + TypeScript type check — 85s, 2 tasks, 1 file affected

**Phase 19 metrics:**
- Phase 19-01 (2026-02-27): RouteStop migration SQL, Prisma schema, routeStopSchema, stop CRUD in server actions — 185s, 2 tasks, 4 files affected
- Phase 19-02 (2026-02-27): Stop editor in route-form.tsx, stop timeline in route-detail.tsx, initialStops data plumbing — 108s, 2 tasks, 4 files affected
- Phase 19-03 (2026-02-27): Geofence RouteStop auto-arrival, driver portal active stop panel + Mark Departed — 113s, 2 tasks, 3 files affected

**Quick-36 metrics:**
- Quick-36 (2026-02-27): Mobile responsiveness audit — flex stop badges, 44px touch targets, overflow-x-auto table, dark mode design tokens — 212s, 3 tasks, 5 files affected

**Quick-37 metrics:**
- Quick-37 (2026-02-27): Sidebar expense settings links, remove Maintenance duplicate, invoice conditional Edit + Mark as Paid — 93s, 2 tasks, 4 files affected

**Quick-38 metrics:**
- Quick-38 (2026-02-28): DB error handling on 29 pages, requireRole on live-map, null guards on payroll driver names, remove use client from 2 pages — ~1080s, 3 tasks, 29 files affected

**Quick-39 metrics:**
- Quick-39 (2026-02-28): Driver portal force-dynamic, hooks violation fix, try/catch on 3 pages, null guard on truckId, dark mode design tokens, dead imports removed, error boundary — ~180s, 2 tasks, 10 files affected

**Quick-40 metrics:**
- Quick-40 (2026-03-03): Driver load status page — getMyActiveLoad/advanceLoadStatus server actions, My Load page with status timeline, LoadStatusButton client component, nav link — 325s, 2 tasks, 4 files affected

**Quick-41 metrics:**
- Quick-41 (2026-03-03): Support ticketing system — SupportTicket model, migration, 4 server actions, global floating modal, My Tickets pages (owner+driver), admin dashboard with inline status update — 321s, 3 tasks, 12 files affected

**Quick-42 metrics:**
- Quick-42 (2026-03-04): Extend create tenant flow with owner invitation — role on DriverInvitation, OwnerInvitationEmail template, sendOwnerInvitation, owner fields on create-tenant form, role-aware accept-invitation — 199s, 2 tasks, 8 files affected

**Quick-43 metrics:**
- Quick-43 (2026-03-04): Three-state tenant status (Pending/Active/Suspended) via ownerSetupComplete computed from OWNER-role user existence — 79s, 2 tasks, 2 files affected
- Quick-44 (2026-03-07): Status tab filtering on admin support dashboard — All/Open/In Progress/Closed tabs with per-tab counts, RESOLVED+CLOSED combined — ~60s, 1 task, 1 file affected
- Quick-45 (2026-03-10): TKT-0011 Routes UX — RouteDriver join table + Route.name schema, document upload useEffect sync fix, short ID title badge, co-driver multi-select form — ~5min, 3 tasks, 7 files affected
| Phase 22-support-ticket-system P01 | 261 | 2 tasks | 6 files |
| Phase 22-support-ticket-system P02 | 285 | 2 tasks | 8 files |
| Phase 22-support-ticket-system P03 | 276 | 2 tasks | 9 files |
| Phase 23 P01 | 175 | 2 tasks | 7 files |
| Phase 23 P02 | 480 | 2 tasks | 6 files |
| Phase 23-system-admin-portal P03 | 183 | 2 tasks | 3 files |
| Phase 24-technical-documentation P01 | 227 | 2 tasks | 4 files |
| Phase 24-technical-documentation P02 | 230 | 2 tasks | 5 files |
| Phase quick-46 P01 | 726 | 3 tasks | 23 files |
| Phase quick-51 P01 | 190 | 2 tasks | 4 files |
| Phase 25 P01 | 164 | 2 tasks | 4 files |
| Phase 25 P02 | 378 | 2 tasks | 10 files |
| Phase 25 P03 | 159 | 2 tasks | 6 files |
| Phase quick-60 P01 | 227 | 3 tasks | 6 files |
| Phase quick-75 P01 | 148 | 2 tasks | 3 files |
| Phase quick-77 P01 | 220 | 2 tasks | 6 files |
| Phase quick-80 P1 | 3 | 1 tasks | 2 files |
| Phase 27-automated-playwright-tests P03 | 3 | 2 tasks | 6 files |
| Phase quick-92 P01 | 2m | 2 tasks | 2 files |
| Phase 29 P02 | 365 | 10 tasks | 33 files |
| Phase 29-monorepo-expo-scaffold P03 | 7min | 3 tasks | 46 files |
| Phase 30 P02 | 198 | 6 tasks | 22 files |
| Phase 31-03 P03 | 325 | 3 tasks | 10 files |
| Phase 33 P01 | 257 | 7 tasks | 7 files |
| Phase 33-driver-native-features P03 | 133 | 7 tasks | 7 files |
| Phase 35-owner-core-screens P01 | 203 | 5 tasks | 6 files |
| Phase 36 P02b | 151 | 2 tasks | 2 files |
| Phase 37 P01 | 439 | 6 tasks | 20 files |
| Phase quick-134 P01 | 14 | 3 tasks | 29 files |
| Phase 37.7 P04 | 239 | 2 tasks | 3 files |
| Phase quick-161 P01 | 142s | 2 tasks | 7 files |
| Phase quick-182 P01 | 128s | 2 tasks | 4 files |
| Phase quick-201 P01 | 10 | 2 tasks | 3 files |
| Phase 27 P06 | 186 | 2 tasks | 3 files |
| Phase 37.2-owner-route-maintenance P01 | 389 | 2 tasks | 5 files |
| Phase 37.2 P03 | 215 | 1 tasks | 1 files |
| Phase quick-210 P01 | 15m | 2 tasks | 14 files |
| Phase quick-243 P01 | 10 | 2 tasks | 2 files |

## Session Continuity

Last session: 2026-03-18
Stopped at: Completed Quick-81 — Fix mobile layout on loads and routes list pages.
Resume file: None
Next action: Deploy to Vercel or pick next quick task.
