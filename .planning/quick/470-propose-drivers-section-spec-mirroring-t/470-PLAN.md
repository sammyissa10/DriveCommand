# Quick Task 470: Propose Drivers Section Spec

**Goal:** Propose the Drivers section specification mirroring the Trucks pattern — Pass 1 only (no code).

## Tasks

### Task 1: Read Design System Documentation
- [x] Read `.planning/design-system.md` to understand available components
- [x] Identify reusable pieces: KPICard, StatusTabs, SearchBar, RecordLayout, etc.

### Task 2: Analyze Existing Trucks Pattern
- [x] Read `/trucks/page.tsx` — overview page structure
- [x] Read `TrucksPageClient.tsx` — optimistic updates wrapper
- [x] Read `TrucksKPICards.tsx` — KPI card component
- [x] Read `TrucksDataGrid.tsx` — table + mobile cards
- [x] Read `/trucks/new` — quick-create form
- [x] Read `/trucks/[id]` — view/edit pages with TruckRecord

### Task 3: Analyze Existing Driver Implementation
- [x] Read Prisma schema for User model (drivers are Users with role=DRIVER)
- [x] Read DriverInvitation model for invite-time fields
- [x] Read Document model for compliance documents
- [x] Read existing `/drivers/page.tsx`
- [x] Read existing driver-list-wrapper.tsx and driver-list.tsx
- [x] Read existing driver-invite-form.tsx

### Task 4: Write Specification
- [x] Define data model (User fields, DriverInvitation fields, Document types)
- [x] Define compliance alert logic (license expiry, medical card, CDL)
- [x] Spec overview page (KPIs, tabs, search, table, mobile cards)
- [x] Spec quick-create page (sectioned invite form)
- [x] Spec view/edit pages (unified DriverRecord component)
- [x] Map every element to design system component
- [x] Identify no new components needed

### Task 5: Deliver Spec
- [x] Write spec to `.planning/drivers-spec.md`
- [x] Stop and wait for sign-off (no code writing)

## Status

**COMPLETE** — Spec written, awaiting user sign-off.

## Output

Specification: `.planning/drivers-spec.md`
