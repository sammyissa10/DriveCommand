---
phase: quick-265
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(driver)/my-route/loading.tsx
  - apps/web/src/app/(driver)/my-load/loading.tsx
  - apps/web/src/app/(driver)/messages/loading.tsx
  - apps/web/src/app/(driver)/hours/loading.tsx
  - apps/web/src/app/(driver)/incidents/loading.tsx
  - apps/web/src/app/(driver)/my-load/page.tsx
  - apps/web/src/app/(driver)/messages/page.tsx
  - apps/web/src/app/(driver)/hours/page.tsx
  - apps/web/src/app/(driver)/incidents/page.tsx
  - apps/web/src/app/(driver)/my-route/page.tsx
  - apps/web/src/app/(driver)/actions/driver-routes.ts
  - apps/web/src/components/driver/completed-load-history.tsx
  - apps/web/src/components/driver/route-detail-readonly.tsx
  - apps/web/src/components/driver/dispatch-history-list.tsx
  - apps/web/src/components/driver/stop-document-upload.tsx
  - apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts
autonomous: true
must_haves:
  truths:
    - "Driver portal pages show skeleton loaders during navigation instead of blank screens"
    - "All driver portal pages have force-dynamic to prevent static caching"
    - "Driver can see completed dispatch history with Active/History tabs on Route page"
    - "Driver cannot see rate amounts, rate types, revenue, or financial fields on load view"
    - "Driver can upload documents (BOL, POD, Weight Ticket, Fuel Receipt, Other) on any stop"
    - "Document uploads work on completed dispatch stops without changing stop status"
  artifacts:
    - path: "apps/web/src/app/(driver)/my-route/loading.tsx"
      provides: "Route page skeleton"
    - path: "apps/web/src/app/(driver)/my-load/loading.tsx"
      provides: "Load page skeleton"
    - path: "apps/web/src/app/(driver)/messages/loading.tsx"
      provides: "Messages page skeleton"
    - path: "apps/web/src/components/driver/dispatch-history-list.tsx"
      provides: "Completed dispatch history list and detail views"
    - path: "apps/web/src/components/driver/stop-document-upload.tsx"
      provides: "Per-stop document upload UI component"
    - path: "apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts"
      provides: "Web API for driver stop document upload to R2"
  key_links:
    - from: "apps/web/src/app/(driver)/my-route/page.tsx"
      to: "apps/web/src/app/(driver)/actions/driver-routes.ts"
      via: "getMyCompletedDispatches server action"
    - from: "apps/web/src/components/driver/stop-document-upload.tsx"
      to: "apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts"
      via: "FormData POST with file + documentType"
---

<objective>
Driver portal enhancements: loading skeletons, completed dispatch history, hidden rate fields, and per-stop document uploads.

Purpose: Improve driver portal UX (instant feedback on nav), add dispatch history for drivers to reference past trips, remove sensitive financial data from driver view, and enable drivers to upload BOL/POD/other documents at every stop.
Output: Loading skeletons for all driver pages, Active/History tabs on Route page, rate fields removed from load cards, document upload on every stop card.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(driver)/my-route/page.tsx
@apps/web/src/app/(driver)/my-load/page.tsx
@apps/web/src/app/(driver)/messages/page.tsx
@apps/web/src/app/(driver)/actions/driver-routes.ts
@apps/web/src/app/(driver)/actions/driver-load.ts
@apps/web/src/components/driver/route-detail-readonly.tsx
@apps/web/src/components/driver/completed-load-history.tsx
@apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts
@apps/web/src/lib/storage/presigned.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Loading skeletons, force-dynamic, and hide rate fields</name>
  <files>
    apps/web/src/app/(driver)/my-route/loading.tsx
    apps/web/src/app/(driver)/my-load/loading.tsx
    apps/web/src/app/(driver)/messages/loading.tsx
    apps/web/src/app/(driver)/hours/loading.tsx
    apps/web/src/app/(driver)/incidents/loading.tsx
    apps/web/src/app/(driver)/my-load/page.tsx
    apps/web/src/app/(driver)/messages/page.tsx
    apps/web/src/app/(driver)/hours/page.tsx
    apps/web/src/app/(driver)/incidents/page.tsx
    apps/web/src/components/driver/completed-load-history.tsx
  </files>
  <action>
    **Loading skeletons** — Create loading.tsx files for each driver portal page that lacks one. Follow the existing owner portal skeleton pattern (animate-pulse, bg-muted, rounded shapes matching page layout). Specifically:

    - `my-route/loading.tsx`: Skeleton with heading placeholder (h-8 w-36), subtitle placeholder (h-4 w-48), then a card skeleton with header row + 4 stop timeline rows (circle + text lines).
    - `my-load/loading.tsx`: Skeleton with heading + subtitle, then 3 load card skeletons (h-16 each with title line + subtitle line).
    - `messages/loading.tsx`: Skeleton with heading + subtitle, then a tall card skeleton (h-64) representing the messaging panel.
    - `hours/loading.tsx`: Skeleton with heading, then a 2x2 grid of status cards (h-20 each), then a day bar (h-12 w-full).
    - `incidents/loading.tsx`: Skeleton with heading, then 3 incident card skeletons (h-16 each).

    All skeletons: use `animate-pulse`, `bg-muted`, `rounded`, `border border-border bg-card` for card wrappers. Match the existing owner portal pattern from `apps/web/src/app/(owner)/dashboard/loading.tsx`.

    **force-dynamic** — Add `export const dynamic = 'force-dynamic';` to these pages that currently lack it:
    - `apps/web/src/app/(driver)/my-load/page.tsx` (missing)
    - `apps/web/src/app/(driver)/messages/page.tsx` (missing)
    - `apps/web/src/app/(driver)/hours/page.tsx` (check, add if missing)
    - `apps/web/src/app/(driver)/incidents/page.tsx` (check, add if missing)

    **Hide rate fields** — In `apps/web/src/components/driver/completed-load-history.tsx`, remove the entire Rate section (lines ~127-139 that render `load.rateAmount`, `load.rateType`). The following fields must NOT appear in the driver load view: `rateType`, `rateAmount`, `ratePerMile`, `totalRevenue`, `fuelSurcharge`, `detentionAmount`, `otherCharges`, `carrierCost`, `currency`, `brokerFlag`. Keep: `referenceNumber`, `bolNumber`, `proNumber`, `client.name`, `loadType`, `commodityDescription`, `commodityWeightLbs`, `commodityPieces`, `specialInstructions`, `status`, stops.
  </action>
  <verify>
    - `npx tsc --noEmit` passes with no errors
    - Grep for `rateAmount` in completed-load-history.tsx returns no results
    - All 5 loading.tsx files exist in the driver portal subdirectories
    - Grep for `force-dynamic` in all driver portal page.tsx files shows every one has it
  </verify>
  <done>
    All driver portal pages have loading.tsx skeletons and force-dynamic. Rate/financial fields are removed from the driver load card component.
  </done>
</task>

<task type="auto">
  <name>Task 2: Completed dispatch history with Active/History tabs</name>
  <files>
    apps/web/src/app/(driver)/my-route/page.tsx
    apps/web/src/app/(driver)/actions/driver-routes.ts
    apps/web/src/components/driver/dispatch-history-list.tsx
  </files>
  <action>
    **Server action** — In `apps/web/src/app/(driver)/actions/driver-routes.ts`, update `getMyDispatchHistory()`:
    - Change `take: 10` to `take: 20`
    - Change `orderBy: { actualArrival: 'desc' }` to `orderBy: { actualDeparture: 'desc' }` (per task spec)
    - Add `carrierLoads` to the include so history items show client names:
      ```
      carrierLoads: {
        include: { client: { select: { id: true, name: true } } },
      },
      ```
    - Also include `documents` on each stop in the history query:
      ```
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        include: {
          facility: { select: { id: true, name: true, city: true, state: true } },
          documents: { select: { id: true, documentType: true, filename: true, createdAt: true } },
        },
      },
      ```

    **Dispatch history list component** — Create `apps/web/src/components/driver/dispatch-history-list.tsx` as a 'use client' component:
    - Props: `dispatches` (array from getMyDispatchHistory return type)
    - Two views: **list** and **detail** (controlled by `selectedId` state)
    - **List view**: Each dispatch row shows: dispatch ID (first 8 chars uppercase), completion date (actualArrival formatted), truck unit number, stop count, client names (unique from carrierLoads, comma-separated). Rows are clickable.
    - **Detail view**: Shows dispatch header (ID, truck, dates, planned miles), full stop timeline identical to DispatchDetail but read-only (no action buttons). Each stop card includes a Documents section showing uploaded docs (filename + upload time) and a StopDocumentUpload component (built in Task 3). Back button at top returns to list view.
    - Use the same card styling as route-detail-readonly.tsx (rounded-none border-x-0 lg:rounded-lg lg:border-x pattern).
    - Import and use the `LocalTime` pattern from route-detail-readonly.tsx for date rendering (copy the useMounted/formatLocalTime/LocalTime helpers, or extract to a shared util).

    **Route page tabs** — Rewrite `apps/web/src/app/(driver)/my-route/page.tsx`:
    - Fetch both `getMyActiveDispatch()` and `getMyDispatchHistory()` in parallel at the top.
    - Wrap content in a client component `RouteTabView` that manages Active/History tab state.
    - Active tab: Shows existing DispatchDetail (or empty state if no active dispatch). Show a badge count on Active tab if there's an active dispatch.
    - History tab: Shows DispatchHistoryList with completed dispatches (or empty state "No completed dispatches yet").
    - Tab UI: Two horizontally arranged tab buttons at the top (below the page heading), using the same styling pattern as owner portal tabs (bg-muted rounded-lg p-1, active tab gets bg-background shadow-sm). Default to Active tab.
    - Pass `startTrip`, `arriveAtStop`, `completeCurrentStop` server actions only to the Active tab's DispatchDetail.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - The my-route page renders with Active/History tabs
    - History tab shows completed dispatches with dispatch ID, date, truck, stop count, client names
    - Clicking a history dispatch shows detail view with stops timeline and back button
  </verify>
  <done>
    Route page has Active/History tabs. History tab lists up to 20 completed dispatches with drill-down detail view showing stops, timestamps, and documents per stop.
  </done>
</task>

<task type="auto">
  <name>Task 3: Per-stop document upload (active and completed stops)</name>
  <files>
    apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts
    apps/web/src/components/driver/stop-document-upload.tsx
    apps/web/src/components/driver/route-detail-readonly.tsx
  </files>
  <action>
    **Web API route** — Create `apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts`:
    - POST handler accepting multipart FormData with `file` and `documentType` fields.
    - Auth: Use `requireRole([UserRole.DRIVER])` + `getSession()` from `@/lib/auth/supabase`.
    - Validate `documentType` is one of: `bol`, `pod`, `weight_ticket`, `fuel_receipt`, `other` (expanded from the mobile route's bol/pod only).
    - Validate file: allowed types = pdf, jpeg, jpg, png, heic, webp. Max 25MB. Non-empty.
    - Tenant isolation: Verify stop belongs to a dispatch where `primaryDriverId` matches the authenticated driver's carrierDriver record AND `orgId` = session.tenantId. Use the same bypass_rls + $transaction pattern as in driver-routes.ts.
    - Upload file to R2 using the same presigned URL flow as the mobile route (`generateUploadUrl` from `@/lib/storage/presigned`): generate URL, fetch PUT with file buffer.
    - Create `CarrierDocument` record: `parentType: 'stop'`, `parentId: stopId`, `stopId: stopId`, `documentType`, `fileUrl: s3Key`, `filename`, `fileSizeBytes`, `uploadedBy: session.userId`.
    - Do NOT change stop status on upload. No status checks that block uploads on completed stops.
    - If `documentType === 'bol'` or `documentType === 'pod'`, also update the stop: set `bolNumber` or `podNumber` to a non-null indicator if currently null (optional — only if the field is empty, don't overwrite existing values). This is a soft flag, not a status change.
    - Return 201 with `{ id, documentType, filename, createdAt }`.
    - Add rate limiting using `uploadLimiter` from `@/lib/rate-limit`.

    - Also add a GET handler on the same route to list documents for a stop:
      - Auth: Same driver ownership check.
      - Returns array of `{ id, documentType, filename, createdAt }` for CarrierDocuments where `stopId` matches.

    **Stop document upload component** — Create `apps/web/src/components/driver/stop-document-upload.tsx` as a 'use client' component:
    - Props: `stopId: string`, `existingDocs?: Array<{ id: string; documentType: string; filename: string; createdAt: string | Date }>`.
    - Displays existing documents as a compact list (doc type icon + filename + upload time).
    - "Upload Document" button opens an inline form (not a modal — keep it simple):
      - Document type dropdown: BOL, POD, Weight Ticket, Fuel Receipt, Other.
      - File input (accept=".pdf,.jpg,.jpeg,.png,.heic,.webp").
      - Upload button with loading state.
    - On submit: POST FormData to `/api/driver/stops/${stopId}/documents`.
    - On success: Add new doc to local list, show success message, reset form.
    - On error: Show error message.
    - Use Tailwind classes consistent with the driver portal (bg-card, border-border, text-foreground, etc.).
    - Use lucide-react icons: FileText for docs, Upload for button, Check for success.

    **Integrate into active dispatch stops** — In `apps/web/src/components/driver/route-detail-readonly.tsx`:
    - Import `StopDocumentUpload` component.
    - Add a "Documents" section below each stop's existing content (after special instructions, before action buttons).
    - Render `<StopDocumentUpload stopId={stop.id} existingDocs={stop.documents} />` for EVERY stop regardless of stop type or status.
    - Update the `CarrierStopShape` interface to include `documents?: Array<{ id: string; documentType: string; filename: string; createdAt: Date }>`.
    - Update `getMyActiveDispatch()` in driver-routes.ts to include `documents` on each stop:
      ```
      documents: {
        select: { id: true, documentType: true, filename: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      ```

    The completed dispatch detail view (from Task 2) also renders StopDocumentUpload on each stop — that wiring happens in dispatch-history-list.tsx (Task 2 already references this component).
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - The API route file exists at `apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts`
    - The StopDocumentUpload component exists and is imported in route-detail-readonly.tsx
    - Every stop card in the active dispatch view has a Documents section
    - The API route does NOT check or modify stop.status on upload
    - Grep for `bypass_rls` in the new API route confirms tenant isolation
  </verify>
  <done>
    Every stop in both active and completed dispatch views has a Documents section with upload capability. Uploads go to R2 via the new web API, create CarrierDocument records linked to the stop, and do not change stop status. Document types include BOL, POD, Weight Ticket, Fuel Receipt, and Other.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero TypeScript errors
2. All driver portal pages have `export const dynamic = 'force-dynamic'`
3. All driver portal pages have `loading.tsx` skeleton files
4. Rate/financial fields do not appear in driver load view
5. Route page has Active/History tabs, history shows completed dispatches
6. Every stop card has document upload capability
7. Document uploads work on completed stops without status changes
8. All new queries include tenant isolation (orgId = session.tenantId)
</verification>

<success_criteria>
- Driver portal navigation shows skeletons instead of blank screens
- All driver portal pages are force-dynamic (no static caching)
- Driver sees no rate, revenue, or financial data on load cards
- Driver can browse completed dispatch history from the Route tab
- Driver can click into a completed dispatch to see full stop timeline with docs
- Driver can upload BOL/POD/Weight Ticket/Fuel Receipt/Other on any stop (active or completed)
- Uploads on completed stops do NOT change stop status
- All queries are tenant-isolated
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/265-driver-portal-enhancements-nav-performan/265-SUMMARY.md`
</output>
