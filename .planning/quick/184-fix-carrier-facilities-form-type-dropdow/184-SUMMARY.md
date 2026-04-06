---
phase: quick-184
plan: "01"
subsystem: carrier/facilities
tags: [carrier, facilities, form, prisma, migration]
dependency_graph:
  requires: []
  provides: [working-facility-form, lumper-appointment-toggles, dynamic-contacts]
  affects: [FacilityForm, CarrierFacility, facilities-api]
tech_stack:
  added: []
  patterns: [Switch toggles, dynamic array UI, JSONB contacts]
key_files:
  created:
    - apps/web/prisma/migrations/20260406000001_facility_lumper_appointment_contacts/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/facilities.ts
    - apps/web/src/app/api/v1/carrier/facilities/route.ts
    - apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts
    - apps/web/src/components/carrier/facilities/FacilityForm.tsx
    - apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
decisions:
  - "Kept contactName/Phone/Email columns in DB untouched; only removed them from form UI"
  - "contacts stored as JSONB array with name/phone/email/role per entry"
  - "Old facility types (distribution_center, cross_dock, etc.) replaced with 5 valid DB-enum values"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-05"
  tasks_completed: 2
  files_changed: 7
---

# Quick-184: Fix Carrier Facilities Form Type Dropdown

Fixed the carrier facilities form that threw a 500 DB constraint error on submit due to invalid facility type values. Added lumperRequired/appointmentRequired boolean toggles and replaced single contact fields with a dynamic multi-contact JSONB array.

## What Was Done

### Task 1: DB migration + Prisma schema + API schemas (623e7f0)

- Created migration `20260406000001_facility_lumper_appointment_contacts` adding `lumper_required` (BOOLEAN), `appointment_required` (BOOLEAN), and `contacts` (JSONB DEFAULT '[]') to the `facilities` table
- Added `lumperRequired`, `appointmentRequired`, `contacts` fields to `CarrierFacility` model in Prisma schema
- Extended `FacilityCreateInput` interface with the 3 new optional fields
- Added the 3 fields to Zod schemas in both POST (`/api/v1/carrier/facilities`) and PATCH (`/api/v1/carrier/facilities/[id]`) routes
- Regenerated Prisma client — no type errors

### Task 2: Rewrite FacilityForm (faa4ec7)

- Replaced `FACILITY_TYPES` array with exactly 5 valid DB values: `terminal`, `yard`, `warehouse`, `drop_yard`, `customer_site`
- Added Options section with Lumper Required and Appointment Required `Switch` toggles
- Replaced static single-contact fields (contactName/Phone/Email) with dynamic contacts array: Add Contact button adds rows, each with Name/Phone/Email/Role inputs and an X remove button
- `handleSubmit` sends `lumperRequired`, `appointmentRequired`, and `contacts` (filtered to non-empty name entries); removed old single-contact fields from POST/PATCH body
- Edit page (`[id]/page.tsx`) passes `lumperRequired`, `appointmentRequired`, and `contacts` from Prisma result to `FacilityForm`
- `tsc --noEmit` passes cleanly on `apps/web`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist
- `apps/web/prisma/migrations/20260406000001_facility_lumper_appointment_contacts/migration.sql` — FOUND
- `apps/web/src/components/carrier/facilities/FacilityForm.tsx` — FOUND
- `apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx` — FOUND

### Commits exist
- `623e7f0` — feat(quick-184): add lumper/appointment/contacts columns to CarrierFacility — FOUND
- `faa4ec7` — feat(quick-184): rewrite FacilityForm with correct types, toggles, dynamic contacts — FOUND

## Self-Check: PASSED
