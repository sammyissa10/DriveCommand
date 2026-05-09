# Quick Task 245 — Fix live map vehicles endpoint wrong table name carrier_facilities

## Objective
Fix 500 error on `/api/v1/carrier/live-map/vehicles` caused by raw SQL referencing `carrier_facilities` (does not exist) instead of the correct `facilities` table.

## Tasks

### Task 1 — Fix wrong table name in vehicles route
**File:** `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts`

**Problem:** Line ~401 in the carrier next-stop query:
```sql
LEFT JOIN carrier_facilities f ON s.facility_id = f.id
```
The actual DB table name is `facilities` (confirmed via `pg_tables`). This causes the entire endpoint to 500 which breaks the live map — no vehicles show at all.

**Fix:** Change `carrier_facilities` → `facilities`.

**Verified table names via pg_tables:**
- `facilities` ✓ (not `carrier_facilities`)
- `dispatches` ✓ (correct — already used correctly elsewhere in the file)
- `carrier_trucks` ✓ (correct)
- `carrier_drivers` ✓ (correct)
- `stops` ✓ (correct)
