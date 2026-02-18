---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/profit-predictor.ts
  - src/components/profit-predictor/profit-predictor-form.tsx
  - src/app/(owner)/profit-predictor/page.tsx
  - src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "User can enter origin, destination, distance, and offered rate"
    - "System shows predicted expenses based on historical cost-per-mile for that exact lane (or fleet average as fallback)"
    - "System shows predicted profit, margin percentage, and a clear go/no-go indicator"
    - "When a matching lane exists in historical data, lane-specific cost-per-mile is used and labeled"
    - "When no lane history exists, fleet average cost-per-mile is used with a notice"
    - "Profit predictor is accessible from the sidebar under Intelligence"
  artifacts:
    - path: "src/app/(owner)/actions/profit-predictor.ts"
      provides: "Server action: predictLoadProfitability"
      exports: ["predictLoadProfitability", "PredictionInput", "PredictionResult"]
    - path: "src/components/profit-predictor/profit-predictor-form.tsx"
      provides: "Client form with real-time result display"
    - path: "src/app/(owner)/profit-predictor/page.tsx"
      provides: "Page wrapper with auth guard"
  key_links:
    - from: "src/components/profit-predictor/profit-predictor-form.tsx"
      to: "src/app/(owner)/actions/profit-predictor.ts"
      via: "server action call on form submit"
      pattern: "predictLoadProfitability"
    - from: "src/app/(owner)/actions/profit-predictor.ts"
      to: "src/app/(owner)/actions/lane-analytics.ts"
      via: "getLaneAnalytics to find lane match"
      pattern: "getLaneAnalytics"
    - from: "src/app/(owner)/actions/profit-predictor.ts"
      to: "src/app/(owner)/actions/route-analytics.ts"
      via: "getFleetAverageCostPerMile as fallback"
      pattern: "getFleetAverageCostPerMile"
---

<objective>
Build the AI Profit Predictor — a form-based analytical tool that estimates load profitability before accepting a job. User inputs origin, destination, distance (miles), and offered rate; the system queries historical lane data to find cost-per-mile for that exact lane (or falls back to fleet average), then calculates predicted expenses, profit, and margin.

Purpose: Help dispatchers make data-driven accept/reject decisions on loads before committing.
Output: Server action + client form component + page route + sidebar nav link.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(owner)/actions/lane-analytics.ts
@src/app/(owner)/actions/route-analytics.ts
@src/lib/finance/route-calculator.ts
@src/components/lanes/lane-summary-cards.tsx
@src/components/navigation/sidebar.tsx
@src/app/(owner)/lane-analytics/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create profit prediction server action</name>
  <files>src/app/(owner)/actions/profit-predictor.ts</files>
  <action>
Create `src/app/(owner)/actions/profit-predictor.ts` as a 'use server' module.

Export interfaces:
```ts
export interface PredictionInput {
  origin: string;          // User-entered origin (normalized internally)
  destination: string;     // User-entered destination (normalized internally)
  distanceMiles: number;   // Miles for this load
  offeredRate: number;     // Payment offered (dollars)
}

export interface PredictionResult {
  predictedExpenses: string;          // Decimal string, 2dp
  predictedProfit: string;            // Decimal string, 2dp (offeredRate - predictedExpenses)
  predictedMarginPercent: number;     // (profit / offeredRate) * 100, 0 if rate=0
  costPerMileUsed: string;            // Decimal string, 2dp
  dataSource: 'lane' | 'fleet' | 'none';  // Where cost-per-mile came from
  laneRouteCount: number | null;      // How many historical routes for matched lane
  offeredRate: string;                // Echo back for display
  distanceMiles: number;              // Echo back for display
  recommendation: 'accept' | 'caution' | 'reject';  // accept: margin>=15%, caution: 0-14.9%, reject: <0%
}
```

Export async function `predictLoadProfitability(input: PredictionInput): Promise<PredictionResult>`:

1. `await requireRole([UserRole.OWNER, UserRole.MANAGER])` — OWNER/MANAGER only.

2. Normalize origin and destination: `input.origin.trim().toUpperCase()` and `input.destination.trim().toUpperCase()`.

3. Call `getLaneAnalytics(365)` (1 year of history for maximum lane coverage). Find a matching lane where `lane.origin === normalizedOrigin && lane.destination === normalizedDestination`. If found and `lane.profitPerMile !== null`, use that lane's cost-per-mile via: expense cost-per-mile = totalExpenses / totalMiles. Compute it as: `new Decimal(lane.totalExpenses).div(new Decimal(lane.totalMiles!)).toDecimalPlaces(2)`. Set `dataSource = 'lane'`, `laneRouteCount = lane.routeCount`.

4. If no lane match or lane has no mileage data: call `getFleetAverageCostPerMile()`. If it returns a non-null costPerMile, use it. Set `dataSource = 'fleet'`, `laneRouteCount = null`.

5. If still no cost data: set `dataSource = 'none'`, set costPerMileUsed to `'0.00'`. In this case, return prediction with all zeros and recommendation `'caution'`.

6. Compute predicted expenses using Decimal.js (NEVER use JS number arithmetic for money):
   ```ts
   const Decimal = Prisma.Decimal;
   const costPerMile = new Decimal(costPerMileUsed);
   const predictedExpenses = costPerMile.mul(new Decimal(input.distanceMiles)).toDecimalPlaces(2);
   const rate = new Decimal(input.offeredRate);
   const predictedProfit = rate.sub(predictedExpenses).toDecimalPlaces(2);
   const predictedMarginPercent = rate.isZero()
     ? 0
     : predictedProfit.div(rate).mul(100).toDecimalPlaces(1).toNumber();
   ```

7. Determine recommendation:
   - `predictedMarginPercent >= 15` → `'accept'`
   - `predictedMarginPercent >= 0` → `'caution'`
   - else → `'reject'`

8. Return the full `PredictionResult` with all fields as strings (`.toFixed(2)` for money decimals).

Import pattern: `import { Prisma } from '@/generated/prisma'` for `Prisma.Decimal`. Import `getLaneAnalytics` from `@/app/(owner)/actions/lane-analytics`. Import `getFleetAverageCostPerMile` from `@/app/(owner)/actions/route-analytics`. Import `requireRole` from `@/lib/auth/server` and `UserRole` from `@/lib/auth/roles`.

Note: getLaneAnalytics internally calls requireRole — that's fine, call it anyway; the outer requireRole is belt-and-suspenders.
  </action>
  <verify>TypeScript: `npx tsc --noEmit` passes with no errors in this file.</verify>
  <done>predictLoadProfitability server action exists, compiles, correctly resolves lane vs fleet cost-per-mile, uses Decimal.js exclusively for all money math, returns typed PredictionResult.</done>
</task>

<task type="auto">
  <name>Task 2: Build prediction form component and page + sidebar link</name>
  <files>
    src/components/profit-predictor/profit-predictor-form.tsx
    src/app/(owner)/profit-predictor/page.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
**A. Create `src/components/profit-predictor/profit-predictor-form.tsx`** — `'use client'` component.

State: `origin`, `destination`, `distanceMiles` (string, validated to number on submit), `offeredRate` (string, validated to number), `result: PredictionResult | null`, `loading: boolean`, `error: string | null`.

Form fields (Tailwind styling matching existing card/form patterns from lane-analytics page):
- Origin text input (placeholder: "e.g. Chicago, IL")
- Destination text input (placeholder: "e.g. Dallas, TX")
- Distance input (type="number", min="1", placeholder: "e.g. 850")
- Offered Rate input (type="number", min="0", step="0.01", placeholder: "e.g. 2500.00")
- Submit button "Predict Profitability" — disabled during loading

On submit: validate all fields are non-empty and numeric values > 0, then call `predictLoadProfitability({ origin, destination, distanceMiles: parseFloat(distanceMiles), offeredRate: parseFloat(offeredRate) })`. Set result on success.

Result display section (render below form when `result !== null`):

1. **Recommendation banner** — full-width colored banner:
   - `accept`: green background — "Recommended: Accept Load" with checkmark
   - `caution`: amber/yellow — "Proceed with Caution" with warning icon
   - `reject`: red — "Not Recommended: Low/Negative Margin" with X icon

2. **Stats grid** (2x2 on mobile, 4 cols on md+):
   - Offered Rate: format as `$X,XXX.XX`
   - Predicted Expenses: format as currency, red text
   - Predicted Profit: format as currency, green if positive / red if negative
   - Margin: `XX.X%`, colored by recommendation

3. **Data source notice** — small text below grid:
   - `lane`: "Based on {laneRouteCount} historical routes on {origin} → {destination}"
   - `fleet`: "No lane history found — using fleet average cost-per-mile"
   - `none`: "No historical data available — enter expenses manually"

4. **Key stat callout**: "Cost per mile used: $X.XX/mi" — muted text

Currency formatting helper: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(value))` — same pattern as lane-summary-cards.tsx.

Import `predictLoadProfitability` and `PredictionResult` from `@/app/(owner)/actions/profit-predictor`.

---

**B. Create `src/app/(owner)/profit-predictor/page.tsx`** — server component.

```tsx
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { ProfitPredictorForm } from '@/components/profit-predictor/profit-predictor-form';

export const fetchCache = 'force-no-store';

export default async function ProfitPredictorPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profit Predictor</h1>
        <p className="text-muted-foreground mt-1">
          Estimate load profitability before accepting — based on historical lane data and fleet cost averages
        </p>
      </div>
      <ProfitPredictorForm />
    </div>
  );
}
```

---

**C. Update `src/components/navigation/sidebar.tsx`** — add profit predictor nav item.

In the Intelligence section (where `/lane-analytics` and `/compliance` links are), add a new `SidebarMenuItem` for Profit Predictor. Insert it after the Lane Profitability item:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    isActive={pathname.startsWith("/profit-predictor")}
    tooltip="Profit Predictor"
  >
    <Link href="/profit-predictor">
      <Calculator />
      <span>Profit Predictor</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Add `Calculator` to the lucide-react import at the top of the file (it's already imported with other icons — just add `Calculator` to the destructured list).
  </action>
  <verify>
1. `npx tsc --noEmit` passes with no errors.
2. Dev server starts without errors: `npm run dev`.
3. Visit http://localhost:3000/profit-predictor — page loads with form.
4. Enter "Chicago, IL", "Dallas, TX", "850", "2200" and submit — result section appears with recommendation, stats grid, and data source notice.
5. Sidebar shows "Profit Predictor" link under Intelligence section.
  </verify>
  <done>
Form renders and accepts input. Submitting calls server action and displays: recommendation banner (accept/caution/reject), predicted expenses, profit, margin, cost-per-mile used, and data source label. Sidebar link navigates to /profit-predictor. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (no type errors)
- `/profit-predictor` page loads for OWNER/MANAGER roles
- Form with 4 inputs submits successfully and shows result panel
- Result shows correct lane-specific or fleet-average cost-per-mile with labeled data source
- Recommendation banner is green/amber/red based on margin thresholds (15% / 0%)
- All money calculations use Decimal.js (no `parseFloat` arithmetic, only display formatting)
- Sidebar Intelligence section includes Profit Predictor link with Calculator icon
</verification>

<success_criteria>
User can enter origin, destination, distance, and rate on the Profit Predictor page and see: predicted expenses (from lane history or fleet average), predicted profit, margin percentage, and a clear accept/caution/reject recommendation — all computed server-side using Decimal.js with full lane-history context.
</success_criteria>

<output>
After completion, create `.planning/quick/13-build-ai-profit-predictor/13-SUMMARY.md` using the summary template.
</output>
