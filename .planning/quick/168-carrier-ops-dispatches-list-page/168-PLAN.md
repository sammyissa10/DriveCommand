---
phase: quick-168
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
  - apps/web/src/components/carrier/dispatches/DispatchList.tsx
  - apps/web/src/components/carrier/dispatches/DispatchCard.tsx
  - apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
autonomous: true

must_haves:
  truths:
    - "User sees dispatches for today+tomorrow by default on /carrier/dispatches"
    - "Each dispatch card shows dispatch_number, status badge, driver name, truck unit, stops progress, departure time, client names"
    - "User can filter by status multi-select, date range, and needs_assignment toggle"
    - "User can create a new dispatch via side Sheet with driver/truck selects"
    - "Clicking a dispatch card navigates to /carrier/dispatches/[id]"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/dispatches/page.tsx"
      provides: "Server page with driver/truck lookup maps passed to client list"
    - path: "apps/web/src/components/carrier/dispatches/DispatchList.tsx"
      provides: "Client component with filters, fetch, refresh, skeleton loading"
    - path: "apps/web/src/components/carrier/dispatches/DispatchCard.tsx"
      provides: "Individual dispatch card with status badge, chips, progress bar"
    - path: "apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx"
      provides: "Side Sheet form for creating new dispatches"
  key_links:
    - from: "DispatchList.tsx"
      to: "/api/v1/carrier/dispatches"
      via: "fetch with query params (status, date_from, date_to, needs_assignment)"
      pattern: "fetch.*api/v1/carrier/dispatches"
    - from: "NewDispatchForm.tsx"
      to: "/api/v1/carrier/dispatches"
      via: "POST fetch"
      pattern: "fetch.*api/v1/carrier/dispatches.*POST"
    - from: "DispatchCard.tsx"
      to: "/carrier/dispatches/[id]"
      via: "Link or router.push"
      pattern: "carrier/dispatches/"
---

<objective>
Build the Carrier Ops dispatches list page — the dispatcher's main daily view showing dispatch cards with filters, and a side Sheet to create new dispatches.

Purpose: This is the central dispatch management page for carrier operations, letting dispatchers see today's and tomorrow's dispatches at a glance, filter by status/date/assignment needs, and create new dispatches.
Output: 4 new files — server page, client list, card component, new dispatch form.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/templates/page.tsx (pattern: server page for carrier section)
@apps/web/src/components/carrier/templates/RouteTemplateList.tsx (pattern: client list component with fetch + filters)
@apps/web/src/app/api/v1/carrier/dispatches/route.ts (existing API — GET with filters, POST to create)
@apps/web/src/lib/carrier/dispatches.ts (backend logic — listDispatches returns items with _count.stops and completedStopsCount)
@apps/web/src/generated/prisma/schema.prisma (CarrierDispatch model — fields, relations to CarrierDriver/CarrierTruck)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create server page and DispatchCard component</name>
  <files>
    apps/web/src/app/(owner)/carrier/dispatches/page.tsx
    apps/web/src/components/carrier/dispatches/DispatchCard.tsx
  </files>
  <action>
**page.tsx** — Server component (follows carrier/templates/page.tsx pattern):
- Import `getSession` from `@/lib/auth/supabase`, redirect if no session.
- Import `prisma` from `@/lib/db/prisma`.
- Fetch lookup maps server-side via Prisma:
  - `carrierDriver.findMany({ where: { orgId, status: 'active' }, select: { id, firstName, lastName } })` — build `Record<string, string>` mapping id to `${firstName} ${lastName}`.
  - `carrierTruck.findMany({ where: { orgId, status: 'active' }, select: { id, unitNumber } })` — build `Record<string, string>` mapping id to unitNumber.
- Render page header: "Dispatches" title (text-2xl sm:text-3xl font-bold), subtitle "Dispatcher's daily view — showing today and tomorrow by default."
- Render `<DispatchList driverMap={driverMap} truckMap={truckMap} />`.

**DispatchCard.tsx** — Client component ('use client'):
- Props: `dispatch` object (typed inline with fields from API response: id, status, notes, primaryDriverId, truckId, scheduledDeparture, _count.stops, completedStopsCount), `driverName: string`, `truckUnit: string`, `clientNames: string` (pre-computed by parent).
- Extract dispatch_number from notes field using regex: `/\[DISPATCH_NUMBER=([^\]]+)\]/` — fallback to "—" if not found.
- Wrap entire card in Next.js `<Link href={/carrier/dispatches/${dispatch.id}}>`.
- Card layout (rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer):
  - **Top row:** dispatch_number (font-semibold text-sm) + status Badge on the right.
    - Status badge colors: planned=slate (`bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`), in_progress=blue, completed=green, cancelled=red, tonu=amber.
    - Special: if notes contain `needs_assignment=true`, show an ADDITIONAL orange badge with Bell icon from lucide-react: `bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300`, icon `<Bell className="h-3 w-3 mr-1" />` + text "Needs Assignment".
  - **Middle row:** Driver name chip (User icon + name, bg-muted rounded-full px-2.5 py-0.5 text-xs), Truck unit chip (Truck icon + unitNumber, same chip style).
  - **Stops progress row:** Progress bar (div with bg-muted rounded-full h-2, inner div with bg-primary rounded-full h-2 width = completedStopsCount / _count.stops * 100%), text "{completedStopsCount}/{_count.stops} stops" (text-xs text-muted-foreground).
  - **Bottom row:** Scheduled departure formatted with `new Date(scheduledDeparture).toLocaleDateString()` + `toLocaleTimeString()` (text-xs text-muted-foreground), client names on the right (text-xs text-muted-foreground, truncate if long).
- Import icons from lucide-react: Bell, User, Truck.
  </action>
  <verify>Run `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -30` to check for type errors in these files.</verify>
  <done>DispatchCard renders dispatch info with correct status badges including needs_assignment orange+Bell. Server page fetches driver/truck lookup maps and passes to list.</done>
</task>

<task type="auto">
  <name>Task 2: Create DispatchList with filters and NewDispatchForm sheet</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchList.tsx
    apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
  </files>
  <action>
**DispatchList.tsx** — Client component ('use client'):
- Props: `driverMap: Record<string, string>`, `truckMap: Record<string, string>`.
- State: `dispatches` array, `loading` boolean, `statusFilter` string[] (multi-select), `dateFrom` string (default: today ISO date), `dateTo` string (default: tomorrow ISO date), `needsAssignment` boolean (default false), `lastUpdated` Date | null, `sheetOpen` boolean for NewDispatchForm.
- On mount and when filters change, fetch from `/api/v1/carrier/dispatches?date_from=${dateFrom}&date_to=${dateTo}${statusFilter.map(s => '&status=' + s).join('')}${needsAssignment ? '&needs_assignment=true' : ''}`. Note: the API only accepts a single `status` param — so if multi-select has multiple values, fetch without status filter and filter client-side, OR make multiple requests. Simplest: filter client-side after fetch. Fetch with date params only, then filter by status in JS.
- For each dispatch, fetch client names: use a second fetch to `/api/v1/carrier/loads?dispatch_id=${dispatchId}` per dispatch to get loads with client info. BUT this would be N+1. Better approach: fetch loads for all dispatch IDs in one batch — but the loads API doesn't support batch dispatch IDs. Pragmatic solution: fetch all loads for the date range `/api/v1/carrier/loads?date_from=${dateFrom}&date_to=${dateTo}&pageSize=200`, build a `Map<dispatchId, Set<clientName>>` from the response. Each load should have a `clientId` — then look up client names from a parallel fetch to `/api/v1/carrier/clients?pageSize=200`. Build `clientMap: Record<string, string>` from clients response.
- **Filter controls** (flex flex-wrap gap-3 items-center mb-4):
  - Status multi-select: Use a set of toggle buttons (or checkboxes) for statuses: planned, in_progress, completed, cancelled, tonu. Each is a small button with the status badge color, toggles on/off. Active = filled, inactive = outline. Using shadcn `Button` variant="outline" with conditional classes.
  - Date range: Two `<input type="date" />` fields (styled with shadcn Input classes), labeled "From" and "To", defaulting to today and tomorrow.
  - Needs Assignment toggle: shadcn `Switch` with label "Needs Assignment" — when on, filters to only dispatches whose notes contain `needs_assignment=true`.
  - Refresh button: `<Button variant="outline" size="sm">` with RefreshCw icon. On click, re-fetch. Next to it, show last-updated timestamp in text-xs text-muted-foreground: `"Updated {lastUpdated.toLocaleTimeString()}"`.
- **New Dispatch button** top right: `<Button>` with Plus icon, text "New Dispatch". Opens `<Sheet>` containing `<NewDispatchForm>`.
- **List rendering:** If loading, show 4 skeleton cards (rounded-lg border bg-card p-4 with animate-pulse divs). Otherwise, map dispatches through DispatchCard, passing `driverName={driverMap[d.primaryDriverId] ?? 'Unassigned'}`, `truckUnit={truckMap[d.truckId] ?? '—'}`, `clientNames` from the loads/client lookup. Wrap in a `div className="grid gap-3"`.
- If no dispatches and not loading, show empty state: centered icon (ClipboardList), "No dispatches found" text, "Try adjusting your filters" subtext.
- Import icons: Plus, RefreshCw, ClipboardList from lucide-react.
- Import DispatchCard, NewDispatchForm, Sheet/SheetContent/SheetHeader/SheetTitle from shadcn, Button, Switch, Input/Label.

**NewDispatchForm.tsx** — Client component ('use client'):
- Props: `driverMap: Record<string, string>`, `truckMap: Record<string, string>`, `onSuccess: (newId: string) => void`, `onCancel: () => void`.
- State: `primaryDriverId`, `truckId`, `coDriverId` (optional), `scheduledDeparture` (datetime-local string), `plannedMiles` (number | ''), `notes` (string), `submitting` boolean, `error` string | null.
- Form fields:
  - **Primary Driver** (required): `<select>` (styled or use shadcn Select) populated from driverMap entries. Placeholder "Select driver...".
  - **Truck** (required): `<select>` populated from truckMap entries (show unitNumber). Placeholder "Select truck...".
  - **Co-Driver** (optional): `<select>` populated from driverMap entries. Placeholder "None". 
  - **Scheduled Departure** (required): `<input type="datetime-local" />` — default to next hour from now.
  - **Planned Miles** (optional): `<input type="number" min="0" step="0.01" />`.
  - **Notes** (optional): `<textarea>` with placeholder.
  - **Info note** (not a field): A muted text box: "Add loads to this dispatch from the dispatch detail page." — styled with bg-muted rounded-lg p-3 text-sm text-muted-foreground, with an Info icon from lucide-react.
  - NO client_id field.
- Submit handler: POST to `/api/v1/carrier/dispatches` with JSON body `{ primaryDriverId, truckId, coDriverId (if set), scheduledDeparture (ISO string), plannedMiles (if set), notes (if set) }`. On 201, extract `data.id` from response, call `onSuccess(id)`. On error, show toast via sonner + set error state.
- Cancel button and Submit button at bottom.
- Import toast from sonner, Info icon from lucide-react.

In DispatchList, when NewDispatchForm calls onSuccess(newId), close the sheet and use `router.push('/carrier/dispatches/' + newId)` via next/navigation useRouter.
  </action>
  <verify>Run `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -30` to check for type errors. Then visually verify by navigating to /carrier/dispatches in the browser — should show filter bar, dispatch list (or empty state), and New Dispatch button that opens the sheet.</verify>
  <done>DispatchList shows dispatches with date range (today+tomorrow default), status multi-select filter, needs_assignment toggle, refresh button with timestamp. NewDispatchForm opens in Sheet, creates dispatch via POST, redirects to detail page on success. No client_id field in form, info note present about adding loads from detail page.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit --project apps/web/tsconfig.json` passes with no errors in the 4 new files.
- Navigate to /carrier/dispatches — page loads with header, filter controls, and either dispatch cards or empty state.
- Click "New Dispatch" — Sheet slides open with form fields (driver select, truck select, co-driver, departure, miles, notes, info box).
- Status badges use correct colors: planned=slate, in_progress=blue, completed=green, cancelled=red, tonu=amber, needs_assignment=orange with Bell icon.
- Date range defaults to today + tomorrow.
</verification>

<success_criteria>
- All 4 files created and TypeScript-clean.
- Dispatches list page renders at /carrier/dispatches with skeleton loading state.
- Filter controls functional: status toggles, date range picker, needs_assignment switch, refresh button.
- DispatchCard shows dispatch_number, status badge, driver chip, truck chip, stops progress bar, departure time, client names.
- NewDispatchForm submits to POST /api/v1/carrier/dispatches and redirects to new dispatch detail page.
- No existing files modified.
</success_criteria>

<output>
After completion, create `.planning/quick/168-carrier-ops-dispatches-list-page/168-SUMMARY.md`
</output>
