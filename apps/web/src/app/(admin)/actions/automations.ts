'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { revalidatePath } from 'next/cache';
import { executeSendEmailAction } from '@/lib/automations/actions/send-email';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) throw new Error('Unauthorized: Admin access required');
}

/**
 * Get all AutomationRule rows ordered by key.
 * Used by /automations list page.
 */
export async function getAutomationRules() {
  await requireAdminAccess();
  // quick-613 — ROUTE. A sysadmin has no tenant, and `_count.runs` counts
  // AutomationRun rows across EVERY tenant; on a tenant connection that count
  // silently drops every run the caller's GUC does not name.
  const adminDb = await getAdminDb('sysadmin automation rule listing');
  return adminDb.automationRule.findMany({
    orderBy: { key: 'asc' },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      triggerEvent: true,
      isActive: true,
      runOncePerTenant: true,
      scope: true,
      _count: { select: { runs: true } },
    },
  });
}

/**
 * Get a single rule with its last 10 runs.
 * Used by /automations/[ruleId] detail page.
 */
export async function getRuleWithRuns(ruleId: string) {
  await requireAdminAccess();
  // quick-613 — ROUTE. The last 10 runs are read ACROSS ALL TENANTS and joined
  // to `Tenant.name`; both the runs and the tenant names belong to tenants the
  // sysadmin is not, and neither is visible to a tenant connection.
  const adminDb = await getAdminDb('sysadmin automation rule detail read');
  const rule = await adminDb.automationRule.findUnique({
    where: { id: ruleId },
    include: {
      runs: {
        orderBy: { firedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          tenantId: true,
          triggeredBy: true,
          status: true,
          firedAt: true,
          scheduledAt: true,
          errorMessage: true,
          tenant: { select: { name: true } },
        },
      },
    },
  });
  if (!rule) throw new Error('Rule not found');
  return rule;
}

/**
 * Toggle isActive on a rule.
 */
export async function toggleRuleActive(ruleId: string, isActive: boolean) {
  await requireAdminAccess();
  // quick-613 — ROUTE. This writes a platform (`scope='SYSTEM'`, `tenantId`
  // NULL) rule, which no tenant owns. Measured 42501 under `app_user` in
  // quick-612 §3 with AND without a tenant GUC; quick-612's per-command split
  // turned that into a silent 0 rows, which is quieter, not safer.
  const adminDb = await getAdminDb('sysadmin automation rule activation toggle');
  await adminDb.automationRule.update({
    where: { id: ruleId },
    data: { isActive },
  });
  revalidatePath('/automations');
}

/**
 * Manually trigger a rule for a specific tenant.
 *
 * Creates a PENDING AutomationRun immediately (scheduledAt = now) and then
 * executes ONLY that specific run by calling executeSendEmailAction directly.
 * Does NOT call runEvaluator() — that would scan and execute ALL pending runs
 * across ALL tenants, which is not the intent of a manual trigger.
 */
export async function manualTriggerRule(ruleId: string, tenantId: string) {
  await requireAdminAccess();

  // Validate tenantId format (basic UUID check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return { error: 'Invalid tenant UUID format' };
  }

  // quick-613 — ROUTE, for BOTH reads below. `tenantId` is supplied by the
  // operator and names a tenant that is not theirs — a sysadmin has no tenant
  // at all — so on a tenant connection the lookup returns null for every real
  // tenant and this action answers "Tenant not found" always. The rule read is
  // the same unit of work as the `automationRun` writes further down, which
  // quick-600 already routed; one acquisition serves both.
  const adminDbRead = await getAdminDb('sysadmin manual automation trigger');

  const tenant = await adminDbRead.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) return { error: 'Tenant not found' };

  const rule = await adminDbRead.automationRule.findUnique({
    where: { id: ruleId },
    select: { id: true, actionsJson: true },
  });
  if (!rule) return { error: 'Rule not found' };

  // Step 1: Create the PENDING run and capture its ID
  // quick-600 (B5) — ROUTE. Sysadmin acting on an arbitrary tenant's rule.
  let newRunId: string | null = null;
  try {
    const adminDb = await getAdminDb('sysadmin manual automation trigger');
    const created = await adminDb.automationRun.create({
      data: {
        ruleId,
        tenantId,
        triggeredBy: 'manual:sysadmin',
        status: 'PENDING',
        scheduledAt: new Date(),
      },
      select: { id: true },
    });
    newRunId = created.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create run' };
  }

  if (!newRunId) return { error: 'Run creation returned no ID' };

  // Step 2: Execute only this specific run directly (not via runEvaluator)
  const actions = rule.actionsJson as Array<{ type: string; templateKey?: string }> | undefined;
  if (!Array.isArray(actions)) {
    return { error: `Rule actionsJson is not an array` };
  }

  for (const action of actions) {
    if (action.type === 'send_email' && action.templateKey && action.templateKey !== 'confirm_email') {
      try {
        await executeSendEmailAction(
          { id: newRunId, tenantId, ruleId },
          { templateKey: action.templateKey },
        );
        // Mark SENT — quick-600 (B5) ROUTE, same reason: same sysadmin unit of work.
        const adminDbSent = await getAdminDb('sysadmin manual automation trigger');
        await adminDbSent.automationRun.updateMany({
          where: { id: newRunId!, status: 'PENDING' },
          data: { status: 'SENT', firedAt: new Date() },
        });
      } catch (err) {
        // Mark FAILED and surface the error to SysAdmin — quick-600 (B5) ROUTE.
        const errorMessage = err instanceof Error ? err.message : String(err);
        const adminDbFailed = await getAdminDb('sysadmin manual automation trigger');
        await adminDbFailed.automationRun.updateMany({
          where: { id: newRunId!, status: 'PENDING' },
          data: { status: 'FAILED', firedAt: new Date(), errorMessage },
        });
        return { error: `Send failed: ${errorMessage}` };
      }
    }
  }

  revalidatePath(`/automations/${ruleId}`);
  return { ok: true, tenantName: tenant.name };
}
