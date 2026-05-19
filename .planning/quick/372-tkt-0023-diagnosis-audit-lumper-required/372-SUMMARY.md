---
phase: quick-372
plan: "372"
subsystem: carrier/facilities
tags: [diagnosis, carrier, facilities, tkt-0023, lumper, appointment]
dependency_graph:
  requires: []
  provides: [tkt-0023-verdict]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md
  modified: []
decisions:
  - "TKT-0023 is RESOLVED — both lumper_required and appointment_required are present in DB, Prisma, and UI form"
  - "TC-04 QA test script is not committed to the repo; quick-184 plan artifact used as equivalent spec reference"
metrics:
  duration: "~12 minutes"
  completed: "2026-05-18"
  tasks_completed: 2
  files_changed: 1
---

# Quick-372: TKT-0023 Diagnosis — Lumper Required / Appointment Required Audit

Audited TKT-0023 across four layers (spec, DB, Prisma model, UI form). Both fields are present in all three verifiable layers. TKT-0023 can be closed.

## Verdict

**TKT-0023 RESOLVED** — both `Lumper Required` and `Appointment Required` are fully wired end-to-end.

## Layer-by-Layer Result

| Field | In Spec? | In DB? | In Prisma model? | In UI form? |
|---|---|---|---|---|
| Lumper Required | YES (quick-184 plan, line 20) | YES (`lumper_required` BOOLEAN, live DB confirmed) | YES (`lumperRequired Boolean @default(false)`, schema.prisma:1974) | YES (Switch toggle, FacilityForm.tsx:392–402) |
| Appointment Required | YES (quick-184 plan, line 20) | YES (`appointment_required` BOOLEAN, live DB confirmed) | YES (`appointmentRequired Boolean @default(false)`, schema.prisma:1975) | YES (Switch toggle, FacilityForm.tsx:404–416) |

**Spec note:** The TC-04 QA test script HTML/PDF is not committed to the repository. The equivalent requirement spec is `.planning/quick/184-fix-carrier-facilities-form-type-dropdow/184-PLAN.md:20` which mandates both toggles appear and persist on save.

## Resolution History

TKT-0023 was filed 2026-04-05. quick-184 was executed the same day and shipped the full fix:

- `623e7f08` (2026-04-05 19:49) — `feat(quick-184): add lumper/appointment/contacts columns to CarrierFacility` — DB migration + Prisma schema + API Zod schemas
- `faa4ec78` (2026-04-05 19:50) — `feat(quick-184): rewrite FacilityForm with correct types, toggles, dynamic contacts` — Switch toggles rendered + values sent in POST/PATCH body

## Diagnosis File

Full evidence: `.planning/quick/372-tkt-0023-diagnosis-audit-lumper-required/372-DIAGNOSIS.md`

## Recommended Next Step

Close TKT-0023. No fix is needed — the feature is already live.
