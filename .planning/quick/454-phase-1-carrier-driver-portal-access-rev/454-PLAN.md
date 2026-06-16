---
phase: quick-454
plan: 454
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/revoke-access/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/restore-access/route.ts
autonomous: true

must_haves:
  truths:
    - "An OWNER/MANAGER can revoke a carrier driver's portal access via POST, banning their Supabase auth and deactivating their User"
    - "An OWNER/MANAGER can restore a previously-revoked carrier driver's access via POST, unbanning their Supabase auth and reactivating their User"
    - "A DRIVER role receives 403 when calling either endpoint"
    - "Drivers without a linked user account return a 400 error instead of crashing"
    - "Revoke/restore are tenant-scoped — a driver from another org returns 404 Not found"
  artifacts:
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "revokeCarrierDriverAccess + restoreCarrierDriverAccess lib functions"
      contains: "export async function revokeCarrierDriverAccess"
    - path: "apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/revoke-access/route.ts"
      provides: "POST endpoint to revoke carrier driver portal access"
      exports: ["POST"]
    - path: "apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/restore-access/route.ts"
      provides: "POST endpoint to restore carrier driver portal access"
      exports: ["POST"]
  key_links:
    - from: "revoke-access/route.ts"
      to: "revokeCarrierDriverAccess"
      via: "import from @/lib/carrier/fleet-drivers"
      pattern: "revokeCarrierDriverAccess"
    - from: "restore-access/route.ts"
      to: "restoreCarrierDriverAccess"
      via: "import from @/lib/carrier/fleet-drivers"
      pattern: "restoreCarrierDriverAccess"
    - from: "fleet-drivers.ts"
      to: "createAdminClient"
      via: "import from @/lib/supabase/admin"
      pattern: "createAdminClient"
---

<objective>
Add the ability to REVOKE and RESTORE a carrier driver's portal access. Carrier drivers can be invited (granted access) but there is currently no way to take that access away or give it back.

This phase builds ONLY the backend: two lib functions + two API routes. No UI.

Purpose: Close the portal-access lifecycle gap — granting access already exists, revoking/restoring does not.
Output: revokeCarrierDriverAccess + restoreCarrierDriverAccess in fleet-drivers.ts, plus POST routes at /api/v1/carrier/fleet/drivers/[id]/revoke-access and /restore-access.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Proven deactivate/reactivate pattern to mirror (owner portal)
@apps/web/src/app/(owner)/actions/drivers.ts

# The lib file to extend (plain lib, no 'use server'; functions called by API routes)
@apps/web/src/lib/carrier/fleet-drivers.ts

# The API route shape to mirror exactly
@apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/resend-invitation/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add revokeCarrierDriverAccess + restoreCarrierDriverAccess to fleet-drivers.ts</name>
  <files>apps/web/src/lib/carrier/fleet-drivers.ts</files>
  <action>
Append two new exported async functions to the BOTTOM of apps/web/src/lib/carrier/fleet-drivers.ts.

First, add the missing import at the top of the file (alongside the existing imports — `getTenantPrisma` and `logger` are already imported, `createAdminClient` is NOT):

  import { createAdminClient } from '@/lib/supabase/admin';

Then append both functions to the end of the file:

```ts
export async function revokeCarrierDriverAccess(
  orgId: string,
  carrierDriverId: string
): Promise<{ revoked: true; userId: string } | { error: string }> {
  const tenantPrisma = await getTenantPrisma();
  const driver = await tenantPrisma.carrierDriver.findFirst({
    where: { id: carrierDriverId, orgId },
    select: { id: true, userId: true },
  });
  if (!driver) return { error: 'Not found' };
  if (!driver.userId) return { error: 'Driver has no linked account to revoke' };

  await tenantPrisma.user.update({
    where: { id: driver.userId },
    data: { isActive: false },
  });

  try {
    const supabaseAdmin = createAdminClient();
    await supabaseAdmin.auth.admin.updateUserById(driver.userId, { ban_duration: '87600h' });
    await supabaseAdmin.auth.admin.signOut(driver.userId, 'global');
  } catch (err) {
    logger.error('[revokeCarrierDriverAccess] Supabase ban failed for user:' + driver.userId, err);
  }

  return { revoked: true, userId: driver.userId };
}

export async function restoreCarrierDriverAccess(
  orgId: string,
  carrierDriverId: string
): Promise<{ restored: true; userId: string } | { error: string }> {
  const tenantPrisma = await getTenantPrisma();
  const driver = await tenantPrisma.carrierDriver.findFirst({
    where: { id: carrierDriverId, orgId },
    select: { id: true, userId: true },
  });
  if (!driver) return { error: 'Not found' };
  if (!driver.userId) return { error: 'Driver has no linked account to restore' };

  await tenantPrisma.user.update({
    where: { id: driver.userId },
    data: { isActive: true },
  });

  try {
    const supabaseAdmin = createAdminClient();
    await supabaseAdmin.auth.admin.updateUserById(driver.userId, { ban_duration: 'none' });
  } catch (err) {
    logger.error('[restoreCarrierDriverAccess] Supabase unban failed for user:' + driver.userId, err);
  }

  return { restored: true, userId: driver.userId };
}
```

Mirrors the owner-portal deactivateDriver/reactivateDriver pattern (drivers.ts lines 327-382): isActive flag + Supabase ban_duration + global signOut on revoke, ban_duration 'none' on restore. Tenant scoping via findFirst({ where: { id, orgId } }) matches updateCarrierDriver. Supabase calls are wrapped in try/catch so a transient auth-API failure does not roll back the DB state change (same tolerance as the owner pattern).
  </action>
  <verify>cd apps/web && npx tsc --noEmit 2>&1 | grep -i "fleet-drivers" || echo "no new fleet-drivers type errors"</verify>
  <done>Both functions exported from fleet-drivers.ts; createAdminClient imported from @/lib/supabase/admin; tsc introduces no new errors referencing fleet-drivers.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Add revoke-access and restore-access API routes</name>
  <files>apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/revoke-access/route.ts, apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/restore-access/route.ts</files>
  <action>
Create both route files mirroring the resend-invitation/route.ts shape EXACTLY (getSession → check session → check orgId → call lib fn → map errors → return JSON), with one addition: an OWNER/MANAGER role gate after the orgId check, matching the proven carrier pattern in stops/[id]/messages/route.ts line 20.

Create apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/revoke-access/route.ts:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { revokeCarrierDriverAccess } from '@/lib/carrier/fleet-drivers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });
  if (session.role !== 'OWNER' && session.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const result = await revokeCarrierDriverAccess(orgId, id);

    if ('error' in result) {
      if (result.error === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ revoked: result.revoked, userId: result.userId });
  } catch (err) {
    logger.error('POST /api/v1/carrier/fleet/drivers/[id]/revoke-access failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

Create apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/restore-access/route.ts — identical, but import and call restoreCarrierDriverAccess, log path `.../restore-access failed`, and return `{ restored: result.restored, userId: result.userId }`.
  </action>
  <verify>cd apps/web && npx tsc --noEmit 2>&1 | grep -iE "revoke-access|restore-access" || echo "no new route type errors"</verify>
  <done>Both route files exist, export POST, gate on OWNER/MANAGER (403 for others), call their respective lib fn, map 'Not found'→404 / other error→400 / success→200 JSON. No new tsc errors.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` produces no NEW errors in the three touched files (baseline ~35 pre-existing errors are unrelated — see CLAUDE.md TypeScript baseline note).
- revokeCarrierDriverAccess and restoreCarrierDriverAccess are exported from fleet-drivers.ts.
- Both route files exist under .../fleet/drivers/[id]/ and export POST.
- Role gate present in both routes: DRIVER → 403.
</verification>

<success_criteria>
- POST /api/v1/carrier/fleet/drivers/[id]/revoke-access bans Supabase auth + sets User.isActive=false + global signOut, scoped to orgId, returns { revoked: true, userId }.
- POST /api/v1/carrier/fleet/drivers/[id]/restore-access unbans + sets User.isActive=true, scoped to orgId, returns { restored: true, userId }.
- Non-OWNER/MANAGER → 403. Cross-org or missing driver → 404. Driver with no linked account → 400. Supabase API failure → DB change persists, error logged, function still returns success object.
- Backend only — no UI changes.
</success_criteria>

<output>
After completion, create `.planning/quick/454-phase-1-carrier-driver-portal-access-rev/454-SUMMARY.md`
</output>
