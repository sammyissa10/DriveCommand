---
phase: quick-129
plan: "01"
subsystem: documentation
tags: [docs, monorepo, mobile, web]
dependency_graph:
  requires: []
  provides: [root-readme, mobile-docs, updated-web-docs]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - README.md
    - apps/mobile/docs/README.md
    - apps/mobile/docs/architecture.md
  modified:
    - apps/web/docs/README.md
    - apps/web/docs/architecture.md
    - apps/web/docs/stack.md
    - apps/web/docs/setup.md
    - apps/web/docs/database.md
decisions:
  - "Database.md model rows updated with createdById? on 5 models (Truck, Route, Invoice, PayrollRecord, Load) found during schema review"
  - "PushToken added to Tables without RLS section with explanation that it uses userId not tenantId"
metrics:
  duration: "4 minutes"
  completed: "2026-03-30T17:28:39Z"
  tasks: 2
  files: 8
---

# Quick Task 129: Update Technical Documentation Summary

Documentation updated across 8 files to reflect the current DriveCommand Turborepo monorepo with Expo SDK 55 mobile app, Next.js 16 web app, and 37 Prisma models.

---

## What Was Done

### Task 1: Root README and Mobile Docs (commit 2975d00)

**Created `README.md` (root):**
- Monorepo structure table: apps/web, apps/mobile, packages/types, packages/validation, packages/api-client
- Tech stack comparison table (web vs mobile)
- Quick start: clone + `npm install` at root
- Development commands: `npm run dev` (turbo all), per-app commands, mobile emulator note
- Links to both app doc directories

**Created `apps/mobile/docs/README.md`:**
- Overview of Owner and Driver portals
- Quick start: npm install at root, ADB reverse tunnels, `npx expo start`
- Key libraries table with versions from package.json
- Warning about Android emulator only (MMKV/Maps incompatible with Expo Go)

**Created `apps/mobile/docs/architecture.md`:**
- Full stack table (Expo 55, RN 0.83, Expo Router, NativeWind v4, React Query, etc.)
- Monorepo position explanation: web app as single backend, mobile API routes under /api/mobile/
- Auth flow: Supabase Auth → JWT → expo-secure-store → Bearer header on API calls
- Navigation tree: Expo Router file-based routing, (owner)/ and (driver)/ route groups with all screens
- State management matrix: React Query / React Context / useState / MMKV / SecureStore
- Push notification flow: PushToken model, expo-task-manager background tasks, expo-server-sdk
- EAS Build profiles: development, preview, production
- Key design decisions: single backend, Supabase Auth vs custom cookie, NativeWind v4, MMKV vs AsyncStorage

### Task 2: Web Docs Updates (commit dae7cc7)

**`apps/web/docs/README.md`:**
- "Next.js 15" → "Next.js 16" in tech stack table
- Added Monorepo Context section: workspace table, shared packages, links to root README and mobile docs

**`apps/web/docs/architecture.md`:**
- Added Monorepo Architecture section at top: monorepo directory tree, web-as-backend explanation, mobile API routes under /api/mobile/, Supabase JWT vs custom cookie distinction
- Added `mobile/` to File Structure Overview's api/ subtree

**`apps/web/docs/stack.md`:**
- Added Section 14: Shared Packages — @drivecommand/types, @drivecommand/validation, @drivecommand/api-client
- Added Section 15: Rate Limiting — @upstash/ratelimit + @upstash/redis
- Added Section 16: Push Notifications — expo-server-sdk
- Added Section 17: Error Monitoring — @sentry/nextjs

**`apps/web/docs/setup.md`:**
- Updated "Clone and Install" section to explain Turborepo/npm workspace setup
- Added `npm run dev` (all apps via Turbo) vs `cd apps/web && npm run dev` guidance
- Added 9 missing env vars to the table: GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_FROM_NAME, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SENTRY_DSN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

**`apps/web/docs/database.md`:**
- Updated Truck, Route, Invoice, PayrollRecord, and Load rows with `createdById?` field (found during schema review)
- Fixed Invoice row to include `routeId?` and `loadId?` fields (present in schema, missing from table)
- Updated "Tables without RLS" to include PushToken with explanation (userId-keyed, no RLS)

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invoice model row was missing routeId and loadId fields**
- **Found during:** Task 2 (database.md review)
- **Issue:** The Invoice row only listed `customerId?` but the schema has `routeId?` and `loadId?` as well
- **Fix:** Added both fields to the Invoice row in the database model table
- **Files modified:** apps/web/docs/database.md
- **Commit:** dae7cc7

---

## Self-Check: PASSED

All 8 files verified present on disk. Both task commits (2975d00, dae7cc7) confirmed in git log.
