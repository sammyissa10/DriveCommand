/**
 * send_email action handler for the automation evaluator.
 *
 * Reads templateKey from the action config, looks up TEMPLATE_REGISTRY,
 * resolves owner context from the DB, renders and sends via gmail-client.ts.
 *
 * Called exclusively from evaluator.ts inside a $transaction.
 * The caller (evaluator) handles status update to SENT/FAILED with optimistic locking.
 */

import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/gmail-client';
import { TEMPLATE_REGISTRY, TemplateContext } from '@/lib/automations/template-registry';
import type { AutomationRun } from '@/generated/prisma';

export interface SendEmailActionConfig {
  templateKey: string;
}

/**
 * Execute the send_email action for a given AutomationRun.
 * Returns void — throws on unrecoverable error (caller catches and marks FAILED).
 */
export async function executeSendEmailAction(
  run: Pick<AutomationRun, 'id' | 'tenantId' | 'ruleId'>,
  actionConfig: SendEmailActionConfig,
): Promise<void> {
  const { templateKey } = actionConfig;

  const template = TEMPLATE_REGISTRY[templateKey];
  if (!template) {
    throw new Error(`[send-email] Unknown templateKey: ${templateKey}`);
  }

  // Resolve owner context — Tenant has no ownerEmail field; look up OWNER User row
  const owner = await prisma.user.findFirst({
    where: { tenantId: run.tenantId, role: 'OWNER' },
    select: { email: true, firstName: true, lastName: true },
  });

  if (!owner?.email) {
    throw new Error(`[send-email] No OWNER user found for tenantId=${run.tenantId}`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: run.tenantId },
    select: {
      name: true,
      subscription: { select: { trialEndsAt: true } },
    },
  });

  const trialEndsAt = tenant?.subscription?.trialEndsAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(tenant.subscription.trialEndsAt)
    : undefined;

  const ctx: TemplateContext = {
    tenantId: run.tenantId,
    ownerEmail: owner.email,
    firstName: owner.firstName ?? 'there',
    companyName: tenant?.name ?? 'your company',
    trialEndsAt,
  };

  const subject = template.subject(ctx);
  const element = template.buildElement(ctx);

  await sendEmail({
    to: owner.email,
    subject,
    react: element,
    replyTo: process.env.SUPPORT_REPLY_TO ?? process.env.GMAIL_USER,
  });

  console.log(
    `[send-email] Sent templateKey=${templateKey} to=${owner.email} runId=${run.id}`,
  );
}
