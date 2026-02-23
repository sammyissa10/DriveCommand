---
phase: quick-22
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/integrations/motive.ts
  - src/app/api/integrations/motive/sync/route.ts
  - src/app/(owner)/settings/integrations/integrations-manager.tsx
autonomous: true
must_haves:
  truths:
    - "Motive/KeepTruckin GPS locations sync into GPSLocation table matched by VIN"
    - "Motive integration is configurable from the integrations settings page (API token + enable/disable)"
    - "Manual Sync Now button works for Motive just like Samsara"
  artifacts:
    - path: "src/lib/integrations/motive.ts"
      provides: "Motive GPS sync logic"
      exports: ["fetchMotiveLocations", "syncMotiveLocations"]
    - path: "src/app/api/integrations/motive/sync/route.ts"
      provides: "POST endpoint for Motive GPS sync"
      exports: ["POST"]
    - path: "src/app/(owner)/settings/integrations/integrations-manager.tsx"
      provides: "Motive config panel with token input and sync button"
  key_links:
    - from: "src/lib/integrations/motive.ts"
      to: "prisma.gPSLocation"
      via: "createMany bulk insert"
      pattern: "gPSLocation\\.createMany"
    - from: "src/app/api/integrations/motive/sync/route.ts"
      to: "src/lib/integrations/motive.ts"
      via: "syncMotiveLocations import"
      pattern: "import.*syncMotiveLocations.*from.*motive"
    - from: "integrations-manager.tsx"
      to: "/api/integrations/motive/sync"
      via: "fetch POST on Sync Now click"
      pattern: "fetch.*api/integrations/motive/sync"
---

<objective>
Add Motive (KeepTruckin) as a fully functional second GPS/ELD provider alongside Samsara.

Purpose: Expand ELD provider coverage so fleets using Motive hardware can sync vehicle locations into DriveCommand.
Output: Motive sync library, sync API endpoint, and updated integrations UI with config panel.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/integrations/samsara.ts
@src/app/api/integrations/samsara/sync/route.ts
@src/app/(owner)/settings/integrations/integrations-manager.tsx
@src/app/(owner)/settings/integrations/page.tsx
@src/app/(owner)/actions/integrations.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Motive GPS sync library and API endpoint</name>
  <files>
    src/lib/integrations/motive.ts
    src/app/api/integrations/motive/sync/route.ts
  </files>
  <action>
Create `src/lib/integrations/motive.ts` mirroring the Samsara pattern exactly:

1. Define TypeScript interfaces for Motive API response:
   - `MotiveVehicle` with fields: `id` (number), `number` (string), `vin` (string), `current_location` object containing `lat`, `lon`, `speed`, `bearing`, `located_at` (ISO string).
   - `MotiveVehiclesResponse` with `vehicles: MotiveVehicle[]` and optional `pagination` with `per_page`, `page_no`, `total`.
   - Export `SyncResult` type (same shape as Samsara: `{ synced: number; unmatched: string[] }`).

2. `fetchMotiveLocations(apiToken: string): Promise<MotiveVehicle[]>`:
   - Base URL: `https://api.keeptruckin.com/v1/vehicles`
   - Query param: `per_page=100`
   - Auth header: `Authorization: Bearer ${apiToken}`
   - Handle pagination: if response has more pages (`total > page_no * per_page`), increment `page_no` and fetch again.
   - On non-OK response, throw `Error` with status and body text (same pattern as Samsara).

3. `syncMotiveLocations(tenantId: string, apiToken: string): Promise<SyncResult>`:
   - Fetch vehicles from Motive API.
   - Load tenant trucks via `prisma.$transaction` with `set_config('app.current_tenant_id', ...)` (identical RLS bypass pattern as Samsara).
   - Build VIN lookup map (normalized: trim + uppercase).
   - For each Motive vehicle with `vin` and `current_location`, match to truck by VIN.
   - Map fields: `lat` -> `latitude`, `lon` -> `longitude`, `speed` (already mph) -> round to integer, `bearing` -> `heading` (round to integer), `located_at` -> `timestamp` as Date.
   - Bulk insert matched records into `gPSLocation` via `createMany` in a transaction with RLS bypass.
   - Return `{ synced, unmatched }`.

Then create `src/app/api/integrations/motive/sync/route.ts` — copy the Samsara sync route structure exactly but change:
- Import `syncMotiveLocations` from `@/lib/integrations/motive`
- Query `TenantIntegration` where `provider: 'KEEP_TRUCKIN'` (this is the enum value for Motive)
- Error messages say "Motive" instead of "Samsara"
- Console error prefix: `[Motive Sync]`
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors in the new files. Verify both files exist and export the expected functions.
  </verify>
  <done>
`src/lib/integrations/motive.ts` exports `fetchMotiveLocations` and `syncMotiveLocations`. `src/app/api/integrations/motive/sync/route.ts` exports `POST` handler. Both compile without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Generalize integrations UI to support Motive config panel</name>
  <files>
    src/app/(owner)/settings/integrations/integrations-manager.tsx
  </files>
  <action>
Update `integrations-manager.tsx` to support Motive as a fully configurable ELD provider:

1. In the CATALOG array, update the KeepTruckin entry:
   - Change `name` from `'KeepTruckin'` to `'Motive (KeepTruckin)'`
   - Change `description` to `'Import GPS tracking, HOS logs, and vehicle locations from Motive (formerly KeepTruckin).'`
   - Change `logoPlaceholder` from `'KT'` to `'MO'`
   - Change `comingSoon` from `true` to `false`

2. Generalize the hardcoded Samsara token/sync state to support multiple ELD providers. Refactor the component to use a per-provider state pattern:
   - Create a `type EldProviderKey = 'SAMSARA' | 'KEEP_TRUCKIN'` and a list `const ELD_PROVIDERS: EldProviderKey[] = ['SAMSARA', 'KEEP_TRUCKIN']`.
   - Replace single `samsaraToken`, `isEditingToken`, `isSaving`, `isSyncing` states with a `Record<EldProviderKey, { token: string; isEditing: boolean; isSaving: boolean; isSyncing: boolean }>` state object. Initialize `isEditing` based on whether `configMap[provider]?.apiToken` exists.
   - Update `handleSaveToken` to accept a provider parameter: calls `saveIntegrationConfig(provider, { apiToken })`. Toast says provider name.
   - Update `handleSyncNow` to accept a provider parameter: fetches from `/api/integrations/${provider === 'SAMSARA' ? 'samsara' : 'motive'}/sync`. Toast says provider name.

3. Replace the hardcoded `{def.provider === 'SAMSARA' && enabledMap['SAMSARA'] && (...)}` config panel with a generic ELD config panel that renders for any provider in `ELD_PROVIDERS`:
   - Condition: `ELD_PROVIDERS.includes(def.provider as EldProviderKey) && enabledMap[def.provider]`
   - The config panel title: `${def.name} Configuration`
   - Token placeholder: `Enter your ${def.name} API token`
   - Sync description: `Manually pull the latest vehicle locations from ${def.name}.`
   - Wire save/edit/cancel/sync buttons to the per-provider state and handlers.

This avoids duplicating the entire config panel JSX. One generic panel serves both Samsara and Motive (and future ELD providers).
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors. Visually confirm in the browser at `/settings/integrations` that:
- Motive card appears under "ELD / Telematics" without "Coming Soon" badge
- Motive card has a toggle switch
- When enabled, Motive shows config panel with API token input and Sync Now button
- Samsara still works identically
  </verify>
  <done>
Motive appears as a fully configurable ELD provider on the integrations page. Users can enter a Motive API token, enable/disable the integration, and trigger manual GPS sync. Samsara continues working unchanged.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. Motive sync library mirrors Samsara pattern (fetch locations, match by VIN, bulk insert GPSLocation)
3. POST `/api/integrations/motive/sync` returns proper JSON response (synced count + unmatched)
4. Integrations page shows Motive as active provider with config panel
5. Both Samsara and Motive can be independently configured and synced
</verification>

<success_criteria>
- Motive GPS sync function exists and handles the Motive API response format correctly
- Motive sync API endpoint exists with same auth pattern as Samsara (CRON_SECRET or OWNER session)
- Integrations settings page shows Motive as configurable (not "coming soon")
- Config UI supports API token entry and Sync Now for both Samsara and Motive
- All files compile without TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/22-motive-keeptruckin-eld-integration-secon/22-SUMMARY.md`
</output>
