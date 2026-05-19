# Quick 385 — TKT-0033 Diagnostic: Truck Details Page UX

**Status:** diagnostic-complete
**Type:** read-only investigation
**Date:** 2026-05-19

## TL;DR

- The truck details page (`apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx`) renders `<CarrierTruckForm>` unconditionally on load — there is no view/edit toggle at all; the edit form is always visible.
- The `CarrierTruck` Prisma model has **no photo column**. No `photoUrl`, `photoS3Key`, or equivalent field exists. A migration is required.
- The existing upload infrastructure (`apps/web/src/lib/storage/presigned.ts` + `generateUploadUrl`) already has a `'trucks'` category defined. The pattern to copy is `DocumentUploadModal.tsx` (form-data POST) or `AttachmentUploader.tsx` (presign → PUT → confirm).
- Row clicks on the trucks overview page navigate away via `<Link href="/carrier/fleet/trucks/${t.id}">` — there is **no Sheet** in the trucks list at all. The list is a server-rendered page using a client `CarrierTruckList` component.
- The best row-click-to-Sheet pattern in the codebase is `apps/web/src/app/(owner)/settings/team-permissions/page.tsx` — it uses `selectedMember` state + `Sheet open={!!selectedMember}` + `onClick={() => openMemberSheet(member)}` on each row.

---

## Issue 1 — Truck details defaults to edit mode

### Current behavior
- File: `apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx`
- Default mode: **always edit** (no mode toggle exists)
- Root cause (line 233–258): The server component renders a hard-coded "Edit Truck" section that unconditionally mounts `<CarrierTruckForm truck={...} />` on every page load. There is no `isEditing` / `viewMode` state anywhere.
- `CarrierTruckForm` (`apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx`) is a `'use client'` form that manages form `values` state (line 93–111) but has no internal view-only mode — it always renders all inputs.

### Editable fields
| Field | Input type | Required? |
|-------|------------|-----------|
| `unitNumber` | `Input` (text) | Yes |
| `displayName` | `Input` (text) | No |
| `vin` | `Input` (text, font-mono) + Lookup button | No |
| `year` | `Input` (number, min 1900, max 2099) | No |
| `make` | `Input` (text) | No |
| `model` | `Input` (text) | No |
| `truckType` | `Select` (semi/box_truck/flatbed/reefer/tanker/day_cab/straight_truck) | Yes |
| `grossWeightLbs` | `Input` (number) | No |
| `payloadCapacityLbs` | `Input` (number) | No |
| `currentOdometerMiles` | `Input` (number) | No |
| `licensePlate` | `Input` (text) | No |
| `licenseState` | `Select` (US states) | No |
| `registrationExpiry` | `Input` (date) | No |
| `licenseExpiry` | `Input` (date) | No |
| `insuranceExpiry` | `Input` (date) | No |
| `status` | `Select` (active/inactive/maintenance/out_of_service) | Yes |
| `notes` | `Textarea` | No |

### Save mechanism
- API route: `PATCH /api/v1/carrier/fleet/trucks/${truck.id}` at `apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts:51`
- Lib function: `updateCarrierTruck(orgId, id, parsed.data)` at `apps/web/src/lib/carrier/fleet-trucks.ts`
- Triggered by: `handleSubmit` in `CarrierTruckForm.tsx:180`
- Save button: `CarrierTruckForm.tsx:546`, label `"Save Changes"` (in edit mode) / `"Create Truck"` (in create mode)
- After save: calls `router.refresh()` (line 232)

### Recommendation for follow-up task
- Add `viewMode` state (default `'view'`) inside `CarrierTruckForm` or lift it to the page component; simpler to add to `CarrierTruckForm` since it's already `'use client'`
- When `viewMode === 'view'`: replace each `<Input>` with a `<p className="text-sm font-medium">` read-only display value; replace `<Select>` with a `<Badge>` or `<p>`; hide the "Save Changes" / "Cancel" buttons; show an "Edit" button in the section header
- When `viewMode === 'edit'`: render current form exactly as-is; show "Save Changes" and "Cancel"; Cancel sets mode back to `'view'`
- The read-only card block already at page lines 130–229 shows the correct visual style for view mode — the "Truck Details" read-only card can serve as the view template
- Suggested follow-up plan title: **"TKT-0033 Fix 1: Add view/edit toggle to truck details page"**

---

## Issue 2 — Truck photo upload missing

### Schema state
- `apps/web/prisma/schema.prisma`, model `CarrierTruck` (lines 2052–2091):
  - photo column present? **No** — absent. No `photoUrl`, `photoS3Key`, `imageUrl`, `thumbnailUrl`, or any image-adjacent field exists.
  - Fields present: `id`, `orgId`, `vehicleId`, `displayName`, `unitNumber`, `year`, `make`, `model`, `vin`, `truckType`, `payloadCapacityLbs`, `grossWeightLbs`, `licensePlate`, `licenseState`, `licenseExpiry`, `registrationExpiry`, `insuranceExpiry`, `currentOdometerMiles`, `lastOdometerDate`, `status`, `isSample`, `notes`, `createdById`, `updatedById`, `createdAt`, `updatedAt`
  - Closest analogous pattern in schema: `DriverIncident.photoS3Key` at `schema.prisma:1848` (stores an R2 object key, not a URL)

### Existing upload pattern (reusable)
- **Closest pattern:** `DocumentUploadModal` — carrier document uploads (form-data POST to API route, XHR progress tracking)
- **Upload modal UI component:** `apps/web/src/components/carrier/documents/DocumentUploadModal.tsx` (drag-drop zone, file preview, progress bar, 25 MB limit)
- **Simpler pattern (presign → PUT → confirm, for single-image uploads):** `apps/web/src/components/driver-pay/attachment-uploader.tsx`
- **Storage helper:** `apps/web/src/lib/storage/presigned.ts` — `generateUploadUrl(tenantId, category, fileId, fileName, contentType, fileSize)` at line 38
  - `DocumentCategory` type at `presigned.ts:25` already includes `'trucks'` as a valid category: `export type DocumentCategory = 'trucks' | 'routes' | 'drivers' | 'support' | 'messages' | 'inspections';`
- **S3 client:** `apps/web/src/lib/storage/s3-client.ts` — Cloudflare R2 confirmed at line 12: `import { S3Client } from '@aws-sdk/client-s3';` with custom endpoint support (`S3_ENDPOINT` env var, R2-compatible `forcePathStyle: !!endpoint` at line 33)
- **Storage backend:** Cloudflare R2 confirmed at `apps/web/src/lib/storage/s3-client.ts:7-11` (comment: "Cloudflare R2 (S3-compatible)") and `presigned.ts:53` (comment: "Supabase S3 compat rejects presigned URLs with signed ContentLength")

### Recommendation for follow-up task
- **Schema change required: YES**
  - Add `photoS3Key String? @map("photo_s3_key")` to `model CarrierTruck` (mirrors the `DriverIncident.photoS3Key` pattern at `schema.prisma:1848`)
  - Migration sketch:
    ```sql
    ALTER TABLE carrier_trucks ADD COLUMN photo_s3_key TEXT;
    ```
  - Also add `photoS3Key` to `CarrierTruckUpdateSchema` in `apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts` (currently does not accept a photo field)
  - Add `photoS3Key?: string | null` to `CarrierTruckData` interface in `CarrierTruckForm.tsx:19`
- **Reusable storage helper:** `apps/web/src/lib/storage/presigned.ts` — `generateUploadUrl` with category `'trucks'`; no changes needed to the helper itself
- **New API endpoint needed:** A presign endpoint for truck photos, e.g., `POST /api/v1/carrier/fleet/trucks/[id]/photo` that calls `generateUploadUrl` and returns `{ uploadUrl, s3Key }`, plus a `PATCH` to save the resulting key to `carrier_trucks.photo_s3_key`
- **Serving the photo:** Add a `GET /api/v1/carrier/fleet/trucks/[id]/photo` (or include a presigned download URL in the existing GET response) using `generateDownloadUrl(s3Key)` from `presigned.ts:71`
- **Where to mount upload UI:** At the top of the truck details page, above the "Truck Details" card (line 130 of `page.tsx`), as a photo avatar / upload zone — `16:9` aspect ratio (`aspect-video`) or square (`aspect-square w-48`); fallback: truck icon placeholder when no photo
- Suggested follow-up plan title: **"TKT-0033 Fix 2: Add truck photo upload (schema + presign API + UI)"**

---

## Issue 3 — Trucks overview row click navigates away

### Current behavior
- File: `apps/web/src/components/carrier/fleet/CarrierTruckList.tsx`
- Component type: **client** (`'use client'` at line 1)
- Row implementation: Each row's unit number cell contains a `<Link>` element at lines 201–207:
  ```tsx
  <Link
    href={`/carrier/fleet/trucks/${t.id}`}
    className="font-medium text-foreground hover:text-primary transition-colors"
  >
    {t.displayName || t.unitNumber}
  </Link>
  ```
- The `<tr>` element itself at line 193 only has `hover:bg-muted/30` — there is **no `onClick` on the row** and **no Sheet** in the component. The entire row is not clickable; only the unit number text is a link.
- The parent page (`apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx`) is a **server component** (no `'use client'`). However, `CarrierTruckList` is already `'use client'`, so no client wrapper is needed.

### Best Sheet example in codebase
- **File:** `apps/web/src/app/(owner)/settings/team-permissions/page.tsx`
- **Sheet primitives import:** `import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';` (line 24–30)
- **Pattern:** `const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)` (line 235); row `onClick={() => openMemberSheet(member)}` (line 385); `<Sheet open={!!selectedMember} onOpenChange={(open) => { if (!open) setSelectedMember(null); }}>` (line 413)
- **Why this example:** It is exactly the row-click-to-sheet pattern needed — clicking a row sets selected state, Sheet responds to that state, close clears it. No `SheetTrigger` wrapper needed; the trigger is the `onClick` on the row.
- **Sheet primitives location:** `apps/web/src/components/ui/sheet.tsx` (shadcn component, exports `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`, `SheetTrigger`, `SheetClose`)
- **Second example (trucks-adjacent):** `apps/web/src/components/vehicle/vehicle-details-sheet.tsx` — a sheet that already shows truck diagnostics data from `CarrierTruck` (make, model, year, licensePlate, odometer, GPS, fuel level). Import: `import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';` (lines 5–10)

### Recommended quick-view fields (from Truck model)
Fields available from `CarrierTruckItem` (already passed to `CarrierTruckList`):

1. **Unit Number + Display Name** — primary identifier; already in list
2. **Status** — operational readiness; dispatcher's top concern
3. **Truck Type** — semi / flatbed / reefer etc.; load assignment context
4. **Year / Make / Model** — physical identification
5. **VIN** — compliance + insurance reference
6. **License Plate + State** — `licensePlate` + `licenseState` (not in `CarrierTruckItem` currently — would need to be added to the prop type from the page)
7. **Registration Expiry** — already in `CarrierTruckItem`; color-coded warning
8. **License Expiry** — already in `CarrierTruckItem`; color-coded warning
9. **Odometer** — `currentOdometerMiles`; quick capacity/maintenance gauge

Fields NOT in `CarrierTruckItem` that would need to be added from the page query: `licensePlate`, `licenseState`, `insuranceExpiry`, `vin` (vin IS present), `vehicleId` (present).

### Recommendation for follow-up task
- Create `TruckQuickViewSheet` as a new `'use client'` component at `apps/web/src/components/carrier/fleet/TruckQuickViewSheet.tsx`
- Props: `truck: CarrierTruckItem | null`, `open: boolean`, `onClose: () => void`
- In `CarrierTruckList`:
  - Add `const [selectedTruck, setSelectedTruck] = useState<CarrierTruckItem | null>(null)`
  - Replace `<Link href="...">` on the unit number with a `<button onClick={() => setSelectedTruck(t)}>` (or make the whole `<tr>` clickable with `onClick`)
  - Render `<TruckQuickViewSheet truck={selectedTruck} open={!!selectedTruck} onClose={() => setSelectedTruck(null)} />` at the bottom of the component
- Inside the sheet: include an "Open full details" `<Link href="/carrier/fleet/trucks/${truck.id}">` button to preserve the current deep-link behavior
- Extend `CarrierTruckItem` interface to include `licensePlate`, `licenseState`, `insuranceExpiry` (add to the page's map at `trucks/page.tsx:76–91`)
- Component placement: `apps/web/src/components/carrier/fleet/TruckQuickViewSheet.tsx`
- Suggested follow-up plan title: **"TKT-0033 Fix 3: Add TruckQuickViewSheet to trucks overview"**

---

## Files referenced in this investigation

| File | Purpose |
|------|---------|
| `apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx` | Truck details server component — Issue 1 root |
| `apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx` | Trucks overview server component — Issue 3 root |
| `apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx` | Edit form client component — Issue 1 fields |
| `apps/web/src/components/carrier/fleet/CarrierTruckList.tsx` | Trucks list client component — Issue 3 row click |
| `apps/web/prisma/schema.prisma` (lines 2052–2091) | CarrierTruck model — Issue 2 schema |
| `apps/web/prisma/schema.prisma` (line 1848) | DriverIncident.photoS3Key — upload column pattern |
| `apps/web/src/lib/storage/presigned.ts` | R2 upload/download helper — Issue 2 storage |
| `apps/web/src/lib/storage/s3-client.ts` | S3/R2 client singleton — storage backend confirmation |
| `apps/web/src/lib/storage/attachments.ts` | Pay-component attachment helper (presign → PUT → confirm pattern) |
| `apps/web/src/components/carrier/documents/DocumentUploadModal.tsx` | Best upload UI to copy — Issue 2 UI pattern |
| `apps/web/src/components/driver-pay/attachment-uploader.tsx` | Presign → PUT → confirm upload pattern |
| `apps/web/src/components/ui/sheet.tsx` | Sheet primitive component — Issue 3 |
| `apps/web/src/app/(owner)/settings/team-permissions/page.tsx` (lines 235, 385, 413) | Best row-click-to-Sheet pattern — Issue 3 |
| `apps/web/src/components/vehicle/vehicle-details-sheet.tsx` | Existing truck-data Sheet — Issue 3 secondary example |
| `apps/web/src/components/help/HelpSidebar.tsx` (line 27, 132) | Sheet import + trigger example |
| `apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts` | PATCH update route — Issue 1 save mechanism |

---

TKT-0033 diagnostic complete. Recommended fix plan: **THREE prompts** — one per sub-issue, as each fix touches a different surface (page architecture for Issue 1, schema + API + UI for Issue 2, list component + new sheet component for Issue 3). The three fixes are independent and can be executed in any order, though Issue 1 (view/edit toggle) should come first since Issue 2's photo upload UI will be mounted on the truck details page.
