# Plan 388: TKT-0033 Part 3 — Single-click side sheet with quick truck details

**Mode:** quick
**Date:** 2026-05-19
**Goal:** Add a single-click side sheet to the carrier trucks list that shows a compact truck summary without breaking the existing unit-number Link.

---

## Approach

Row clicks set `selectedTruck` state in `CarrierTruckList`; the existing unit-number `<Link>` has `onClick={(e) => e.stopPropagation()}` so it swallows the event before the row handler fires. The `TruckQuickViewSheet` fetches the signed photo URL on open via `/api/v1/carrier/fleet/trucks/[id]/photo-view-url` (fetch-on-open avoids stale URLs in the list payload). When `photoS3Key` is absent or the fetch fails, a `<Truck>` icon from lucide-react renders as placeholder.

---

## Context

**Files discovered:**
- Query: `apps/web/src/lib/carrier/fleet-trucks.ts` → `listCarrierTrucks` uses `findMany` (no select) — all columns returned. Currently no dispatch/driver include.
- Page mapping: `apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx` — maps items to `CarrierTruckItem`; currently only passes a subset of fields (no `photoS3Key`, `insuranceExpiry`, `licensePlate`, `licenseState`, driver).
- List component: `apps/web/src/components/carrier/fleet/CarrierTruckList.tsx` — `CarrierTruckItem` interface is local; rows only have `hover:bg-muted/30` and the unit-number `<Link>`.
- Sheet UI: `apps/web/src/components/ui/sheet.tsx` — exports `Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetClose`.
- Photo endpoint: `/api/v1/carrier/fleet/trucks/[id]/photo-view-url` (Part 2, returns `{ viewUrl: string }`).
- Driver relation: `CarrierTruck` → `primaryDispatches` (CarrierDispatch[]) → `primaryDriver` (CarrierDriver). To get current driver, filter dispatches by status `in ['planned', 'in_transit']`, take the most recent.

**Dispatch statuses found:** `planned`, `in_transit`, `completed`, `cancelled`

---

## Tasks

### Task 1: Extend data layer and CarrierTruckItem interface

**Files to modify:**
1. `apps/web/src/lib/carrier/fleet-trucks.ts` — add `include` to `listCarrierTrucks` for active dispatch + driver
2. `apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx` — update mapping to pass `photoS3Key`, `insuranceExpiry`, `licensePlate`, `licenseState`, `assignedDriver`
3. `apps/web/src/components/carrier/fleet/CarrierTruckList.tsx` — extend `CarrierTruckItem` interface

**Specific changes:**

**fleet-trucks.ts** — in `listCarrierTrucks`, add `include` block to `findMany`:
```typescript
include: {
  primaryDispatches: {
    where: { status: { in: ['planned', 'in_transit'] } },
    select: {
      primaryDriver: {
        select: { id: true, firstName: true, lastName: true }
      }
    },
    orderBy: { scheduledDeparture: 'desc' },
    take: 1,
  }
}
```

**page.tsx** — in the `trucks={items.map(...)}` call, add:
```typescript
photoS3Key: t.photoS3Key ?? null,
insuranceExpiry: t.insuranceExpiry,
licensePlate: t.licensePlate ?? null,
licenseState: t.licenseState ?? null,
assignedDriver: t.primaryDispatches[0]?.primaryDriver ?? null,
```

**CarrierTruckList.tsx** — extend `CarrierTruckItem`:
```typescript
photoS3Key: string | null;
insuranceExpiry: Date | string | null;
licensePlate: string | null;
licenseState: string | null;
assignedDriver: { id: string; firstName: string; lastName: string } | null;
```

---

### Task 2: Create TruckQuickViewSheet.tsx

**File to create:** `apps/web/src/components/carrier/fleet/TruckQuickViewSheet.tsx`

**Props:** `{ truck: CarrierTruckItem; open: boolean; onOpenChange: (open: boolean) => void }`

**Layout (single column inside SheetContent):**
1. Photo thumbnail (80×80px) — fetch on open via photo-view-url; `<Truck>` icon placeholder
2. Unit number (text-lg font-semibold) + status badge (inline)
3. Truck type badge
4. Make/Model/Year line (text-sm text-muted-foreground)
5. Assigned driver (link to `/carrier/drivers/[id]` if present)
6. VIN (font-mono text-xs)
7. License plate + state (combined)
8. Registration expiry (color-coded, reuse `expiryColor` + `formatDate` helpers from list)
9. License expiry (color-coded)
10. Insurance expiry (color-coded)

**Footer CTAs:**
- "View Full Details" → `<Link href="/carrier/fleet/trucks/[id]">` (no mode param → view mode)
- "Edit" → `<Link href="/carrier/fleet/trucks/[id]?mode=edit">`

**Import from** `@/components/ui/sheet` (Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter)
**Import** `Link` from `next/link`, `Badge` from `@/components/ui/badge`, `Button` from `@/components/ui/button`, `Truck` from lucide-react

---

### Task 3: Wire row clicks in CarrierTruckList.tsx

**Changes:**
1. Add `useState` import for `selectedTruck: CarrierTruckItem | null`
2. Import `TruckQuickViewSheet`
3. Import `useRouter` from `next/navigation` — NOT needed; navigation is via Link CTAs
4. Change `<tr>` to add:
   - `onClick={() => setSelectedTruck(t)}`
   - `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTruck(t); } }}`
   - `role="button"` + `tabIndex={0}`
   - Class change: `hover:bg-muted/50 cursor-pointer` (upgrade from `hover:bg-muted/30`)
5. On the unit-number `<Link>`, add `onClick={(e) => e.stopPropagation()}`
6. After `</div>` (closing the table wrapper), render:
   ```tsx
   <TruckQuickViewSheet
     truck={selectedTruck!}
     open={!!selectedTruck}
     onOpenChange={(o) => { if (!o) setSelectedTruck(null); }}
   />
   ```
   (Guard: only render when `selectedTruck` is non-null, or pass null-safe props)

---

## Verification

After implementation:
- `npx tsc --noEmit` exits 0 (or only pre-existing errors)
- Row click opens sheet
- Unit number click does NOT open sheet (navigates directly)
- ESC closes sheet
- Click outside closes sheet
- Keyboard: Tab to row + Enter opens sheet
- No-photo truck: Truck icon renders
- Photo truck: thumbnail fetched and rendered
