---
phase: quick-89
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/storage/presigned.ts
  - src/app/api/support/upload-attachment/route.ts
  - src/actions/support-tickets.ts
  - src/components/support/support-ticket-modal.tsx
  - src/app/(admin)/admin-support/ticket-list.tsx
  - src/app/(owner)/support/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Support ticket form shows platform toggle (Mobile/Desktop) with auto-detection"
    - "Support ticket form allows attaching an image or PDF (max 10MB)"
    - "Submitted ticket stores platform, attachmentUrl, and attachmentKey in database"
    - "Admin ticket detail shows platform badge and clickable attachment link"
    - "Owner ticket detail shows platform badge and clickable attachment link"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "platform, attachmentUrl, attachmentKey fields on SupportTicket"
      contains: "platform"
    - path: "src/app/api/support/upload-attachment/route.ts"
      provides: "Presigned upload URL endpoint for support attachments"
      exports: ["POST"]
    - path: "src/components/support/support-ticket-modal.tsx"
      provides: "Platform toggle and file attachment UI"
  key_links:
    - from: "src/components/support/support-ticket-modal.tsx"
      to: "/api/support/upload-attachment"
      via: "fetch POST for presigned URL, then PUT to upload"
      pattern: "api/support/upload-attachment"
    - from: "src/components/support/support-ticket-modal.tsx"
      to: "src/actions/support-tickets.ts"
      via: "createSupportTicket with platform + attachment fields"
      pattern: "createSupportTicket"
---

<objective>
Add platform field (Mobile/Desktop) and file attachment (images + PDFs, max 10MB) to the support ticket system.

Purpose: Let users indicate which platform they experienced an issue on and attach screenshots/files for faster issue resolution.
Output: Updated schema, upload API route, updated modal form, display in admin and owner ticket views.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma (lines 927-986 — SupportTicket model and enums)
@src/actions/support-tickets.ts (createSupportTicket action, getAllTickets raw query)
@src/components/support/support-ticket-modal.tsx (current form)
@src/lib/storage/presigned.ts (generateUploadUrl pattern — reuse s3Client/getBucketName directly)
@src/app/api/documents/request-upload-url/route.ts (reference pattern for presigned URL API route)
@src/app/(admin)/admin-support/ticket-list.tsx (admin expanded ticket view)
@src/app/(owner)/support/[id]/page.tsx (owner ticket detail page)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + upload API route + server action update</name>
  <files>
    prisma/schema.prisma
    src/lib/storage/presigned.ts
    src/app/api/support/upload-attachment/route.ts
    src/actions/support-tickets.ts
  </files>
  <action>
1. **Schema** — Add three nullable fields to the `SupportTicket` model (after `description`):
   ```
   platform       String?
   attachmentUrl  String?
   attachmentKey  String?
   ```
   Run `npx prisma db push` to apply (no migration file needed — project uses db push).
   Then run `npx prisma generate` to update the client.

2. **Presigned helper** — In `src/lib/storage/presigned.ts`, update the `DocumentCategory` type to add `'support'`:
   ```ts
   export type DocumentCategory = 'trucks' | 'routes' | 'drivers' | 'support';
   ```

3. **Upload API route** — Create `src/app/api/support/upload-attachment/route.ts`:
   - POST handler accepting `{ fileName, contentType, sizeBytes }` in JSON body
   - Auth: use `requireAuth()` from `@/lib/auth/server` (any authenticated user can upload)
   - Tenant: use `requireTenantId()` from `@/lib/context/tenant-context`
   - Validate: fileName required, contentType must start with `image/` or be `application/pdf`, sizeBytes <= 10 * 1024 * 1024 (10MB hard limit for support attachments, separate from the global MAX_FILE_SIZE)
   - Generate fileId with `nanoid()`
   - Sanitize fileName: replace `/` and `\` with `-`
   - Call `generateUploadUrl(tenantId, 'support', fileId, sanitizedFileName, contentType, sizeBytes)`
   - Return `{ uploadUrl, s3Key }` as JSON

4. **Server action** — Update `createSupportTicket` in `src/actions/support-tickets.ts`:
   - Add `platform?: string`, `attachmentUrl?: string`, `attachmentKey?: string` to the input type
   - Add to the zod schema: `platform: z.enum(['MOBILE', 'DESKTOP']).optional()`, `attachmentUrl: z.string().url().optional()`, `attachmentKey: z.string().optional()`
   - Pass `platform`, `attachmentUrl`, `attachmentKey` into the `tx.supportTicket.create({ data: ... })` call
   - In `getAllTickets`: the raw SQL `SELECT *` already returns all columns, so `platform`, `attachmentUrl`, `attachmentKey` will automatically be included. Update the `RawTicket` type to add `platform: string | null; attachmentUrl: string | null; attachmentKey: string | null;`
  </action>
  <verify>
    Run `npx prisma db push` succeeds. Run `npx prisma generate` succeeds. Run `npx next build` or `npx tsc --noEmit` to confirm no type errors.
  </verify>
  <done>
    SupportTicket table has platform/attachmentUrl/attachmentKey columns. Upload API route returns presigned URL. createSupportTicket accepts and stores new fields. getAllTickets returns them.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update modal form with platform toggle and file attachment</name>
  <files>
    src/components/support/support-ticket-modal.tsx
  </files>
  <action>
Update the support ticket modal to add platform toggle and file attachment:

1. **Platform toggle** — Add between the Priority select and Title input:
   - State: `const [platform, setPlatform] = useState<'MOBILE' | 'DESKTOP'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'MOBILE' : 'DESKTOP');`
   - UI: Two buttons side by side (segmented toggle style), "Mobile" and "Desktop". Use Tailwind classes — the active button gets `bg-primary text-primary-foreground`, inactive gets `bg-muted text-muted-foreground hover:bg-muted/80`. Wrap in a div with `flex rounded-md overflow-hidden border border-input` so they look like a toggle group. Each button is `flex-1 px-3 py-2 text-sm font-medium transition-colors`.
   - Label: "Platform" with `text-sm font-medium text-foreground`

2. **File attachment** — Add between Description and the "Submitting from" info box:
   - State: `const [file, setFile] = useState<File | null>(null);`
   - State: `const [uploading, setUploading] = useState(false);`
   - UI: A label "Attachment (optional)" with `text-sm font-medium text-foreground`
   - If no file selected: show an `<input type="file" accept="image/*,.pdf" />` with standard file input styling
   - If file selected: show filename + file size (formatted as KB/MB) + a clear "X" button to remove. Use `text-sm text-muted-foreground` for the info text.
   - Validate on selection: if file.size > 10 * 1024 * 1024, toast.error('File must be under 10MB') and clear selection
   - Validate on selection: if file.type doesn't start with 'image/' and isn't 'application/pdf', toast.error('Only images and PDFs are accepted') and clear selection

3. **Submit flow** — Update `handleSubmit`:
   - After existing validation, before calling `createSupportTicket`:
   - If `file` is selected:
     - Set `setUploading(true)`
     - POST to `/api/support/upload-attachment` with `{ fileName: file.name, contentType: file.type, sizeBytes: file.size }`
     - If error, toast.error and return
     - PUT the file to `uploadResult.uploadUrl` with `Content-Type: file.type` header
     - If PUT fails, toast.error and return
     - Set `setUploading(false)`
     - Construct `attachmentUrl` from s3Key: use the pattern from the codebase — since R2 files use presigned download URLs (not public URLs), store just the `s3Key` as `attachmentKey` and leave `attachmentUrl` as a placeholder like `s3://${s3Key}` (the display components will use `generateDownloadUrl` to create temp links). Actually, simpler: just store the s3Key in `attachmentKey` and set `attachmentUrl` to empty string — we'll generate download URLs on demand in the display views.
   - Call `createSupportTicket({ category, priority, title, description, fromPage: pathname, platform, attachmentKey: s3Key or undefined, attachmentUrl: undefined })`
   - Actually, to keep it simple and avoid needing presigned download URLs everywhere, store `attachmentKey` only (the s3Key). Set `attachmentUrl` to undefined. The admin/owner views will show a "Download" link that calls `generateDownloadUrl` server-side.

4. **Reset** — Add `setFile(null)` and `setPlatform` reset to `resetForm()`. Update loading button text: show "Uploading..." during upload, "Submitting..." during ticket creation.

5. **Disable** — Disable submit button while `uploading` is true. Disable file input while `loading || uploading`.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors. Open the app, click support button, verify platform toggle appears and auto-selects based on viewport. Verify file input accepts images/PDFs and rejects other types. Verify file size validation works.
  </verify>
  <done>
    Modal shows platform toggle (auto-detected), file attachment input with validation (10MB, images+PDF only), and submits both fields with the ticket. Upload flow: presigned URL then PUT then create ticket.
  </done>
</task>

<task type="auto">
  <name>Task 3: Display platform and attachment in admin and owner ticket views</name>
  <files>
    src/app/(admin)/admin-support/ticket-list.tsx
    src/app/(owner)/support/[id]/page.tsx
    src/actions/support-tickets.ts
  </files>
  <action>
1. **Server action helper** — Add a new exported async function `getAttachmentDownloadUrl(s3Key: string)` in `src/actions/support-tickets.ts`:
   - Import `generateDownloadUrl` from `@/lib/storage/presigned`
   - Auth: call `requireAuth()` (any authenticated user)
   - Call `generateDownloadUrl(s3Key)` and return the URL
   - This generates a 1-hour presigned GET URL for downloading the attachment

2. **Admin ticket list** (`ticket-list.tsx`) — In the `TicketRow` expanded detail section, after "Submitted from page" div:
   - If `ticket.platform`: show a row with label "Platform" and a small badge — `bg-blue-50 text-blue-700 border-blue-200` for DESKTOP, `bg-violet-50 text-violet-700 border-violet-200` for MOBILE. Text: "Desktop" or "Mobile".
   - If `ticket.attachmentKey`: show a row with label "Attachment" and a button "View Attachment" that on click calls `getAttachmentDownloadUrl(ticket.attachmentKey)` and opens the result URL in a new tab (`window.open(url, '_blank')`). Use `text-blue-600 hover:text-blue-800 underline text-sm cursor-pointer` styling. Show a small loading spinner while fetching. Import `Paperclip` icon from lucide-react to show next to the link.
   - Update the `RawTicket` type alias (already done in Task 1 but verify it includes `platform`, `attachmentKey`, `attachmentUrl`).

3. **Owner ticket detail** (`[id]/page.tsx`) — In the ticket header card's `CardContent`, after the description block:
   - If `ticket.platform`: show a row — `<p className="text-xs font-medium text-muted-foreground mb-1">Platform</p>` with a Badge showing "Mobile" or "Desktop" using same color scheme as admin.
   - If `ticket.attachmentKey`: This page is a server component, so generate the download URL server-side. At the top of the component (after fetching ticket), call `const attachmentUrl = ticket.attachmentKey ? await generateDownloadUrl(ticket.attachmentKey) : null;`. Import `generateDownloadUrl` from `@/lib/storage/presigned`. Show a row with label "Attachment" and an `<a href={attachmentUrl} target="_blank" rel="noopener noreferrer">` link styled as `text-blue-600 hover:text-blue-800 underline text-sm inline-flex items-center gap-1`. Import and show `Paperclip` icon from lucide-react.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors. Submit a test ticket with platform set and a file attached. Verify admin can see platform badge and click attachment link in expanded ticket view. Verify owner can see platform badge and attachment link on ticket detail page.
  </verify>
  <done>
    Admin ticket list shows platform badge and clickable attachment download link in expanded view. Owner ticket detail page shows platform badge and clickable attachment download link. Both use presigned download URLs (1-hour expiry).
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npx prisma db push` applied successfully (platform, attachmentUrl, attachmentKey columns exist)
3. Support modal shows platform toggle with auto-detection and file attachment input
4. Submitting a ticket with attachment: file uploads to R2, ticket created with attachmentKey
5. Admin expanded ticket view shows platform badge and attachment link
6. Owner ticket detail page shows platform badge and attachment link
7. Attachment download links work (presigned URLs open file in new tab)
</verification>

<success_criteria>
- SupportTicket model has platform, attachmentUrl, attachmentKey nullable fields
- Support modal has platform toggle (auto-detects Mobile vs Desktop) and file input (images + PDF, max 10MB)
- File uploads via presigned URL to R2 `tenant-{tenantId}/support/{fileId}-{fileName}` path
- Admin and owner views display platform as a badge and attachment as a clickable download link
- All TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/89-support-ticket-add-file-attachment-and-m/89-SUMMARY.md`
</output>
