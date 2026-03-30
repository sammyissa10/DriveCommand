---
phase: quick-121
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/components/shared/SupportTicketFAB.tsx
  - apps/web/src/app/api/mobile/support/ticket/route.ts
  - apps/web/src/app/api/mobile/support/upload-screenshot/route.ts
  - packages/api-client/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Success toast shows human-readable page label (e.g. 'Loads Tab') instead of raw pathname"
    - "User can attach a screenshot from gallery or camera before submitting"
    - "Thumbnail preview of attached screenshot appears in form"
    - "Screenshot is uploaded to S3 and screenshotKey is saved on the ticket"
    - "Admin view already displays screenshotKey images — no admin changes needed"
  artifacts:
    - path: "apps/mobile/components/shared/SupportTicketFAB.tsx"
      provides: "Human-readable page labels, image picker, thumbnail preview, upload flow"
    - path: "apps/web/src/app/api/mobile/support/upload-screenshot/route.ts"
      provides: "Presigned URL endpoint for mobile screenshot uploads"
    - path: "apps/web/src/app/api/mobile/support/ticket/route.ts"
      provides: "Accepts optional screenshotKey in create payload"
    - path: "packages/api-client/src/index.ts"
      provides: "Updated createSupportTicket signature with screenshotKey"
  key_links:
    - from: "SupportTicketFAB.tsx"
      to: "/api/mobile/support/upload-screenshot"
      via: "fetch for presigned URL then PUT to S3"
      pattern: "upload-screenshot"
    - from: "SupportTicketFAB.tsx"
      to: "/api/mobile/support/ticket"
      via: "createSupportTicket with screenshotKey"
      pattern: "screenshotKey"
---

<objective>
Improve the mobile SupportTicketFAB with two enhancements: (1) convert raw expo-router pathnames to human-readable labels in both the fromPage sent to the API and the success toast, and (2) add screenshot attachment via expo-image-picker with thumbnail preview, S3 upload, and screenshotKey persistence.

Purpose: Better support context for admins (readable page names + visual screenshots) and better UX for users (see where they're submitting from, attach visual evidence).
Output: Updated FAB component, new upload endpoint, updated ticket API and api-client.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/components/shared/SupportTicketFAB.tsx
@apps/web/src/app/api/mobile/support/ticket/route.ts
@apps/web/src/app/api/mobile/driver/incidents/upload-photo/route.ts (pattern reference for presigned URL endpoint)
@apps/mobile/lib/upload.ts (pattern reference for S3 upload from mobile)
@packages/api-client/src/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pathname-to-label mapping and screenshot upload endpoint</name>
  <files>
    apps/mobile/components/shared/SupportTicketFAB.tsx
    apps/web/src/app/api/mobile/support/upload-screenshot/route.ts
    apps/web/src/app/api/mobile/support/ticket/route.ts
    packages/api-client/src/index.ts
  </files>
  <action>
**1a. Pathname-to-label mapping in SupportTicketFAB.tsx:**

Create a `getPageLabel(pathname: string): string` helper function at the top of the file that maps expo-router pathnames to human-readable labels. The mapping should cover all known routes:

Owner routes:
- `/(owner)` or `/(owner)/index` -> "Dashboard"
- `/(owner)/loads` -> "Loads"
- `/(owner)/loads/[id]` (any path matching `/loads/` with a segment after) -> "Load Details"
- `/(owner)/drivers` -> "Drivers"
- `/(owner)/drivers/[id]` -> "Driver Details"
- `/(owner)/drivers/invite` -> "Invite Driver"
- `/(owner)/map` -> "Map"
- `/(owner)/more` or `/(owner)/more/index` -> "More"
- `/(owner)/more/fleet` -> "Fleet"
- `/(owner)/more/trucks` -> "Trucks"
- `/(owner)/more/trucks/[id]` -> "Truck Details"
- `/(owner)/more/trucks/new` -> "New Truck"
- `/(owner)/more/invoices` -> "Invoices"
- `/(owner)/more/invoices/[id]` -> "Invoice Details"
- `/(owner)/more/invoices/new` -> "New Invoice"
- `/(owner)/more/crm` -> "CRM"
- `/(owner)/more/crm/new` -> "New Customer"
- `/(owner)/more/compliance` -> "Compliance"
- `/(owner)/more/payroll` -> "Payroll"
- `/(owner)/more/ai-documents` -> "AI Documents"
- `/(owner)/more/settings` -> "Settings"
- `/(owner)/more/settings/account` -> "Account Settings"
- `/(owner)/more/settings/team` -> "Team Settings"

Driver routes:
- `/(driver)` or `/(driver)/index` -> "Dashboard"
- `/(driver)/loads` -> "Loads"
- `/(driver)/loads/[id]` -> "Load Details"
- `/(driver)/loads/my-route` -> "My Route"
- `/(driver)/documents` -> "Documents"
- `/(driver)/hos` -> "Hours of Service"
- `/(driver)/incidents` -> "Incidents"
- `/(driver)/incidents/new` -> "New Incident"
- `/(driver)/messages` -> "Messages"

Fallback: if no match, strip the group prefix `/(owner)/` or `/(driver)/`, capitalize segments, and join with " > ". E.g. unknown path `/(owner)/foo/bar` -> "Foo > Bar".

Implementation approach: Use an ordered array of `{ pattern: RegExp, label: string }` entries, checking from most specific to least specific. For dynamic segments like `[id]`, use a regex that matches any non-slash segment (e.g. `/loads/[^/]+$` matches `/loads/abc123`).

Use this label in two places:
- Pass `fromPage` as `\`${pathname} (${label})\`` so the raw path is preserved for debugging but the label is visible in admin view.
- In the success toast `text2`, change from "We'll be in touch soon." to `"Submitted from ${label}"`.

**1b. New presigned URL endpoint for mobile screenshot uploads:**

Create `apps/web/src/app/api/mobile/support/upload-screenshot/route.ts` following the exact same pattern as `apps/web/src/app/api/mobile/driver/incidents/upload-photo/route.ts` but:
- Route: POST /api/mobile/support/upload-screenshot
- Do NOT require driverId (support tickets come from both drivers and owners)
- Use `'support'` as the S3 bucket prefix (same as the web upload-attachment endpoint)
- Allow image/jpeg, image/jpg, image/png only
- Max 10MB
- Use `validateMobileToken`, `mobileLimiter`, `applyRateLimit`, `generateUploadUrl`, `nanoid` — same imports as the incident photo endpoint

**1c. Update ticket creation to accept screenshotKey:**

In `apps/web/src/app/api/mobile/support/ticket/route.ts`:
- Add `screenshotKey: z.string().optional()` to `createTicketSchema`
- Extract `screenshotKey` from validated data
- Include `screenshotKey` in the `tx.supportTicket.create` data object (only if provided)

**1d. Update api-client createSupportTicket:**

In `packages/api-client/src/index.ts`:
- Add `screenshotKey?: string` to the data parameter type of the `createSupportTicket` function

In `packages/api-client/src/driver.ts`:
- Add `screenshotKey?: string` to the data parameter type of `driverApi.createSupportTicket`
  </action>
  <verify>
    Run `npx tsc --noEmit` from the repo root (or `cd apps/web && npx tsc --noEmit` and `cd apps/mobile && npx tsc --noEmit`) to confirm no type errors. Verify the new route file exists at apps/web/src/app/api/mobile/support/upload-screenshot/route.ts.
  </verify>
  <done>
    - getPageLabel maps all known routes to human-readable labels
    - Success toast shows "Submitted from {label}"
    - fromPage includes both raw path and label
    - New upload-screenshot endpoint exists and mirrors incident photo pattern
    - Ticket creation accepts optional screenshotKey
    - api-client types updated
  </done>
</task>

<task type="auto">
  <name>Task 2: Add expo-image-picker screenshot attachment with preview in SupportTicketFAB</name>
  <files>
    apps/mobile/components/shared/SupportTicketFAB.tsx
  </files>
  <action>
In SupportTicketFAB.tsx, add screenshot attachment capability:

**Form state changes:**
- Add `screenshotUri: string | null` to `FormState` interface (default: `null`)
- Add `screenshotUploading: boolean` state (separate from form, managed via useState)

**Attach button UI:**
Between the description input and the submit button, add an "Attach Screenshot" section:
- A row with a Pressable styled like a secondary/outline button with a camera icon (use `Camera` from lucide-react-native) and text "Attach Screenshot"
- When pressed, show an Alert.alert with three options: "Take Photo" (launchCameraAsync), "Choose from Gallery" (launchImageLibraryAsync), "Cancel"
- Use `expo-image-picker` — it is already installed. Import `launchImageLibraryAsync`, `launchCameraAsync`, `requestCameraPermissionsAsync`, `requestMediaLibraryPermissionsAsync`, `MediaTypeOptions` from `expo-image-picker`
- For camera: request camera permission first. For gallery: request media library permission. If denied, show a toast error.
- Config for both: `mediaTypes: 'images'`, `quality: 0.7`, `allowsEditing: false`
- On result (if not cancelled): set `form.screenshotUri` to `result.assets[0].uri`

**Thumbnail preview:**
- If `form.screenshotUri` is set, show a preview row below the attach button:
  - `Image` component (from react-native) showing the URI, height 120, rounded corners, border
  - A small "X" remove button (Pressable) in the top-right corner of the image to clear the screenshot (set `screenshotUri` back to null)
- Style: `borderRadius: 8, borderWidth: 1, borderColor: '#334155'`

**Upload on submit:**
Modify the `mutationFn` in the `useMutation` hook:
1. If `form.screenshotUri` is set:
   - Import and reuse the upload pattern from `apps/mobile/lib/upload.ts` but generalized. Create a local async helper `uploadScreenshot(uri: string, token: string): Promise<string>` that:
     a. Gets file info via `getInfoAsync` from `expo-file-system/legacy`
     b. POSTs to `/api/mobile/support/upload-screenshot` with `{ fileName, contentType, sizeBytes }` and Bearer token
     c. Gets `{ uploadUrl, s3Key }` back
     d. Reads file as base64 via `readAsStringAsync`, converts to Uint8Array, PUTs to the presigned URL
     e. Returns `s3Key`
   - Call this before `createSupportTicket`, passing the resulting `s3Key` as `screenshotKey`
2. If no screenshot, pass `screenshotKey: undefined` (omit from payload)

**Loading state:**
- While uploading screenshot, the submit button text should show "Uploading screenshot..." before switching to "Submitting..."
- Use a `ref` or state variable to track upload phase vs submit phase

**Reset on close/success:**
- The `handleClose` and `onSuccess` already reset form via `setForm(DEFAULT_FORM)` — since `screenshotUri: null` is in DEFAULT_FORM, this is handled automatically

**Styles to add:**
- `attachRow`: `flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8`
- `attachButton`: `flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8`
- `attachButtonText`: `color: '#94a3b8', fontSize: 13, fontWeight: '500'`
- `previewContainer`: `marginTop: 12, position: 'relative'`
- `previewImage`: `height: 120, borderRadius: 8, borderWidth: 1, borderColor: '#334155'`
- `removeButton`: `position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center'`
- `removeButtonText`: `color: '#ffffff', fontSize: 14, fontWeight: '600'`

Note: The `getBaseUrl()` helper from `apps/mobile/lib/upload.ts` should be reused — either import it (if exported) or duplicate the same pattern using `process.env.EXPO_PUBLIC_API_URL`.
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit` to confirm no type errors. Visually verify in Android emulator: open FAB, see "Attach Screenshot" button, tap it, select image, see thumbnail preview with remove X, submit and see "Submitted from {page label}" toast.
  </verify>
  <done>
    - Attach Screenshot button visible in support ticket form
    - Tapping shows camera/gallery options
    - Selected image shows as thumbnail preview with remove option
    - Screenshot uploads to S3 before ticket creation
    - screenshotKey saved with ticket and visible in admin panel (existing admin screenshot display works)
    - Submit button shows upload progress state
    - Form reset clears screenshot
  </done>
</task>

</tasks>

<verification>
1. Open mobile app on Android emulator (owner portal)
2. Tap the support FAB (lifebuoy icon)
3. Verify "Attach Screenshot" button is visible between description and submit
4. Tap "Attach Screenshot" -> select from gallery -> thumbnail appears
5. Tap X on thumbnail -> image removed
6. Fill out form and attach a screenshot, submit
7. Success toast should show "Submitted from Dashboard" (or appropriate label for current page)
8. Check admin panel -> admin-support -> find the new ticket -> expand it -> screenshot should display
9. Repeat from driver portal to verify driver route labels work
</verification>

<success_criteria>
- All known mobile routes map to human-readable labels
- Success toast includes page label
- Screenshot can be attached via camera or gallery
- Thumbnail preview with remove functionality works
- Screenshot uploads to S3 and screenshotKey persists on ticket
- Admin view shows the screenshot (existing functionality, no changes needed)
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/121-support-ticket-improvements-1-convert-ra/121-SUMMARY.md`
</output>
