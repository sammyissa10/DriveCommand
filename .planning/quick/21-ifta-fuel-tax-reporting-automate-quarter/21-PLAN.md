---
phase: quick-21
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/geo/state-lookup.ts
  - src/app/(owner)/actions/ifta.ts
  - src/app/(owner)/ifta/page.tsx
  - src/components/ifta/ifta-report-table.tsx
  - src/components/ifta/ifta-quarter-selector.tsx
  - src/components/navigation/sidebar.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can navigate to /ifta page from sidebar"
    - "Owner can select a quarter+year and see IFTA report data"
    - "Report shows miles driven per US state derived from GPS records"
    - "Report shows fuel gallons purchased per state derived from FuelRecord lat/lng"
    - "Owner can download a CSV of the IFTA quarterly report"
  artifacts:
    - path: "src/lib/geo/state-lookup.ts"
      provides: "Point-in-polygon US state detection from lat/lng"
    - path: "src/app/(owner)/actions/ifta.ts"
      provides: "Server action to compute IFTA report data"
      exports: ["getIFTAReport"]
    - path: "src/app/(owner)/ifta/page.tsx"
      provides: "IFTA reporting page with quarter selector"
    - path: "src/components/ifta/ifta-report-table.tsx"
      provides: "Table displaying miles, gallons, and net per state"
    - path: "src/components/ifta/ifta-quarter-selector.tsx"
      provides: "Quarter + year selector with generate button"
  key_links:
    - from: "src/app/(owner)/ifta/page.tsx"
      to: "src/app/(owner)/actions/ifta.ts"
      via: "server action call with quarter/year params"
      pattern: "getIFTAReport"
    - from: "src/app/(owner)/actions/ifta.ts"
      to: "src/lib/geo/state-lookup.ts"
      via: "getStateFromCoordinates for GPS and fuel records"
      pattern: "getStateFromCoordinates"
---

<objective>
Build IFTA fuel tax reporting page that automates quarterly IFTA reports by calculating miles driven per US state from GPSLocation records and fuel purchased per state from FuelRecord records, with CSV download.

Purpose: Fleet owners need IFTA quarterly reports for tax compliance. Currently they must manually calculate miles per state and cross-reference fuel purchases -- this automates it from existing GPS and fuel data.

Output: /ifta page with quarter selector, state-by-state mileage + fuel table, and CSV export.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@prisma/schema.prisma (GPSLocation model lines 340-355, FuelRecord model lines 394-418)
@src/app/(owner)/compliance/page.tsx (page pattern reference)
@src/app/(owner)/actions/lane-analytics.ts (server action pattern reference)
@src/components/navigation/sidebar.tsx (sidebar nav pattern)
</context>

<tasks>

<task type="auto">
  <name>Task 1: State lookup utility and IFTA server action</name>
  <files>
    src/lib/geo/state-lookup.ts
    src/app/(owner)/actions/ifta.ts
  </files>
  <action>
**src/lib/geo/state-lookup.ts:**
Create a lightweight point-in-bounding-box US state lookup function. Use a hardcoded array of US state bounding boxes (simplified rectangles for all 48 contiguous states + DC). Each entry: { code: string, name: string, minLat, maxLat, minLng, maxLng }. Export `getStateFromCoordinates(lat: number, lng: number): string | null` that returns 2-letter state code or null. This is intentionally approximate (bounding boxes, not polygons) since IFTA just needs reasonable state attribution from GPS pings -- perfect accuracy is not required for quarterly reporting. For overlapping bounding boxes (border areas), pick the first match (order states by area ascending so smaller states match first).

Also export `US_STATES: Record<string, string>` mapping code to full name (e.g., { AL: 'Alabama', ... }).

**src/app/(owner)/actions/ifta.ts:**
Create server action `getIFTAReport(quarter: 1|2|3|4, year: number)` following the existing pattern (requireRole with OWNER/MANAGER, withTenantRLS).

Logic:
1. Calculate date range from quarter+year (Q1=Jan1-Mar31, etc.)
2. Query GPSLocation records for tenant within date range. For consecutive GPS pings on the same truck, calculate distance between points using Haversine formula (export a `haversineDistance(lat1, lng1, lat2, lng2): number` helper returning miles). Attribute each segment's distance to the state of the starting point using getStateFromCoordinates.
3. Query FuelRecord records for tenant within date range. For each record, determine state from latitude/longitude using getStateFromCoordinates (FuelRecord has lat/lng fields but NO state field). If lat/lng is null, try to parse state from the `location` string field (look for 2-letter state code pattern). If still unknown, bucket as "UNKNOWN".
4. Aggregate: per state -> { stateCode, stateName, milesDriven (number), fuelGallons (number using parseFloat on Decimal) }
5. Return sorted by stateCode alphabetically. Include a `totals` object with total miles and total gallons.

Also create `generateIFTACSV(data: IFTAReportRow[], totals, quarter, year): string` that returns CSV content with headers: State,State Name,Miles Driven,Fuel Gallons Purchased. Include totals row at bottom.

Export types: `IFTAReportRow`, `IFTAReportData`.
  </action>
  <verify>
    TypeScript compiles: `npx tsc --noEmit src/lib/geo/state-lookup.ts src/app/(owner)/actions/ifta.ts` (or full project build `npm run build` if individual file check not supported).
  </verify>
  <done>
    getStateFromCoordinates returns correct state codes for known coordinates (e.g., 40.7128,-74.0060 -> NY). getIFTAReport returns aggregated miles and fuel per state for a given quarter. generateIFTACSV produces valid CSV string.
  </done>
</task>

<task type="auto">
  <name>Task 2: IFTA page UI with quarter selector, report table, and CSV download</name>
  <files>
    src/app/(owner)/ifta/page.tsx
    src/components/ifta/ifta-quarter-selector.tsx
    src/components/ifta/ifta-report-table.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
**src/components/ifta/ifta-quarter-selector.tsx:**
"use client" component. Props: currentQuarter, currentYear, onGenerate callback. Render a row with:
- Year select dropdown (current year and previous 2 years)
- Quarter select (Q1/Q2/Q3/Q4) with month ranges shown (e.g., "Q1 (Jan-Mar)")
- Default to current quarter based on today's date
- "Generate Report" button that calls onGenerate(quarter, year)
Use shadcn Select and Button components.

**src/components/ifta/ifta-report-table.tsx:**
"use client" component. Props: data (IFTAReportRow[]), totals, quarter, year, csvContent. Render:
- Summary cards row: Total States, Total Miles, Total Gallons (use Card from shadcn)
- Table with columns: State | State Name | Miles Driven | Fuel Purchased (gal) — use shadcn Table
- Miles and gallons formatted with toLocaleString (commas, 1 decimal)
- States with 0 miles AND 0 gallons should be omitted
- "Download CSV" button that creates a Blob from csvContent and triggers download as `ifta-{year}-q{quarter}.csv`

**src/app/(owner)/ifta/page.tsx:**
Server component page. Pattern: same as compliance/page.tsx.
- requireRole([UserRole.OWNER, UserRole.MANAGER])
- Read quarter/year from searchParams (default to current quarter)
- Call getIFTAReport(quarter, year)
- Call generateIFTACSV for CSV content
- Render page header "IFTA Fuel Tax Report", subtitle "Quarterly miles driven and fuel purchased by state"
- Render IFTAQuarterSelector (use Link-based navigation to update searchParams, same pattern as lane-analytics timeframe selector)
- Render IFTAReportTable with data
- export const fetchCache = 'force-no-store'

**src/components/navigation/sidebar.tsx:**
Add IFTA link in the Intelligence section (after Compliance, before AI Documents). Use `FileSpreadsheet` icon from lucide-react (add to imports). Link to "/ifta", isActive on pathname.startsWith("/ifta"), tooltip "IFTA Reports".
  </action>
  <verify>
    `npm run build` completes without errors. Navigate to /ifta in the app — page renders with quarter selector and empty/populated table depending on data.
  </verify>
  <done>
    /ifta page accessible from sidebar under Intelligence. Quarter selector defaults to current quarter. Table shows miles and fuel by state. CSV download produces correctly formatted file. Page follows existing codebase patterns (requireRole, fetchCache, searchParams).
  </done>
</task>

</tasks>

<verification>
- `npm run build` succeeds with no TypeScript errors
- /ifta page loads for OWNER/MANAGER users
- Quarter selector navigates via searchParams (no client-side state for quarter)
- Report table shows state-by-state data from GPSLocation + FuelRecord
- CSV download produces valid file with correct headers and data
- Sidebar shows IFTA link under Intelligence section
</verification>

<success_criteria>
Fleet owner can visit /ifta, select any quarter/year, see miles driven per state (from GPS data) and fuel purchased per state (from fuel records), and download the report as CSV for IFTA tax filing.
</success_criteria>

<output>
After completion, create `.planning/quick/21-ifta-fuel-tax-reporting-automate-quarter/21-SUMMARY.md`
</output>
