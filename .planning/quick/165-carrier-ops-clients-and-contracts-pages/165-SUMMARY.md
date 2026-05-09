---
phase: quick-165
plan: 01
subsystem: carrier-ops
tags: [carrier, clients, contracts, web, pages, components]
dependency_graph:
  requires:
    - quick-159 (carrier API routes for facilities and clients)
    - quick-160 (carrier API routes for dispatches)
  provides:
    - /carrier/clients pages (list, new, detail with 4 tabs)
    - /carrier/contracts pages (list, new, detail with inline edit)
  affects:
    - Carrier Ops sidebar navigation (clients and contracts sections now have working pages)
tech_stack:
  added: []
  patterns:
    - Server page fetches data, passes serialized props to client components
    - Client detail page with lazy-loaded tabs (useEffect on tab switch)
    - Inline edit toggle (isEditing state replaces read-only view with form)
    - Amber row highlight for expiring contracts (within 30 days, not terminated/expired)
key_files:
  created:
    - apps/web/src/app/(owner)/carrier/clients/page.tsx
    - apps/web/src/app/(owner)/carrier/clients/new/page.tsx
    - apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    - apps/web/src/components/carrier/clients/ClientList.tsx
    - apps/web/src/components/carrier/clients/ClientForm.tsx
    - apps/web/src/components/carrier/clients/ClientFinancials.tsx
    - apps/web/src/app/(owner)/carrier/contracts/page.tsx
    - apps/web/src/app/(owner)/carrier/contracts/new/page.tsx
    - apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
    - apps/web/src/components/carrier/contracts/ContractList.tsx
    - apps/web/src/components/carrier/contracts/ContractForm.tsx
  modified: []
decisions:
  - "Client list omits financial aggregates (openLoadsCount, outstandingAR) per-row — too expensive; those are shown on the detail page only"
  - "Loads tab in client detail shows 'coming soon' placeholder if /api/v1/carrier/loads?client_id= returns non-OK (endpoint may not support filter)"
  - "credit_limit highlight in ClientFinancials skipped — field not in CarrierClient schema; TODO comment added"
  - "ContractForm omits detention/TONU/layover/auto_renew/payment_terms fields — not in CarrierContract schema; TODO comment added"
  - "ContractDetail extracted into separate ClientDetail.tsx/ContractDetail.tsx 'use client' files co-located with their server pages"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 13
---

# Phase quick-165 Plan 01: Carrier Ops Clients and Contracts Pages Summary

Created client and contract list, detail, and form pages for the Carrier Ops module — 13 files covering the full commercial identity (clients) and rate agreement (contracts) layers.

## What Was Built

### Task 1: Client Pages and Components

**ClientList.tsx** — Table with name (linked), status badge (green/yellow/red), primary contact, email, city/state. Search filters by name/contact/email. Status dropdown filter (All/Active/Inactive/Blocked). "New Client" button.

**ClientForm.tsx** — Full create/edit form with 5 sections: Basic Info (name, DBA, MC#, DOT#, tax ID), Address, Contact, Portal Access (checkbox + conditional portalEmail), Notes. Validates name required, email format, state max 2 chars. POST to `/api/v1/carrier/clients` or PATCH to `/api/v1/carrier/clients/[id]`.

**ClientFinancials.tsx** — Fetches `/api/v1/carrier/reports/aging` on mount, filters to current client. Shows Outstanding AR summary cards and aging buckets table (0–30, 31–60, 61–90, 90+ days). 90+ bucket highlighted in orange. TODO comment for credit_limit schema migration.

**clients/page.tsx** — Server component: getSession, listClients, stat chips by status, renders ClientList.

**clients/new/page.tsx** — Back link + heading + ClientForm in card.

**clients/[id]/page.tsx + ClientDetail.tsx** — Server fetches client data, passes to 'use client' ClientDetail. Four tabs:
- **Overview**: stats (open loads, AR), identity fields, address, contact, portal access toggle (live PATCH), notes
- **Contracts**: lazy-fetched on tab switch from `/api/v1/carrier/contracts?client_id=`, table with "New Contract" button
- **Loads**: lazy-fetched, placeholder message if endpoint unavailable
- **Financials**: ClientFinancials component

### Task 2: Contract Pages and Components

**ContractList.tsx** — Table with contract # (linked), client name (linked to client detail), contract type badge (spot=slate, dedicated=blue, volume=purple, brokerage=amber), rate display formatted by type ($/mi, flat, $/hr), status badge (active=green, pending=yellow, expired=red, terminated=gray), expiration date. Amber row highlight (`bg-amber-50 dark:bg-amber-950/30`) for rows expiring within 30 days and not yet terminated/expired. Search by contract # or client name. Status filter dropdown.

**ContractForm.tsx** — Client searchable select (fetches `/api/v1/carrier/clients`, pre-selected if defaultClientId provided), contract type, rate type, base rate, fuel surcharge method + conditional rate input, effective/expiration dates, status, notes. Validates clientId required and baseRate positive. POST to `/api/v1/carrier/contracts` or PATCH.

**contracts/page.tsx** — Server component: listContracts, serializes Decimal fields (effectiveDate/expirationDate to ISO strings), stat chips by status, renders ContractList.

**contracts/new/page.tsx** — Reads `?clientId` searchParam, passes as `defaultClientId` to ContractForm.

**contracts/[id]/page.tsx + ContractDetail.tsx** — Server fetches getContract + getContractLoadsSummary, passes to 'use client' ContractDetail. Sections:
1. Header with contract # + status badge + client link + Edit button
2. Basic Info: type, dates, status, notes
3. Rate & Accessorials: rate type, base rate formatted, FSC method + rate (only shown when method != none)
4. Linked Route Templates: count or "No linked route templates" placeholder
5. Loads Summary: total loads, total revenue, total invoiced, total paid, avg rate — all currency formatted

Inline edit button toggles ContractForm pre-filled with initialData; Cancel button restores read-only view.

## Deviations from Plan

None - plan executed exactly as written. All spec notes about missing schema fields (credit_limit, payment_terms_days, detention/TONU/layover) were already documented in the plan with explicit instructions to omit them — followed precisely with TODO comments added.

## Self-Check: PASSED

All 13 created files exist on disk. Both task commits (f62e25a, d1512bf) verified in git log. TypeScript check (`tsc --noEmit`) passed with zero errors.
