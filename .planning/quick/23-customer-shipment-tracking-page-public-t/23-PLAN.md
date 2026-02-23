---
phase: quick-23
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/app/(owner)/actions/loads.ts
  - src/app/api/track/[token]/route.ts
  - src/app/track/[token]/page.tsx
  - src/components/tracking/tracking-map.tsx
  - src/app/(owner)/loads/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Customer can visit /track/[token] without logging in and see load status timeline"
    - "Customer can see the truck's latest GPS position on a Leaflet map"
    - "Customer can see origin, destination, truck info, and estimated delivery"
    - "Visiting /track/[invalid-token] shows a not-found page"
    - "Owner can copy tracking link from load detail page"
    - "trackingToken is auto-generated when a load is dispatched"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "trackingToken field on Load model"
      contains: "trackingToken"
    - path: "src/app/api/track/[token]/route.ts"
      provides: "Public API returning load + GPS data by token"
      exports: ["GET"]
    - path: "src/app/track/[token]/page.tsx"
      provides: "Public tracking page with status timeline and map"
    - path: "src/components/tracking/tracking-map.tsx"
      provides: "Leaflet map showing single truck location"
    - path: "src/app/(owner)/loads/[id]/page.tsx"
      provides: "Copy Tracking Link button"
  key_links:
    - from: "src/app/track/[token]/page.tsx"
      to: "/api/track/[token]"
      via: "fetch in component or server-side query"
      pattern: "api/track"
    - from: "src/app/api/track/[token]/route.ts"
      to: "prisma.load"
      via: "database query by trackingToken"
      pattern: "prisma\\.load\\.findUnique"
    - from: "src/app/(owner)/actions/loads.ts"
      to: "prisma.load.update"
      via: "dispatchLoad sets trackingToken"
      pattern: "trackingToken.*randomUUID|crypto"
---

<objective>
Build a public customer-facing shipment tracking page at /track/[token] that shows live load location and status without requiring login.

Purpose: Customers receive a tracking link (via email or shared by dispatcher) and can monitor their shipment's progress in real-time — building trust and reducing "where is my load?" support calls.
Output: Public tracking page, public API endpoint, schema migration, tracking link copy button on load detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@prisma/schema.prisma
@src/app/(owner)/actions/loads.ts
@src/app/(owner)/loads/[id]/page.tsx
@src/components/maps/live-map.tsx
@src/components/maps/vehicle-marker.tsx
@src/lib/maps/map-utils.ts
@src/app/layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + API + dispatch token generation</name>
  <files>
    prisma/schema.prisma
    src/app/(owner)/actions/loads.ts
    src/app/api/track/[token]/route.ts
  </files>
  <action>
    1. Add `trackingToken String? @unique` field to the Load model in schema.prisma. Add `@@index([trackingToken])`. Run `npx prisma db push` then `npx prisma generate`.

    2. In `src/app/(owner)/actions/loads.ts`, update the `dispatchLoad` function: in the `prisma.load.update` call where status is set to DISPATCHED, also set `trackingToken: crypto.randomUUID()` (import crypto from 'node:crypto' or use globalThis.crypto.randomUUID()). This ensures every dispatched load gets a unique tracking token.

    3. Create `src/app/api/track/[token]/route.ts` — a PUBLIC API route (no auth required, no requireRole, no getTenantPrisma). Import the base prisma client directly (from `@/lib/db/prisma`). Implement GET handler:
       - Extract `token` from params
       - Query: `prisma.load.findUnique({ where: { trackingToken: token }, include: { truck: { select: { id, make, model, licensePlate } }, driver: { select: { firstName, lastName } } } })`
       - If not found, return 404 JSON `{ error: 'Tracking information not found' }`
       - If found, query latest GPS: `prisma.gPSLocation.findFirst({ where: { truckId: load.truckId }, orderBy: { timestamp: 'desc' } })` (only if load.truckId exists)
       - Return JSON with: loadNumber, status, origin, destination, deliveryDate, truck (make/model/licensePlate), driverFirstName, latestGPS (lat/lng/speed/heading/timestamp). Do NOT expose: rate, tenantId, customerId, notes, or any financial data.
       - IMPORTANT: This route must NOT use RLS or tenant context since there is no session. Use the raw prisma import directly. Do NOT set any RLS config.
  </action>
  <verify>
    Run `npx prisma db push` succeeds. Run `npx prisma generate` succeeds. TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -30`. The API route file exists and exports GET.
  </verify>
  <done>
    trackingToken field exists on Load model with unique constraint. dispatchLoad auto-generates UUID token. Public API at /api/track/[token] returns load status + GPS data without auth, or 404 for invalid tokens.
  </done>
</task>

<task type="auto">
  <name>Task 2: Public tracking page with status timeline and Leaflet map</name>
  <files>
    src/app/track/[token]/page.tsx
    src/components/tracking/tracking-map.tsx
  </files>
  <action>
    1. Create `src/components/tracking/tracking-map.tsx` — a client component ('use client') that renders a single-truck Leaflet map. Import `leaflet/dist/leaflet.css` first. Use `MapContainer`, `TileLayer`, `Marker` from react-leaflet. Accept props: `{ latitude: number, longitude: number, truckLabel: string }`. Render a 300px-tall map centered on the coordinates with a marker. Use a simple divIcon with a truck SVG similar to the VehicleMarker pattern (copy the SVG from vehicle-marker.tsx). Use a blue color scheme for the marker. Include `dynamic(() => import(...), { ssr: false })` pattern — actually, make the component itself 'use client' and the page will dynamic-import it. Export default.

    2. Create `src/app/track/[token]/page.tsx` — this is a SERVER component (not inside any auth-gated route group). It is placed directly under `src/app/track/` so no layout wraps it with sidebar/auth.

    Page structure:
    - Generate metadata: `export const metadata = { title: 'Track Shipment | DriveCommand' }`
    - Server-side: call the prisma query directly (same as the API route logic — query load by trackingToken, include truck/driver, fetch latest GPS). Import prisma from `@/lib/db/prisma`. Do NOT use getTenantPrisma or any auth.
    - If load not found: call `notFound()` from next/navigation
    - Render a clean, professional public page with DriveCommand branding:

    Layout (no sidebar, standalone page):
    ```
    - Header bar: "DriveCommand" logo text (text-xl font-bold) + "Shipment Tracking" subtitle, bg-card border-b
    - Main content (max-w-4xl mx-auto px-4 py-8):
      a) Load number + status badge (large, prominent)
      b) Status timeline/stepper: DISPATCHED -> PICKED_UP -> IN_TRANSIT -> DELIVERED
         - Use the same stepper pattern from the load detail page (green completed circles, blue current, gray future)
         - Only show these 4 statuses (not PENDING/INVOICED/CANCELLED — customer doesn't need those)
         - Map: DISPATCHED="Order Confirmed", PICKED_UP="Picked Up", IN_TRANSIT="In Transit", DELIVERED="Delivered"
      c) Two-column grid (lg:grid-cols-2, stack on mobile):
         - Left: Shipment details card (origin, destination, estimated delivery if set, truck info, driver first name only)
         - Right: Leaflet map showing latest truck position (dynamic import tracking-map with ssr:false)
           - If no GPS data yet, show a placeholder: "Live tracking will be available once the truck is in transit"
      d) Footer: "Powered by DriveCommand" text-muted-foreground text-sm, centered
    ```

    Styling: Use Tailwind classes consistent with the rest of the app (bg-background, text-foreground, border-border, bg-card, rounded-lg). The page inherits the root layout (which has Inter font and globals.css) but NOT any auth layout. Dark mode support via existing CSS variables.

    IMPORTANT: The dynamic import for the map component must use `{ ssr: false }` because Leaflet requires browser APIs:
    ```tsx
    import dynamic from 'next/dynamic';
    const TrackingMap = dynamic(() => import('@/components/tracking/tracking-map'), { ssr: false, loading: () => <div className="h-[300px] bg-muted rounded-lg animate-pulse" /> });
    ```
  </action>
  <verify>
    Run `npx tsc --noEmit --pretty 2>&1 | head -30` — no type errors. Visit /track/[valid-token] in browser shows the tracking page. Visit /track/invalid-uuid shows 404.
  </verify>
  <done>
    Public tracking page renders at /track/[token] with status timeline, shipment details, and Leaflet map showing truck position. Page works without login. Invalid tokens show 404.
  </done>
</task>

<task type="auto">
  <name>Task 3: Copy Tracking Link button on load detail page</name>
  <files>
    src/app/(owner)/loads/[id]/page.tsx
  </files>
  <action>
    In `src/app/(owner)/loads/[id]/page.tsx`:

    1. The load query already fetches the load. After the query, check if `load.trackingToken` exists.

    2. Add a "Copy Tracking Link" button in the action buttons area (alongside Edit, Dispatch, Status Update, Delete). Show it only when `load.trackingToken` is truthy (i.e., load has been dispatched).

    3. Since this is a server component, create a small client component inline or as a separate file. Simplest approach: create a small client component `CopyTrackingLinkButton` right in a new file `src/components/loads/copy-tracking-link.tsx`:
       - Props: `{ token: string }`
       - Constructs URL: `${window.location.origin}/track/${token}`
       - On click: `navigator.clipboard.writeText(url)` then show a toast via sonner (`toast.success('Tracking link copied!')`)
       - Renders a button with Link2 icon from lucide-react, styled like the other action buttons (border border-border bg-card px-4 py-2.5 text-sm font-medium rounded-lg shadow-sm hover:bg-accent)

    4. Import and render `<CopyTrackingLinkButton token={load.trackingToken} />` in the action buttons section, after the status update button. Add the file to files_modified.

    Also add `src/components/loads/copy-tracking-link.tsx` to the files created.
  </action>
  <verify>
    Run `npx tsc --noEmit --pretty 2>&1 | head -30` — no type errors. On a dispatched load's detail page, "Copy Tracking Link" button appears. Clicking it copies the /track/[token] URL to clipboard and shows a toast.
  </verify>
  <done>
    Load detail page shows "Copy Tracking Link" button for dispatched loads. Clicking copies the public tracking URL to clipboard with toast confirmation. Button hidden for non-dispatched loads.
  </done>
</task>

</tasks>

<verification>
1. `npx prisma db push` — schema applies without error
2. `npx tsc --noEmit` — no TypeScript errors
3. Dispatch a PENDING load — confirm trackingToken is generated (check DB or API response)
4. Visit `/track/[token]` — page loads without login, shows status timeline, map (if GPS data exists), shipment details
5. Visit `/track/invalid` — shows 404 page
6. On load detail page for dispatched load — "Copy Tracking Link" button visible and functional
</verification>

<success_criteria>
- Public /track/[token] page renders load status, timeline, map, and shipment details without authentication
- Invalid tokens return 404 (not enumerable)
- trackingToken auto-generated on dispatch
- Copy Tracking Link button works on owner load detail page
- No financial data (rate, revenue) exposed on public page
- Page is clean, professional, and uses DriveCommand branding
</success_criteria>

<output>
After completion, create `.planning/quick/23-customer-shipment-tracking-page-public-t/23-SUMMARY.md`
</output>
