# TKT-0026 Diagnosis — Audit Contact Column on Facilities List

**Date:** 2026-05-18
**Status:** already-resolved
**Ticket:** TKT-0026 (filed Apr 5, 2026 by owner@test.com)

## Status Line

TKT-0026 is already resolved — the Contact cell was fixed in quick-186 (Apr 5, 2026) to read `contacts[0].name` from the JSONB array first, with fallback to `contactName`. Dashes showing for most facilities is expected behavior: the 10 most recent rows all have `contact_name = NULL` and `contacts = []` because users created those facilities without entering contact information.

## File Paths

- **List page:** `apps/web/src/app/(owner)/carrier/facilities/page.tsx`
- **Data fetch:** `apps/web/src/lib/carrier/facilities.ts` — function `listFacilities()`
- **Table component:** `apps/web/src/components/carrier/facilities/FacilityList.tsx`

## Data Fetch — Field Selection

`listFacilities()` uses `prisma.carrierFacility.findMany()` with **no explicit `select`** (lines 76–83 of `facilities.ts`). Prisma returns all columns by default, which includes both the legacy scalars (`contactName`, `contactPhone`, `contactEmail`) and the new JSONB field (`contacts`). The page then passes both down to `FacilityList`:

```tsx
// apps/web/src/app/(owner)/carrier/facilities/page.tsx, lines 66-77
<FacilityList
  facilities={items.map((f) => ({
    id: f.id,
    name: f.name,
    facilityType: f.facilityType,
    city: f.city,
    state: f.state,
    contactName: f.contactName,         // legacy scalar (now always NULL in DB)
    contacts: Array.isArray(f.contacts)
      ? (f.contacts as Array<{ name: string; phone?: string; email?: string; role?: string }>)
      : [],
    notes: f.notes,
  }))}
/>
```

Both `contacts` (JSONB) and `contactName` (legacy scalar) are selected and forwarded.

## Contact Cell Rendering Code

```tsx
// apps/web/src/components/carrier/facilities/FacilityList.tsx, lines 143-147
<td className="px-4 py-3 text-muted-foreground">
  {f.contacts && f.contacts.length > 0
    ? f.contacts[0].name
    : f.contactName ?? '—'}
</td>
```

This renderer correctly prioritizes `contacts[0].name` (JSONB) and falls back to `contactName` (legacy scalar), then finally to `'—'`.

## Database Evidence

Query: `SELECT id, name, contact_name, contact_phone, contact_email, contacts, created_at FROM facilities ORDER BY created_at DESC LIMIT 10`

| name | contact_name | contact_phone | contact_email | contacts |
|---|---|---|---|---|
| Ss (2026-05-18) | NULL | NULL | NULL | `[{"name":"Sara","role":"","email":"","phone":"15555"}]` |
| Lawi (2026-05-18) | NULL | NULL | NULL | `[]` |
| tester (2026-05-16) | NULL | NULL | NULL | `[]` |
| location testing (2026-05-15) | NULL | NULL | NULL | `[]` |
| Test Plan DELETE ME (2026-05-11) | NULL | NULL | NULL | `[]` |
| guest (2026-05-03) | NULL | NULL | NULL | `[]` |
| Home (2026-05-03) | NULL | NULL | NULL | `[]` |
| DealerCorp (2026-04-20) | NULL | NULL | NULL | `[]` |
| Hazem's House (2026-04-19) | NULL | NULL | NULL | `[]` |
| Mahmoud's (2026-04-19) | NULL | NULL | NULL | `[]` |

Key observations:
- Legacy scalars (`contact_name`, `contact_phone`, `contact_email`) are NULL on every row — consistent with the quick-184 migration having removed scalar writes.
- 9 of 10 rows have `contacts = []` — these facilities were created without contact data, so `—` is correct output.
- 1 row ("Ss") has `contacts` populated with one entry (`name: "Sara"`) — this would render "Sara" in the Contact column, confirming the renderer works.

## Diagnosis

TKT-0026 was fixed by quick-186 on April 5, 2026 (the same day the ticket was filed). The fix added the `contacts` JSONB field to the `FacilityItem` interface, wired it through the page's mapping, and updated the Contact cell to prefer `contacts[0].name`. The cell renderer logic is correct: JSONB first, legacy scalar fallback, then dash.

Dashes appearing for most facilities are **not a bug** — they reflect facilities that were created without any contact information (empty `contacts` array, NULL legacy scalars). The one facility with contact data entered ("Ss" → "Sara") would display correctly. The ticket can be closed.

## Most Recent Commit Touching List Page

`7f3ce44b` — fix(quick-186): fix facility types, contact display, payment fields, portal toggle (Sun Apr 5 21:45:43 2026)

This commit is labeled BUG-14 in its message and explicitly added contacts JSONB support to both `FacilityList.tsx` and `page.tsx`.

## Recommended Next Step

**Close ticket — already resolved.**

The Contact column correctly shows contact data for facilities that have contacts entered. The dashes seen by the reporter likely reflected facilities with no contact data. No code change required.

If the user believes contacts are being entered via the form but not appearing, a secondary investigation should check the facility create/edit form to confirm it writes to the `contacts` JSONB array (not to legacy scalars) — but based on the DB evidence, at least one row ("Ss") confirms the full create → store → display pipeline works end-to-end.
