# Quick Task 245 — Summary

## What was fixed
Single-line fix in `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts`:

```diff
- LEFT JOIN carrier_facilities f ON s.facility_id = f.id
+ LEFT JOIN facilities f ON s.facility_id = f.id
```

The carrier next-stop query (added in task 244) joined against `carrier_facilities` which does not exist in the database. The actual table name is `facilities` (confirmed via `pg_tables`). This caused the entire vehicles endpoint to 500, preventing any trucks from appearing on the live map.

## Verification
- Confirmed via Supabase `pg_tables` query: table is `facilities`, not `carrier_facilities`
- All other table names in the file are correct (`dispatches`, `carrier_trucks`, `carrier_drivers`, `stops`)
- TypeScript: no new errors introduced (pre-existing e2e test errors unrelated)
