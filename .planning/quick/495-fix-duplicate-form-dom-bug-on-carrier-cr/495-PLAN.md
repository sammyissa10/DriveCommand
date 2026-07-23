---
phase: quick-495
plan: 495
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/ui/ResponsiveSwitch.tsx
  - apps/web/src/hooks/useIsDesktop.ts
  - apps/web/src/app/(owner)/carrier/contracts/new/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/new/page.tsx
  - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
  - apps/web/src/app/(owner)/carrier/clients/new/page.tsx
  - apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx
  - apps/web/src/app/(owner)/carrier/templates/new/page.tsx
autonomous: true

must_haves:
  truths:
    - "Only ONE <form> element exists in the DOM on each carrier create page at any viewport width"
    - "Clicking the primary submit (e.g. Create Contract) fires its POST on the FIRST click every time"
    - "Exactly one submit button per label is present in the DOM"
    - "No hidden empty duplicate <select>/inputs remain from the unmounted variant"
    - "Desktop variant still shows its back-link + header chrome; mobile variant keeps its own chrome"
    - "trips/new shows the correct driver dropdowns once (primary + co-driver), not four"
  artifacts:
    - path: "apps/web/src/components/ui/ResponsiveSwitch.tsx"
      provides: "SSR-safe client component that mounts exactly one of {mobile, desktop} slots after mount"
      min_lines: 20
    - path: "apps/web/src/hooks/useIsDesktop.ts"
      provides: "SSR-safe hook returning boolean|undefined (undefined until mounted) for (min-width:1024px)"
      min_lines: 10
  key_links:
    - from: "carrier create page.tsx (server component)"
      to: "ResponsiveSwitch"
      via: "passes server-fetched props into mobile/desktop slot elements; switch mounts one"
      pattern: "ResponsiveSwitch"
    - from: "ResponsiveSwitch"
      to: "useIsDesktop"
      via: "reads breakpoint after mount to pick a single slot"
      pattern: "useIsDesktop"
---

<objective>
Fix the duplicate-form DOM bug on carrier create/edit pages. The mobile-web design-system pattern currently renders BOTH breakpoint variants of a form at once (`lg:hidden` mobile variant + `hidden lg:block` desktop variant), toggling with CSS only. Two complete `<form>` elements with independent, unsynchronized state are live in the DOM simultaneously — so submit clicks can bind to the wrong copy (zero network requests), submit buttons/fields are doubled, and screen readers announce fields twice. On trips/new this produces four driver dropdowns.

Purpose: Guarantee exactly ONE form + ONE submit button + a single source of form state at any viewport, while preserving the two distinct DS layouts (mobile vs desktop).
Output: A reusable SSR-safe responsive switch (component + hook) and every affected carrier create page converted to mount exactly one variant.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/mobile-design-system.md

# The bug pattern (both variants mounted, CSS-toggled):
@apps/web/src/app/(owner)/carrier/contracts/new/page.tsx
@apps/web/src/app/(owner)/carrier/trips/new/page.tsx
@apps/web/src/app/(owner)/carrier/loads/new/page.tsx

# Existing breakpoint hooks to mirror (do NOT reuse verbatim — see Task 1 SSR note):
@apps/web/src/hooks/use-mobile.tsx
@apps/web/src/components/data-grid/hooks/useBreakpoint.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SSR-safe useIsDesktop hook + ResponsiveSwitch component</name>
  <files>apps/web/src/hooks/useIsDesktop.ts, apps/web/src/components/ui/ResponsiveSwitch.tsx</files>
  <action>
Create ONE reusable responsive switch so the DS mobile/desktop layouts are preserved but only ONE is ever mounted.

1. `apps/web/src/hooks/useIsDesktop.ts` ('use client'):
   - Export `useIsDesktop(): boolean | undefined`.
   - State initialized to `undefined` (NOT false) so the first render is intentionally "unknown".
   - In `useEffect`, use `window.matchMedia('(min-width: 1024px)')`, set state to `mql.matches`, subscribe to `change`, clean up on unmount. Use 1024px to match the existing `lg` Tailwind breakpoint the pages use.
   - Returning `undefined` until mounted is the whole point: it lets the switch render NEITHER variant during SSR/hydration, avoiding a hydration mismatch and avoiding two forms ever coexisting. Do NOT coerce to `!!` (that would render desktop during hydration like use-mobile.tsx does).

2. `apps/web/src/components/ui/ResponsiveSwitch.tsx` ('use client'):
   - Props: `{ mobile: React.ReactNode; desktop: React.ReactNode; fallback?: React.ReactNode }`.
   - Call `useIsDesktop()`. While it is `undefined` (pre-mount), render `fallback ?? null` — render NOTHING or a passed skeleton, never both variants.
   - Once defined, render `isDesktop ? desktop : mobile` — exactly one node.
   - Because the page is a Server Component that server-fetches data, the slots are passed as already-constructed elements holding server props; the switch only chooses which to mount. This keeps a single source of form state automatically (only one variant instantiated).
  </action>
  <verify>
`npx tsc --noEmit` from apps/web has no NEW errors in these two files. Confirm useIsDesktop returns `undefined` before mount (state init is `undefined`, no `!!` coercion) and ResponsiveSwitch renders `fallback ?? null` in that case.
  </verify>
  <done>useIsDesktop.ts and ResponsiveSwitch.tsx exist; hook is SSR-safe (undefined until mounted, 1024px matchMedia); switch mounts exactly one of {mobile, desktop} and never both.</done>
</task>

<task type="auto">
  <name>Task 2: Convert the 3 primary form create pages + fix trips driver-dropdown count</name>
  <files>apps/web/src/app/(owner)/carrier/contracts/new/page.tsx, apps/web/src/app/(owner)/carrier/trips/new/page.tsx, apps/web/src/app/(owner)/carrier/loads/new/page.tsx</files>
  <action>
For each page, replace the sibling `<div className="lg:hidden -m-4">…</div>` + `<div className="hidden lg:block …">…</div>` dual-mount with a single `<ResponsiveSwitch>` (imported from `@/components/ui/ResponsiveSwitch`). The page stays a Server Component; it still server-fetches data (prisma) and passes those props into the slot elements.

- `mobile` slot = the existing mobile component wrapped exactly as before, keeping its `-m-4` chrome wrapper. contracts: `<NewContractMobile clients={clients} defaultClientId={clientId} />`; trips: `<NewTripMobile driverMap={driverMap} truckMap={truckMap} userRole={session.role} />`; loads: `<NewLoadMobile clients={clients} facilities={facilities} />`.
- `desktop` slot = the existing desktop branch INCLUDING its back-link + header chrome and the `space-y-6` wrapper. Do NOT drop the desktop header/back-link — move the entire contents of the old `hidden lg:block` div into the desktop slot. contracts: header + `<ContractForm defaultClientId={clientId} />`; trips: back-link + header + `<NewTripFormClient … />`; loads: header + `<LoadForm mode="create" clients={clients} drivers={driverOptions} trucks={trucks} />`.
- Remove the now-unused `lg:hidden`/`hidden lg:block` wrapper divs and the `ArrowLeft`/`Link` imports ONLY if they move entirely into the desktop slot element (they can stay in the page file since the slot is defined inline there — keep imports as needed).

trips/new specifically: after single-mount, confirm the "four driver dropdowns" is resolved. The four came from BOTH page variants mounting (NewTripMobile has primary + co-driver = 2 selects; the desktop NewDispatchForm has its own). With one variant mounted, trips/new must show only that variant's intended driver selects (mobile: primary + co-driver; desktop: NewDispatchForm's driver select set). Open NewTripMobile.tsx and NewDispatchForm.tsx and verify NEITHER contains its OWN nested `lg:hidden`/`hidden lg:block` dual-mount of the same field (grep each for `lg:hidden` and `hidden lg:`). If a genuine internal double-render exists, remove the redundant branch so each field renders once; if the two selects are the legitimately distinct primary-driver and co-driver fields, leave them.
  </action>
  <verify>
Run `npx tsc --noEmit` (apps/web) — no new errors. Grep each converted page for `hidden lg:block` and `lg:hidden` — zero matches remain. Grep trips/new/NewTripMobile.tsx and components/carrier/dispatches/NewDispatchForm.tsx for `lg:hidden`/`hidden lg:` — confirm no same-field internal dual-mount. In browser (dev server), on /carrier/contracts/new, /carrier/trips/new, /carrier/loads/new at BOTH a narrow (<1024px) and wide (>=1024px) width: `document.querySelectorAll('form').length === 1`; count driver `<select>` on trips/new equals the single variant's intended count (no duplicates). Fill contract form, click Create Contract once → Network shows exactly one `POST /api/v1/carrier/contracts` on the first click.
  </verify>
  <done>All 3 pages mount exactly one variant via ResponsiveSwitch; one `<form>` and one submit button per label at any width; desktop header/back-link preserved; Create Contract POSTs on first click; trips/new no longer shows four driver dropdowns.</done>
</task>

<task type="auto">
  <name>Task 3: Convert remaining carrier create pages + audit [id] edit pages</name>
  <files>apps/web/src/app/(owner)/carrier/clients/new/page.tsx, apps/web/src/app/(owner)/carrier/facilities/new/page.tsx, apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx, apps/web/src/app/(owner)/carrier/templates/new/page.tsx</files>
  <action>
Apply the identical ResponsiveSwitch conversion (from Task 2) to the remaining create pages that use the dual-mount pattern:
- clients/new — ClientCreateMobile (mobile) + ClientForm-with-header (desktop)
- facilities/new — FacilityCreateMobile (mobile) + desktop form branch
- fleet/drivers/new — DriverCreateMobile (mobile) + desktop form branch
- templates/new — NewTemplateMobile (mobile) + desktop form branch

For each: move the FULL desktop branch (header/back-link chrome + form) into the `desktop` slot, the mobile component into the `mobile` slot (preserving its `-m-4` wrapper), pass through the server-fetched props unchanged, and delete the leftover `lg:hidden`/`hidden lg:block` wrapper divs.

NOTE: `fleet/trucks/new` is a SINGLE-form page (no dual-mount) — do NOT touch it.

Then AUDIT the carrier `[id]` edit pages for the same duplicate-FORM bug (not merely dual-layout detail views). Grep these for the sibling `lg:hidden` + `hidden lg:block` pair AND for two live `<form>`/submit handlers: contracts/[id], trips/[id], loads/[id], clients/[id], facilities/[id], fleet/drivers/[id], fleet/trucks/[id], templates/[id]. For any [id] page that renders TWO complete forms via the CSS-toggle dual-mount, apply the same ResponsiveSwitch conversion and add its path to files_modified. For [id] pages that are read-only detail views (single form or no form), leave them unchanged — the CSS dual-mount for pure detail layout is not in scope for this bug.
  </action>
  <verify>
`npx tsc --noEmit` (apps/web) — no new errors. Grep each converted page for `hidden lg:block`/`lg:hidden` — zero matches. For each converted create page in browser at narrow AND wide widths: `document.querySelectorAll('form').length === 1` and one submit button per label; submit fires its POST on first click. For the [id] audit, report which pages had duplicate forms and were converted vs which were left as detail views.
  </verify>
  <done>clients/new, facilities/new, fleet/drivers/new, templates/new each mount exactly one variant with one form; every carrier [id] edit page with a genuine duplicate-form dual-mount is converted; detail-only [id] pages correctly left untouched; fleet/trucks/new untouched.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` from apps/web shows no new errors versus baseline.
- Grep the carrier tree: no create/edit FORM page still renders sibling `lg:hidden` + `hidden lg:block` complete-form variants.
- On every converted page, at both <1024px and >=1024px: `document.querySelectorAll('form').length === 1`, exactly one submit button per label, no hidden empty duplicate `<select>`/inputs from an unmounted variant.
- Contract create: single `POST /api/v1/carrier/contracts` on the first Create click.
- Desktop header/back-link chrome preserved on all desktop variants; mobile chrome preserved on mobile variants.
</verification>

<success_criteria>
- ResponsiveSwitch + useIsDesktop exist, SSR-safe, mount exactly one variant.
- All affected carrier create pages (and any true duplicate-form [id] edit pages) mount a single form variant.
- trips/new shows the correct driver dropdowns once, not four.
- No hydration mismatch introduced (switch renders nothing/skeleton until mounted).
</success_criteria>

<output>
After completion, create `.planning/quick/495-fix-duplicate-form-dom-bug-on-carrier-cr/495-SUMMARY.md`.
</output>
