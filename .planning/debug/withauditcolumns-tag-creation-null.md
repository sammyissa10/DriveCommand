---
status: resolved
trigger: "withAuditColumns Prisma extension not populating createdById/updatedById on Tag creation — both columns are NULL after UI tag creation on production."
created: 2026-05-17T00:00:00Z
updated: 2026-05-17T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — getTenantPrisma() never passes userId to createTenantClient(), so withAuditColumns receives null and no-ops on every write
test: Static read of tenant-context.ts, tenant-client.ts, audit-columns.ts, tags.ts, supabase.ts
expecting: N/A — root cause confirmed
next_action: None (diagnosis-only mode)

## Symptoms

expected: When an authenticated owner creates a Tag via the /tags UI, the Tag row should have createdById and updatedById set to the owner's user ID.
actual: Tag row is created successfully with name + tenantId, but createdById and updatedById are both NULL. Tag ID: 6e1e9e15-7a89-404e-aecd-95818dec2f74
errors: No errors — creation succeeds silently, columns just remain NULL.
reproduction: Log in as owner@test.com on production, create a Tag via /tags page.
started: TKT-0015 Wave 1 (commit 5ad81f28) added the columns. Has never worked correctly since addition.

## Eliminated

- hypothesis: Tag is in EXEMPT_AUDIT_MODELS
  evidence: EXEMPT_AUDIT_MODELS does not contain 'Tag'. The set contains: Tenant, TicketMessage, AuditLog, DriverPayAuditLog, DispatchOverrideAudit, NotificationLog, NotificationSendLog, AutomationRun, AppEvent, PlaybookNotification, GPSLocation, GpsReport, SafetyEvent, FuelRecord, ActivationProgress, TenantHealthScore, TenantMetricsDaily, Subscription, TagAssignment, DriverRouteJoin. 'Tag' is absent.
  timestamp: 2026-05-17

- hypothesis: Model name casing mismatch
  evidence: The extension uses `model` from Prisma's $allOperations context. For prisma.tag.create, Prisma supplies model = 'Tag' (PascalCase). The EXEMPT_AUDIT_MODELS entries are all PascalCase. 'Tag' is not in the set regardless, so no casing mismatch could cause the issue. The injectOnData path would be reached for Tag.
  timestamp: 2026-05-17

- hypothesis: Wrong operation intercepted (tag creation uses a code path the switch doesn't cover)
  evidence: tags.ts line 44 calls `prisma.tag.create(...)`. The extension switch handles 'create' explicitly (lines 103-109 in audit-columns.ts). This operation IS covered.
  timestamp: 2026-05-17

- hypothesis: Wrong Prisma client (no withAuditColumns composed)
  evidence: tags.ts line 41 calls getTenantPrisma(), which calls createTenantClient(tenantId). createTenantClient() in tenant-client.ts line 25-26 DOES compose withAuditColumns. So the extension IS on the client — but it is composed with userId = null (see root cause).
  timestamp: 2026-05-17

## Evidence

- timestamp: 2026-05-17
  checked: apps/web/src/app/(owner)/actions/tags.ts — the Tag creation server action
  found: Line 41: `const prisma = await getTenantPrisma();` — imported from '@/lib/context/tenant-context'. Line 44: `await prisma.tag.create({ data: { ...result.data, tenantId } })`. No userId is present in the data payload and no userId is passed to getTenantPrisma().
  implication: The Prisma client is obtained via getTenantPrisma() with no user identity.

- timestamp: 2026-05-17
  checked: apps/web/src/lib/context/tenant-context.ts — getTenantPrisma()
  found: Line 34-37:
    `export async function getTenantPrisma(): Promise<PrismaClient> {`
    `  const tenantId = await requireTenantId();`
    `  return createTenantClient(tenantId);`
    `}`
  getTenantPrisma() calls createTenantClient with ONLY tenantId. The userId parameter is NOT passed — it is omitted entirely.
  implication: createTenantClient receives userId = undefined.

- timestamp: 2026-05-17
  checked: apps/web/src/lib/db/tenant-client.ts — createTenantClient()
  found: Line 23: `export function createTenantClient(tenantId: string, userId?: string | null): PrismaClient`
  Line 26: `.$extends(withAuditColumns(userId ?? null))`
  When userId is undefined (omitted), the `?? null` coalesces it to null.
  There is also a comment at line 21: "Prompt 3 will wire the actual session userId at the call site." — confirming this was a deferred TODO that was never implemented.
  implication: withAuditColumns is called with userId = null every time.

- timestamp: 2026-05-17
  checked: apps/web/src/lib/db/extensions/audit-columns.ts — withAuditColumns guard
  found: Lines 77-80:
    `if (userId == null) {`
    `  return query(args);`
    `}`
  When userId is null, the extension immediately passes through the query unchanged — it injects NOTHING.
  implication: With userId = null, createdById and updatedById are never set, regardless of which model or operation is used.

- timestamp: 2026-05-17
  checked: apps/web/src/lib/auth/supabase.ts — requireRole() return value
  found: requireRole() (line 104) returns `Promise<UserRole>` — the role string only, NOT the userId. The userId lives on the SessionData.userId field returned by getSession(), but requireRole() discards it.
  implication: The tags.ts action calls requireRole() for auth, but discards the return value (which doesn't include userId anyway), then calls getTenantPrisma() separately — losing access to the session userId entirely.

- timestamp: 2026-05-17
  checked: apps/web/src/lib/db/extensions/audit-columns.ts — EXEMPT_AUDIT_MODELS and CREATE_ONLY_AUDIT_MODELS
  found:
    CREATE_ONLY_AUDIT_MODELS = { 'FleetMessage' }
    EXEMPT_AUDIT_MODELS = {
      'Tenant', 'TicketMessage', 'AuditLog', 'DriverPayAuditLog',
      'DispatchOverrideAudit', 'NotificationLog', 'NotificationSendLog',
      'AutomationRun', 'AppEvent', 'PlaybookNotification', 'GPSLocation',
      'GpsReport', 'SafetyEvent', 'FuelRecord', 'ActivationProgress',
      'TenantHealthScore', 'TenantMetricsDaily', 'Subscription',
      'TagAssignment', 'DriverRouteJoin'
    }
  'Tag' is NOT in either list.
  implication: If userId were non-null, the extension WOULD inject createdById and updatedById on Tag.create.

- timestamp: 2026-05-17
  checked: apps/web/src/lib/db/extensions/audit-columns.ts — operations intercepted
  found: The switch statement handles: 'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert'. The default branch passes through findMany/findUnique/delete/aggregate without touching audit fields.
  implication: prisma.tag.create routes to the 'create' case, which would inject both createdById and updatedById — if userId were non-null.

## Resolution

root_cause: getTenantPrisma() in apps/web/src/lib/context/tenant-context.ts (line 36) calls createTenantClient(tenantId) without passing userId. This causes createTenantClient to receive userId = undefined, which coalesces to null via `userId ?? null` in tenant-client.ts line 26. The withAuditColumns extension then hits its null-guard immediately (audit-columns.ts lines 77-80) and returns query(args) untouched — injecting nothing. Every single write through getTenantPrisma() is affected, not just Tag. The deferred "Prompt 3" mentioned in tenant-client.ts comment was never implemented.

fix: Two changes required — neither implemented (diagnosis-only):

  1. apps/web/src/lib/context/tenant-context.ts — getTenantPrisma() must resolve the session userId and forward it to createTenantClient:

     Current (line 34-37):
       export async function getTenantPrisma(): Promise<PrismaClient> {
         const tenantId = await requireTenantId();
         return createTenantClient(tenantId);
       }

     Required change:
       import { getSession } from '../auth/supabase';  // add this import
       export async function getTenantPrisma(): Promise<PrismaClient> {
         const tenantId = await requireTenantId();
         const session = await getSession();           // get session (cached, no extra DB call)
         return createTenantClient(tenantId, session?.userId ?? null);
       }

     Note: getSession() is already memoized with React's cache(), so this adds no extra Supabase round-trip when called from a server action that already called requireRole() (which called getSession() internally via getRole()).

  2. No change needed to audit-columns.ts, tenant-client.ts, or tags.ts — the extension logic is correct; only the wiring at getTenantPrisma() is missing.

verification: (not applicable — diagnosis-only mode)
files_changed: []
