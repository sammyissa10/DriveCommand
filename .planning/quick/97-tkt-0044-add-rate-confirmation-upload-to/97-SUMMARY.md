---
phase: quick-97
plan: "01"
subsystem: loads
tags: [document-upload, s3, rate-confirmation, loads, file-management]
dependency_graph:
  requires: [prisma/schema.prisma, document.repository.ts, document.schemas.ts, driver-documents.ts]
  provides: [load RC upload/view/delete, loadId on Document model, RATE_CONFIRMATION DocumentType]
  affects: [load detail page, Document model, DocumentType enum]
tech_stack:
  added: []
  patterns: [server-side S3 PutObjectCommand upload, optimistic delete UI, collapsible upload form]
key_files:
  created:
    - src/app/(owner)/actions/load-documents.ts
    - src/components/loads/load-rc-documents-section.tsx
  modified:
    - prisma/schema.prisma
    - src/lib/validations/document.schemas.ts
    - src/lib/db/repositories/document.repository.ts
    - src/app/(owner)/loads/[id]/page.tsx
decisions:
  - documentType hardcoded to RATE_CONFIRMATION in server action rather than passed from client
  - Section conditionally rendered only for DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED/INVOICED
  - Used useTransition for refresh calls to avoid blocking optimistic UI
metrics:
  duration: "~15 minutes"
  completed: "2026-03-22"
  tasks_completed: 3
  files_changed: 6
---

# Quick 97: TKT-0044 — Add Rate Confirmation Upload to Load Detail Page

**One-liner:** Owner-uploaded rate confirmation PDFs/images stored in R2 under `tenant-{id}/loads/` with per-load view/delete UI alongside the existing Generate RC button.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Schema migration — loadId on Document + RATE_CONFIRMATION DocumentType | dff3dfb |
| 2 | Server actions — uploadLoadDocument, listLoadDocuments, deleteLoadDocument | 4d46ae3 |
| 3 | LoadRCDocumentsSection component + load detail page integration | 0d35ab2 |

## What Was Built

**Schema changes (Task 1):**
- `RATE_CONFIRMATION` added to `DocumentType` enum
- `loadId String? @db.Uuid` added to `Document` model with `@@index([loadId])`
- `load Load? @relation(...)` on Document and `documents Document[]` on Load
- `documentCreateSchema` updated: added `loadId` field, updated entity count refinement to include loadId, relaxed driverId+documentType rule when loadId is set
- `DocumentCreateInput` interface extended with `loadId?: string`
- `findByLoadId(loadId: string)` method added to `DocumentRepository`

**Server actions (Task 2)** — `src/app/(owner)/actions/load-documents.ts`:
- `uploadLoadDocument(formData)`: validates file, uploads server-side to R2 at `tenant-{id}/loads/`, saves DB record with `documentType: 'RATE_CONFIRMATION'`, revalidates load page
- `listLoadDocuments(loadId)`: returns all documents for a load via `findByLoadId`
- `deleteLoadDocument(documentId)`: defense-in-depth tenant+category check, deletes S3 object then DB record

**UI component (Task 3)** — `src/components/loads/load-rc-documents-section.tsx`:
- Collapsible "Upload RC" button reveals form with file input (PDF/JPG/PNG) and optional notes
- Document list shows filename, size, upload date, notes with View (opens presigned URL in new tab) and Delete (optimistic removal) actions
- Mobile-friendly: `flex-col sm:flex-row` responsive layout, min 36px touch targets
- Section rendered only for `DISPATCHED | PICKED_UP | IN_TRANSIT | DELIVERED | INVOICED` statuses

**Load detail page integration** — `src/app/(owner)/loads/[id]/page.tsx`:
- Imports `DocumentRepository` and `requireTenantId` for server-side document fetch
- Fetches `loadDocuments` via `docRepo.findByLoadId(id)` after invoices
- Renders `<LoadRCDocumentsSection>` between Invoices section and Audit Trail
- Existing "Generate RC" button in header remains at lines 143–145 unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `prisma/schema.prisma` — loadId and RATE_CONFIRMATION present
- [x] `src/app/(owner)/actions/load-documents.ts` — 3 exports: uploadLoadDocument, listLoadDocuments, deleteLoadDocument
- [x] `src/components/loads/load-rc-documents-section.tsx` — component exists
- [x] `src/app/(owner)/loads/[id]/page.tsx` — LoadRCDocumentsSection rendered
- [x] `npx tsc --noEmit` — no errors
- [x] `npm run build` — clean build

## Self-Check: PASSED
