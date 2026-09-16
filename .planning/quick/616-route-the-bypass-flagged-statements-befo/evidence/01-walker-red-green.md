### RED WITNESS — `npx tsx scripts/audit/616-bypass-census.ts --break-visitor`
```
FAIL  FLOOR statements  —  0 >= 150
FAIL  FLOOR files  —  0 >= 80
FAIL  POSITIVE WITNESS api/mobile/driver/hos/route.ts  —  0 statements at lines [] >= 2
FAIL  ARRAY-FORM WITNESS lib/auth/supabase.ts  —  0 array-form statements at lines [] >= 1
PASS  COUNTER-ASSERTION lib/auth/mobile-auth.ts WAS READ  —  bytes=3821 parsed=true proseOccurrences=1 (>=1 proves the literal IS in the file and was seen)
PASS  COUNTER-ASSERTION lib/auth/mobile-auth.ts YIELDS ZERO  —  0 executable statements === 0
FAIL  NO ORPHAN CLASSIFICATION OVERRIDE  —  DRIFTED: src/lib/auth/supabase.ts:164, src/lib/security/audit-log.ts:86, src/actions/support-tickets.ts:170, src/actions/support-tickets.ts:218, src/actions/support-tickets.ts:408, src/actions/support-tickets.ts:447, src/app/(driver)/actions/driver-dashboard.ts:86, src/app/(driver)/actions/driver-routes.ts:202, src/app/api/driver/stops/[stopId]/messages/route.ts:105, src/app/api/v1/carrier/stops/[id]/messages/route.ts:89, src/actions/support-tickets.ts:99, src/app/api/mobile/support/ticket/route.ts:39, src/app/api/v1/carrier/stops/[id]/messages/route.ts:49, src/app/api/v1/carrier/stops/[id]/messages/route.ts:76, src/app/api/v1/carrier/stops/[id]/messages/route.ts:201, src/app/api/driver/stops/[stopId]/messages/route.ts:66, src/app/api/driver/stops/[stopId]/messages/route.ts:92, src/app/api/driver/stops/[stopId]/messages/route.ts:209, src/app/api/driver/stops/[stopId]/messages/route.ts:219, src/app/(driver)/actions/driver-dashboard.ts:74, src/app/(owner)/carrier/stops/[id]/page.tsx:91, src/app/(owner)/carrier/stops/[id]/page.tsx:110, src/app/(owner)/carrier/stops/[id]/page.tsx:153, src/app/(owner)/carrier/trips/[id]/page.tsx:137, src/app/(owner)/carrier/trips/[id]/stops/page.tsx:118, src/app/api/track/[token]/route.ts:50, src/lib/automations/evaluator.ts:127, src/app/api/cron/workflow-digest/route.ts:82, src/app/api/cron/workflow-digest/route.ts:102, src/app/api/cron/workflow-digest/route.ts:181, src/app/api/cron/workflow-digest/route.ts:190, src/app/api/mobile/driver/messages/route.ts:109, src/app/api/mobile/owner/loads/[id]/route.ts:206, src/app/api/mobile/owner/fleet-positions/route.ts:40, src/app/api/mobile/owner/map/vehicles/route.ts:44

statements: 0   files: 0
test statements: 0 in 2 files
prose-only files: 95

ANTI-VACUITY FAILED — 5 check(s): FLOOR statements; FLOOR files; POSITIVE WITNESS api/mobile/driver/hos/route.ts; ARRAY-FORM WITNESS lib/auth/supabase.ts; NO ORPHAN CLASSIFICATION OVERRIDE
The walker is broken or the population changed. NOTHING WRITTEN.
exit=0
```

Real exit code (not through a pipe): `1`.

Note the two COUNTER-ASSERTIONS still PASS on a broken walker — that is correct and is exactly
why they cannot stand alone. A walker that returns nothing satisfies "yields zero" perfectly.
The FLOOR and the two POSITIVE witnesses are what turn it red.

### GREEN — `npx tsx scripts/audit/616-bypass-census.ts`
```
PASS  FLOOR statements  —  177 >= 150
PASS  FLOOR files  —  87 >= 80
PASS  POSITIVE WITNESS api/mobile/driver/hos/route.ts  —  2 statements at lines [29, 174] >= 2
PASS  ARRAY-FORM WITNESS lib/auth/supabase.ts  —  1 array-form statements at lines [164] >= 1
PASS  COUNTER-ASSERTION lib/auth/mobile-auth.ts WAS READ  —  bytes=3821 parsed=true proseOccurrences=1 (>=1 proves the literal IS in the file and was seen)
PASS  COUNTER-ASSERTION lib/auth/mobile-auth.ts YIELDS ZERO  —  0 executable statements === 0
PASS  NO ORPHAN CLASSIFICATION OVERRIDE  —  all 35 overrides matched a statement

statements: 177   files: 87
test statements: 5 in 2 files
prose-only files: 8
wrote .planning\quick\616-route-the-bypass-flagged-statements-befo\evidence\01-census.json
```

Real exit code: `0`. Artefact written.
