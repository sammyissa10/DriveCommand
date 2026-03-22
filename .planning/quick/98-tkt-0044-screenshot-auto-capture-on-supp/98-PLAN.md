---
phase: quick-98
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/components/support/support-ticket-modal.tsx
  - src/actions/support-tickets.ts
  - src/app/(admin)/admin-support/ticket-list.tsx
  - package.json
autonomous: true
must_haves:
  truths:
    - "When user clicks the support button, a confirmation dialog asks whether to capture a screenshot of the current page"
    - "If user confirms, html2canvas captures the page before the ticket form sheet opens"
    - "Captured screenshot appears as a thumbnail preview in the ticket form with option to remove it"
    - "User can still submit a ticket without a screenshot (screenshot is optional)"
    - "Screenshot is uploaded to S3 via the existing presigned URL pattern and stored as screenshotKey on the ticket"
    - "Admin support ticket list shows screenshot inline as a clickable thumbnail that expands to full size"
  artifacts:
    - path: "src/components/support/support-ticket-modal.tsx"
      provides: "Screenshot capture flow with confirmation dialog, preview, upload"
    - path: "src/actions/support-tickets.ts"
      provides: "screenshotKey field in createSupportTicket and getAllTickets"
    - path: "src/app/(admin)/admin-support/ticket-list.tsx"
      provides: "Inline screenshot thumbnail with expand-to-full-size dialog"
    - path: "prisma/schema.prisma"
      provides: "screenshotKey nullable field on SupportTicket"
  key_links:
    - from: "support-ticket-modal.tsx"
      to: "/api/support/upload-attachment"
      via: "presigned upload for screenshot blob"
      pattern: "fetch.*upload-attachment"
    - from: "support-ticket-modal.tsx"
      to: "createSupportTicket"
      via: "passes screenshotKey from upload"
      pattern: "screenshotKey"
    - from: "ticket-list.tsx"
      to: "getAttachmentDownloadUrl"
      via: "fetches presigned URL for screenshot display"
      pattern: "getAttachmentDownloadUrl.*screenshotKey"
---

<objective>
TKT-0044: Add automatic screenshot capture to support ticket creation flow.

When a user clicks the support button, show a confirmation dialog asking if they want to capture a screenshot. If confirmed, use html2canvas to capture the current page BEFORE the ticket form opens, then show the screenshot as a preview in the form. The screenshot uploads to S3 via the existing presigned URL pattern and is stored separately from the manual file attachment (new `screenshotKey` field). On the admin side, screenshots display inline as clickable thumbnails that expand to full size in a dialog.

Purpose: Give admins immediate visual context about what the user was seeing when they reported an issue, dramatically improving support efficiency.
Output: Working screenshot capture -> preview -> upload -> admin inline view flow.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/support/support-ticket-modal.tsx
@src/actions/support-tickets.ts
@src/app/api/support/upload-attachment/route.ts
@src/app/(admin)/admin-support/ticket-list.tsx
@src/lib/storage/presigned.ts
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + server action + html2canvas install</name>
  <files>
    prisma/schema.prisma
    src/actions/support-tickets.ts
    package.json
  </files>
  <action>
    1. Install html2canvas: `npm install html2canvas`

    2. Add `screenshotKey String?` field to the `SupportTicket` model in prisma/schema.prisma, right after the existing `attachmentKey` field. Run `npx prisma db push` to apply.

    3. Update `src/actions/support-tickets.ts`:
       - Add `screenshotKey: z.string().optional()` to `createTicketSchema`
       - Add `screenshotKey?: string` to the `createSupportTicket` data parameter type
       - Persist `screenshotKey: screenshotKey ?? null` in the `tx.supportTicket.create` call
       - Update the `RawTicket` type in `getAllTickets` to include `screenshotKey: string | null`
       - The existing `getAttachmentDownloadUrl` action will be reused for screenshot URLs too (it just takes any s3Key)
  </action>
  <verify>
    `npx tsc --noEmit` passes with zero errors.
    `npx prisma db push` completes without error.
    Grep for `screenshotKey` in schema.prisma and support-tickets.ts confirms presence.
  </verify>
  <done>
    SupportTicket model has screenshotKey field. createSupportTicket accepts and persists screenshotKey. getAllTickets returns screenshotKey. html2canvas is installed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Screenshot capture flow in support ticket modal</name>
  <files>
    src/components/support/support-ticket-modal.tsx
  </files>
  <action>
    Rewrite the support button click flow in `SupportTicketModal`:

    **New state variables:**
    - `screenshotBlob: Blob | null` — captured screenshot data
    - `screenshotPreviewUrl: string | null` — object URL for thumbnail preview
    - `capturing: boolean` — true while html2canvas is running
    - `showConfirmDialog: boolean` — controls the confirmation prompt

    **New click flow for the support button (replace direct `setOpen(true)`):**
    1. On button click, set `showConfirmDialog = true`
    2. Show an AlertDialog (from shadcn/ui — already installed at `@/components/ui/alert-dialog`) with:
       - Title: "Capture Screenshot?"
       - Description: "We can capture a screenshot of the current page to attach to your support ticket. This helps our team understand the issue faster."
       - Two actions: "Skip" (opens form without screenshot) and "Capture & Continue" (captures then opens form)
    3. If "Skip": close dialog, `setOpen(true)` to open the form sheet as before
    4. If "Capture & Continue":
       - Close the dialog
       - Set `capturing = true`
       - Import html2canvas dynamically: `const html2canvas = (await import('html2canvas')).default`
       - Call `html2canvas(document.body, { useCORS: true, scale: 1, logging: false, windowWidth: document.documentElement.scrollWidth, windowHeight: document.documentElement.scrollHeight })` to capture full page
       - Convert canvas to blob: `canvas.toBlob(blob => ..., 'image/png', 0.8)`
       - Store blob in state, create object URL for preview
       - Set `capturing = false`, `setOpen(true)` to open form

    **Show a brief capturing indicator:**
    When `capturing` is true, render a fixed overlay (same z-index area as the support button) with a small "Capturing screenshot..." text + spinner. This disappears once capture completes and the form opens.

    **Screenshot preview in the form (inside the Sheet, before the file attachment section):**
    - If `screenshotPreviewUrl` exists, show a section labeled "Auto-captured Screenshot" with:
      - A thumbnail image (max-h-32, rounded, border) showing the preview
      - A small "Remove" button (X icon) that clears screenshotBlob and screenshotPreviewUrl
    - If no screenshot, show nothing (no empty state needed — it's optional)

    **Updated submit flow (handleSubmit):**
    - After the existing file attachment upload (if any), add a second upload block for the screenshot:
      - If `screenshotBlob` exists:
        - Call `/api/support/upload-attachment` with `{ fileName: 'screenshot.png', contentType: 'image/png', sizeBytes: screenshotBlob.size }`
        - PUT the blob to the returned uploadUrl
        - Store the s3Key as `screenshotS3Key`
      - Pass `screenshotKey: screenshotS3Key` to `createSupportTicket` along with existing fields
    - The existing `attachmentKey` (manual file) remains separate and independent

    **Reset form update:**
    - In `resetForm()`, also clear `screenshotBlob`, revoke `screenshotPreviewUrl` with `URL.revokeObjectURL`, and set both to null

    **Important:** The screenshot is captured of the page BEHIND the modal. The html2canvas call happens BEFORE `setOpen(true)`, so the Sheet is not yet open. The support button itself will be captured in the screenshot, which is fine — it's part of the page state.
  </action>
  <verify>
    `npx tsc --noEmit` passes with zero errors.
    Visually verify (manual): Click support button -> confirmation dialog appears -> "Capture & Continue" -> brief spinner -> form opens with screenshot thumbnail -> can remove screenshot -> can submit with or without screenshot.
  </verify>
  <done>
    Support button click shows confirmation dialog. "Capture & Continue" captures page via html2canvas before form opens. Screenshot preview shows in form as removable thumbnail. Screenshot uploads to S3 on submit as screenshotKey. Users can still submit without screenshot by clicking "Skip" or removing the preview.
  </done>
</task>

<task type="auto">
  <name>Task 3: Inline screenshot display in admin ticket list</name>
  <files>
    src/app/(admin)/admin-support/ticket-list.tsx
  </files>
  <action>
    Update the `TicketRow` component in the admin ticket list to show screenshots inline:

    **New state:**
    - `screenshotUrl: string | null` — presigned download URL for inline display
    - `screenshotLoading: boolean` — loading state while fetching URL
    - `screenshotExpanded: boolean` — controls full-size dialog

    **Load screenshot URL when row expands:**
    In the existing `useEffect` that fires on `expanded`, add: if `ticket.screenshotKey` exists and `screenshotUrl` is null, call `getAttachmentDownloadUrl(ticket.screenshotKey)` and store the result in `screenshotUrl`. Handle errors gracefully (just don't show the screenshot).

    **Render screenshot section in expanded detail (between "Attachment" and "Thread" sections):**
    - Only render if `ticket.screenshotKey` exists
    - Label: "Auto-captured Screenshot" (text-xs font-medium text-gray-500)
    - If `screenshotLoading`: show "Loading screenshot..." text
    - If `screenshotUrl`: show a clickable thumbnail image:
      - `<img src={screenshotUrl} alt="Page screenshot" />` with classes: `max-h-48 rounded-md border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity`
      - On click: set `screenshotExpanded = true`
    - When `screenshotExpanded` is true, render an AlertDialog (or a simple fixed overlay) showing the full-size screenshot:
      - Use shadcn Dialog component (already available): `<Dialog open={screenshotExpanded} onOpenChange={setScreenshotExpanded}>`
      - DialogContent with `max-w-4xl` class
      - Full-size `<img>` with `w-full` class
      - DialogTitle: "Screenshot — {ticket.ticketNumber}"
    - Import Dialog, DialogContent, DialogHeader, DialogTitle from `@/components/ui/dialog`

    **Also update the row header (always-visible part):**
    If `ticket.screenshotKey` exists, add a small camera icon (use `Camera` from lucide-react) next to the existing badges in the ticket header, as a visual indicator. Style it as a subtle gray icon: `<Camera className="h-3.5 w-3.5 text-gray-400" title="Has screenshot" />`
  </action>
  <verify>
    `npx tsc --noEmit` passes with zero errors.
    Visually verify (manual): Expand a ticket with a screenshot -> thumbnail loads inline -> click thumbnail -> full-size dialog opens -> close dialog.
  </verify>
  <done>
    Admin ticket list shows a camera icon on tickets with screenshots. Expanding a ticket with a screenshot shows an inline thumbnail. Clicking the thumbnail opens a full-size dialog view. Tickets without screenshots render identically to before.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero TypeScript errors
2. `npx prisma validate` — schema valid
3. Full flow test: Click support button -> "Capture & Continue" -> screenshot preview visible -> fill form -> submit -> admin panel shows screenshot inline
4. Skip flow test: Click support button -> "Skip" -> no screenshot in form -> submit works normally
5. Manual attachment still works independently alongside auto-screenshot
</verification>

<success_criteria>
- html2canvas installed and working for page capture
- Confirmation dialog appears before screenshot capture
- Screenshot captured BEFORE form opens (captures the page user was viewing)
- Screenshot preview in form with remove option
- Screenshot uploaded to S3 as separate screenshotKey (not conflicting with attachmentKey)
- Admin ticket list shows inline expandable screenshots
- Existing attachment functionality unchanged
- TypeScript compiles with zero errors
</success_criteria>

<output>
After completion, create `.planning/quick/98-tkt-0044-screenshot-auto-capture-on-supp/98-SUMMARY.md`
</output>
