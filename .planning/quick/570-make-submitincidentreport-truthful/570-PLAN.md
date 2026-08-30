# quick-570 — PLAN

**Mode:** quick · **Date:** 2026-08-30 · **Branch:** `master` · **Pre-task HEAD:** `d12b5a5c`

## The defect

`submitIncidentReport` validates its input, writes nothing, notifies nobody, and
returns *"Incident report submitted successfully. Dispatch has been notified."*
It is reachable from a driver quick action. `DriverIncident` holds 0 rows in
production.

## Pre-implementation findings (steps 1–3, reported before building)

- **No write, no notification anywhere on the path.** The file's only imports are
  `requireRole` and `UserRole`. `location` is read and never used.
- **Schema is sufficient without DDL**, with two mismatches:
  - form offers 8 types, `IncidentCategory` admits 5 (read from production
    `pg_enum`, per DEC-14). Only `ACCIDENT`/`OTHER` overlap.
  - `severity` is NOT NULL and the form does not collect it.
- **`driver.incident_reported` exists**, is seeded, and is live in production
  with `defaultHtmlCache` present and `defaultRecipients` = OWNER + MANAGER role
  rules. Nothing emits it. No new trigger needed.
- **No web page renders a `DriverIncident`** — the template's CTA has no true
  destination. Reported, not papered over.

## Decision (step 4): write and notify

The sentence is made true rather than deleted, because the model, a working
precedent (`/api/mobile/driver/incidents` POST) and a live trigger all exist.

## Tasks

### Task 1 — the action writes and notifies

- `INCIDENT_CATEGORY_MAP` — the 8 form values onto the 5 enum values, in one
  place, with the rationale. Lossy by construction, so the driver's exact
  selection and the `location` string are preserved in `notes` rather than
  discarded.
- Add a required `severity` field to the form. **Not derived, not defaulted** —
  a fabricated safety value is the defect this task exists to remove. Mobile's
  `SeverityToggle` is the precedent.
- Write inside `prisma.$transaction`, following the mobile route exactly.
- Build the notification payload **before** the deferral, then
  `emitNotificationAfterResponse('driver.incident_reported', …)` — after the
  response, never throws, cannot roll back the write (Section 11, step 5).
- `serializeError` in every catch. On a write failure return an error state —
  never a success message.
- `getMyIncidentReports` reads real rows instead of returning `[]`.

### Task 2 — the guard

A test that fails if the action reports success with no `DriverIncident` row.
Asserts on the real row, not on a mock. Must also pin that a notification
failure does not lose the incident.

## Gates

tsc probed in both apps · suite diffed against 1730/1600/66/61 · no DDL ·
`git worktree remove` never `Remove-Item`; no worktree for the baseline
(quick-567: `.env.local` is not copied and the baseline lies).
