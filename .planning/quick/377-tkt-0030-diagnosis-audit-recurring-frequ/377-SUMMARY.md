---
phase: quick
plan: "377"
subsystem: carrier-route-templates
tags: [diagnosis, tkt-0030, recurring-frequency, route-templates]
dependency_graph:
  requires: []
  provides: [tkt-0030-verdict]
  affects: [carrier/templates/new, RouteTemplate]
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/377-tkt-0030-diagnosis-audit-recurring-frequ/377-SUMMARY.md
  modified: []
decisions: []
metrics:
  duration: "~15 minutes"
  completed: "2026-05-19"
---

# TKT-0030 — Recurring Frequency Field Diagnosis

**Status:** Resolved — field is already a bounded `<Select>` component (not a free-text box).
**Filed:** Apr 7, 2026 by demo@drivecommand.com (Mobile platform tag)
**Page reported:** /carrier/templates/new
**Diagnosis date:** 2026-05-19

---

## 1. Desktop form

- **File:** `apps/web/src/app/(owner)/carrier/templates/new/page.tsx`
- **Form component:** `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx`
- **Field identifier:** `rruleFrequency` (state variable of type `'DAILY' | 'WEEKLY' | 'MONTHLY'`)
- **Current input type:** `<Select>` (shadcn/ui `Select` component — not a free-text input)
- **Verbatim JSX:**

```tsx
{/* Frequency selector */}
<div className="space-y-1.5">
  <label className="text-sm font-medium text-foreground" htmlFor="rruleFrequency">
    Recurrence Frequency
  </label>
  <Select
    value={rruleFrequency}
    onValueChange={(val) => setRruleFrequency(val as 'DAILY' | 'WEEKLY' | 'MONTHLY')}
  >
    <SelectTrigger id="rruleFrequency">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="DAILY">Daily</SelectItem>
      <SelectItem value="WEEKLY">Weekly</SelectItem>
      <SelectItem value="MONTHLY">Monthly</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- **Client-side value constraint:** TypeScript union literal `'DAILY' | 'WEEKLY' | 'MONTHLY'` enforced via `onValueChange` cast. The options array is hard-coded in the JSX (no separate `const` options array, but values are completely bounded).
- **Visibility condition:** This field only renders when `scheduleType === 'fixed_days' || scheduleType === 'frequency'`. For `scheduleType === 'on_call'`, the recurrence section is hidden entirely.

**Additional context — RRULE builder pattern:**
The form uses `rruleFrequency` to drive a recurrence rule builder. The final persisted value is not `rruleFrequency` itself but the generated RRULE string stored in `recurrenceRule` (mapped to `recurrence_rule` in the DB). Examples:
- `DAILY` → `FREQ=DAILY`
- `WEEKLY` + selected days → `FREQ=WEEKLY;BYDAY=MO,WE,FR`
- `MONTHLY` + day numbers → `FREQ=MONTHLY;BYMONTHDAY=1,15`

---

## 2. Prisma schema (RouteTemplate)

- **File:** `apps/web/prisma/schema.prisma`
- **Model:** `RouteTemplate` (`@@map("route_templates")`)
- **Frequency-related fields:**

```prisma
model RouteTemplate {
  id                     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId                  String   @map("org_id") @db.Uuid
  templateName           String   @map("template_name")
  clientId               String   @map("client_id") @db.Uuid
  contractId             String?  @map("contract_id") @db.Uuid
  scheduleType           String   @map("schedule_type")
  recurrenceRule         String?  @map("recurrence_rule")
  recurrenceTimezone     String   @default("America/Chicago") @map("recurrence_timezone")
  scheduledDepartureTime String?  @map("scheduled_departure_time")
  equipmentType          String   @map("equipment_type")
  ...
  @@map("route_templates")
}
```

- **`recurrenceRule` field:** `String?` (nullable plain text). No `@db.*` type decorator — defaults to `text` in PostgreSQL. Stores an RRULE string (e.g. `FREQ=WEEKLY;BYDAY=MO,WE`).
- **`scheduleType` field:** `String` (non-nullable). Constrained by a DB CHECK constraint (see section 4).
- **No Prisma enum** for frequency or recurrence — the RRULE approach bypasses the need for a simple enum. The `rruleFrequency` UI control is form-local state only; it is never persisted directly.
- **Related enum:** none — no Prisma `enum` type is used for any frequency-related field.

---

## 3. Shared validation (packages/validation)

- **Search result:** No route template schema exists in `packages/validation/src/`.
- **Grep patterns searched:** `routeTemplate`, `RouteTemplate`, `frequency`, `recurrence` — all returned no matches.
- **Finding:** Route template validation is handled entirely in `RouteTemplateForm.tsx` (inline `validate()` function) and the `saveRouteTemplate` server action. No shared Zod schema for frequency/recurrence values.

---

## 4. Live DB CHECK constraints (Supabase introspection)

**Query:** `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'route_templates'::regclass AND contype = 'c'`

**Result:**

| conname | definition |
|---------|------------|
| `route_templates_equipment_type_check` | `CHECK ((equipment_type = ANY (ARRAY[('dry_van'::character varying)::text, ('flatbed'::character varying)::text, ('reefer'::character varying)::text, ('tanker'::character varying)::text, ('step_deck'::character varying)::text, ('other'::character varying)::text])))` |
| `route_templates_schedule_type_check` | `CHECK ((schedule_type = ANY (ARRAY[('fixed_days'::character varying)::text, ('frequency'::character varying)::text, ('on_call'::character varying)::text])))` |

**Frequency-related constraint:** None. The `recurrence_rule` column has no CHECK constraint — it is an unconstrained `text?` field. Only `schedule_type` and `equipment_type` are constrained by DB CHECK.

**Column definition for `recurrence_rule` (from `information_schema.columns`):**

| column_name | data_type | udt_name | varchar_length | is_nullable | column_default |
|-------------|-----------|----------|----------------|-------------|----------------|
| `recurrence_rule` | `text` | `text` | null | `YES` | null |

**Full `route_templates` column list (for completeness):**

| column_name | data_type | is_nullable | column_default |
|-------------|-----------|-------------|----------------|
| id | uuid | NO | gen_random_uuid() |
| org_id | uuid | NO | null |
| template_name | text | NO | null |
| client_id | uuid | NO | null |
| contract_id | uuid | YES | null |
| schedule_type | text | NO | null |
| recurrence_rule | text | YES | null |
| recurrence_timezone | text | NO | 'America/Chicago'::character varying |
| scheduled_departure_time | text | YES | null |
| equipment_type | text | NO | null |
| temp_min_f | integer | YES | null |
| temp_max_f | integer | YES | null |
| max_weight_lbs | integer | YES | null |
| commodity_description | text | YES | null |
| estimated_miles | integer | YES | null |
| default_driver_id | uuid | YES | null |
| default_truck_id | uuid | YES | null |
| auto_generate_days_ahead | integer | NO | 7 |
| active | boolean | NO | true |
| notes | text | YES | null |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | null |
| created_by_id | uuid | YES | null |
| updated_by_id | uuid | YES | null |

---

## 5. Mobile app parity (apps/mobile)

- **Search scope:** `apps/mobile/app/(owner)/` — all folders and files.
- **Route template create screen:** **Does not exist.**
- **Evidence:** The mobile owner portal has: `_layout.tsx`, `drivers/`, `loads/`, `map.tsx`, `more/`, `routes/`, `index.tsx`. No `templates/` folder, no `route-template*` files.
- **The `routes/` folder** (`apps/mobile/app/(owner)/routes/new.tsx`) is for creating regular **Routes** (origin/destination, stops, driver/truck assignment) — not carrier route templates. It uses `TextInput` for addresses but no frequency/recurrence field exists there.
- **Grep confirmation:** Searching `apps/mobile/app/(owner)/` for `template`, `recurring`, `recurrence`, `frequency`, `cadence` returned zero matches.
- **Conclusion:** Route templates are a desktop-only feature. No mobile equivalent exists.

---

## 6. Spec-defined canonical values

- **Sources searched:**
  - `docs/specs/DriveCommand_Workflow_Engine_v2.md`
  - `docs/specs/workflow-engine.md`
  - `docs/specs/DriverPay_TechnicalSpec_v4.md`
  - `docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md`
  - `docs/specs/Notifications System Technical Documentation.md`
  - `docs/specs/tenant-self-onboarding/` (all files)
- **Result:** No spec-defined canonical values for route template recurrence frequency found. The only `frequency` mention in `DriveCommand_Workflow_Engine_v2.md` (line 367: `recurringConfig Json? // { frequency:"daily", daysOfWeek:[1..5], time:"07:00" }`) refers to **Playbook trigger configuration**, not route templates. This is a different model and different system.
- **Canonical values found:** None specific to route templates.

---

## 7. Comparison table

| Layer | Current state |
|-------|---------------|
| Desktop form input — `rruleFrequency` | `<Select>` with hard-coded options: `DAILY`, `WEEKLY`, `MONTHLY` |
| Mobile form input | Screen does not exist (desktop-only feature) |
| Prisma field type — `recurrenceRule` | `String?` (stores RRULE string; no enum) |
| DB CHECK constraint on `recurrence_rule` | None — column is unconstrained `text?` |
| Spec-defined canonical values | None found in any spec document |

---

## 8. Verdict

**A — Already resolved:** The recurring frequency field on `/carrier/templates/new` is **not** a free-text input. It is a fully bounded `<Select>` component (shadcn/ui) with exactly three options: Daily, Weekly, Monthly. The field is labeled "Recurrence Frequency" and is conditionally shown only when `scheduleType` is `fixed_days` or `frequency`. The persisted value (`recurrence_rule`) is an RRULE string auto-generated by the form from the select value plus day-picker sub-controls. No free-text input for frequency exists anywhere in the form. TKT-0030 should be closed. The most likely explanation is that the ticket was filed against an older version of the form (before the RRULE builder was added), or the reporter viewed the form in a state where the recurrence section was hidden and navigated to a text field in a different section.

**Close TKT-0030.**

---

## 9. Recommended (NOT chosen) canonical values

Not applicable — Verdict is A (already resolved). No canonical value decision is needed.

---

## 10. Files inspected (no modifications)

- `apps/web/src/app/(owner)/carrier/templates/new/page.tsx`
- `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx`
- `apps/web/prisma/schema.prisma` (RouteTemplate model at lines 2090–2131, RouteTemplateStop at lines 2133–2158)
- `packages/validation/src/` (full grep — no route template schemas found)
- `apps/mobile/app/(owner)/` (directory listing + grep)
- `apps/mobile/app/(owner)/routes/new.tsx` (top section — confirmed regular Route, not template)
- `docs/specs/DriveCommand_Workflow_Engine_v2.md`
- `docs/specs/DriverPay_TechnicalSpec_v4.md`
- `docs/specs/tenant-self-onboarding/04-SCHEMA-RECONCILIATION.md`
- `docs/specs/tenant-self-onboarding/06-PHASE-49-RECONCILIATION.md`
- Supabase live DB (via Prisma `$queryRawUnsafe`): `pg_constraint` + `information_schema.columns` for `route_templates`

---

## 11. Notes

- **Mobile platform tag on ticket:** The ticket was tagged "Mobile" but the reported URL is `/carrier/templates/new`, which is a desktop owner route (no mobile equivalent exists). The reporter almost certainly opened the desktop site in a mobile browser. No mobile route template screen exists to fix.
- **RRULE architecture:** The form does not store `DAILY`/`WEEKLY`/`MONTHLY` directly in the DB. It stores an RFC 5545 RRULE string (e.g. `FREQ=WEEKLY;BYDAY=MO,TH`) in the `recurrence_rule` column. The `rruleFrequency` select is a UI-only construct that seeds the RRULE builder. This means the DB column is intentionally unconstrained text — the constraint lives at the application layer (the select options).
- **No DB CHECK on `recurrence_rule`:** This is by design given the RRULE approach. Adding a CHECK constraint here would be incorrect (RRULE strings are variable in structure). The constraint on `schedule_type` correctly gates which records even have a recurrence rule.
- **Consistency check:** Prisma (`String?`) and DB (`text`, nullable) are in full agreement for `recurrence_rule`. No schema drift detected.
