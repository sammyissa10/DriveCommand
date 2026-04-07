---
quick: 198
description: Fix Bugs 25,32,38,39,40,41,42,43 — recurrence UI, template status toggle, FAB position, load redirect, loads list display fixes, per-mile/per-stop form fields
date: 2026-04-07
commits:
  - dc55c51 feat(quick-198): replace RRULE text input with visual day picker in RouteTemplateForm
  - d48862d feat(quick-198): add active/inactive status badge and toggle to route template detail page
  - 742e4e2 feat(quick-198): move support FAB to bottom-left (Bug 38)
  - 747164a feat(quick-198): redirect to /carrier/loads list after load create (Bug 39)
  - 70db756 feat(quick-198): extract clean dispatch number in loads list
  - c7fb02a feat(quick-198): persist otherCharges on load create so totalRevenue is correct
  - a52cac8 feat(quick-198): add planned miles input and fix per_stop delivery count in financial preview
tsc: clean
---

## What was fixed

### Bug 25 — RRULE Day Picker (RouteTemplateForm.tsx)
Replaced raw `FREQ=WEEKLY;BYDAY=...` text input with a visual builder:
- Frequency dropdown: Daily / Weekly / Monthly
- Weekly: 7 toggle buttons (Mon–Sun) with active styling
- Monthly: comma-separated day numbers input
- RRULE auto-generated via `useEffect`, shown as read-only mono helper text
- Edit mode parses existing RRULE on mount to pre-populate UI state

### Bug 32 — Template Status Toggle (3 files)
- New `TemplateStatusToggle.tsx` client component: green/red badge + shadcn Switch
- Calls PATCH on toggle, shows toast, refreshes via `router.refresh()`
- `route-templates.ts` — `RouteTemplateUpdateInput` extended with `active?: boolean`
- Template detail page PATCH route Zod schema includes `active: z.boolean().optional()`

### Bug 38 — Support FAB Position (support-ticket-modal.tsx)
Changed `right-6` → `left-6` on the FAB container to avoid overlapping form action buttons.

### Bug 39 — Load Create Redirect (LoadForm.tsx)
After create, `router.push` now goes to `/carrier/loads` list instead of `/carrier/loads/${savedId}`.

### Bug 40 — Dispatch Number in Loads List (LoadList.tsx)
Added `extractDispatchNumber` helper using `[DISPATCH_NUMBER=DC-...]` regex. Dispatch column shows clean `DC-YYYY-NNNNN` with font-mono styling; falls back to truncated UUID.

### Bug 41 — Invoice Total on New Loads (POST /api/v1/carrier/loads)
`LoadCreateSchema` was missing `otherCharges`. Added to Zod schema + `prisma.carrierLoad.create` call + `updateLoad` data spread. `recalculateAndStore` now reads persisted `otherCharges` and includes it in `totalRevenue`.

### Bug 42 — Per Mile Planned Miles Input (LoadForm.tsx + LoadFinancials.tsx)
- Conditional "Planned Miles" number input appears when `rateType === 'per_mile'`
- Passed to `LoadFinancials` which computes `baseRevenue = rateAmount × plannedMiles`
- FSC also fixed to use `plannedMiles × fscRate` (was returning 0)

### Bug 43 — Per Stop Delivery Count (LoadForm.tsx + LoadFinancials.tsx)
- `deliveryStopCount = stops.filter(s => s.stop_type === 'delivery').length` computed from StopBuilder state
- Passed to `LoadFinancials` which computes `baseRevenue = rateAmount × deliveryStopCount`
- Shows hint "(add delivery stops)" when count is 0
