---
phase: 18-driver-document-uploads
plan: 02
subsystem: driver-documents
tags: [ui, upload, multipart, expiry-tracking, document-management]
dependency_graph:
  requires: [18-01]
  provides: [driver-document-ui, multipart-upload-client, expiry-badges, document-crud-ui]
  affects: [driver-detail-page, document-components]
tech_stack:
  added: [date-fns, XMLHttpRequest-progress-tracking]
  patterns: [multipart-chunking, optimistic-ui, inline-editing, cancel-support]
key_files:
  created:
    - src/components/documents/expiry-status-badge.tsx
    - src/components/documents/driver-document-upload.tsx
    - src/components/documents/driver-document-list.tsx
    - src/app/(owner)/drivers/[id]/driver-documents-section.tsx
  modified:
    - src/app/(owner)/drivers/[id]/page.tsx
    - package.json
decisions:
  - Used date-fns for expiry date calculations (differenceInDays) - clean date math API
  - XMLHttpRequest instead of fetch for part uploads - required for progress event tracking
  - 5MB threshold for small vs multipart uploads - balances simplicity with large file support
  - 10MB part size for multipart uploads - good tradeoff between request count and reliability
  - Exponential backoff retry (1s, 2s, 4s) for part uploads - handles transient network failures
  - Inline edit form for document metadata - faster than modal dialog UX
  - Window.confirm for delete confirmation - simple and effective for v1
  - Document type badges with semantic colors (blue=license, purple=application, gray=general)
  - 30-day threshold for "expiring soon" status - standard compliance warning window
metrics:
  duration: 396s
  tasks_completed: 2
  files_created: 4
  files_modified: 2
  commits: 2
  completed_date: 2026-02-17T01:49:47Z
---

# Phase 18 Plan 02: Upload UI Components Summary

Built complete driver document management UI with multipart upload for large files (50-100MB), expiry status badges, inline editing, and integrated into driver detail page.

## What Was Built

### ExpiryStatusBadge Component

**Purpose:** Visual indicator for document expiry status with color-coded warnings.

**Features:**
- Calculates days until expiry using `date-fns.differenceInDays`
- Three status levels:
  - **Expired** (red badge): Shows days past expiry
  - **Expiring Soon** (yellow badge): Within 30 days of expiry
  - **Valid** (green badge): More than 30 days until expiry
- Returns null if no expiry date set (optional field)
- Consistent badge styling (`rounded-full px-2.5 py-0.5 text-xs font-medium`)

### DriverDocumentUpload Component

**Purpose:** Upload driver documents with support for both small (<5MB) and large (>=5MB) files using multipart upload.

**Form Fields:**
- **Document Type** (required): Dropdown with "Driver License", "Driver Application", "General Document"
- **Expiry Date** (optional): Date input with contextual hint for license documents
- **Notes** (optional): Text input, max 500 characters, placeholder suggests common metadata

**Upload Flow - Small Files (<5MB):**
1. Client validates file (size, type, document type selected)
2. Calls `requestDriverUploadUrl` server action with FormData
3. Uploads file to presigned URL via single PUT request
4. Calls `completeDriverDocumentUpload` with metadata
5. Resets form and triggers parent refresh

**Upload Flow - Large Files (>=5MB):**
1. Client validates file same as small files
2. Calculates total parts (10MB per part)
3. POSTs to `/api/documents/multipart/initiate` → receives uploadId and s3Key
4. For each part:
   - POSTs to `/api/documents/multipart/part-url` → receives presigned URL
   - Uploads chunk using **XMLHttpRequest** (enables progress events)
   - Tracks `xhr.upload.onprogress` to update progress state
   - Extracts ETag from response headers
   - Implements retry logic (3 attempts with exponential backoff: 1s, 2s, 4s)
5. POSTs to `/api/documents/multipart/complete` with all part ETags and metadata
6. Resets form and triggers parent refresh

**Progress Tracking:**
- Progress bar shows percentage completion
- For multipart: displays "Part X of Y" with current part number
- States: "Uploading... XX%" → "Saving..." → complete
- Real-time progress updates via XMLHttpRequest upload events

**Cancel Support:**
- AbortController cancels in-flight requests
- Cancel button visible during upload
- Cleanup on abort with user feedback

**Error Handling:**
- Client-side validation: file size, type, required fields
- Server error messages displayed in red banner below upload area
- Retry logic for transient network failures during part uploads
- Clear error state on new upload attempt

### DriverDocumentList Component

**Purpose:** Display driver documents with type/expiry badges, inline editing, download, and optimistic delete.

**Display Features:**
- **File Type Badge**: Color-coded by content type (red=PDF, blue=image, gray=other)
- **Document Type Badge**: Semantic colors (blue=license, purple=application, gray=general)
- **Expiry Status Badge**: Integrated `ExpiryStatusBadge` component shown when expiryDate exists
- **Metadata Display**: File size, upload timestamp, notes (if present)
- **Empty State**: "No driver documents uploaded yet" with icon

**Inline Edit Mode:**
- Edit button triggers inline form (replaces document row)
- Editable fields: Document Type (dropdown), Expiry Date (date input), Notes (text input)
- Save calls `updateDriverDocument` server action
- Cancel reverts to display mode without saving
- Form highlights with blue background during editing

**Actions:**
- **Download**: Calls `getDownloadUrl` → opens in new tab
- **Delete**: Confirm dialog → optimistic UI removal → calls `deleteDriverDocument`
- **Edit**: Inline form replaces document row for metadata changes

**Optimistic UI:**
- Uses `useOptimistic` hook for instant delete feedback
- Document fades/disappears immediately on delete
- Reverts if server action fails

### DriverDocumentsSection Component

**Purpose:** Client wrapper combining upload and list for driver detail page.

**State Management:**
- Receives `initialDocuments` from server (server-side fetch)
- Maintains local state for client-side refresh after mutations
- `refreshDocuments` function calls `listDriverDocuments` and updates state

**Layout:**
- Section header with title and description
- Upload component at top
- Document list below
- Matches existing driver detail page card styling (`rounded-xl border bg-card p-6 shadow-sm`)

### Driver Detail Page Integration

**Changes:**
- Added `listDriverDocuments` import and call in server component
- Fetches documents alongside driver data (parallel fetch possible in future)
- Passes `initialDocuments` to `DriverDocumentsSection`
- Documents section renders below "Driver Information" card
- No changes to existing page structure (additive only)

## Technical Implementation

### Multipart Upload Architecture

**Client Responsibilities:**
- Split file into 10MB chunks
- Request presigned URL for each part
- Upload parts directly to R2 with progress tracking
- Collect ETags from each part upload
- Handle retry logic for failed parts
- Assemble parts list for completion

**Server Responsibilities (via API routes):**
- Orchestrate multipart upload lifecycle (initiate, part-url, complete)
- Generate presigned URLs with 10-minute expiry
- Validate s3Key tenant isolation
- Complete multipart upload in S3
- Save document metadata to database
- Abort and cleanup on failure

**Progress Tracking with XMLHttpRequest:**
- `fetch()` API does not support upload progress events
- XMLHttpRequest provides `xhr.upload.onprogress` event
- Calculate percentage from `event.loaded / totalFileSize`
- Update progress state on each event for smooth progress bar animation

### Retry Logic for Part Uploads

**Strategy:** Exponential backoff with max 3 attempts per part.

**Backoff Schedule:**
- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 seconds delay
- Attempt 4: 4 seconds delay (if needed)

**Failure Handling:**
- If all retries exhausted: display error, allow user to retry entire upload
- AbortController cancellation bypasses retry logic (user-initiated abort)

### Date Calculation with date-fns

**Expiry Status Logic:**
```typescript
const daysUntilExpiry = differenceInDays(expiryDate, now);

if (daysUntilExpiry < 0) {
  // Expired: red badge, "Expired X days ago"
} else if (daysUntilExpiry <= 30) {
  // Expiring soon: yellow badge, "Expires in X days"
} else {
  // Valid: green badge, "Valid (X days)"
}
```

**Why date-fns:**
- Clean API for date math (no manual millisecond calculations)
- Tree-shakeable (only import `differenceInDays`)
- Handles edge cases (leap years, timezone, DST)

### Document Type Badge Colors

**Semantic Meaning:**
- **Blue (license)**: Critical compliance document requiring expiry tracking
- **Purple (application)**: Onboarding/hiring document (less time-sensitive)
- **Gray (general)**: Miscellaneous supporting documents

Consistent color scheme helps users quickly identify document categories.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing Dependency] Installed date-fns**
- **Found during:** Task 1 compilation
- **Issue:** Plan stated "date-fns (already installed)" but package.json did not include it
- **Fix:** `npm install date-fns` before compiling ExpiryStatusBadge
- **Files modified:** package.json, package-lock.json
- **Commit:** 82026ac (included with Task 1)

No other deviations - plan executed as written.

## Task Breakdown

### Task 1: Create ExpiryStatusBadge, DriverDocumentUpload, and DriverDocumentList components
**Commit:** `82026ac`
**Files created:** 3 (expiry-status-badge.tsx, driver-document-upload.tsx, driver-document-list.tsx)
**Files modified:** 2 (package.json, package-lock.json)

- Created ExpiryStatusBadge with three color-coded statuses (valid/expiring-soon/expired)
- Built DriverDocumentUpload with dual upload path (small single PUT, large multipart)
- Implemented XMLHttpRequest progress tracking for multipart uploads
- Added exponential backoff retry logic for part upload failures
- Created form fields for document type, expiry date, and notes
- Added cancel support via AbortController
- Built DriverDocumentList with inline edit, download, delete actions
- Integrated ExpiryStatusBadge into document list display
- Added document type badges with semantic colors
- Implemented optimistic UI for delete operations
- Installed date-fns dependency for expiry calculations

### Task 2: Create DriverDocumentsSection and integrate into driver detail page
**Commit:** `23f9084`
**Files created:** 1 (driver-documents-section.tsx)
**Files modified:** 1 (page.tsx)

- Created DriverDocumentsSection client component combining upload and list
- Added state management for document refresh after mutations
- Updated driver detail page to fetch documents server-side
- Integrated documents section below driver information card
- Maintained existing page structure (additive only)

## Verification Results

All verification criteria passed:

1. `npm run build` succeeded - no TypeScript compilation errors
2. All three main components export named exports:
   - ExpiryStatusBadge (line 14 of expiry-status-badge.tsx)
   - DriverDocumentUpload (exported from driver-document-upload.tsx)
   - DriverDocumentList (exported from driver-document-list.tsx)
3. ExpiryStatusBadge integration confirmed:
   - Import at line 11 of driver-document-list.tsx
   - Usage at line 310 (conditional render when expiryDate exists)
4. Multipart API route usage confirmed:
   - `/api/documents/multipart/initiate` at line 203
   - `/api/documents/multipart/part-url` at line 287
   - `/api/documents/multipart/complete` at line 254
5. XMLHttpRequest usage confirmed:
   - Line 316 of driver-document-upload.tsx for progress tracking
6. Driver detail page integration confirmed:
   - DriverDocumentsSection import at line 6 of page.tsx
   - listDriverDocuments call at line 21
   - Component render at line 110

## Dependencies Satisfied

**Requires:**
- Plan 18-01 (Driver Document Storage Foundation) - Complete

**Provides for Plan 03 (Expiry Notifications):**
- UI for setting expiry dates on documents
- Visual expiry status badges for user awareness
- Document list querying foundation for notification system

**Provides for End Users:**
- Complete driver document upload workflow
- Large file support (50-100MB scanned PDFs)
- Expiry tracking and visual warnings
- Document management (edit, delete, download)

## User Experience Highlights

### Upload Flow

1. User selects document type from dropdown (e.g., "Driver License")
2. Contextual hint appears if license selected: "License documents typically have an expiry date"
3. User optionally sets expiry date and adds notes
4. User drags/clicks to select PDF file (e.g., 75MB scanned license)
5. File name and size display in upload area
6. User clicks "Upload Document"
7. Progress bar animates showing percentage and part info: "Uploading... 42% (Part 4 of 8)"
8. User can cancel at any time → "Upload cancelled" message
9. Progress transitions to "Saving..." during metadata persistence
10. Upload completes → form resets → document appears in list below with green "Valid (365 days)" badge

### Document Management

1. User sees document list with colored badges (blue "Driver License", green "Valid (365 days)")
2. User clicks "Edit" → inline form appears with pre-filled values
3. User changes expiry date → clicks "Save" → badge updates to yellow "Expires in 25 days"
4. User clicks "Download" → document opens in new tab
5. User clicks "Delete" → confirm dialog → document instantly disappears (optimistic UI)

### Expiry Warnings

- **Green badge**: "Valid (90 days)" - document has >30 days until expiry
- **Yellow badge**: "Expires in 15 days" - document expires within 30 days (action needed soon)
- **Red badge**: "Expired 5 days ago" - document is past expiry (immediate action required)

## Production Readiness

**Ready for User Testing:**
- Full upload flow for small and large files
- Real-time progress feedback for large uploads
- Expiry tracking with visual status indicators
- Complete CRUD operations on documents
- Optimistic UI for instant feedback
- Error handling with user-friendly messages

**Known Limitations:**
- No retry button for failed uploads (must start over)
- No partial upload recovery (if page refreshes mid-upload, must re-upload)
- Cancel during "Saving..." phase may leave orphaned S3 parts (Plan 03 cleanup job can address)

**Monitoring Considerations:**
- Track multipart upload success/failure rates by file size
- Alert on high part upload retry counts (network issues)
- Monitor average upload duration by file size
- Track expiry badge color distribution (how many docs are expiring soon/expired)

## Next Steps

**Plan 03 - Expiry Notifications:**
- Query documents with expiryDate within 30 days using existing badge logic
- Generate email notifications for owners/managers
- Create dashboard widget showing upcoming expirations
- Implement cron job to check expirations daily
- Add notification preferences (email, in-app, both)

**Future Enhancements (post-v1):**
- Resumable uploads (save progress, allow continuation after page refresh)
- Drag-and-drop for multiple files (batch upload)
- Document preview/viewer (PDF render in modal)
- Automatic OCR for license number extraction
- Document version history (track replacements)
- Export documents as ZIP for compliance audits

## Self-Check

Verifying all claimed artifacts exist:

**Created files:**
- src/components/documents/expiry-status-badge.tsx: FOUND
- src/components/documents/driver-document-upload.tsx: FOUND
- src/components/documents/driver-document-list.tsx: FOUND
- src/app/(owner)/drivers/[id]/driver-documents-section.tsx: FOUND

**Modified files:**
- src/app/(owner)/drivers/[id]/page.tsx: FOUND
- package.json: FOUND (date-fns added)

**Commits:**
- 82026ac: FOUND (Task 1 - components)
- 23f9084: FOUND (Task 2 - integration)

**Exports verified:**
- ExpiryStatusBadge: FOUND (expiry-status-badge.tsx:14)
- DriverDocumentUpload: FOUND (driver-document-upload.tsx exported)
- DriverDocumentList: FOUND (driver-document-list.tsx exported)
- DriverDocumentsSection: FOUND (driver-documents-section.tsx exported)

**Integrations verified:**
- ExpiryStatusBadge used in DriverDocumentList: FOUND (line 11 import, line 310 usage)
- Multipart API routes used in DriverDocumentUpload: FOUND (lines 203, 254, 287)
- XMLHttpRequest for progress: FOUND (line 316)
- DriverDocumentsSection integrated in driver page: FOUND (line 6 import, line 110 render)
- listDriverDocuments called in driver page: FOUND (line 5 import, line 21 call)

## Self-Check: PASSED

All files, commits, exports, and integrations verified. Plan executed successfully with one auto-fixed dependency issue (date-fns installation).
