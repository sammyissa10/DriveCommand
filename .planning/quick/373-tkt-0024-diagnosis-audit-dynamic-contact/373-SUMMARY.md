---
phase: 373-tkt-0024-diagnosis-audit-dynamic-contact
plan: "01"
subsystem: carrier/facilities
tags: [carrier, facilities, contacts, jsonb, diagnosis, tkt-0024]
dependency_graph:
  requires:
    - phase: quick-184
      provides: [dynamic-contacts, lumper-appointment-toggles, working-facility-form]
  provides: [tkt-0024-verdict, facility-contacts-audit]
  affects: [carrier/facilities, FacilityForm]
tech-stack:
  added: []
  patterns: [diagnosis-only, no-code-changes]
key-files:
  created:
    - .planning/quick/373-tkt-0024-diagnosis-audit-dynamic-contact/373-SUMMARY.md
  modified: []
key-decisions:
  - "TKT-0024 (dynamic facility contacts) is fully resolved — all four layers match the desired state"
  - "Legacy scalar contact columns (contact_name/phone/email) remain in DB and Prisma model as backward-compat, but are not written by the form or API"
  - "Note: TKT-0024 in STATE.md row 71 refers to a different ticket (truck inMaintenance toggle, quick-71); this diagnosis concerns TKT-0024 as referenced in the facility contacts context"
duration: ~8min
completed: 2026-05-18
---

# Quick Task 373: TKT-0024 Diagnosis — Dynamic Facility Contacts Audit

**Dynamic contacts JSONB array fully implemented across all four layers (DB, Prisma, Form UI, API action) by quick-184 on 2026-04-05 — TKT-0024 is resolved.**

---

## 1. Verdict

**TKT-0024 is already resolved.** All four layers — live DB columns, Prisma model, Form UI, and API/server action — reflect the desired dynamic contacts array (JSONB). The New Facility form at `/carrier/facilities/new` does NOT use single scalar fields; it uses a fully functional dynamic add/remove contacts array persisted as JSONB. No remediation is needed.

---

## 2. Evidence — Form UI

**File:** `apps/web/src/components/carrier/facilities/FacilityForm.tsx`

The form uses a **dynamic array UI**, not single scalar fields. Key evidence:

- **Lines 50–55:** `FacilityContact` interface with fields `name`, `phone`, `email`, `role`.
- **Lines 69–77:** `FacilityData` interface marks legacy scalars as read-only backward compat:
  ```typescript
  // Legacy single-contact fields (read-only, kept for backward compat)
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  // New fields
  contacts?: FacilityContact[];
  ```
- **Lines 153–155:** State initialized from `normalizeContacts(initialData?.contacts)` — JSONB array.
- **Lines 168–180:** `addContact()`, `removeContact()`, `updateContact()` — full dynamic array management.
- **Lines 192–208:** `handleSubmit` sends `contacts: filteredContacts` (filtered to entries with non-empty `name`). The old scalar fields (`contactName`, `contactPhone`, `contactEmail`) are NOT sent in the POST/PATCH body.
- **Lines 421–500:** JSX renders an "Add Contact" button (with `<Plus>` icon), an empty-state message, and a `contacts.map()` loop with four `<Input>` fields per row (`Name`, `Phone`, `Email`, `Role`) plus an X remove button. No single-field contact section exists.

The form has **no** `contactName` / `contactPhone` / `contactEmail` input elements.

---

## 3. Evidence — Prisma Model

**File:** `apps/web/prisma/schema.prisma` — `model CarrierFacility` at line 1958

Contact-related fields:

| Field | Prisma type | DB map | Notes |
|---|---|---|---|
| `contactName` | `String?` | `@map("contact_name")` | Legacy scalar, kept for backward compat, line 1971 |
| `contactPhone` | `String?` | `@map("contact_phone")` | Legacy scalar, kept for backward compat, line 1972 |
| `contactEmail` | `String?` | `@map("contact_email")` | Legacy scalar, kept for backward compat, line 1973 |
| `lumperRequired` | `Boolean @default(false)` | `@map("lumper_required")` | Added in quick-184, line 1974 |
| `appointmentRequired` | `Boolean @default(false)` | `@map("appointment_required")` | Added in quick-184, line 1975 |
| `contacts` | `Json @default("[]")` | (no @map, column name `contacts`) | JSONB array, added in quick-184, line 1976 |

The `contacts Json @default("[]")` field is present. No `@db.JsonB` annotation is required in Prisma — the `Json` type maps to `jsonb` in PostgreSQL by default.

---

## 4. Evidence — Live DB Columns

**Source:** Direct REST query to Supabase `facilities` table (`GET /rest/v1/facilities?limit=1`).

All columns returned by the live DB:

```
id, org_id, name, facility_type, address_line1, address_line2, city, state, zip, country,
latitude, longitude, contact_name, contact_phone, contact_email, notes, created_at, updated_at,
lumper_required, appointment_required, contacts, created_by, updated_by, deleted_at, deleted_by,
created_by_id, updated_by_id
```

Contact-relevant columns confirmed present:

| Column name | Type (inferred) | Value in sample row |
|---|---|---|
| `contact_name` | varchar / text | `null` (legacy scalar, not written by current form) |
| `contact_phone` | varchar / text | `null` (legacy scalar, not written by current form) |
| `contact_email` | varchar / text | `null` (legacy scalar, not written by current form) |
| `lumper_required` | boolean | `false` |
| `appointment_required` | boolean | `false` |
| `contacts` | jsonb | `[]` (empty array — correct JSONB default) |

The `contacts` column is JSONB and returns as a parsed JavaScript array (type `object`) — confirming the migration ran successfully. The migration file at `apps/web/prisma/migrations/20260406000001_facility_lumper_appointment_contacts/migration.sql` explicitly adds it as:
```sql
ADD COLUMN "contacts" JSONB NOT NULL DEFAULT '[]';
```

---

## 5. Evidence — Server Action / API Mapping

**Files:**
- `apps/web/src/app/api/v1/carrier/facilities/route.ts` — POST handler
- `apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts` — PATCH handler
- `apps/web/src/lib/carrier/facilities.ts` — `createFacility` / `updateFacility` functions

### Zod validation (both POST and PATCH):
Both route files accept `contacts` as an optional array:
```typescript
contacts: z.array(z.object({
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
})).optional(),
```
The legacy scalar fields (`contactName`, `contactPhone`, `contactEmail`) are also still in the Zod schemas as optional strings (backward compat), but the form never sends them.

### Data persistence (`apps/web/src/lib/carrier/facilities.ts`):
- `FacilityCreateInput` interface (lines 18–36) includes `contacts?: Array<{ name: string; phone?: string; email?: string; role?: string }>`.
- `createFacility` (line 98): spreads `data` directly into `prisma.carrierFacility.create({ data: { ...data, orgId } })` — the `contacts` array passes through to Prisma as-is, serialized to JSONB by the Prisma client.
- `updateFacility` (line 107): same pattern — `prisma.carrierFacility.update({ where: { id }, data })` — contacts array written directly.

No scalar-to-JSONB transformation is needed; Prisma handles serialization of the `Json` field.

---

## 6. Spec Intent

**Source:** `.planning/quick/184-fix-carrier-facilities-form-type-dropdow/184-PLAN.md`, line 21 and lines 146–147:
> `"Dynamic contacts array replaces single contact fields - user can add/remove multiple contacts"`
> `f. Replace the entire Contact section with a dynamic contacts array`

**Source:** `.planning/quick/184-fix-carrier-facilities-form-type-dropdow/184-SUMMARY.md`, lines 8 and 25:
> `provides: [working-facility-form, lumper-appointment-toggles, dynamic-contacts]`
> `"contacts stored as JSONB array with name/phone/email/role per entry"`

The desired state was a dynamic add/remove contacts UI persisted as JSONB with fields `name`, `phone`, `email`, `role` per entry. This matches the current implementation exactly.

**Note on TC-04 / QA test script:** The QA test script (Phase 26 deliverable) is not committed to the repository (confirmed by prior quick-372 diagnosis). No verbatim TC-04 quote is available. The quick-184 planning artifact serves as the authoritative requirement reference.

---

## 7. Comparison Table

| Layer | Current State | Desired State (per spec) | Match? |
|---|---|---|---|
| DB columns | `contacts` jsonb NOT NULL DEFAULT '[]' confirmed present in live `facilities` table; legacy `contact_name/phone/email` columns also present but null in practice | `contacts jsonb` | YES |
| Prisma model | `contacts Json @default("[]")` at schema line 1976; legacy `contactName/Phone/Email String?` fields also present as backward-compat stubs | `contacts Json?` (or `Json @default("[]")`) | YES |
| Form UI | Dynamic array UI: `addContact()`, `removeContact()`, `updateContact()` handlers; `contacts.map()` renders Name/Phone/Email/Role per row with X button; "Add Contact" button; no scalar `contactName/Phone/Email` inputs present | dynamic add/remove array | YES |
| Server action (API) | POST `/api/v1/carrier/facilities` and PATCH `/api/v1/carrier/facilities/:id` accept `contacts` array via Zod; `createFacility`/`updateFacility` pass contacts through to Prisma directly; JSONB written on save | writes `contacts` JSON array | YES |

**All four layers match. Status: RESOLVED.**

---

## 8. Most Recent Git Commit Touching FacilityForm.tsx

```
77e9f868  2026-05-14  fix(quick-314): Bug 42 - make FacilityForm Cancel context-aware via onCancel prop
afd6bb02  2026-04-16  chore: commit regenerated Prisma client and outstanding src fixes
432f22e9  2026-04-13  feat(quick-204): add AddressAutocomplete to FacilityForm and ClientForm
7f3ce44b  2026-04-05  fix(quick-186): fix facility types, contact display, payment fields, portal toggle
c0c9aed0  2026-04-05  fix(quick-185): fix facility search modal bugs in stop builder
```

**Most recent commit:** `77e9f868` (2026-05-14) — `fix(quick-314): Bug 42 - make FacilityForm Cancel context-aware via onCancel prop`

This commit is unrelated to contacts (it added the `onCancel` prop). The contacts rewrite was committed in:
- `faa4ec7` (2026-04-05) — `feat(quick-184): rewrite FacilityForm with correct types, toggles, dynamic contacts`
- `623e7f0` (2026-04-05) — `feat(quick-184): add lumper/appointment/contacts columns to CarrierFacility` (schema + migration)

No commit referencing TKT-0024 (dynamic contacts) directly was found — the work was shipped under the quick-184 task label.

**Sidebar on TKT-0024 numbering:** STATE.md row 71 shows a different `TKT-0024` entry: "Add manual In Maintenance toggle — inMaintenance DB field" (quick-71, completed 2026-03-15, commit `2780dd6`). That ticket is about truck maintenance status, not facility contacts. The facility contacts ticket (this diagnosis subject) appears to have been tracked informally as part of the quick-184 scope rather than as a formal TKT-0024 assignment.

---

## 9. Recommended Next Step

None required. TKT-0024 (dynamic facility contacts) is fully resolved.

**Optional clean-up (not blocking):** The legacy scalar columns `contact_name`, `contact_phone`, `contact_email` remain in the DB, Prisma model, and API Zod schemas as backward-compat stubs. They are never written by the current form or API. If desired, a future migration could drop these columns and remove them from the Prisma model and Zod schemas to reduce confusion — but this is cosmetic only and carries no functional impact.

---

## Self-Check

### Files exist
- `.planning/quick/373-tkt-0024-diagnosis-audit-dynamic-contact/373-SUMMARY.md` — FOUND (this file)

### No source file modifications
- All evidence gathered via read-only operations (file reads, grep, git log, DB REST query).
- `git status` shows only new untracked files: `373-PLAN.md` and `373-SUMMARY.md`. No tracked files modified.

## Self-Check: PASSED
