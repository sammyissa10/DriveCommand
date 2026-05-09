---
phase: quick-138
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/docs/api.md
  - docs/glossary.md
  - apps/mobile/docs/local-development.md
  - apps/mobile/docs/architecture.md
  - apps/web/docs/troubleshooting.md
  - apps/mobile/docs/troubleshooting.md
  - CONTRIBUTING.md
autonomous: true

must_haves:
  truths:
    - "Developer can look up any /api/mobile/* endpoint and see method, path, params, response shape, auth requirement, and error codes"
    - "Developer can look up domain terms (IFTA, HOS, ELD, bypass_rls, etc.) in a central glossary"
    - "Developer can follow local-development.md to get the mobile app running on Android emulator from scratch"
    - "Developer can reference ADRs for why Supabase JWT, MMKV, and NativeWind were chosen"
    - "Developer can diagnose common web and mobile failures using troubleshooting guides"
    - "New contributor can follow CONTRIBUTING.md to understand workflow, branch naming, and commit conventions"
  artifacts:
    - path: "apps/mobile/docs/api.md"
      provides: "Complete mobile API reference for all ~40 endpoints"
    - path: "docs/glossary.md"
      provides: "Domain terminology reference"
    - path: "apps/mobile/docs/local-development.md"
      provides: "Mobile local dev setup guide"
    - path: "apps/mobile/docs/architecture.md"
      provides: "Updated architecture doc with ADR section"
    - path: "apps/web/docs/troubleshooting.md"
      provides: "Web troubleshooting guide"
    - path: "apps/mobile/docs/troubleshooting.md"
      provides: "Mobile troubleshooting guide"
    - path: "CONTRIBUTING.md"
      provides: "Contributor guide"
  key_links: []
---

<objective>
Create 7 documentation files covering mobile API reference, domain glossary, local development guide, architecture ADRs, troubleshooting guides, and contributing guidelines.

Purpose: Fill documentation gaps identified in the project audit so developers (and future Claude sessions) can reference accurate, codebase-derived docs.
Output: 7 new or updated markdown files across the repo.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/mobile/docs/architecture.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Mobile API reference and domain glossary</name>
  <files>apps/mobile/docs/api.md, docs/glossary.md</files>
  <action>
**apps/mobile/docs/api.md** — Read every route file under `apps/web/src/app/api/mobile/` (driver/, owner/, support/) and document each endpoint. The route files already have JSDoc headers with method, path, query params, and behavior descriptions — extract these. For each endpoint document:

- HTTP method and full path (e.g., `GET /api/mobile/driver/loads?status=active|history`)
- Auth requirement (all require `Authorization: Bearer <token>`, note role restrictions like "OWNER only" or "DRIVER only")
- Query parameters or request body shape
- Response shape (key fields returned, based on the Prisma queries in the route)
- Error responses (401 unauthorized, 403 forbidden, 404 not found, 429 rate limited — check which each route can return)
- Pagination info where applicable (page, limit params)

Organize into three sections matching the directory structure:
1. **Driver Endpoints** (~18 routes): dashboard, loads (list, detail, status update, revert, rate-confirmation), documents (list, detail URL, upload URL), HOS, incidents (create, upload photo), messages (list, thread, mark-read, unread-count), route, tracking-token
2. **Owner Endpoints** (~20 routes): dashboard, loads (list, detail, assign-truck), drivers (list, detail, active, invite), trucks (list, detail), invoices (list, detail), customers, compliance, CRM, payroll, fleet-positions, map/vehicles, fleet/messages (list, thread)
3. **Support Endpoints** (2 routes): ticket, upload-screenshot

Include a summary table at the top with all endpoints, methods, and one-line descriptions.

Two auth patterns exist in the codebase — note both:
- `withMobileAuth` wrapper (newer pattern, extracts auth into callback param)
- `validateMobileToken` + manual check (older pattern, some routes still use this)

**docs/glossary.md** — Scan the codebase for domain-specific terms and create a glossary. Include at minimum:
- IFTA (International Fuel Tax Agreement), HOS (Hours of Service), ELD (Electronic Logging Device)
- POD (Proof of Delivery), BOL (Bill of Lading), rate confirmation
- RouteStop, bypass_rls, multi-tenant, tenantId
- Load statuses: PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED, INVOICED, CANCELLED
- Driver HOS statuses: OFF_DUTY, SLEEPER, DRIVING, ON_DUTY
- RLS (Row-Level Security), JWT, OTA (Over-the-Air updates)
- Any other terms found in models or API routes (e.g., deadhead miles, accessorial charges)

Format as alphabetical definition list with brief, accurate definitions.
  </action>
  <verify>
- `cat apps/mobile/docs/api.md | wc -l` shows substantial content (expect 400+ lines)
- `cat docs/glossary.md | wc -l` shows 50+ lines
- Grep for a known endpoint path in api.md: `grep "driver/dashboard" apps/mobile/docs/api.md` returns a match
- Grep for a known term in glossary: `grep "IFTA" docs/glossary.md` returns a match
  </verify>
  <done>All ~40 mobile API endpoints documented with method, path, params, response shape, and auth. Glossary covers 20+ domain terms.</done>
</task>

<task type="auto">
  <name>Task 2: Local development guide, architecture ADRs, and CONTRIBUTING.md</name>
  <files>apps/mobile/docs/local-development.md, apps/mobile/docs/architecture.md, CONTRIBUTING.md</files>
  <action>
**apps/mobile/docs/local-development.md** — Create a complete local development guide for the mobile app. Source info from the memory files (feedback_emulator_startup.md, feedback_mobile_testing.md) and the existing web setup.md pattern. Include:

1. **Prerequisites**: Node.js 20+, Android Studio with SDK and emulator configured, Java 17 (for Android builds), Expo CLI, ADB in PATH
2. **Initial Setup**: Clone repo, `npm install` at root (Turborepo workspaces), explain that `apps/mobile` is one workspace
3. **Environment Variables**: Reference `apps/mobile/.env.example` (created in quick-137) — EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SENTRY_DSN
4. **Development Build**: Must create a dev build first: `cd apps/mobile && eas build --profile development --platform android` (or install a pre-built APK if available)
5. **The 4-Step Startup Sequence** (the exact steps from memory):
   - Step 1: Start Android emulator via Android Studio Device Manager
   - Step 2: Terminal 1 — `cd apps/web && npm run dev` (wait for "Ready on localhost:3000")
   - Step 3: Terminal 2 — `adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081`
   - Step 4: Terminal 3 — `cd apps/mobile && npx expo start --clear`, then press `a`
6. **Why Expo Go Does Not Work**: Native modules (react-native-mmkv, react-native-maps, @sentry/react-native) require a custom dev build. Expo Go only supports Expo SDK modules.
7. **Common Issues**: Network errors mid-session (re-run adb reverse), Metro cache issues (--clear flag), hot reload not working (press r)

**apps/mobile/docs/architecture.md** — Append an "Architecture Decision Records" section at the end of the existing file (do NOT rewrite existing content). Add three ADRs:

1. **ADR-001: Supabase JWT for mobile auth (not session cookies)**
   - Context: Web app uses custom AES-256-GCM session cookies for Edge Runtime compatibility
   - Decision: Mobile uses Supabase Auth with JWT tokens stored in expo-secure-store
   - Rationale: expo-secure-store provides hardware-backed encryption; Supabase client handles token refresh automatically; JWT Bearer auth is standard for mobile API clients; no cookie jar management needed in React Native
   - Status: Accepted

2. **ADR-002: MMKV over AsyncStorage**
   - Context: Need fast persistent key-value storage for non-sensitive data (preferences, cache flags)
   - Decision: Use react-native-mmkv instead of @react-native-async-storage/async-storage
   - Rationale: MMKV is synchronous (no await needed), 30x faster than AsyncStorage, uses memory-mapped files. Auth tokens stay in SecureStore; only non-sensitive data goes in MMKV.
   - Status: Accepted

3. **ADR-003: NativeWind v4 over StyleSheet.create**
   - Context: Need styling solution that allows code sharing patterns with the Tailwind-based web app
   - Decision: Use NativeWind v4 (Tailwind CSS for React Native)
   - Rationale: Same utility class vocabulary as the web app (consistency for developer); compiled at build time (no runtime overhead); supports dark mode, responsive breakpoints; reduces style boilerplate vs StyleSheet.create
   - Status: Accepted

**CONTRIBUTING.md** (repo root) — Create a contributor guide covering:
1. **Project Overview**: DriveCommand is a multi-tenant fleet management SaaS (Turborepo monorepo with apps/web and apps/mobile)
2. **Development Workflow**: Reference the GSD (Get Shit Done) system — `/gsd:quick` for small tasks, full phase workflow for features
3. **Branch Naming**: `feature/description`, `fix/description`, `docs/description`
4. **Commit Conventions**: Conventional commits format used — `type(scope): message`. Types: feat, fix, docs, refactor, test, chore. Scope examples: quick-NNN, phase-NN. Reference the git log for examples.
5. **Pre-Commit Checks**: Run `npx tsc --noEmit` before deploying (TypeScript errors fail Vercel builds)
6. **Deployment**: Vercel CLI only (`vercel --prod`), never push-to-deploy via GitHub
7. **Code Style**: Prettier + ESLint configured at root; Tailwind + shadcn/ui for web; NativeWind for mobile
8. **Where to Find Docs**: Point to apps/web/docs/, apps/mobile/docs/, docs/, and .planning/
  </action>
  <verify>
- `cat apps/mobile/docs/local-development.md | grep "adb reverse"` returns a match
- `cat apps/mobile/docs/architecture.md | grep "ADR-001"` returns a match
- `cat CONTRIBUTING.md | grep "GSD"` returns a match
- All three files exist and have substantial content
  </verify>
  <done>Local dev guide has the complete 4-step emulator sequence with prerequisites. Architecture doc has 3 ADRs appended. CONTRIBUTING.md covers workflow, conventions, and deployment.</done>
</task>

<task type="auto">
  <name>Task 3: Web and mobile troubleshooting guides</name>
  <files>apps/web/docs/troubleshooting.md, apps/mobile/docs/troubleshooting.md</files>
  <action>
**apps/web/docs/troubleshooting.md** — Create a troubleshooting guide for common web app failures. Research actual error patterns from the codebase (middleware, Prisma config, RLS setup, deployment). Include:

1. **Prisma Migration Drift**: Symptoms (schema out of sync with DB), cause (manual DB changes or failed migrations), fix (`npx prisma db push` for dev, `npx prisma migrate deploy` for prod, `npx prisma migrate diff` to inspect)
2. **TypeScript Errors on Vercel Deploy**: Symptoms (build fails with type errors), cause (Vercel runs `next build` which includes tsc), fix (always run `npx tsc --noEmit` locally before `vercel --prod`)
3. **RLS Blocking Queries**: Symptoms (queries return empty results or 403), cause (missing `set_config('app.bypass_rls', 'on', TRUE)` in transaction, or incorrect tenantId), fix (check the bypass_rls pattern, verify tenantId in WHERE clause, check that the route uses `$transaction` with the config call)
4. **Environment Variable Issues**: Symptoms (runtime errors for undefined env vars), cause (missing .env.local entries, Vercel env not synced), fix (check .env.example, verify in Vercel dashboard, redeploy after adding vars)
5. **Middleware Redirect Loops**: Symptoms (infinite redirect, browser shows "too many redirects"), cause (PUBLIC_PATHS not updated for new routes), fix (add path to PUBLIC_PATHS array in middleware.ts)
6. **Supabase Connection Errors**: Symptoms (database connection timeout), cause (connection pool exhausted, wrong DATABASE_URL), fix (check connection string, verify Supabase project is running, check for connection leak in Prisma client)
7. **Rate Limiting Errors (429)**: Symptoms (API returns 429 Too Many Requests), cause (Redis-based rate limiter triggered), fix (check rate limit config, in development ensure Redis is running or rate limiting falls through gracefully)

**apps/mobile/docs/troubleshooting.md** — Create a troubleshooting guide for common mobile app failures:

1. **EAS Build Failures — Missing Secrets**: Symptoms (build fails with "missing environment variable"), cause (EAS secrets not configured), fix (run `eas secret:list` to check, `eas secret:create` to add missing vars)
2. **EAS Build Failures — Expired Credentials**: Symptoms (build fails at signing step), cause (expired Apple provisioning profile or keystore), fix (for Android: regenerate keystore; for iOS: renew provisioning profile in Apple Developer portal)
3. **Emulator Cannot Reach API**: Symptoms (network errors, "fetch failed"), cause (ADB reverse tunnels not set or web server not running), fix (verify all 3 terminals are running per local-development.md, re-run `adb reverse` commands)
4. **Expo Go Incompatibility**: Symptoms (app crashes on launch in Expo Go, "native module not found"), cause (project uses native modules: react-native-mmkv, react-native-maps, @sentry/react-native), fix (must use a custom dev build via EAS, never Expo Go)
5. **Metro Bundler Cache Issues**: Symptoms (stale code, changes not reflected), cause (Metro cache corrupted), fix (`npx expo start --clear` or delete `node_modules/.cache`)
6. **Native Module Errors After Package Update**: Symptoms (red screen with "native module X is null"), cause (JS updated but native binary is stale), fix (rebuild dev client: `eas build --profile development --platform android`)
7. **Hot Reload Not Working**: Symptoms (code changes not appearing), cause (Metro disconnected from emulator), fix (press `r` in Metro terminal, or restart Metro with --clear)
8. **Maps Not Rendering**: Symptoms (blank map view), cause (Google Maps API key not configured or not enabled), fix (check GOOGLE_MAPS_API_KEY in app.json/app.config.ts, verify Maps SDK for Android is enabled in Google Cloud Console)
  </action>
  <verify>
- `cat apps/web/docs/troubleshooting.md | grep "Migration Drift"` returns a match
- `cat apps/mobile/docs/troubleshooting.md | grep "Expo Go"` returns a match
- Both files exist and cover all listed failure modes
  </verify>
  <done>Web troubleshooting covers 7 failure modes (Prisma drift, TS errors, RLS, env vars, middleware loops, Supabase, rate limiting). Mobile troubleshooting covers 8 failure modes (EAS builds, emulator, Expo Go, Metro, native modules, maps).</done>
</task>

</tasks>

<verification>
All 7 documentation files exist and contain accurate, codebase-derived content:
- `ls apps/mobile/docs/api.md apps/mobile/docs/local-development.md apps/mobile/docs/architecture.md apps/mobile/docs/troubleshooting.md apps/web/docs/troubleshooting.md docs/glossary.md CONTRIBUTING.md`
- API docs reference actual endpoint paths that exist in the codebase
- Glossary terms match terminology used in models and routes
- Local dev guide includes the 4-step startup sequence
- Architecture doc retains all original content plus 3 new ADRs
</verification>

<success_criteria>
- 7 markdown files created/updated
- API reference covers all ~40 /api/mobile/* endpoints
- Glossary has 20+ domain terms
- Local dev guide has complete emulator setup with all 4 steps
- 3 ADRs appended to architecture.md
- Web troubleshooting has 7 failure modes
- Mobile troubleshooting has 8 failure modes
- CONTRIBUTING.md covers GSD workflow, commit conventions, deployment
</success_criteria>

<output>
After completion, create `.planning/quick/138-fill-documentation-gaps-mobile-api-docs-/138-SUMMARY.md`
</output>
