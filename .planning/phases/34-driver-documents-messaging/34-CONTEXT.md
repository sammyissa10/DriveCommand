# Phase 34: Driver Documents + Messaging - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the driver documents screen (view compliance documents with expiry status, upload new documents) and the driver messaging screen (view and reply to fleet messages from dispatchers). These are the last two driver portal screens, completing the full driver app feature set.

</domain>

<decisions>
## Implementation Decisions

### Documents screen layout
- List of driver's documents (license, medical card, application, general)
- Each row: document type icon, name, expiry date, status badge (Valid/Expiring/Expired)
- Expiring (< 30 days): amber badge
- Expired: red badge
- Valid: green badge
- Tapping a document row → document detail bottom sheet
- FAB (+) to upload new document
- Pull-to-refresh

### Document detail bottom sheet
- Document name, type, upload date, expiry date
- Status badge (large)
- "View Document" button → opens presigned S3 URL in device browser (expo-web-browser)
- No in-app PDF viewer in v1 — opens externally

### Document upload flow
- FAB → bottom sheet with: document type select, document name field, expiry date picker, file picker button
- File picker: expo-document-picker (PDFs and images) OR camera (expo-camera)
- File size limit: 50MB (existing S3 multipart API handles this)
- Upload progress bar inline in the upload bottom sheet
- Success: close sheet + refresh list
- No camera scanning/OCR in v1 — just upload

### Messaging screen layout
- Message thread list (FlashList)
- Each row: sender name/avatar initials, message preview (first 60 chars), timestamp, unread dot
- Threads sorted by most recent message
- Tapping a thread → message detail screen (conversation)
- Compose button (top right header icon) — but driver can only REPLY, not initiate new threads in v1

Wait: actually looking at the existing messaging system — it's fleet messages, not threaded conversations. Owners send to a driver, driver can reply. Let me reconsider.

- Message list: all fleet messages addressed to this driver + driver's replies, sorted newest first
- Single "thread" per driver-owner relationship
- Driver can see messages from any sender (owner/manager)
- Driver can reply to any message

### Message detail
- Simple chronological list of all messages (both directions)
- Driver's messages: right-aligned, brand blue background
- Owner's messages: left-aligned, slate background
- Reply text input at bottom with send button
- Auto-scroll to bottom on open

### Unread badge
- Unread count badge on Messages tab icon
- Poll every 30s when messages screen is not focused
- Mark as read when message screen opens (call markAsRead endpoint)

### Claude's Discretion
- Exact document type icons (use lucide-react-native icons)
- Whether to show a separate "Expired" section at the top of the list
- Exact avatar color generation for sender initials

</decisions>

<specifics>
## Specific Ideas

- The unread message badge on the tab is high priority — drivers should never miss a dispatch message
- Document upload should feel as simple as possible — the fewer steps, the better

</specifics>

<deferred>
## Deferred Ideas

- In-app PDF viewer — future phase (complex, adds significant bundle size)
- Document OCR/scanning — Phase 29 original plan had this, moved to v1.1
- Driver-initiated message threads — future phase
- Message search — future phase

</deferred>

---

*Phase: 34-driver-documents-messaging*
*Context gathered: 2026-03-21*
