---
phase: quick-17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/integrations/samsara.ts
  - src/app/api/integrations/samsara/sync/route.ts
  - src/app/(owner)/settings/integrations/integrations-manager.tsx
  - src/app/(owner)/actions/integrations.ts
autonomous: true
must_haves:
  truths:
    - "Owner can enter Samsara API token in integrations settings"
    - "API endpoint fetches vehicle locations from Samsara and writes GPSLocation records"
    - "Live map displays real GPS data from Samsara after sync runs"
    - "Credentials stored encrypted in TenantIntegration.configJson"
  artifacts:
    - path: "src/lib/integrations/samsara.ts"
      provides: "Samsara API client with vehicle location fetching and VIN-based truck matching"
    - path: "src/app/api/integrations/samsara/sync/route.ts"
      provides: "POST endpoint that triggers Samsara GPS sync for a tenant"
    - path: "src/app/(owner)/settings/integrations/integrations-manager.tsx"
      provides: "API token input UI for Samsara integration"
    - path: "src/app/(owner)/actions/integrations.ts"
      provides: "Server action to save integration config/credentials"
  key_links:
    - from: "src/app/api/integrations/samsara/sync/route.ts"
      to: "src/lib/integrations/samsara.ts"
      via: "imports fetchSamsaraLocations"
    - from: "src/lib/integrations/samsara.ts"
      to: "prisma GPSLocation"
      via: "creates GPSLocation records matched by VIN to truckId"
    - from: "integrations-manager.tsx"
      to: "src/app/(owner)/actions/integrations.ts"
      via: "saveIntegrationConfig server action"
---

<objective>
Wire up real Samsara GPS provider integration so the live map displays actual telematics data instead of seeded demo data.

Purpose: Replace mock GPS data with real vehicle locations from Samsara (or similar ELD provider), making the live map production-ready for fleet owners who use Samsara hardware.

Output: Samsara API client library, sync API endpoint, and settings UI for API token entry. Live map automatically shows real data once sync runs.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@prisma/schema.prisma (GPSLocation model lines 340-355, TenantIntegration model lines 752-765, Truck model lines 158-178)
@src/app/(owner)/live-map/actions.ts (getLatestVehicleLocations — existing query, no changes needed)
@src/app/(owner)/settings/integrations/integrations-manager.tsx (current UI — needs API key input)
@src/app/(owner)/actions/integrations.ts (toggleIntegration — needs saveIntegrationConfig)
@src/lib/maps/vehicle-status.ts (status logic — no changes needed)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Samsara API client and sync endpoint</name>
  <files>
    src/lib/integrations/samsara.ts
    src/app/api/integrations/samsara/sync/route.ts
  </files>
  <action>
Create `src/lib/integrations/samsara.ts` with:

1. **fetchSamsaraLocations(apiToken: string)** — calls Samsara Fleet API `GET https://api.samsara.com/fleet/vehicles/locations` with `Authorization: Bearer {apiToken}` header. Returns array of `{ id, name, vin, location: { latitude, longitude, speed, heading, time } }`. Handle pagination if Samsara returns `pagination.hasNextPage`. Parse response per Samsara v1 API docs (the `/fleet/vehicles/locations` endpoint returns `data[]` with each vehicle having `id`, `name`, `vin`, and `location` object containing `latitude`, `longitude`, `speedMilesPerHour`, `heading`, `time`).

2. **syncSamsaraLocations(tenantId: string, apiToken: string)** — orchestrates the full sync:
   - Call fetchSamsaraLocations to get all vehicle positions
   - Load all Trucks for the tenant (using RLS-bypassed prisma since this runs from API route, use `prismaAdmin` or inline `SET app.tenant_id` pattern)
   - Match Samsara vehicles to Truck records by VIN (normalize both: trim + uppercase). Log warnings for unmatched vehicles.
   - For each matched vehicle, create a GPSLocation record: `{ tenantId, truckId, latitude, longitude, speed (convert speedMilesPerHour to Int), heading (Int), timestamp (parse ISO time from Samsara) }`. Use `createMany` for bulk insert efficiency.
   - Return `{ synced: number, unmatched: string[] }` summary.

Create `src/app/api/integrations/samsara/sync/route.ts` as a POST endpoint:
- Accept `{ tenantId }` in request body (for cron/webhook use) OR derive tenantId from session (for manual trigger).
- Look up the TenantIntegration row for provider=SAMSARA where enabled=true for that tenant. Extract apiToken from `configJson.apiToken`.
- If no enabled Samsara integration found, return 404 `{ error: "Samsara integration not enabled" }`.
- Call syncSamsaraLocations and return the result as JSON.
- Wrap in try/catch — return 500 with error message on failure.
- This endpoint does NOT require browser session auth (designed to be called by cron). Instead, protect with a simple `Authorization: Bearer {CRON_SECRET}` header check using `process.env.CRON_SECRET`. If no CRON_SECRET env var is set, fall back to requiring a valid user session via `requireRole([OWNER])`.

Do NOT use any external Samsara SDK — use plain fetch() calls. The Samsara REST API is simple enough for direct HTTP.
  </action>
  <verify>
TypeScript compiles: `npx tsc --noEmit src/lib/integrations/samsara.ts src/app/api/integrations/samsara/sync/route.ts` (or full project `npx tsc --noEmit`).
Manually verify the API route file exports a POST function.
  </verify>
  <done>
Samsara client library fetches vehicle locations via REST API and writes GPSLocation records matched by VIN. Sync endpoint callable via POST with tenant context. Unmatched vehicles logged but do not block sync.
  </done>
</task>

<task type="auto">
  <name>Task 2: Settings UI for API token and save config action</name>
  <files>
    src/app/(owner)/actions/integrations.ts
    src/app/(owner)/settings/integrations/integrations-manager.tsx
  </files>
  <action>
**In `src/app/(owner)/actions/integrations.ts`**, add a new server action:

`saveIntegrationConfig(provider: IntegrationProvider, configJson: Record<string, string>)`:
- Requires OWNER role (not MANAGER — API keys are sensitive).
- Gets tenantId, then updates the TenantIntegration row for that tenant+provider, setting `configJson` to the provided object and `enabled` to true.
- Uses upsert pattern (same as toggleIntegration) with the category looked up from a provider-to-category map.
- Revalidates `/settings/integrations`.
- Returns `{ success: true }` or `{ error: string }`.

**In `src/app/(owner)/settings/integrations/integrations-manager.tsx`**, update the Samsara card:

1. Change Samsara's `comingSoon` from `true` to `false` in the CATALOG array.
2. When Samsara is enabled (switch is on), show an expandable section below the card with:
   - A password-type input for "API Token" with placeholder "Enter your Samsara API token"
   - A "Save" button that calls `saveIntegrationConfig('SAMSARA', { apiToken: value })`
   - A "Sync Now" button that calls `POST /api/integrations/samsara/sync` (with tenantId from a hidden approach — actually just call it without tenantId and let the endpoint derive from session)
   - Show toast on success/failure for both save and sync
3. If `configJson` already has an `apiToken`, show a masked display ("*****...last4") with an "Edit" button to reveal the input.
4. Keep KeepTruckin as `comingSoon: true` (future work).

Update the Props type to include `configMap?: Record<string, any>` so the parent page can pass down configJson values from the TenantIntegration rows. Update the settings page to pass this data.

Use existing UI components: Input from `@/components/ui/input`, Button from `@/components/ui/button`.
  </action>
  <verify>
Run `npx tsc --noEmit` to verify full project compiles. Visit `/settings/integrations` in browser — Samsara card should show switch (not "Coming Soon" badge). Toggle on should reveal API token input field.
  </verify>
  <done>
Owner can enter and save Samsara API token from integrations settings page. Token stored in TenantIntegration.configJson. "Sync Now" button triggers manual GPS data pull. Samsara card no longer shows "Coming Soon".
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Samsara integration card in settings is interactive (not "Coming Soon")
3. Saving an API token persists to TenantIntegration.configJson
4. Sync endpoint returns expected shape when called with valid tenant
5. GPSLocation records created after sync match existing schema (latitude/longitude as Decimal, speed/heading as Int)
6. Live map page works unchanged — getLatestVehicleLocations query picks up Samsara-synced records automatically
</verification>

<success_criteria>
- Samsara API client fetches real vehicle locations via REST
- VIN-based matching connects Samsara vehicles to DriveCommand trucks
- GPSLocation records written in correct schema format
- Settings UI allows token entry, save, and manual sync trigger
- Live map displays Samsara data with no code changes to map components
- No regressions to existing seed-data-based map functionality
</success_criteria>

<output>
After completion, create `.planning/quick/17-wire-up-real-gps-provider-integration-to/17-SUMMARY.md`
</output>
