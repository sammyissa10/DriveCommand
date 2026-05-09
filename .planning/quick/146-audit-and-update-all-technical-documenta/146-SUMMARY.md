---
phase: quick-146
plan: 01
subsystem: documentation
tags: [auth, supabase, mobile, docs, architecture]

requires: []
provides:
  - Accurate web auth docs reflecting supabase.ts consolidation (session.ts/server.ts removed)
  - Accurate mobile API endpoint tree matching actual filesystem
  - Accurate mobile navigation tree matching actual app/ directory
  - Deployment and setup docs referencing Gmail SMTP and SUPABASE_SERVICE_ROLE_KEY
  - SysAdmin Invoicing module documented in modules.md
affects: [future-phases, onboarding, mobile-dev-setup]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - apps/web/docs/auth.md
    - apps/web/docs/architecture.md
    - apps/web/docs/stack.md
    - apps/web/docs/setup.md
    - apps/web/docs/deployment.md
    - apps/web/docs/modules.md
    - apps/mobile/docs/architecture.md
    - apps/mobile/docs/local-development.md

key-decisions:
  - "auth.md: Consolidated session.ts + server.ts references to single supabase.ts module"
  - "architecture.md: Updated AES-256-GCM entry to describe Supabase Auth via @supabase/ssr"
  - "mobile architecture.md: ADR-001 context updated to remove stale AES-256-GCM reference"
  - "modules.md: SysAdmin Invoicing added as module 21 (Phase 25 work was undocumented)"

duration: 25min
completed: 2026-03-31
---

# Quick Task 146: Audit and Update All Technical Documentation

**Surgical doc audit fixing auth drift (session.ts -> supabase.ts), stale AES-256-GCM references, incomplete mobile API/navigation trees, and missing Gmail SMTP + SUPABASE_SERVICE_ROLE_KEY in deployment docs**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-03-31
- **Tasks:** 2 of 2
- **Files modified:** 8

## Accomplishments

- Replaced all `session.ts` and `server.ts` auth file references with `supabase.ts` across web docs; added `permissions.ts`, `guards.tsx`, `auth-context.tsx`, and `requirePermission()` to auth.md
- Removed stale AES-256-GCM session cookie references from both web architecture.md and mobile architecture.md (including ADR-001 context section)
- Expanded mobile API tree in architecture.md from 4 owner endpoints to the full 16 owner + 8 driver endpoints matching the actual filesystem
- Updated mobile navigation tree to match actual `app/` directory: `login.tsx` (not `sign-in.tsx`), `routes/`, `settings/`, `invoices/[id].tsx`, `ai-documents.tsx`, `compliance.tsx`, `fuel.tsx`, `payroll.tsx`, `safety.tsx`, `profit-predictor.tsx`, driver `incidents/new.tsx`, `loads/my-route.tsx`
- Fixed `setup.md`: promoted Gmail SMTP vars to primary, demoted RESEND_API_KEY to legacy, added `SUPABASE_SERVICE_ROLE_KEY`, removed duplicate rows
- Fixed `deployment.md`: checklist now references Gmail SMTP and `SUPABASE_SERVICE_ROLE_KEY` instead of Resend
- Added SysAdmin Invoicing (Phase 25) as module 21 in `modules.md`
- Marked `bcryptjs` as legacy in `stack.md` (passwords now managed by Supabase Auth)

## Task Commits

1. **Task 1: Update web docs** - `293b80e` (docs)
2. **Task 2: Update mobile docs** - `025cf19` (docs)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `apps/web/docs/auth.md` - Updated key files list; renamed helpers section; added requirePermission
- `apps/web/docs/architecture.md` - Updated lib/auth/ listing; updated lib/db/ listing; fixed mobile API auth description; replaced AES-256-GCM entry
- `apps/web/docs/stack.md` - Marked bcryptjs as legacy
- `apps/web/docs/setup.md` - Gmail SMTP as primary email; SUPABASE_SERVICE_ROLE_KEY added; RESEND_API_KEY demoted; duplicate rows removed
- `apps/web/docs/deployment.md` - Checklist updated: Gmail SMTP + SUPABASE_SERVICE_ROLE_KEY
- `apps/web/docs/modules.md` - SysAdmin Invoicing added as module 21; Shipment Tracking renumbered to 22
- `apps/mobile/docs/architecture.md` - Full API tree expansion; full navigation tree update; auth description fixed; Key Design Decisions updated; ADR-001 context updated
- `apps/mobile/docs/local-development.md` - sign-in.tsx -> login.tsx in project structure

## Decisions Made

- Kept `bcryptjs` in `stack.md` but marked as legacy rather than removing it — the package is still in package.json and the `passwordHash` field is still in the schema (nullable)
- Kept historical note in ADR-001 that web previously used cookies (to explain why mobile JWT was the right choice) without mentioning AES-256-GCM specifically
- Did not modify `api.md` in mobile docs (33KB comprehensive file, plan explicitly said skip it)
- Database model count (37) already matched schema — no change needed to `database.md`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `setup.md` originally had Gmail SMTP vars in two places in the env table (moved from one position to another in a prior partial edit). Removed the duplicate rows in a single clean edit.

## Self-Check

- `apps/web/docs/auth.md` — exists, contains `supabase.ts` reference
- `apps/web/docs/architecture.md` — exists, no AES-256-GCM reference
- `apps/mobile/docs/architecture.md` — exists, no AES-256-GCM reference, includes `login.tsx`, `routes/`, `settings/`, `ai-documents.tsx`
- `apps/mobile/docs/local-development.md` — exists, `login.tsx` not `sign-in.tsx`
- Commits: `293b80e` and `025cf19` both present

## Self-Check: PASSED

## Next Phase Readiness

- All 8 doc files now accurately reflect Phase 37.6 codebase state
- A new developer reading these docs will get accurate auth system, file structure, mobile API surface, and deployment process information

---
*Phase: quick-146*
*Completed: 2026-03-31*
