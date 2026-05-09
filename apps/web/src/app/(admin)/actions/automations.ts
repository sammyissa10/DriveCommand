'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
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
  return prisma.automationRule.findMany({
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
  const rule = await prisma.automationRule.findUnique({
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
  await prisma.automationRule.update({
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

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) return { error: 'Tenant not found' };

  const rule = await prisma.automationRule.findUnique({
    where: { id: ruleId },
    select: { id: true, actionsJson: true },
  });
  if (!rule) return { error: 'Rule not found' };

  // Step 1: Create the PENDING run and capture its ID
  let newRunId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      const created = await tx.automationRun.create({
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
    }, TX_OPTIONS);
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
        // Mark SENT
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.automationRun.updateMany({
            where: { id: newRunId!, status: 'PENDING' },
            data: { status: 'SENT', firedAt: new Date() },
          });
        }, TX_OPTIONS);
      } catch (err) {
        // Mark FAILED and surface the error to SysAdmin
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.automationRun.updateMany({
            where: { id: newRunId!, status: 'PENDING' },
            data: { status: 'FAILED', firedAt: new Date(), errorMessage },
          });
        }, TX_OPTIONS);
        return { error: `Send failed: ${errorMessage}` };
      }
    }
  }

  revalidatePath(`/automations/${ruleId}`);
  return { ok: true, tenantName: tenant.name };
}
