---
phase: quick-474
plan: 474
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/clients/new/ClientCreateMobile.tsx
  - apps/web/src/app/(owner)/carrier/clients/new/page.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx
autonomous: true

must_haves:
  truths:
    - "At a phone viewport, /carrier/clients/new renders the mobile ds layout (MobileScreen, NavHeader Cancel/Save, grouped FieldGroup sections, PrimaryButton) instead of the old light desktop form"
    - "At a phone viewport, /carrier/fleet/drivers/new renders the mobile ds layout instead of the old light desktop form"
    - "Submitting the mobile Client form POSTs to /api/v1/carrier/clients and navigates to /carrier/clients on success"
    - "Submitting the mobile Driver form POSTs to /api/v1/carrier/fleet/drivers and navigates to /carrier/fleet/drivers on success"
    - "Desktop (lg and up) renders the unchanged existing ClientForm / CarrierDriverForm"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/clients/new/ClientCreateMobile.tsx"
      provides: "Mobile ds New Client create form mirroring ClientForm fields + validation + POST body"
      min_lines: 120
    - path: "apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx"
      provides: "Mobile ds New Driver create form mirroring CarrierDriverForm fields + validation + POST body"
      min_lines: 120
    - path: "apps/web/src/app/(owner)/carrier/clients/new/page.tsx"
      provides: "Dual render: lg:hidden ClientCreateMobile + hidden lg:block existing ClientForm"
      contains: "ClientCreateMobile"
    - path: "apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx"
      provides: "Dual render: lg:hidden DriverCreateMobile + hidden lg:block existing CarrierDriverForm"
      contains: "DriverCreateMobile"
  key_links:
    - from: "ClientCreateMobile.tsx"
      to: "/api/v1/carrier/clients"
      via: "fetch POST"
      pattern: "fetch.*carrier/clients"
    - from: "DriverCreateMobile.tsx"
      to: "/api/v1/carrier/fleet/drivers"
      via: "fetch POST"
      pattern: "fetch.*carrier/fleet/drivers"
    - from: "clients/new/page.tsx"
      to: "ClientCreateMobile"
      via: "lg:hidden wrapper"
      pattern: "lg:hidden"
    - from: "drivers/new/page.tsx"
      to: "DriverCreateMobile"
      via: "lg:hidden wrapper"
      pattern: "lg:hidden"
---

<objective>
Rebuild the two carrier create forms still rendering the OLD desktop form at phone widths — New Client (`/carrier/clients/new`) and New Driver (`/carrier/fleet/drivers/new`) — on the DriveCommand mobile-web design system, matching the already-shipped Facility/Contract/Load/Trip mobile create pages. Desktop forms stay 100% unchanged.

Purpose: These are the last two Quick Create carrier forms without a mobile ds variant. Closing the gap makes the whole Quick Create menu consistent at phone widths.
Output: `ClientCreateMobile.tsx` + `DriverCreateMobile.tsx` mobile components, and both `page.tsx` files wired to render `lg:hidden <XCreateMobile/>` + `hidden lg:block` existing desktop form.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Authoritative design spec (spec wins over any built screen):
- `docs/specs/DriveCommand-Mobile-Design-System.pdf` — extract with `/mingw64/bin/pdftotext -layout docs/specs/DriveCommand-Mobile-Design-System.pdf out.txt`
- `.planning/mobile-design-system.md` — the mobile-web contract

Reference implementation to mirror EXACTLY (copy the structure, do not invent a new pattern):
@apps/web/src/app/(owner)/carrier/facilities/new/FacilityCreateMobile.tsx
@apps/web/src/app/(owner)/carrier/facilities/new/page.tsx

ds kit (import from `@/components/ui/ds`):
@apps/web/src/components/ui/ds/FieldGroup.tsx
@apps/web/src/components/ui/ds/index.ts

Desktop forms to port field-for-field (KEEP UNCHANGED — read only to enumerate fields/validation/endpoint/body):
@apps/web/src/components/carrier/clients/ClientForm.tsx
@apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
@apps/web/src/app/(owner)/carrier/clients/new/page.tsx
@apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebuild New Client create form on mobile ds</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/new/ClientCreateMobile.tsx (new)
    apps/web/src/app/(owner)/carrier/clients/new/page.tsx (modify — add mobile wrapper only)
  </files>
  <action>
Create `ClientCreateMobile.tsx` as a `'use client'` component mirroring `FacilityCreateMobile.tsx`'s structure exactly (MobileScreen + NavHeader with Cancel top-left / Create top-right + SectionHeader groups + FieldGroup isEditing + PrimaryButton). Import only from `@/components/ui/ds`.

Port EVERY field from the desktop `ClientForm.tsx` (create path, `isEdit=false`) into ds SectionHeader groups matching the desktop section grouping and label wording (user-facing copy only):
  - BASIC INFO: name (label "Name *", required), dbaName ("DBA Name"), mcNumber ("MC Number"), dotNumber ("DOT Number"), taxId ("Tax ID / EIN")
  - ADDRESS: addressLine1 ("Address Line 1"), addressLine2 ("Address Line 2"), city ("City"), state ("State", maxLength 2, autoCapitalize characters, uppercase on change), zip ("ZIP", inputMode numeric), country ("Country", default 'US')
  - CONTACT: primaryContact ("Primary Contact"), phone ("Phone", inputMode tel), email ("Email", type email, inputMode email, autoCapitalize none), website ("Website")
  - BILLING: paymentTerms ("Payment Terms (days)", type number, default '30'), creditLimit ("Credit Limit ($)", type number)
  - PORTAL ACCESS: portalAccess as a ds `Toggle` (label "Client portal access"); when ON, render a portalEmail FieldGroup field ("Portal Email *", type email) — conditional, mirror desktop
  - NOTES: notes ("Notes", multiline)

Address is MANUAL entry — do NOT use AddressAutocomplete (drop the `parseFormattedAddress`/`US_STATES` autocomplete logic from the desktop form; ds forms are manual per the established pattern).

Port validation EXACTLY from `ClientForm.validate()`: name required ("Name is required"); email valid format if present ("Enter a valid email address"); state ≤2 chars ("State must be 2 characters max"); if portalAccess ON then portalEmail required ("Portal email is required when portal access is enabled") and must be valid ("Enter a valid portal email address"). Clear a field's error on change (mirror facility). On failed validate, scroll to first error via `document.getElementById('field-<key>')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.

Build the POST body IDENTICALLY to `ClientForm.handleSubmit` create path: trimmed name, conditional-spread optional string fields, `portalAccess: values.portalAccess`, conditional portalEmail, `paymentTerms: parseInt(...) || 30`, conditional creditLimit, conditional notes. `fetch('/api/v1/carrier/clients', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })`. On !res.ok throw `data.detail ?? data.error ?? 'Failed to create client'`. On success: `navigator.vibrate?.(10)`, `toast.success('Client created')`, `router.push('/carrier/clients')`, `router.refresh()`. On error: `toast.error(...)` and reset saving. NavHeader Cancel + PrimaryButton label "Create client"; `canSave = name.trim().length > 0 && !saving`.

Then modify `apps/web/src/app/(owner)/carrier/clients/new/page.tsx` to render BOTH (copy the facility page.tsx pattern):
  - `<div className="lg:hidden -m-4"><ClientCreateMobile /></div>` (NEW)
  - `<div className="hidden lg:block space-y-6">` wrapping the EXISTING back-link + heading + `<ClientForm />` card, UNCHANGED
Wrap in a `<>...</>` fragment. Do NOT touch `ClientForm.tsx`.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` shows no NEW errors in the two touched files (repo has ~35 baseline errors — only regressions in touched files count). Grep confirms `fetch` targets `/api/v1/carrier/clients` and page.tsx contains both `lg:hidden` ClientCreateMobile and `hidden lg:block` ClientForm.
  </verify>
  <done>
At a phone viewport `/carrier/clients/new` renders MobileScreen + NavHeader (Cancel/Create) + grouped FieldGroup sections + PrimaryButton; submitting a valid form POSTs to `/api/v1/carrier/clients` and navigates to `/carrier/clients`. Desktop (lg+) is visually unchanged. Committed atomically: `feat(quick-474): rebuild New Client create form on mobile ds`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rebuild New Driver create form on mobile ds</name>
  <files>
    apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx (new)
    apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx (modify — add mobile wrapper only)
  </files>
  <action>
Create `DriverCreateMobile.tsx` as a `'use client'` component mirroring `FacilityCreateMobile.tsx`'s structure. Import only from `@/components/ui/ds`. It takes a `facilities: { id: string; name: string }[]` prop (the drivers `page.tsx` is a server component that already fetches `facilitiesResult` — pass it down; do NOT client-fetch options).

Port EVERY field from the desktop `CarrierDriverForm.tsx` (create path, `isEdit=false`) into ds SectionHeader groups matching the desktop grouping/labels:
  - BASIC INFO: firstName ("First Name *", required), lastName ("Last Name *", required), email ("Email", type email, inputMode email, autoCapitalize none), phone ("Phone", inputMode tel)
  - LICENSE INFORMATION: cdlNumber ("License Number"), cdlState ("License State", native select via FieldDef `input.options`), cdlClass ("License Class", select), cdlExpiry ("License Expiry", FieldDef `input.type: 'date'`)
  - PAY CONFIGURATION: homeTerminalId ("Home Terminal", select from `facilities` prop), payModel ("Pay Model", select, default 'per_mile'), payRate (type number — label is DYNAMIC via PAY_RATE_LABELS keyed on payModel, mirror desktop), payPeriod ("Pay Period", select, default 'weekly')
  - NOTES: notes ("Notes", multiline)

Do NOT include the Status field — desktop only shows it when `isEdit` (create omits it). No avatar on a create form (follow FacilityCreateMobile).

Define the select option constants INLINE in this component (do not client-fetch), matching the desktop `<SelectItem>` values EXACTLY:
  - US_STATES array (same 50 as CarrierDriverForm) → options `[{ label: 'Select state…', value: '' }, ...states.map(s => ({label:s, value:s}))]`
  - cdlClass options: `[{label:'Select class…',value:''},{label:'Class A (CDL)',value:'A'},{label:'Class B (CDL)',value:'B'},{label:'Class C (CDL)',value:'C'},{label:'Class D (Non-CDL)',value:'D'},{label:'Class E (Non-CDL)',value:'E'},{label:'Non-CDL / Other',value:'OTHER'}]`
  - homeTerminal options: `[{label:'Select terminal…',value:''}, ...facilities.map(f => ({label:f.name, value:f.id}))]`
  - payModel options: per_mile "Per Mile", percentage_gross "Percentage of Gross", hourly "Hourly", flat_rate "Flat Rate", team_split "Team Split"
  - payPeriod options: weekly "Weekly", biweekly "Bi-weekly", monthly "Monthly"
  - PAY_RATE_LABELS: same map as desktop (per_mile/team_split "Rate per Mile ($)", percentage_gross "Percentage of Gross (%)", hourly "Hourly Rate ($)", flat_rate "Flat Rate ($)")

GOTCHA (documented): for fields that default to empty string (cdlState, cdlClass, homeTerminalId) the native `<select value="">` MUST have a matching option with `value=''` or it silently shows the wrong first option — hence the "Select…" placeholder options above. payModel/payPeriod default to real values that already match an option.

Validation mirrors desktop: firstName required, lastName required (desktop uses `toast.error`; here follow the ds pattern — set field errors and scroll to first via `document.getElementById('field-<key>')`, and/or toast, but at minimum block submit when either name is empty). `canSave = firstName.trim() && lastName.trim() && !saving`.

Build the POST body IDENTICALLY to `CarrierDriverForm.handleSubmit` create path: trimmed firstName/lastName, conditional-spread email/phone/cdlNumber/cdlState/cdlClass/cdlExpiry/homeTerminalId, `payModel`, conditional `payRate: Number(...)`, `payPeriod`, conditional notes. Omit status on create. `fetch('/api/v1/carrier/fleet/drivers', { method: 'POST', ... })`. On !res.ok throw `data.error ?? 'Failed to create driver'`. On success: `navigator.vibrate?.(10)`, `toast.success('Driver created')`, `router.push('/carrier/fleet/drivers')`, `router.refresh()`. NavHeader Cancel + PrimaryButton "Create driver".

Then modify `apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx` (keep it a server component — it already awaits session + `listFacilities`). Render BOTH:
  - `<div className="lg:hidden -m-4"><DriverCreateMobile facilities={facilitiesResult.items.map(f => ({ id: f.id, name: f.name }))} /></div>` (NEW)
  - `<div className="hidden lg:block space-y-6">` wrapping the EXISTING back-link + heading + `<CarrierDriverForm facilities={...} />` card, UNCHANGED
Wrap in `<>...</>`. Do NOT touch `CarrierDriverForm.tsx`.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` shows no NEW errors in the two touched files. Grep confirms `fetch` targets `/api/v1/carrier/fleet/drivers`, select options include empty-value placeholders for cdlState/cdlClass/homeTerminal, and page.tsx contains both `lg:hidden` DriverCreateMobile and `hidden lg:block` CarrierDriverForm.
  </verify>
  <done>
At a phone viewport `/carrier/fleet/drivers/new` renders MobileScreen + NavHeader (Cancel/Create) + grouped FieldGroup sections (with working native selects showing correct placeholder, not a wrong first option) + PrimaryButton; submitting POSTs to `/api/v1/carrier/fleet/drivers` and navigates to `/carrier/fleet/drivers`. Desktop (lg+) unchanged. Committed atomically: `feat(quick-474): rebuild New Driver create form on mobile ds`.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — no new errors in the 4 touched files (baseline ~35 errors tolerated).
- Both `page.tsx` files render `lg:hidden` mobile component + `hidden lg:block` unchanged desktop form.
- `ClientForm.tsx` and `CarrierDriverForm.tsx` are byte-for-byte unchanged (git diff shows no changes to them).
- Mobile POST bodies + endpoints + client-side validation match their desktop counterparts.
- No schema/migration changes. No address autocomplete added. No tenant/orgId logic in the mobile components.
</verification>

<success_criteria>
- `/carrier/clients/new` and `/carrier/fleet/drivers/new` render the mobile ds layout at phone widths and the unchanged desktop form at lg+.
- Submitting either mobile form creates the record via the SAME endpoint the desktop form uses and navigates to the correct list (`/carrier/clients`, `/carrier/fleet/drivers`).
- Native selects show correct placeholder / selected option (empty-value gotcha handled).
- Two atomic commits, one per page. Executor commits only — NO git push, NO deploy.
</success_criteria>

<output>
After completion, create `.planning/quick/474-mobile-ds-rebuild-new-client-new-driver-/474-SUMMARY.md`.
</output>
