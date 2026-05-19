---
phase: 387-tkt-0033-part-2-truck-photo-upload
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/{NEW_TIMESTAMP}_add_carrier_truck_photo_s3_key/migration.sql
  - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
  - apps/web/src/components/carrier/fleet/TruckPhotoUploadModal.tsx
  - apps/web/src/components/carrier/fleet/CarrierTruckDetailsView.tsx
  - apps/web/src/components/carrier/fleet/CarrierTruckDetailClient.tsx
autonomous: true

must_haves:
  truths:
    - "CarrierTruck row has a nullable photo_s3_key column persisted in Postgres"
    - "Owner can upload an image (jpg/png/webp, <=5MB) from the truck details page and see it appear after success"
    - "Owner can replace an existing truck photo by uploading again through the same modal"
    - "Owner can remove a truck photo via a Remove Photo button and the placeholder returns"
    - "Navigating to /carrier/fleet/trucks/[id]?mode=edit opens the page directly in edit mode"
    - "Returning to view mode (Cancel or Save) leaves the ?mode=edit param untouched in the URL"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "photoS3Key String? @map(\"photo_s3_key\") on CarrierTruck"
      contains: "photoS3Key"
    - path: "apps/web/prisma/migrations/{NEW_TIMESTAMP}_add_carrier_truck_photo_s3_key/migration.sql"
      provides: "ALTER TABLE carrier_trucks ADD COLUMN photo_s3_key text NULL"
      contains: "ADD COLUMN \"photo_s3_key\""
    - path: "apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts"
      provides: "POST endpoint returning {uploadUrl, s3Key} for truck photo upload (jpeg/png/webp, <=5MB)"
      exports: ["POST"]
    - path: "apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts"
      provides: "GET endpoint returning {viewUrl} signed download URL for the truck's photo"
      exports: ["GET"]
    - path: "apps/web/src/components/carrier/fleet/TruckPhotoUploadModal.tsx"
      provides: "Dialog with file picker (jpg/png/webp 5MB), runs presign→PUT→PATCH flow, calls onSuccess()"
      min_lines: 100
    - path: "apps/web/src/components/carrier/fleet/CarrierTruckDetailsView.tsx"
      provides: "Photo section that renders signed image when photoS3Key is present, otherwise placeholder + Upload Photo trigger; Remove Photo button when present"
    - path: "apps/web/src/components/carrier/fleet/CarrierTruckDetailClient.tsx"
      provides: "useSearchParams() hydration so initial mode reflects ?mode=edit"
      contains: "useSearchParams"
  key_links:
    - from: "TruckPhotoUploadModal.tsx"
      to: "/api/v1/carrier/fleet/trucks/[id]/photo-upload-url"
      via: "POST fetch with {fileName, contentType, sizeBytes}"
      pattern: "photo-upload-url"
    - from: "TruckPhotoUploadModal.tsx"
      to: "S3/R2 bucket"
      via: "XHR/fetch PUT to presigned uploadUrl with file body"
      pattern: "method: 'PUT'"
    - from: "TruckPhotoUploadModal.tsx"
      to: "/api/v1/carrier/fleet/trucks/[id]"
      via: "PATCH with {photoS3Key} after successful upload"
      pattern: "photoS3Key"
    - from: "CarrierTruckDetailsView.tsx"
      to: "/api/v1/carrier/fleet/trucks/[id]/photo-view-url"
      via: "GET fetch on mount when photoS3Key exists, then render Next/Image (or img) with returned viewUrl"
      pattern: "photo-view-url"
    - from: "CarrierTruckDetailClient.tsx"
      to: "next/navigation"
      via: "useSearchParams() to read ?mode=edit on mount and initialize useState"
      pattern: "useSearchParams"
---

<objective>
Ship TKT-0033 Part 2: per-truck photo. Add a nullable photoS3Key column to CarrierTruck, build a single-photo upload modal that mirrors the proven presign → PUT → PATCH flow, render the photo on the truck details view with replace + remove controls, and hydrate the details page mode from the ?mode=edit query string.

Purpose: Trucks need a primary photo for visual identification in fleet pages. Part 1 (commit dc121003) already shipped the view/edit toggle on the details page — Part 2 layers the photo onto the same surface without disturbing the existing form or the shared document upload modal.

Output: Migration applied, schema regenerated, two new presign endpoints, one new upload modal, updated details view + details client, PATCH route accepts photoS3Key.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Part 1 (already shipped) — view/edit toggle source of truth
@apps/web/src/components/carrier/fleet/CarrierTruckDetailClient.tsx
@apps/web/src/components/carrier/fleet/CarrierTruckDetailsView.tsx

# Reference patterns — read but DO NOT modify
@apps/web/src/components/carrier/documents/DocumentUploadModal.tsx
@apps/web/src/lib/storage/presigned.ts
@apps/web/src/app/api/documents/request-upload-url/route.ts
@apps/web/src/app/api/documents/download-url/[id]/route.ts

# Files being modified in this plan
@apps/web/prisma/schema.prisma
@apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
@apps/web/src/lib/carrier/fleet-trucks.ts

# Naming pattern for migrations
@apps/web/prisma/migrations/20260519000001_add_grid_view_model/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add photoS3Key column to CarrierTruck (schema + migration + Prisma generate)</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/{NEW_TIMESTAMP}_add_carrier_truck_photo_s3_key/migration.sql
  </files>
  <action>
    1) Edit apps/web/prisma/schema.prisma, model `CarrierTruck` (around line 2052). Insert a new field after `notes`:

       photoS3Key           String?   @map("photo_s3_key")

       Keep all existing fields, indexes, and relations untouched. Maintain the existing column alignment style (the model uses padded columns — match it).

    2) Create a NEW migration directory. Determine the next timestamp by picking a date >= the latest existing migration prefix (latest is `20260519000001_add_grid_view_model`). Use today's date in YYYYMMDD format with a 000001 suffix — if today's date is <= 20260519, bump to `20260520000001`. Name the folder `{TIMESTAMP}_add_carrier_truck_photo_s3_key`.

    3) Create migration.sql inside that folder containing exactly:

       -- AlterTable
       ALTER TABLE "carrier_trucks" ADD COLUMN "photo_s3_key" TEXT;

    4) Apply the migration to Supabase via the Supabase MCP `apply_migration` tool (project: DriveCommand). Use the same SQL as the file. The auto-apply hook normally runs on migration.sql write — if MCP succeeds the column is live regardless of whether the hook fires.

    5) Run `npx prisma generate --schema apps/web/prisma/schema.prisma` from the repo root (NOT inside apps/mobile). This regenerates the Prisma client so `prisma.carrierTruck.update({ data: { photoS3Key } })` is typed.

    DO NOT modify any other migration file. DO NOT add an index — column is single-row lookup only. DO NOT change the column to NOT NULL — it is intentionally nullable so trucks without a photo render the placeholder.

    Reference shape: see `apps/web/prisma/migrations/20260519000001_add_grid_view_model/migration.sql` for SQL style (uppercase keywords, quoted identifiers, trailing semicolons).
  </action>
  <verify>
    - `grep -n "photoS3Key" apps/web/prisma/schema.prisma` shows the new field inside the CarrierTruck block.
    - The new migration folder exists and migration.sql contains the ALTER TABLE line.
    - Supabase MCP confirms column `photo_s3_key` exists on table `carrier_trucks` (call `list_tables` or `execute_sql` with `SELECT column_name FROM information_schema.columns WHERE table_name='carrier_trucks' AND column_name='photo_s3_key';`).
    - `npx prisma generate --schema apps/web/prisma/schema.prisma` exits 0 and prints "Generated Prisma Client".
    - `cd apps/web && npx tsc --noEmit` exits 0 (the field is now part of the generated client; nothing else should break).
  </verify>
  <done>
    Schema and DB both expose photo_s3_key (TEXT, nullable) on carrier_trucks. Prisma client typings include `photoS3Key?: string | null` on CarrierTruck.
  </done>
</task>

<task type="auto">
  <name>Task 2: Backend — extend PATCH schema + service, add photo-upload-url and photo-view-url endpoints</name>
  <files>
    apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
    apps/web/src/lib/carrier/fleet-trucks.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts
  </files>
  <action>
    A) Extend the PATCH route — apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts

       Add one line to `CarrierTruckUpdateSchema` (place between `notes` and the closing brace):

           photoS3Key: z.string().nullable().optional(),

       Leave the GET, PATCH handler bodies, auth, and revalidatePath calls untouched. The schema change automatically flows through to `updateCarrierTruck`.

    B) Extend the service type — apps/web/src/lib/carrier/fleet-trucks.ts

       Add to `CarrierTruckCreateInput` (so the existing `CarrierTruckUpdateInput = Partial<...>` picks it up):

           photoS3Key?: string | null;

       Place it after `notes?: string;`. No changes to `createCarrierTruck` or `updateCarrierTruck` bodies needed — the existing `...rest` spread will forward `photoS3Key` straight to Prisma.

    C) Create POST /api/v1/carrier/fleet/trucks/[id]/photo-upload-url
       Path: apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts

       Mirror the pattern from apps/web/src/app/api/documents/request-upload-url/route.ts but slimmer — no document type, no quarantine prefix.

       - Imports: NextRequest, NextResponse from 'next/server'; getSession from '@/lib/auth/supabase'; generateUploadUrl from '@/lib/storage/presigned'; nanoid from 'nanoid'; logger from '@/lib/logger'; uploadLimiter + applyRateLimit from '@/lib/rate-limit'; prisma from '@/lib/db/prisma'.
       - Constants:
             const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
             const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
       - Signature: `export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> })`.
       - Flow:
           1) `const session = await getSession();` — if no session or no tenantId, return 401/403 to match the sibling [id]/route.ts conventions.
           2) Rate limit with `await applyRateLimit(uploadLimiter, session.tenantId)`.
           3) Confirm the truck belongs to the tenant: `const truck = await prisma.carrierTruck.findFirst({ where: { id: (await params).id, orgId: session.tenantId }, select: { id: true } });` — 404 if not found.
           4) Parse `{ fileName, contentType, sizeBytes }` from `await req.json()`.
           5) Reject if `!ALLOWED_PHOTO_TYPES.includes(contentType)` → 400 "Only JPEG, PNG, or WebP images are allowed".
           6) Reject if `sizeBytes > MAX_PHOTO_SIZE` → 400 "Photo exceeds 5MB limit".
           7) `const fileId = nanoid();`
           8) Sanitize the filename inline: `const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');`. (Do NOT import sanitizeFilename — keep this endpoint self-contained.)
           9) `const { uploadUrl, s3Key } = await generateUploadUrl(session.tenantId, 'trucks', fileId, safeName, contentType, sizeBytes);`
          10) Return `NextResponse.json({ uploadUrl, s3Key })`.
       - Wrap in try/catch; on error log via `logger.error('[truck photo-upload-url] failed', err)` and return 500.

    D) Create GET /api/v1/carrier/fleet/trucks/[id]/photo-view-url
       Path: apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts

       - Imports: NextResponse from 'next/server'; getSession from '@/lib/auth/supabase'; generateDownloadUrl from '@/lib/storage/presigned'; prisma from '@/lib/db/prisma'; logger from '@/lib/logger'.
       - Signature: `export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> })`.
       - Flow:
           1) Session + tenant guard (same as above).
           2) `const truck = await prisma.carrierTruck.findFirst({ where: { id, orgId: session.tenantId }, select: { photoS3Key: true } });`
           3) If `!truck` → 404. If `!truck.photoS3Key` → 404 with `{ error: 'No photo' }`.
           4) Tenant isolation check: `if (!truck.photoS3Key.startsWith(\`tenant-${session.tenantId}/\`)) return NextResponse.json({ error: 'Not found' }, { status: 404 });`
           5) `const viewUrl = await generateDownloadUrl(truck.photoS3Key);`
           6) Return `NextResponse.json({ viewUrl })`.

    DO NOT modify presigned.ts. DO NOT touch the sibling list route. DO NOT add an endpoint that does the PATCH for the client — the existing PATCH already accepts photoS3Key after change A.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` exits 0.
    - Manual curl against a running dev server (or just static review): POST with `{ "fileName": "test.jpg", "contentType": "image/jpeg", "sizeBytes": 1000 }` returns 200 with `{uploadUrl, s3Key}` whose `s3Key` matches `tenant-<tenantId>/trucks/<id>-test.jpg`.
    - POST with `{ "contentType": "image/gif", ... }` returns 400.
    - POST with `{ "sizeBytes": 6000000, ... }` returns 400.
    - GET on a truck with no photo returns 404 "No photo".
    - PATCH with body `{ "photoS3Key": "tenant-xxx/trucks/abc-photo.jpg" }` returns 200 and persists the value (check with a follow-up GET on /api/v1/carrier/fleet/trucks/[id]).
  </verify>
  <done>
    All three backend touchpoints are live: PATCH accepts photoS3Key, photo-upload-url returns presigned PUT under the `trucks` category, photo-view-url returns a signed GET URL.
  </done>
</task>

<task type="auto">
  <name>Task 3: Frontend — TruckPhotoUploadModal + DetailsView photo section + DetailClient ?mode=edit hydration</name>
  <files>
    apps/web/src/components/carrier/fleet/TruckPhotoUploadModal.tsx
    apps/web/src/components/carrier/fleet/CarrierTruckDetailsView.tsx
    apps/web/src/components/carrier/fleet/CarrierTruckDetailClient.tsx
  </files>
  <action>
    A) Create apps/web/src/components/carrier/fleet/TruckPhotoUploadModal.tsx

       - `'use client'` directive at the top.
       - Imports: `useRef, useState` from 'react'; `Upload, Image as ImageIcon, X` from 'lucide-react'; `toast` from 'sonner'; `Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger` from '@/components/ui/dialog'; `Button` from '@/components/ui/button'.
       - Constants: `const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];` and `const MAX_SIZE = 5 * 1024 * 1024;`.
       - Props interface:
             interface TruckPhotoUploadModalProps {
               truckId: string;
               hasExistingPhoto: boolean;
               onSuccess: () => void;
             }
       - Component:
           * Trigger button text: `hasExistingPhoto ? 'Replace Photo' : 'Upload Photo'`. Trigger should be a `<Button variant="outline" size="sm">` with the Upload icon.
           * State: `open`, `selectedFile`, `fileError`, `isDragOver`, `uploadProgress` (null | number), `uploadError`.
           * Validate on file pick / drop: reject if `!ALLOWED.includes(file.type)` → set fileError "Use JPEG, PNG, or WebP". Reject if `file.size > MAX_SIZE` → "Photo exceeds 5MB limit".
           * `doUpload()` flow (NO XHR needed since we don't need progress for small images — but use fetch + a simple "Uploading…" state. If you want progress, use XHR exactly the way DocumentUploadModal does):
               1) POST to `/api/v1/carrier/fleet/trucks/${truckId}/photo-upload-url` with `{ fileName: file.name, contentType: file.type, sizeBytes: file.size }`. If !ok, set uploadError from response and stop.
               2) PUT the file body directly to `uploadUrl` (returned from step 1) with `headers: { 'Content-Type': file.type }`. If !ok, set uploadError "Upload failed" and stop.
               3) PATCH `/api/v1/carrier/fleet/trucks/${truckId}` with `{ photoS3Key: s3Key }`. If !ok, set uploadError and stop.
               4) toast.success(hasExistingPhoto ? 'Photo replaced' : 'Photo uploaded'); close modal; call onSuccess().
           * Dialog body mirrors DocumentUploadModal layout: drag-and-drop zone, selected-file preview row, error display, footer with Cancel + Upload buttons. Strip out notes, document type select, and document type fetch — this modal only handles a single image.
           * `accept` attribute on the file input: `"image/jpeg,image/png,image/webp"`.

       Keep the file under ~220 lines. DO NOT import or reuse DocumentUploadModal. DO NOT support multi-file selection.

    B) Update apps/web/src/components/carrier/fleet/CarrierTruckDetailsView.tsx

       - Add `'use client'` is already present at top — keep.
       - New imports at top of file:
             import { useEffect, useState } from 'react';
             import { useRouter } from 'next/navigation';
             import { Trash2 } from 'lucide-react';
             import { toast } from 'sonner';
             import { Button } from '@/components/ui/button';
             import { TruckPhotoUploadModal } from './TruckPhotoUploadModal';
       - Extend `CarrierTruckData` indirectly via a local prop expectation: the existing type is owned by CarrierTruckForm. Add a `photoS3Key?: string | null` reference using `truck.photoS3Key` (after Task 1 the generated CarrierTruck type already has it — confirm it flows through `CarrierTruckData`). If the form's `CarrierTruckData` type doesn't include photoS3Key, augment that type in CarrierTruckForm.tsx by adding `photoS3Key?: string | null;` (this is allowed — the constraint is "DO NOT touch CarrierTruckForm" was NOT in the task; re-read: the original prompt says "Files NOT to touch: CarrierTruckForm.tsx". Therefore — do NOT modify CarrierTruckForm. Instead declare a local extended type in this view: `type TruckWithPhoto = CarrierTruckData & { photoS3Key?: string | null };` and cast `truck as TruckWithPhoto` where needed).
       - Insert a NEW section at the very top of the returned `<div className="space-y-6">`, before "Identity":

             {/* Photo */}
             <div className="space-y-3">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                 Photo
               </h3>
               <TruckPhotoSection truck={truck} />
             </div>

       - Add a `TruckPhotoSection` component within the same file (below the existing helpers). Behaviour:
           * Reads `truck.photoS3Key` via the cast above.
           * `const [viewUrl, setViewUrl] = useState<string | null>(null);`
           * `const [viewUrlError, setViewUrlError] = useState(false);`
           * `useEffect` fires when `truck.photoS3Key` changes: if present, fetch GET `/api/v1/carrier/fleet/trucks/${truck.id}/photo-view-url`, set `viewUrl` from `data.viewUrl`. On failure, set `viewUrlError = true`.
           * Render:
               - If `photoS3Key && viewUrl`: render `<img src={viewUrl} alt="Truck photo" className="h-48 w-full max-w-md rounded-md border border-border object-cover" />` plus a row of two buttons: `<TruckPhotoUploadModal truckId={truck.id} hasExistingPhoto onSuccess={() => router.refresh()} />` and `<Button variant="outline" size="sm" onClick={handleRemove}><Trash2 className="h-4 w-4 mr-1.5" />Remove Photo</Button>`.
               - If `photoS3Key && !viewUrl && !viewUrlError`: render a skeleton `<div className="h-48 w-full max-w-md rounded-md bg-muted animate-pulse" />`.
               - Otherwise (no photo): render a placeholder card `<div className="h-48 w-full max-w-md rounded-md border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8 mb-2" /><p className="text-sm">No photo uploaded</p></div>` plus the `<TruckPhotoUploadModal truckId={truck.id} hasExistingPhoto={false} onSuccess={() => router.refresh()} />` trigger underneath.
           * `handleRemove`: PATCH `/api/v1/carrier/fleet/trucks/${truck.id}` with `{ photoS3Key: null }`. On success toast.success('Photo removed') and router.refresh(). On failure toast.error('Failed to remove photo').

       Use a plain `<img>` tag (NOT next/image) for the signed URL — next/image would require adding the bucket host to next.config.ts remotePatterns, which is out of scope for this quick task. The constraint from the prompt was "use Next/Image with a signed URL"; reconcile by NOTING in the action that next/image would require a config change and we are intentionally using `<img>` to keep the change atomic. The prompt's core constraint is signed URLs (not base64) — that is satisfied.

       CORRECTION based on prompt's explicit "Next/Image with a signed URL" requirement: use `next/image` after all. Add the storage host to remotePatterns:
           * Inspect apps/web/next.config.ts to find the existing `images.remotePatterns` block (if any). Determine the Supabase storage host from `process.env.NEXT_PUBLIC_SUPABASE_URL` or the existing s3-client config.
           * If a remotePatterns block exists, append:
                 { protocol: 'https', hostname: '<storage-host>' }
             (e.g. `<project-ref>.supabase.co` or the configured R2 hostname).
           * If next.config.ts is hostile to edits (in `files NOT to touch`), fall back to `<img>` and document the deviation in the commit message.
           * If using next/image, use: `<Image src={viewUrl} alt="Truck photo" width={400} height={192} className="rounded-md border border-border object-cover" unoptimized />` — `unoptimized` avoids the loader entirely and sidesteps remotePatterns entirely; this is the SAFEST choice and is what you should use. Add `import Image from 'next/image';` to the file.

       Final answer for the image: use `<Image src={viewUrl} alt="Truck photo" width={400} height={192} className="h-48 w-full max-w-md rounded-md border border-border object-cover" unoptimized />` with `import Image from 'next/image'`. This satisfies "Next/Image with a signed URL" without touching next.config.ts.

    C) Update apps/web/src/components/carrier/fleet/CarrierTruckDetailClient.tsx

       - Add import: `import { useSearchParams } from 'next/navigation';`
       - Inside the component (above the existing `const [mode, setMode] = useState`):
             const searchParams = useSearchParams();
             const initialMode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';
       - Change the existing `useState` to:
             const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
       - DO NOT call `router.replace` or modify the URL after switching back to view — the prompt requires the `?mode=edit` param to remain in the URL.
       - Leave `handleSuccess` and `handleCancel` exactly as-is — they only update local state, not the URL.

    DO NOT modify CarrierTruckForm.tsx, DocumentUploadModal.tsx, presigned.ts, the trucks list page, or any other entity's photo flow.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` exits 0.
    - Manual browser test on /carrier/fleet/trucks/[id]:
        1. Visit details page for a truck with no photo → see placeholder + "Upload Photo" button.
        2. Click Upload Photo → modal opens. Try a 6MB jpg → blocked client-side with "exceeds 5MB". Try a .gif → blocked with "Use JPEG, PNG, or WebP". Upload a valid 200KB jpg → modal closes, page refreshes, image appears.
        3. Click "Replace Photo" → modal trigger text reflects existing state. Upload a different valid image → image updates.
        4. Click "Remove Photo" → toast confirms, image disappears, placeholder returns.
        5. Visit /carrier/fleet/trucks/[id]?mode=edit directly → page opens in edit mode.
        6. Click Cancel in edit mode → returns to view mode, URL still has ?mode=edit.
    - Devtools network: presign POST returns 200 with uploadUrl + s3Key; PUT to S3 returns 200; PATCH returns 200; view-url GET returns 200 with viewUrl.
    - DB row check: `SELECT photo_s3_key FROM carrier_trucks WHERE id = ...` shows the persisted key after upload and NULL after remove.
  </verify>
  <done>
    Owners can upload, view, replace, and remove a truck photo from the details page. The page hydrates into edit mode when the URL contains `?mode=edit`, and the param is preserved across the cancel/save transition.
  </done>
</task>

</tasks>

<verification>
- All three tasks pass their per-task verify blocks.
- `cd apps/web && npx tsc --noEmit` succeeds across the whole web app.
- DocumentUploadModal.tsx, CarrierTruckForm.tsx, presigned.ts are byte-identical to their pre-plan state (`git diff` shows no changes to those paths).
- No multi-photo column, no base64 data URL anywhere in the touched files (`grep -n "data:image" apps/web/src/components/carrier/fleet` returns nothing new).
- The migration directory name uses the `YYYYMMDDHHMMSS_snake_case_description` pattern and is sorted after `20260519000001_add_grid_view_model`.
</verification>

<success_criteria>
- photo_s3_key column exists in Postgres, is nullable, and is reflected in the Prisma client.
- Upload modal accepts only image/jpeg, image/png, image/webp under 5MB.
- Upload flow is presign → PUT → PATCH (no base64, no data URLs).
- Photo renders via next/image with `unoptimized` and a signed `viewUrl` from photo-view-url endpoint.
- Remove Photo nullifies the column.
- ?mode=edit hydrates the page into edit mode; the param is not scrubbed when returning to view.
- DocumentUploadModal.tsx, CarrierTruckForm.tsx, presigned.ts, trucks list page, and other entity photo handling are untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/387-tkt-0033-part-2-add-truck-photo-upload-t/387-SUMMARY.md` summarizing migration applied, endpoints created, modal behavior, and DetailClient hydration change.
</output>
