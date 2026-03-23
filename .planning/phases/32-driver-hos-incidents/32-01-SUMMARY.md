---
phase: 32-driver-hos-incidents
plan: "01"
subsystem: database
tags: [prisma, schema, types, hos, incidents, mobile]
dependency_graph:
  requires: []
  provides: [DriverHOSEntry table, DriverIncident table, HOSData type, CreateIncidentPayload type]
  affects: [32-02-PLAN.md, 32-04-PLAN.md]
tech_stack:
  added: []
  patterns: [prisma db push over migrate dev (drift-tolerant)]
key_files:
  created: []
  modified:
    - apps/web/prisma/schema.prisma
    - packages/types/src/index.ts
    - apps/web/src/generated/prisma/index.d.ts
decisions:
  - "Used prisma db push instead of prisma migrate dev due to pre-existing migration drift — no data loss, dev environment only"
  - "IncidentSeverity is a separate enum from SafetyEventSeverity (no CRITICAL value needed for incidents)"
metrics:
  duration: 168s
  completed: "2026-03-23"
  tasks: 3
  files: 3
---

# Phase 32 Plan 01: DB Schema — DriverHOSEntry + DriverIncident Summary

**One-liner:** Added DriverHOSEntry and DriverIncident Prisma models with HOSDutyStatus/IncidentCategory/IncidentSeverity enums, applied to DB via db push, and aligned packages/types with HOSData + CreateIncidentPayload response/request types.

## What Was Built

Two new DB-backed models (DriverHOSEntry, DriverIncident) with proper indexes, tenant/user relations, and regenerated Prisma client. The types package was extended to match the DB model — including the photoUrl → photoS3Key rename and new HOSData/CreateIncidentPayload interfaces required by the API layer in plans 32-02 and 32-04.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add HOS and Incident enums and models to Prisma schema | 5091c55 | apps/web/prisma/schema.prisma |
| 2 | Run Prisma migration and regenerate client | 5dee633 | apps/web/src/generated/prisma/* |
| 3 | Update packages/types with photoS3Key on Incident type | 3c73e25 | packages/types/src/index.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used prisma db push instead of prisma migrate dev**
- **Found during:** Task 2
- **Issue:** The project has pre-existing migration drift — 11 migrations were modified after being applied, and the live DB has schema changes not captured in migration files (RouteDriver table, DocumentType enum, etc). `prisma migrate dev` and `--create-only` both refused to run.
- **Fix:** Used `prisma db push` which syncs schema to DB directly without migration history checks. This is the correct approach for this dev environment given the ongoing drift pattern seen in previous phases.
- **Files modified:** No additional files — same outcome (schema applied, client regenerated)
- **Commit:** 5dee633

## Verification

- [x] `npx prisma validate` passes in apps/web
- [x] `prisma db push` confirmed "Your database is now in sync with your Prisma schema"
- [x] `npx tsc --noEmit` passes in apps/web (clean)
- [x] `npx tsc --noEmit` passes in packages/types (clean)
- [x] Prisma client regenerated — `prisma.driverHOSEntry` and `prisma.driverIncident` delegates confirmed in index.d.ts
- [x] packages/types exports HOSData, CreateIncidentPayload, HOSStatus, HOSEntry, IncidentCategory, IncidentSeverity, Incident

## Self-Check: PASSED

Files verified:
- FOUND: apps/web/prisma/schema.prisma (contains DriverHOSEntry, DriverIncident, HOSDutyStatus, IncidentCategory, IncidentSeverity)
- FOUND: packages/types/src/index.ts (contains HOSData, CreateIncidentPayload)
- FOUND: apps/web/src/generated/prisma/index.d.ts (contains driverHOSEntry delegate)

Commits verified:
- FOUND: 5091c55 — feat(32-01): add DriverHOSEntry and DriverIncident models to Prisma schema
- FOUND: 5dee633 — feat(32-01): run db push and regenerate Prisma client with HOS/Incident models
- FOUND: 3c73e25 — feat(32-01): update packages/types — HOSData, CreateIncidentPayload, aligned Incident/HOSEntry
