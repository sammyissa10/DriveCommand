---
phase: quick-164
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/facilities/FacilityList.tsx
  - apps/web/src/components/carrier/facilities/FacilityForm.tsx
  - apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
  - apps/web/src/app/(owner)/carrier/facilities/page.tsx
  - apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
  - apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
  - apps/web/src/components/navigation/sidebar.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can see a list of facilities with search and type filter"
    - "Owner can create a new facility via form with schema-backed fields only"
    - "Owner can view and edit an existing facility"
    - "Carrier Ops section appears in sidebar with 8 links"
    - "FacilitySearchModal can be used standalone by other carrier pages"
  artifacts:
    - path: "apps/web/src/components/carrier/facilities/FacilityList.tsx"
      provides: "Client-side filterable facility table"
    - path: "apps/web/src/components/carrier/facilities/FacilityForm.tsx"
      provides: "Create/edit form for facilities"
    - path: "apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx"
      provides: "Reusable facility search dialog"
    - path: "apps/web/src/app/(owner)/carrier/facilities/page.tsx"
      provides: "Server component list page"
    - path: "apps/web/src/app/(owner)/carrier/facilities/new/page.tsx"
      provides: "Create facility page"
    - path: "apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx"
      provides: "Detail/edit facility page"
  key_links:
    - from: "FacilityList.tsx"
      to: "/carrier/facilities/new"
      via: "Link component"
    - from: "FacilityForm.tsx"
      to: "/api/v1/carrier/facilities"
      via: "fetch POST/PATCH"
    - from: "FacilitySearchModal.tsx"
      to: "/api/v1/carrier/facilities?search=..."
      via: "fetch GET with debounce"
    - from: "page.tsx (list)"
      to: "listFacilities"
      via: "direct import from @/lib/carrier/facilities"
---

<objective>
Build the Carrier Ops facilities management web UI: list page, create page, detail/edit page, plus three reusable client components (FacilityList, FacilityForm, FacilitySearchModal). Add Carrier Ops section to the sidebar.

Purpose: First carrier ops web pages — enables owners to manage facilities through the UI instead of API-only.
Output: 6 new files + 1 sidebar modification.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/facilities.ts
@apps/web/src/app/api/v1/carrier/facilities/route.ts
@apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts
@apps/web/src/app/(owner)/loads/page.tsx
@apps/web/src/components/loads/load-list.tsx
@apps/web/src/components/navigation/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create FacilityList, FacilityForm, and FacilitySearchModal client components</name>
  <files>
    apps/web/src/components/carrier/facilities/FacilityList.tsx
    apps/web/src/components/carrier/facilities/FacilityForm.tsx
    apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
  </files>
  <action>
**FacilityList.tsx** — "use client" component receiving `facilities` array prop (typed inline matching CarrierFacility schema fields: id, name, facilityType, city, state, contactName, notes, etc.).

- Search input (filters by name or city, client-side from passed data)
- facilityType Select dropdown filter (options: all, terminal, warehouse, distribution_center, cross_dock, customer_location, pickup, delivery)
- shadcn Table with columns: name (as Link to /carrier/facilities/[id]), facilityType (color-coded Badge), city+state combined, contactName, notes (truncated to ~60 chars)
- "New Facility" Button linking to /carrier/facilities/new in the header area
- Empty state: Warehouse icon + "No facilities found" message
- Badge color mapping for facilityType: terminal=blue, warehouse=orange, distribution_center=purple, cross_dock=green, customer_location=slate, pickup=emerald, delivery=amber. Use variant="outline" with className for color.
- Do NOT include columns for lumper_required, appointment_required, avg_dwell_minutes — they do not exist in the schema.

**FacilityForm.tsx** — "use client" component with optional `initialData` prop (same facility type, or undefined for create mode).

- React Hook Form + zod validation schema (inline, matching the API's FacilityCreateSchema exactly):
  - name: z.string().min(1, "Name is required")
  - facilityType: z.string().optional() — Select with same 7 options
  - addressLine1, addressLine2, city: z.string().optional()
  - state: z.string().max(2).optional()
  - zip: z.string().optional()
  - country: z.string().optional() (default "US")
  - latitude, longitude: z.coerce.number().optional() (use z.coerce since input is string)
  - contactName, contactPhone, contactEmail: z.string().optional() (contactEmail with .email() when non-empty)
  - notes: z.string().optional() — Textarea
- Use shadcn Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Input, Select, Textarea, Button
- Layout: 2-column grid on lg, single on mobile. Group logically: Name+Type row, Address section, Contact section, Coordinates row, Notes full-width.
- On submit: fetch POST /api/v1/carrier/facilities (create) or PATCH /api/v1/carrier/facilities/[id] (edit based on initialData.id presence)
- On success: router.push('/carrier/facilities') with router.refresh()
- On error: toast via sonner
- Submit button text: "Create Facility" or "Save Changes" based on mode
- Loading state on submit button (disabled + spinner)

**FacilitySearchModal.tsx** — "use client" self-contained Dialog component.

- Props: open: boolean, onOpenChange: (open: boolean) => void, onSelect: (facility: FacilitySearchResult) => void, onCreateNew?: () => void
- Export both FacilitySearchModal component AND FacilitySearchResult type (id, name, city, state, facilityType)
- shadcn Dialog containing a Command (from cmdk) with CommandInput
- 300ms debounce on input using setTimeout/clearTimeout pattern
- Fetches GET /api/v1/carrier/facilities?search=... on each debounced keystroke
- Results rendered as CommandItem: name bold, city+state muted, facilityType Badge (same color scheme as FacilityList)
- CommandEmpty state: "No facilities found"
- If onCreateNew provided: render a "Create New Facility" button at the bottom of the dialog (not inside Command list)
- Clicking a result calls onSelect(facility) and closes the dialog
- No page-level imports inside this component — fully self-contained
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — no type errors in the 3 new component files. Verify all 3 files exist and have "use client" directive.
  </verify>
  <done>Three client components created with proper typing, form validation, API integration, and no schema fields that don't exist.</done>
</task>

<task type="auto">
  <name>Task 2: Create facility server pages and add Carrier Ops sidebar section</name>
  <files>
    apps/web/src/app/(owner)/carrier/facilities/page.tsx
    apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
    apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
    apps/web/src/components/navigation/sidebar.tsx
  </files>
  <action>
**apps/web/src/app/(owner)/carrier/facilities/page.tsx** — async server component.

- Import `listFacilities` from `@/lib/carrier/facilities` and `getSession` from `@/lib/auth/supabase`
- Call getSession(), extract tenantId (redirect to /login if no session)
- Call listFacilities(orgId) with default filters
- Render page header: h1 "Facilities", subtitle showing count ("Showing X of Y facilities")
- Render FacilityList client component passing the items array
- Follow the exact pattern from the loads page.tsx (try/catch with empty fallback, stats summary)
- Add a simple stat row: total count + count by facilityType (use a groupBy or just count from the items)

**apps/web/src/app/(owner)/carrier/facilities/new/page.tsx** — simple server component.

- Render h1 "New Facility" with a back link to /carrier/facilities
- Render FacilityForm with no initialData prop

**apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx** — async server component.

- Import `getFacility` from `@/lib/carrier/facilities`
- Call getSession(), extract tenantId
- Await params to get id, call getFacility(orgId, id)
- If not found: notFound() from next/navigation
- Render h1 with facility.name, back link to /carrier/facilities
- Render FacilityForm with initialData={facility}
- Add a "Delete" button (calls DELETE /api/v1/carrier/facilities/[id] with confirmation dialog, then redirects to list). This can be a small client component inline or a separate DeleteFacilityButton.

**Sidebar modification** — In sidebar.tsx, add a "Carrier Ops" SidebarGroup between the Management group and the Settings group. Gate it with `canViewFleetIntelligence` (same as Intelligence/Business sections).

Add these imports to the existing lucide-react import: Warehouse, Users2, FileText, CalendarDays, Boxes, BarChart3 (Truck and Package are already imported).

8 SidebarMenuItems with SidebarMenuButton + Link + onClick={handleNavClick}:
1. Facilities — /carrier/facilities — Warehouse icon
2. Clients — /carrier/clients — Users2 icon
3. Contracts — /carrier/contracts — FileText icon
4. Templates — /carrier/templates — CalendarDays icon
5. Dispatches — /carrier/dispatches — Truck icon
6. Loads — /carrier/loads — Package icon
7. Fleet — /carrier/fleet — Boxes icon
8. Reports — /carrier/reports — BarChart3 icon

Each uses `isActive={pathname.startsWith("/carrier/X")}` pattern. SidebarGroupLabel text: "Carrier Ops" with same styling as other labels (text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider).
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — no type errors. Verify all 3 page files exist under apps/web/src/app/(owner)/carrier/facilities/. Verify sidebar.tsx contains "Carrier Ops" group with 8 menu items. Grep for "Carrier Ops" in sidebar.tsx to confirm.
  </verify>
  <done>Three server pages render correctly with data from carrier lib functions. Sidebar shows Carrier Ops section with 8 links, gated to OWNER/MANAGER role. Facilities list, create, and edit flows are fully wired end-to-end through the existing API routes.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with zero errors
- All 6 new files exist in correct directories
- sidebar.tsx has Carrier Ops section with 8 links
- FacilityForm uses ONLY schema-backed fields (no lumperRequired, appointmentRequired, avgDwellMinutes, hoursOpen, hoursClose, checkInInstructions, contacts)
- FacilitySearchModal has no imports from page-level code
- FacilitySearchModal exports both the component and the FacilitySearchResult type
</verification>

<success_criteria>
- Owner navigates to /carrier/facilities and sees facility list with search/filter
- Owner clicks "New Facility", fills form, submits, and is redirected back to list
- Owner clicks a facility row, sees pre-filled edit form, can save changes
- Owner can delete a facility from the detail page
- Sidebar shows "Carrier Ops" section with 8 links (only Facilities works for now)
- FacilitySearchModal works as a standalone Dialog with debounced search
</success_criteria>

<output>
After completion, create `.planning/quick/164-carrier-ops-facilities-management-pages/164-SUMMARY.md`
</output>
