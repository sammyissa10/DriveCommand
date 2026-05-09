# Phase 42: Workflow Engine Foundation — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the template creation layer for the Checklists & Workflows feature. Admin creates StepTemplates (reusable steps), builds Playbooks (ordered collections of steps), and configures categories and phases. Three starter Playbooks are seeded for all tenants. No runtime (no instances, no step completion), no triggers, no mobile.

**Spec:** `docs/specs/workflow-engine.md` is the source of truth. Section 14 (Phase 1 DoD) defines exact scope. This context captures decisions on top of the spec.

</domain>

<decisions>
## Implementation Decisions

### API Architecture
- **Use tRPC** — introduce it to the codebase for this feature
- The spec's Section 7 tRPC router surface is the target (`stepTemplate`, `playbook`, `trigger` routers)
- Service functions (`apps/web/src/server/services/workflows/`) are called from tRPC procedures, not directly from components
- tRPC auth context must read from the existing Supabase session (same session the rest of the app uses)
- Validation schemas live in `packages/validation/src/workflows/` (imported by both web tRPC and mobile API later)

### Playbook Builder — Step Reordering
- **Drag-and-drop with @dnd-kit** (not up/down buttons)
- `@dnd-kit/core` + `@dnd-kit/sortable` as new dependencies
- Steps are draggable within a phase section AND between phase sections (PRE_START, DAY_1, WEEK_1, ONGOING, NONE)
- Visual drop indicator while dragging
- On drop: calls `playbook.reorderSteps` tRPC procedure with new sequence

### Sidebar Navigation
- **New "Workflows" group** — standalone section in the owner portal sidebar
- Not grouped under Operations or Compliance
- Nav label: "Checklists & Workflows" (user-facing name per Section 3 naming table)
- Route: `/owner/checklists` (inside `apps/web/src/app/(owner)/checklists/`)

### Starter Playbook Seeding
- **All tenants on migration** — seed all 3 starter Playbooks to every existing tenant during the Phase 42 migration deploy
- New tenants also get them on tenant create
- The 3 starters are defined in `apps/web/src/server/services/workflows/seedStarterPlaybooks.ts`
- Migration script calls `seedStarterPlaybooks(tenantId)` for all existing tenants

### Builder Scope — Step Type UIs
- **All 8 step types in Phase 1** (per spec)
- FORM_FILL gets the full inline field editor in the expanded builder row: add fields, set type (text/number/date/boolean/select), mark required, reorder fields
- INSPECTION_ITEM gets instruction text editing + "require photo on fail" toggle
- All other types (DOCUMENT_UPLOAD, SIGNATURE, TRAINING_ACK, APPROVAL, THIRD_PARTY, CUSTOM_NOTE) get their simpler config UIs per spec Section 8.2

### File Layout (following spec + resolving conflicts)
- Route group: `apps/web/src/app/(owner)/checklists/` (spec says `app/checklists/` — corrected to use existing route group)
- tRPC routers: `apps/web/src/server/api/routers/workflows/` (new directory)
- Services: `apps/web/src/server/services/workflows/` (new directory)
- Validation: `packages/validation/src/workflows/` (new subdirectory in existing package)
- Mobile screens (Phase 43+): `apps/mobile/src/screens/workflows/`

### Claude's Discretion
- Exact tRPC provider setup and middleware wiring (read Supabase session, follow existing auth patterns)
- shadcn/ui component choices for the builder canvas rows
- Exact icon choices for PlaybookCategory tile grid (spec says 6-tile icon grid, emoji grid filtered by category)
- Empty state illustration style on `/checklists` dashboard

</decisions>

<specifics>
## Specific Ideas

- The builder should feel like Notion or Linear — clean, not cluttered. Drag handles are subtle until hover.
- The "Checklists & Workflows" nav label is the user-facing name; `PlaybookInstance`, `StepTemplate`, etc. must never appear in rendered JSX text (Section 3 naming table, lint enforced).
- Phase 1 naming lint test: Vitest greps all `.tsx` files under the owner portal for internal names in rendered text.

## Spec Conflicts Resolved

| Conflict | Spec says | Resolved as |
|----------|-----------|-------------|
| API layer | tRPC | tRPC (user confirmed) |
| Route path | `app/checklists/` | `app/(owner)/checklists/` |
| Stack versions (mobile) | RN 0.83 + Expo SDK 55 | Actual: RN 0.76 + Expo SDK 52 — flag for mobile phases |
| Storage | "AWS S3" | Cloudflare R2 via existing s3-client (S3-compatible, no change needed) |

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within Phase 42 scope.

</deferred>

---

*Phase: 42-workflow-engine-foundation*
*Context gathered: 2026-04-23*
