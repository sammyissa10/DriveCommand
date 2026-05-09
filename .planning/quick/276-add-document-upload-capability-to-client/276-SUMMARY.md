---
phase: quick-276
plan: "01"
subsystem: carrier-ops
tags: [documents, upload, client, contract, carrier]
dependency_graph:
  requires: [quick-275]
  provides: [client-document-upload, contract-document-upload]
  affects: [carrier/documents, carrier/clients, carrier/contracts]
tech_stack:
  added: []
  patterns: [parentType-guard, named-fetch-extract, onSuccess-callback]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/v1/carrier/documents/route.ts
    - apps/web/src/lib/carrier/documents.ts
    - apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
    - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
decisions:
  - Upload button uses DocumentUploadModal trigger (small underlined link style) consistent with other upload surfaces in the app
  - fetchDocuments extracted as named function (not arrow in useEffect) to allow onSuccess callback re-use without useCallback complexity
metrics:
  duration: "2 minutes"
  completed: "2026-04-21"
  tasks_completed: 2
  files_modified: 5
---

# Phase quick-276 Plan 01: Add Document Upload to Client and Contract Detail Pages Summary

Document upload capability added to client detail Documents tab and contract detail Documents section, extending the existing `DocumentUploadModal` to support a new `'client'` parent type throughout the full upload pipeline.

## What Was Built

**Task 1: client parent type in upload pipeline**
- `POST /api/v1/carrier/documents` now accepts `parent_type=client`
- `uploadDocument` has a `client` branch: verifies `carrierClient.orgId`, sets `clientId = parentId`
- `listDocuments`, `deleteDocument`, `verifyDocument` all have `client` and `contract` branches for full tenant isolation (the `contract` and `client` cases were missing from these three functions)
- `DocumentUploadModal` prop type updated: `parentType: 'stop' | 'load' | 'dispatch' | 'contract' | 'client'`

**Task 2: upload buttons on client and contract pages**
- `ClientDetail.tsx`: imports `DocumentUploadModal`, extracts `fetchDocuments` named function, adds `<DocumentUploadModal parentType="client" parentId={client.id} onSuccess={fetchDocuments} triggerLabel="+ Upload Document" />` above the documents list
- `ContractDetail.tsx`: same pattern — `fetchDocuments` extracted, modal rendered in the Documents section header row alongside the "Documents" heading

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added client and contract branches to listDocuments, deleteDocument, verifyDocument**
- **Found during:** Task 1
- **Issue:** The plan specified adding `client` and `contract` to `listDocuments`, but `deleteDocument` and `verifyDocument` also lacked `contract` and `client` branches — meaning those operations would return "Unauthorized" for documents uploaded under client/contract parents
- **Fix:** Added `client` and `contract` branches to all three functions for complete tenant isolation coverage
- **Files modified:** `apps/web/src/lib/carrier/documents.ts`
- **Commit:** 0f6394c

## Commits

| Hash | Message |
|------|---------|
| 0f6394c | feat(quick-276): add client parent type to document upload pipeline |
| a590952 | feat(quick-276): add document upload buttons to client and contract detail pages |

## Self-Check: PASSED

- `apps/web/src/lib/carrier/documents.ts` — exists, contains `parentType === 'client'` branch in uploadDocument
- `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx` — exists, contains `DocumentUploadModal`
- `apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx` — exists, contains `DocumentUploadModal`
- `tsc --noEmit` passed with zero errors
- Commits 0f6394c and a590952 confirmed in git log
