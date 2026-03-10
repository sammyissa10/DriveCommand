---
phase: quick-51
plan: 01
subsystem: drivers
tags: [drivers, forms, schema, prisma, validation]
dependency_graph:
  requires: []
  provides: [expanded-driver-invite-form, driver-invitation-extended-fields]
  affects: [prisma/schema.prisma, driver-invite-form, driver-actions, zod-schemas]
tech_stack:
  added: []
  patterns: [formData-server-action, optional-field-validation, prisma-db-push]
key_files:
  created: []
  modified:
    - prisma/schema.prisma
    - src/lib/validations/driver.schemas.ts
    - src/components/drivers/driver-invite-form.tsx
    - src/app/(owner)/actions/drivers.ts
decisions:
  - "New fields added to DriverInvitation only (not User model) — User model update deferred; updateDriver action validates new fields but does not persist until User schema is extended"
metrics:
  duration: "190s"
  completed: "2026-03-10"
  tasks: 2
  files: 4
---

# Quick 51: TKT-0009 Expand Driver Invite Form with Comprehensive Driver Fields

Expanded driver invite/creation form from 4 fields to 10 fields — adding middle name, full name preview, date of birth, phone number, address, and license expiration date, with DB schema migration and full Zod validation coverage.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add new fields to DriverInvitation schema and Zod validations | 7b3d21a | prisma/schema.prisma, driver.schemas.ts |
| 2 | Update invite form UI and server action | f0b5bc0 | driver-invite-form.tsx, drivers.ts |

## What Was Built

**Schema changes (prisma/schema.prisma):**
- Added `middleName String?`, `fullName String?`, `dateOfBirth DateTime? @db.Date`, `phoneNumber String?`, `address String?`, `licenseExpirationDate DateTime? @db.Date` to `DriverInvitation` model
- Ran `prisma db push` to sync PostgreSQL schema and `prisma generate` to regenerate client

**Validation (driver.schemas.ts):**
- `driverInviteSchema`: added middleName (max 50, optional), dateOfBirth (string, optional), phoneNumber (7-20 chars, phone format regex, optional), address (max 200, optional), licenseExpirationDate (string, optional)
- `driverUpdateSchema`: same new fields added for future edit form compatibility

**Form UI (driver-invite-form.tsx):**
- Added `useState` tracking for firstName/middleName/lastName to power live full name preview
- New field layout: Email → First/Last Name grid → Middle Name → Full Name preview → DOB/Phone grid → Address → License Number/Expiration grid
- All new fields styled consistently with existing inputClass/labelClass patterns
- Field-level error displays added for all new fields
- Form key remount on success preserves existing reset behavior

**Server action (drivers.ts - inviteDriver):**
- Extracts all 5 new fields from formData
- Includes in Zod rawData for validation
- Computes `fullName = [firstName, middleName, lastName].filter(Boolean).join(' ')` server-side
- Converts dateOfBirth and licenseExpirationDate strings to Date objects (or null if empty)
- Passes all new fields to `prisma.driverInvitation.create`
- Existing email non-blocking pattern untouched

## Deviations from Plan

### Auto-handled Issues

**1. [Rule 1 - Bug Prevention] updateDriver new fields not persisted to User model**
- **Found during:** Task 2
- **Issue:** Plan said to pass new fields to `prisma.user.update`, but the User model does not have these columns (middleName, dateOfBirth, phoneNumber, address, licenseExpirationDate). Attempting to pass them would cause Prisma type errors.
- **Fix:** Extracted and validated new fields in updateDriver for future compatibility, but only passed User-model-compatible fields to the actual update. Added comment noting User model needs extension before full edit support.
- **Files modified:** src/app/(owner)/actions/drivers.ts
- **Commit:** f0b5bc0

## Verification

- `npx prisma validate` — passed
- `npx tsc --noEmit` — passed (no type errors)
- `npm run build` — succeeded
- Schema synced to DB via `prisma db push`
- All 9 form fields present: Email, First Name, Last Name, Middle Name, Full Name (preview), Date of Birth, Phone Number, Address, License Number, License Expiration Date

## Self-Check: PASSED

### Files Exist
- FOUND: prisma/schema.prisma
- FOUND: src/lib/validations/driver.schemas.ts
- FOUND: src/components/drivers/driver-invite-form.tsx
- FOUND: src/app/(owner)/actions/drivers.ts

### Commits Exist
- FOUND: 7b3d21a (Task 1)
- FOUND: f0b5bc0 (Task 2)
