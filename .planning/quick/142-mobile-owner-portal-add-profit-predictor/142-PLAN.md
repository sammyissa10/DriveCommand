---
phase: quick-142
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/profit-predictor/route.ts
  - apps/web/src/app/api/mobile/owner/fuel/route.ts
  - packages/api-client/src/owner.ts
  - apps/mobile/app/(owner)/more/profit-predictor.tsx
  - apps/mobile/app/(owner)/more/fuel.tsx
  - apps/mobile/app/(owner)/more/index.tsx
  - apps/mobile/components/skeletons/FuelRowSkeleton.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can open Profit Predictor from More menu, enter load details, tap Predict, and see profit/margin/recommendation"
    - "Owner can open Fuel Log from More menu, see a list of recent fuel entries with date/truck/gallons/cost/location"
    - "Owner can add a new fuel entry via FAB bottom sheet with truck picker, gallons, cost per gallon, odometer, location, date"
    - "Both new screens appear in the More menu under appropriate sections"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/profit-predictor/route.ts"
      provides: "POST endpoint for profit prediction"
      exports: ["POST"]
    - path: "apps/web/src/app/api/mobile/owner/fuel/route.ts"
      provides: "GET (list) + POST (create) endpoints for fuel records"
      exports: ["GET", "POST"]
    - path: "packages/api-client/src/owner.ts"
      provides: "predictProfit, getFuelLog, createFuelEntry methods"
    - path: "apps/mobile/app/(owner)/more/profit-predictor.tsx"
      provides: "Profit Predictor mobile screen"
    - path: "apps/mobile/app/(owner)/more/fuel.tsx"
      provides: "Fuel Log mobile screen"
  key_links:
    - from: "apps/mobile/app/(owner)/more/profit-predictor.tsx"
      to: "/api/mobile/owner/profit-predictor"
      via: "ownerApi.predictProfit in useMutation"
      pattern: "ownerApi\\.predictProfit"
    - from: "apps/mobile/app/(owner)/more/fuel.tsx"
      to: "/api/mobile/owner/fuel"
      via: "ownerApi.getFuelLog in useQuery + ownerApi.createFuelEntry in useMutation"
      pattern: "ownerApi\\.(getFuelLog|createFuelEntry)"
---

<objective>
Add Profit Predictor and Fuel Log screens to the mobile owner portal More menu.

Purpose: Owners need mobile access to load profitability prediction and fuel tracking -- two features already available on web but missing from mobile.
Output: Two new mobile screens accessible from More menu, two new mobile API endpoints, updated api-client.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/actions/profit-predictor.ts (server action with PredictionInput/PredictionResult types and predictLoadProfitability logic)
@apps/web/src/components/profit-predictor/profit-predictor-form.tsx (web form reference for fields: origin, destination, distanceMiles, offeredRate)
@apps/web/src/app/(owner)/fuel/actions.ts (server action with getFleetFuelSummary, raw SQL queries on FuelRecord table)
@apps/web/src/app/api/mobile/owner/compliance/route.ts (reference pattern for mobile API: validateMobileToken, bypass_rls, prisma.$transaction, TX_OPTIONS)
@apps/mobile/app/(owner)/more/compliance.tsx (reference pattern for mobile screen: SafeAreaView, AnimatedScreen, header with back button, FlashList, useQuery, pull-to-refresh, skeletons, error state)
@apps/mobile/app/(owner)/more/index.tsx (More menu with SECTIONS array -- add new rows here)
@packages/api-client/src/owner.ts (ownerApi object -- add new methods here)
@apps/web/prisma/schema.prisma (FuelRecord model: id, tenantId, truckId, fuelType, quantity, unitCost, totalCost, odometer, location, timestamp, etc.)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create mobile API endpoints for profit predictor and fuel</name>
  <files>
    apps/web/src/app/api/mobile/owner/profit-predictor/route.ts
    apps/web/src/app/api/mobile/owner/fuel/route.ts
    packages/api-client/src/owner.ts
  </files>
  <action>
**1. Profit Predictor API** (`apps/web/src/app/api/mobile/owner/profit-predictor/route.ts`):
- Create a POST handler following the same pattern as the compliance route: `validateMobileToken`, check role is OWNER, `applyRateLimit`, then `prisma.$transaction` with `bypass_rls`.
- Accept JSON body: `{ origin: string, destination: string, distanceMiles: number, offeredRate: number }`
- Port the logic from `apps/web/src/app/(owner)/actions/profit-predictor.ts` into the route:
  - Import `getLaneAnalytics` from `@/app/(owner)/actions/lane-analytics` and `getFleetAverageCostPerMile` from `@/app/(owner)/actions/route-analytics`.
  - IMPORTANT: These server actions call `requireRole` internally which uses cookie-based auth. Since the mobile API uses Bearer token auth, you need to replicate the actual DB query logic directly in the route handler instead of calling those server actions. Look at what `getLaneAnalytics` and `getFleetAverageCostPerMile` do under the hood and replicate the relevant queries using Prisma within the bypass_rls transaction.
  - Alternatively, if those functions only need tenantId context, you can check if `tenantRawQuery` works within the transaction context. If not, write the raw SQL directly.
  - Normalize origin/destination to uppercase, find matching lane in historical data (last 365 days), fall back to fleet average cost-per-mile, then compute: predictedExpenses = costPerMile * distanceMiles, predictedProfit = offeredRate - predictedExpenses, marginPercent, recommendation (accept >= 15%, caution 0-14.9%, reject < 0%).
  - Use `Prisma.Decimal` for all money arithmetic (never JS number math for money).
- Return JSON matching the `PredictionResult` interface shape from the server action.

**2. Fuel API** (`apps/web/src/app/api/mobile/owner/fuel/route.ts`):
- GET handler: Query `FuelRecord` for the tenant, join with Truck to get truck make/model/licensePlate. Return most recent 50 records ordered by `timestamp DESC`. Each record: `{ id, truckId, truckName (make + model), licensePlate, quantity (gallons), unitCost, totalCost, odometer, location, timestamp, fuelType }`.
- POST handler: Create a new FuelRecord. Accept body: `{ truckId, quantity, unitCost, odometer, location?, timestamp? }`. Compute `totalCost = quantity * unitCost`. Default `fuelType` to `DIESEL`, `timestamp` to now if not provided. Validate truckId belongs to tenant. Return created record.
- Both handlers follow the same auth/rls/rate-limit pattern as compliance.

**3. API Client** (`packages/api-client/src/owner.ts`):
- Add types: `PredictProfitPayload` (origin, destination, distanceMiles, offeredRate), `PredictProfitResult` (predictedExpenses, predictedProfit, predictedMarginPercent, costPerMileUsed, dataSource, laneRouteCount, offeredRate, distanceMiles, recommendation).
- Add type: `FuelEntry` (id, truckId, truckName, licensePlate, quantity, unitCost, totalCost, odometer, location, timestamp, fuelType).
- Add type: `CreateFuelEntryPayload` (truckId, quantity, unitCost, odometer, location?, timestamp?).
- Add to `ownerApi` object:
  - `predictProfit: (token, payload) => apiRequest<PredictProfitResult>('/api/mobile/owner/profit-predictor', { method: 'POST', token, body: JSON.stringify(payload) })`
  - `getFuelLog: (token) => apiRequest<{ entries: FuelEntry[] }>('/api/mobile/owner/fuel', { token })`
  - `createFuelEntry: (token, payload) => apiRequest<{ entry: FuelEntry }>('/api/mobile/owner/fuel', { method: 'POST', token, body: JSON.stringify(payload) })`
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` to verify API routes compile. Run `cd packages/api-client && npx tsc --noEmit` to verify client types compile.
  </verify>
  <done>
POST /api/mobile/owner/profit-predictor accepts load details and returns prediction with profit, margin, recommendation. GET /api/mobile/owner/fuel returns fuel entries. POST /api/mobile/owner/fuel creates a fuel entry. All three are typed in api-client.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Profit Predictor and Fuel Log mobile screens with More menu entries</name>
  <files>
    apps/mobile/app/(owner)/more/profit-predictor.tsx
    apps/mobile/app/(owner)/more/fuel.tsx
    apps/mobile/app/(owner)/more/index.tsx
    apps/mobile/components/skeletons/FuelRowSkeleton.tsx
  </files>
  <action>
**1. Profit Predictor Screen** (`apps/mobile/app/(owner)/more/profit-predictor.tsx`):
- Follow the compliance screen pattern: SafeAreaView (bg-slate-950), AnimatedScreen, header with back button + title "Profit Predictor".
- Input form inside a ScrollView:
  - TextInput for Origin (placeholder "e.g. Chicago, IL")
  - TextInput for Destination (placeholder "e.g. Dallas, TX")
  - TextInput for Distance (keyboardType="numeric", placeholder "Miles")
  - TextInput for Offered Rate (keyboardType="numeric", placeholder "$ Rate")
  - Style TextInputs: bg-slate-800, border border-slate-700, rounded-xl, text-slate-100, placeholder text-slate-500, px-4, py-3.5, text-[15px]
  - Group into labeled pairs with a small label text above each (text-slate-400, text-xs, font-semibold, uppercase, tracking-wide, mb-1.5)
- "Predict" button: bg-sky-500 rounded-xl py-3.5, full width, text-white font-semibold text-[15px], disabled state with opacity-50 while loading
- Use `useMutation` from @tanstack/react-query calling `ownerApi.predictProfit(token!, { origin, destination, distanceMiles: parseFloat(distance), offeredRate: parseFloat(rate) })`
- Result display (shown after successful prediction):
  - Recommendation banner at top: rounded-xl, full width, with icon and text. Colors: accept = green (bg: rgba(34,197,94,0.12), border: #22c55e30, text: #22c55e), caution = amber (bg: rgba(245,158,11,0.12), border: #f59e0b30, text: #f59e0b), reject = red (bg: rgba(239,68,68,0.12), border: #ef444430, text: #ef4444). Use CheckCircle/AlertTriangle/XCircle from lucide-react-native.
  - 2x2 stat grid below (same StatCard pattern as compliance screen): Offered Rate, Predicted Expenses (red text), Predicted Profit (green if positive, red if negative), Margin % (colored by recommendation).
  - Data source note at bottom: rounded-xl bg-slate-800 border-slate-700, text explaining where cost-per-mile came from.
- Error handling: show error text in red below the form if mutation fails.
- Import `useAuthContext` for token, `ownerApi` and types from `@drivecommand/api-client`.

**2. Fuel Log Screen** (`apps/mobile/app/(owner)/more/fuel.tsx`):
- Follow compliance screen pattern closely: SafeAreaView, AnimatedScreen, header, FlashList, pull-to-refresh, skeletons, error/empty states.
- `useQuery` with key `['owner-fuel-log']` calling `ownerApi.getFuelLog(token!)`.
- Each fuel entry row: mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5.
  - Left side: date (formatted as MMM DD), truck name below in smaller text
  - Right side: gallons + total cost, location below in smaller text
  - Use Intl.DateTimeFormat for date formatting, format currency with $ prefix.
- Empty state: Fuel icon (from lucide-react-native), "No fuel entries yet", subtitle text.
- FAB (Floating Action Button): Position absolute, bottom-right (bottom: 24, right: 16), w-14 h-14, rounded-full, bg-sky-500, shadow, Plus icon. On press, open a bottom sheet / modal.
- Bottom sheet for adding fuel entry (use React Native Modal with slide-from-bottom animation):
  - Title "Add Fuel Entry"
  - Truck picker: use `ownerApi.getTrucks(token!)` query to load trucks. Display as a scrollable horizontal list of pressable chips or a simple picker. Show truck make/model/plate. Selected = bg-sky-500, unselected = bg-slate-700.
  - TextInput fields: Gallons (numeric), Cost per Gallon (numeric), Odometer (numeric), Location/State (text), Date (default to today, text input with YYYY-MM-DD format).
  - "Save" button: bg-sky-500 full width rounded-xl py-3.5. Use `useMutation` calling `ownerApi.createFuelEntry`. On success, close modal and `refetch()` the fuel log query. Invalidate query cache.
  - "Cancel" link/button to close modal.
  - Style modal: bg-slate-900, rounded-t-2xl, px-4 pt-6 pb-8.

**3. FuelRowSkeleton** (`apps/mobile/components/skeletons/FuelRowSkeleton.tsx`):
- Follow existing skeleton pattern (e.g., ComplianceRowSkeleton). Animated opacity pulse. Shape: rounded-xl, h-[72], mx-4, mb-3, bg-slate-800.

**4. More Menu** (`apps/mobile/app/(owner)/more/index.tsx`):
- Import `TrendingUp` and `Fuel` (or `Droplets`) from lucide-react-native.
- Add to BUSINESS section rows array (after "AI Documents"):
  - `{ label: 'Profit Predictor', subtitle: 'Load profitability', Icon: TrendingUp, iconBg: 'rgba(16,185,129,0.15)', iconColor: '#10b981', route: '/(owner)/more/profit-predictor' }`
- Add new FLEET section row (after "Compliance"):
  - `{ label: 'Fuel Log', subtitle: 'Fill-ups & costs', Icon: Droplets, iconBg: 'rgba(251,146,60,0.15)', iconColor: '#fb923c', route: '/(owner)/more/fuel' }`
  </action>
  <verify>
Run `cd apps/mobile && npx tsc --noEmit` to verify mobile screens compile. Visually verify the More menu shows both new entries. Open each screen to confirm it renders without crash.
  </verify>
  <done>
Profit Predictor screen shows input form, calls API on submit, displays colored recommendation banner with profit/margin stats. Fuel Log screen shows list of fuel entries with pull-to-refresh, FAB opens bottom sheet to add new entries with truck picker. Both screens appear in the More menu.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` -- no type errors in API routes
2. `cd packages/api-client && npx tsc --noEmit` -- no type errors in client
3. `cd apps/mobile && npx tsc --noEmit` -- no type errors in mobile screens
4. More menu shows "Profit Predictor" and "Fuel Log" entries
5. Profit Predictor screen: enter origin/destination/distance/rate, tap Predict, see result with recommendation banner and stat cards
6. Fuel Log screen: see list of fuel entries (or empty state), tap FAB, fill out form, save, see new entry in list
</verification>

<success_criteria>
- Owner can navigate to Profit Predictor from More menu, enter load details, and receive accept/caution/reject recommendation with profit and margin numbers
- Owner can navigate to Fuel Log from More menu, view recent fuel entries, and add new entries via bottom sheet
- All money arithmetic uses Decimal (not JS number) on the server side
- Both screens follow the existing dark-themed mobile design language (slate-950 bg, slate-800 cards, sky-500 accent)
- No TypeScript errors across web, api-client, and mobile packages
</success_criteria>

<output>
After completion, create `.planning/quick/142-mobile-owner-portal-add-profit-predictor/142-SUMMARY.md`
</output>
