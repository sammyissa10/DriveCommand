---
phase: quick-129
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - apps/mobile/docs/README.md
  - apps/mobile/docs/architecture.md
  - apps/web/docs/README.md
  - apps/web/docs/architecture.md
  - apps/web/docs/stack.md
  - apps/web/docs/setup.md
  - apps/web/docs/database.md
autonomous: true
must_haves:
  truths:
    - "Root README explains monorepo structure, workspaces, and how to get started"
    - "Mobile docs describe Expo/RN/NativeWind architecture, auth flow, and build process"
    - "Web docs reflect current state: Next.js 16, 37 models, monorepo workspace setup, Supabase Auth"
  artifacts:
    - path: "README.md"
      provides: "Monorepo overview and quick start"
    - path: "apps/mobile/docs/README.md"
      provides: "Mobile documentation index"
    - path: "apps/mobile/docs/architecture.md"
      provides: "Mobile architecture reference"
    - path: "apps/web/docs/README.md"
      provides: "Updated web docs index with monorepo context"
    - path: "apps/web/docs/database.md"
      provides: "Updated schema reference with all 37 models"
    - path: "apps/web/docs/architecture.md"
      provides: "Updated architecture with monorepo context"
    - path: "apps/web/docs/stack.md"
      provides: "Updated stack versions"
    - path: "apps/web/docs/setup.md"
      provides: "Updated setup for monorepo workspace"
  key_links: []
---

<objective>
Update all technical documentation to reflect the current state of DriveCommand as a Turborepo monorepo with web and mobile apps, shared packages, and the full current Prisma schema.

Purpose: Documentation is stale — it describes a single Next.js app, not the Turborepo monorepo with mobile app. Models in database.md list 37 but schema now has 37 models with new fields. Web docs reference Next.js 15 but we're on 16. Setup docs don't mention workspaces.

Output: Root README.md, mobile docs directory, updated web docs (5 files).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma
@apps/web/docs/README.md
@apps/web/docs/architecture.md
@apps/web/docs/stack.md
@apps/web/docs/setup.md
@apps/web/docs/database.md
@apps/mobile/package.json
@apps/web/package.json
@package.json
@turbo.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create root README.md and mobile docs</name>
  <files>
    README.md
    apps/mobile/docs/README.md
    apps/mobile/docs/architecture.md
  </files>
  <action>
Create `README.md` at repo root with:
- Project name and one-line description ("Multi-tenant SaaS fleet management platform for trucking operators")
- Monorepo structure table: apps/web (Next.js 16 web app), apps/mobile (Expo/React Native mobile app), packages/types (shared TypeScript types), packages/validation (shared Zod schemas), packages/api-client (mobile API client)
- Tech stack overview table (framework, ORM, database, styling, mobile, auth, deployment)
- Quick start section: clone, `npm install` (npm workspaces), link to apps/web/docs/setup.md for full setup
- Development commands: `npm run dev` (turbo dev for all), `cd apps/web && npm run dev` (web only), `cd apps/mobile && npx expo start` (mobile only)
- Links to apps/web/docs/ and apps/mobile/docs/ for detailed documentation

Create `apps/mobile/docs/` directory with two files:

`apps/mobile/docs/README.md`:
- Mobile app overview: Expo SDK 55, React Native 0.83, NativeWind v4, Expo Router
- Two portals: Owner (fleet management on the go) and Driver (route execution, HOS, incidents, messaging)
- Table of contents linking to architecture.md
- Quick start: cd apps/mobile, npx expo start, use Android emulator (NOT Expo Go — native modules like MMKV and Maps are incompatible)

`apps/mobile/docs/architecture.md`:
- Stack: Expo SDK 55 (`expo@~55.0.8`), React Native 0.83 (`react-native@0.83.2`), NativeWind v4 (`nativewind@^4.2.3`), Expo Router (`expo-router@~55.0.7`), React Query (`@tanstack/react-query@^5.95.0`)
- Auth flow: Supabase Auth via `@supabase/supabase-js`, tokens stored in `expo-secure-store`, session managed in React context
- API communication: Uses `@drivecommand/api-client` package which calls the Next.js web API routes (same backend, no separate mobile API)
- Navigation: Expo Router file-based routing with two route groups: `(owner)/` and `(driver)/`
- Owner screens: dashboard (index), loads, drivers/invite, map, more (fleet/trucks, CRM, invoices)
- Driver screens: active route (index), loads, documents, HOS, incidents, messages
- State management: React Query for server state, React context for auth/session
- Storage: MMKV for fast local key-value storage, SecureStore for auth tokens
- Push notifications: expo-notifications + expo-task-manager, PushToken model in DB
- Maps: react-native-maps with clustering (react-native-map-clustering)
- Build/deploy: EAS Build (eas build), profiles: development, preview, production
- Key libraries table with versions from package.json
  </action>
  <verify>
All three files exist and are valid markdown:
- `cat README.md | head -5` shows DriveCommand header
- `cat apps/mobile/docs/README.md | head -5` shows mobile header
- `cat apps/mobile/docs/architecture.md | head -5` shows architecture header
  </verify>
  <done>
Root README.md describes monorepo structure with links to both app docs. Mobile docs directory exists with README.md (overview + quick start) and architecture.md (full mobile stack, auth flow, navigation, build process).
  </done>
</task>

<task type="auto">
  <name>Task 2: Update web docs for monorepo and current state</name>
  <files>
    apps/web/docs/README.md
    apps/web/docs/architecture.md
    apps/web/docs/stack.md
    apps/web/docs/setup.md
    apps/web/docs/database.md
  </files>
  <action>
Update `apps/web/docs/README.md`:
- Change tech stack table: "Next.js 15" to "Next.js 16"
- Add a "Monorepo Context" section after the intro explaining this is the web app within a Turborepo monorepo, with shared packages: @drivecommand/types, @drivecommand/validation, @drivecommand/api-client
- Add link to mobile docs: `../../mobile/docs/` and root README: `../../../README.md`

Update `apps/web/docs/architecture.md`:
- Add a "Monorepo Architecture" section at the top (before System Overview) explaining: Turborepo monorepo with apps/web, apps/mobile, and packages/*. The web app serves as both the web frontend AND the API backend for the mobile app. Mobile API routes live under `src/app/api/mobile/` and are consumed by `@drivecommand/api-client`.
- Update "File Structure Overview" to include the mobile API routes directory:
  ```
  api/
    mobile/         # REST API for mobile app (owner/*, driver/*, support/*)
  ```
- Keep all existing content intact. Only add monorepo context.

Update `apps/web/docs/stack.md`:
- Section 1: Change "Next.js 16" version to `next@^16.1.6` (already correct, but update the section title if it says 15)
- Add section 14: "Shared Packages" listing @drivecommand/types (shared TypeScript interfaces), @drivecommand/validation (shared Zod schemas used by web and mobile), @drivecommand/api-client (typed HTTP client for mobile app to call web API)
- Add section 15: "Rate Limiting" — `@upstash/ratelimit@^2.0.8` + `@upstash/redis@^1.37.0` for API rate limiting on mobile endpoints
- Add section 16: "Push Notifications" — `expo-server-sdk@^6.1.0` for sending push notifications to mobile devices
- Add section 17: "Error Monitoring" — `@sentry/nextjs@^10.46.0` for error tracking and performance monitoring

Update `apps/web/docs/setup.md`:
- Section 1 "Clone and Install": Update to explain monorepo workspace setup. `npm install` at root installs all workspaces. Mention `turbo.json` orchestrates tasks.
- Add note: "To run only the web app: `cd apps/web && npm run dev`" and "To run all apps: `npm run dev` (from root, uses Turbo)"
- Add env vars to table that are missing: `GMAIL_USER` (required for email), `GMAIL_APP_PASSWORD` (required for email), `GMAIL_FROM_NAME` (optional), `UPSTASH_REDIS_REST_URL` (rate limiting), `UPSTASH_REDIS_REST_TOKEN` (rate limiting), `SENTRY_DSN` (error monitoring, optional), `NEXT_PUBLIC_SUPABASE_URL` (Supabase Auth for mobile), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase Auth for mobile)
- Keep all existing content. Append new env vars to existing table.

Update `apps/web/docs/database.md`:
- The "Schema Overview" section currently says "37 models" — count the actual models from schema.prisma (there are 37 models based on grep). Verify the count is correct.
- Check each model in the table against the actual schema. The current table already lists all 37 models. Review for any missing fields that were added recently:
  - `Truck`: verify `documentMetadata` JSONB field is listed (it is)
  - `Route`: verify `driverName` and `routeName` fields are listed if they exist in schema
  - `Customer`: verify `emailNotifications` field is listed (it is)
  - `Invoice`: verify any audit fields (`createdById`, `lastModifiedById`) are listed if they exist
  - `Load`: verify `routeId` optional FK is listed (it is)
  - `PushToken`: verify it's in the table (it is)
  - `DriverHOSEntry`: verify it's listed (it is)
  - `DriverIncident`: verify it's listed (it is)
  - `FleetMessage`: verify it's listed (it is)
- Read the actual schema.prisma to find any fields in the Key Fields column that are outdated or missing. Update the table rows for any models whose fields have changed.
- Add "Tables without RLS" note: also mention that `PushToken` uses `userId` (not tenantId) and has no RLS.
- Keep all other sections intact.
  </action>
  <verify>
Verify updates:
- `grep "Next.js 16" apps/web/docs/README.md` returns a match
- `grep "Monorepo" apps/web/docs/architecture.md` returns a match
- `grep "Shared Packages" apps/web/docs/stack.md` returns a match
- `grep "turbo" apps/web/docs/setup.md` returns a match (case insensitive)
- `grep "37 models" apps/web/docs/database.md` returns a match (or updated count if different)
  </verify>
  <done>
All five web docs updated: README.md reflects Next.js 16 and links to monorepo context, architecture.md explains monorepo and mobile API, stack.md adds shared packages and new dependencies, setup.md covers workspace setup and missing env vars, database.md has accurate model count and field listings.
  </done>
</task>

</tasks>

<verification>
- Root README.md exists and describes Turborepo monorepo structure
- apps/mobile/docs/ directory exists with README.md and architecture.md
- apps/web/docs/README.md references Next.js 16 (not 15)
- apps/web/docs/architecture.md mentions monorepo and mobile API routes
- apps/web/docs/stack.md includes shared packages section
- apps/web/docs/setup.md mentions Turbo and workspace commands
- apps/web/docs/database.md model count matches actual schema
- All markdown files are well-formed
</verification>

<success_criteria>
All documentation accurately reflects the current state of the DriveCommand monorepo: Turborepo structure, shared packages, mobile app (Expo SDK 55 + RN 0.83 + NativeWind v4), web app (Next.js 16), and complete Prisma schema with all 37 models.
</success_criteria>

<output>
After completion, create `.planning/quick/129-update-technical-documentation-to-reflec/129-SUMMARY.md`
</output>
