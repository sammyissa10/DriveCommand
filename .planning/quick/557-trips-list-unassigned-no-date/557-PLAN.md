# quick-557 — /carrier/trips renders "Unassigned" and "—" for trips that have a driver and a date

**Date:** 2026-08-27
**Type:** Bug fix (diagnose first)
**Branch:** feature/document-import

---

## Diagnosis (completed before any edit)

### Step 1 — the query behind /carrier/trips

`/carrier/trips` (desktop lane) renders `DispatchesGrid`, which client-fetches
`GET /api/v1/carrier/dispatches`. That route calls `listTrips()` in
`apps/web/src/lib/carrier/trips.ts:70`. The query is:

```ts
tenantPrisma.trip.findMany({
  where,
  skip,
  take: pageSize,
  orderBy: { scheduledDeparture: 'asc' },
  include: {
    primaryDriver: { select: { firstName: true, lastName: true } },
    truck:         { select: { unitNumber: true } },
    _count:        { select: { stops: true } },
  },
})
```

There is **no `select`**, so every scalar column of `Trip` is returned —
including `primaryDriverId` and `scheduledDeparture` (schema.prisma:2377, 2382,
mapped to `primary_driver_id` / `scheduled_departure`). The driver relation
**is** included, and carries `firstName` + `lastName`.

**Verdict on step 1: the query fetches both fields, and the driver name too.**

### Step 2 — the DRIVER and DATE column definitions

`_grid/columns.tsx`:

```tsx
{ id: 'scheduledDate', accessorKey: 'scheduledDate', header: 'Date',
  cell: ({ getValue }) => formatDate(getValue() as string) }   // '—' when falsy

{ id: 'driverName', accessorKey: 'driverName', header: 'Driver',
  cell: ({ row }) => {
    const driverId = row.original.driverId;
    if (!driverId) return <span>Unassigned</span>;   // ← the rendered text
    return <Link …>{row.original.driverName || 'Unknown'}</Link>;
  } }
```

Both read `DispatchRow` fields (`scheduledDate`, `driverId`, `driverName`), and
`DispatchRow` is produced by the transform inside `DispatchesGrid.tsx:100-111`:

```ts
interface ApiDispatch {
  id: string; driverId: string | null; truckId: string | null;
  scheduledDate: string; status: string; notes: string | null;
  _count?: { loads: number };
}
…
driverId:      item.driverId,                                  // undefined
driverName:    item.driverId ? driverMap[item.driverId] : null // null
scheduledDate: item.scheduledDate,                             // undefined
loadCount:     item._count?.loads || 0,                        // always 0
```

`driverId`, `scheduledDate` and `_count.loads` **do not exist on the payload**.
The API returns `primaryDriverId`, `scheduledDeparture`, `_count.stops`.
`driverId` / `scheduledDate` are columns of the **legacy `Route`** model
(schema.prisma:527, 532) — the grid's `ApiDispatch` is a legacy-Route shape
pointed at a carrier-Trip endpoint. (`truckId` is a real `Trip` column, which is
why the Truck column alone kept working.)

### Step 3 — verdict

**The columns read the wrong path.** The query fetches everything needed. The
break is at the API → `DispatchRow` mapping boundary: three property names that
the endpoint never returns. `undefined` then flows into columns whose empty
branches say "Unassigned" and "—", so a populated database renders as missing
data.

The identical drift exists in the mobile-web lane of the same page,
`TripsMobile.tsx:27-34,170-174`, where it does more damage: `scheduledDate`
being `undefined` makes `new Date(undefined)` → `NaN`, so the Today / Upcoming
scope filters return `false` for every row and empty the list.

---

## Tasks

### Task 1 — fix the API → row mapping on both lanes of /carrier/trips
- `_grid/DispatchesGrid.tsx`: correct `ApiDispatch` to the real payload
  (`primaryDriverId`, `scheduledDeparture`, `primaryDriver`, `truck`,
  `_count.stops` + `_count.carrierLoads`) and map from those names.
- Prefer the **included relation** for the name over the `driverMap` lookup:
  the maps are built from `status: 'active'` rows only, so a trip assigned to a
  deactivated driver would still say "Unassigned". Map stays as fallback.
- `TripsMobile.tsx`: same correction.
- `listTrips`: add `carrierLoads: true` to the existing `_count` select so the
  "Loads" column stops printing a hardcoded 0 for every trip. Additive — every
  other consumer reads `_count.stops`, which is unchanged.

### Task 2 — regression guard
Unit test asserting the row transform maps the real `listTrips` payload shape,
and that a `driverId`/`scheduledDate`-shaped payload does **not** satisfy it.

### Task 3 — verification
- `tsc --noEmit` in both apps, **probed** (inject a deliberate error, confirm
  tsc reports it, delete the probe) per CLAUDE.md's blind-gate rule.
- Vitest suite diffed against baseline.
- Real-browser DOM check of ≥3 rows against the database values.

## Out of scope (reported, not changed)
- The "today and tomorrow plus in-progress" window in `listTrips`.
- No DDL, no data changes.
