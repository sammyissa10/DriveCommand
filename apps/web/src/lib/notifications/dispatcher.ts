/**
 * Notification Dispatcher — public entry point for DriveCommand's notification system.
 *
 * Executes the 10-step flow defined in the Notifications System Technical Documentation:
 *   1. Fetch global NotificationTemplate (short-circuit if missing or isActive=false)
 *   2. Fetch TenantNotificationSettings (short-circuit if isActive=false)
 *   3. Resolve recipients via resolveRecipients()
 *   4. Pick template content (tenant customBlockJson/customSubject ?? global defaults)
 *   5. Render once: Tiptap blockJson + variables -> HTML (shared by all recipients)
 *   6. Per-recipient EMAIL: idempotency check -> resend.emails.send()
 *   7. Per-recipient IN_APP: writeInAppNotification()
 *   8. (Implicit) Per-recipient error isolation — one failure never aborts others
 *   9. (Implicit) Preference gating — emailEnabled / inAppEnabled per user
 *  10. Persist all audit rows in one bypass_rls transaction (always, even on outer error)
 *
 * @returns { sent, skipped, failed } counts across all channels and recipients
 * @never throws — always returns, even on catastrophic failure
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { resend, FROM_EMAIL } from '@/lib/email/resend-client';
import React from 'react';
import DynamicTemplateEmail from '@/emails/dynamic-template';
import type { TriggerKey, NotificationPayload, DefaultRecipientRule } from './types';
import { resolveRecipients } from './recipient-resolver';
import { renderTemplate } from './template-renderer';
import { buildIdempotencyKey, checkIdempotency } from './idempotency';
import { writeAuditLog, type AuditLogEntry } from './audit-log';
import { writeInAppNotification } from './in-app-writer';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags to produce a plain-text message for in-app notifications. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function dispatchNotification<K extends TriggerKey>(
  triggerKey: K,
  options: {
    tenantId: string;
    payload: NotificationPayload[K];
    relatedEntity?: { type: string; id: string };
    /** Optional injected client — used by tests to avoid real DB access */
    prismaClient?: PrismaClient;
  },
): Promise<{ sent: number; skipped: number; failed: number }> {
  const db = options.prismaClient ?? defaultPrisma;
  const audits: AuditLogEntry[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // -----------------------------------------------------------------------
    // Step 1: Fetch global NotificationTemplate
    // -----------------------------------------------------------------------
    const template = await db.notificationTemplate.findUnique({
      where: { triggerKey },
    });

    if (!template || !template.isActive) {
      audits.push({
        tenantId: options.tenantId,
        triggerKey,
        channel: 'EMAIL',
        status: 'SKIPPED_DISABLED',
        idempotencyKey: `disabled-global:${triggerKey}:${Date.now()}`,
        relatedEntityType: options.relatedEntity?.type ?? null,
        relatedEntityId: options.relatedEntity?.id ?? null,
        errorMessage: !template ? 'Template not found' : 'Template globally disabled',
      });
      skipped++;
      return { sent, skipped, failed };
    }

    // -----------------------------------------------------------------------
    // Step 2: Fetch TenantNotificationSettings
    // -----------------------------------------------------------------------
    const tenantSettings = await db.tenantNotificationSettings.findUnique({
      where: { tenantId_triggerKey: { tenantId: options.tenantId, triggerKey } },
    });

    // TenantNotificationSettings.isActive === false means this tenant disabled the trigger.
    // (Note: field is `isActive` in schema — NOT `isEnabled`.)
    if (tenantSettings && tenantSettings.isActive === false) {
      audits.push({
        tenantId: options.tenantId,
        triggerKey,
        channel: 'EMAIL',
        status: 'SKIPPED_DISABLED',
        idempotencyKey: `disabled-tenant:${options.tenantId}:${triggerKey}:${Date.now()}`,
        relatedEntityType: options.relatedEntity?.type ?? null,
        relatedEntityId: options.relatedEntity?.id ?? null,
        errorMessage: 'Tenant disabled this trigger',
      });
      skipped++;
      return { sent, skipped, failed };
    }

    // -----------------------------------------------------------------------
    // Step 3: Resolve recipients
    // -----------------------------------------------------------------------
    const defaultRules = (template.defaultRecipients as DefaultRecipientRule[]) ?? [];
    const recipients = await resolveRecipients(
      db,
      options.tenantId,
      triggerKey,
      defaultRules,
      options.payload as Record<string, string>,
    );

    // -----------------------------------------------------------------------
    // Steps 4-5: Pick content + render once (shared by all recipients)
    // -----------------------------------------------------------------------
    const blockJson = tenantSettings?.customBlockJson ?? template.defaultBlockJson;
    const subjectTemplate = (tenantSettings?.customSubject ?? template.defaultSubject) as string;

    const { html, subjectFinal } = await renderTemplate(
      blockJson,
      options.payload as Record<string, string>,
      subjectTemplate,
    );

    // -----------------------------------------------------------------------
    // Steps 6-9: Per-recipient fan-out (isolated error boundary per recipient)
    // -----------------------------------------------------------------------
    for (const r of recipients) {
      try {
        // -------------------------------------------------------------------
        // Step 6a: EMAIL channel
        // -------------------------------------------------------------------
        if (r.emailEnabled) {
          const idemKey = buildIdempotencyKey(
            triggerKey,
            options.relatedEntity,
            r.userId,
            false,
          );
          const alreadySent = await checkIdempotency(db, idemKey);

          if (alreadySent) {
            audits.push({
              tenantId: options.tenantId,
              triggerKey,
              recipientUserId: r.userId,
              recipientEmail: r.email,
              channel: 'EMAIL',
              subject: subjectFinal,
              status: 'SKIPPED_IDEMPOTENT',
              idempotencyKey: idemKey,
              relatedEntityType: options.relatedEntity?.type ?? null,
              relatedEntityId: options.relatedEntity?.id ?? null,
            });
            skipped++;
          } else {
            try {
              await resend.emails.send({
                from: FROM_EMAIL,
                to: r.email,
                subject: subjectFinal,
                react: React.createElement(DynamicTemplateEmail, { bodyHtml: html }),
              });
              audits.push({
                tenantId: options.tenantId,
                triggerKey,
                recipientUserId: r.userId,
                recipientEmail: r.email,
                channel: 'EMAIL',
                subject: subjectFinal,
                status: 'SENT',
                idempotencyKey: idemKey,
                relatedEntityType: options.relatedEntity?.type ?? null,
                relatedEntityId: options.relatedEntity?.id ?? null,
              });
              sent++;
            } catch (emailErr) {
              audits.push({
                tenantId: options.tenantId,
                triggerKey,
                recipientUserId: r.userId,
                recipientEmail: r.email,
                channel: 'EMAIL',
                subject: subjectFinal,
                status: 'FAILED',
                idempotencyKey: idemKey,
                errorMessage: (emailErr as Error).message?.slice(0, 1000) ?? null,
                relatedEntityType: options.relatedEntity?.type ?? null,
                relatedEntityId: options.relatedEntity?.id ?? null,
              });
              failed++;
            }
          }
        } else {
          // Email channel disabled by user preference
          audits.push({
            tenantId: options.tenantId,
            triggerKey,
            recipientUserId: r.userId,
            recipientEmail: r.email,
            channel: 'EMAIL',
            subject: subjectFinal,
            status: 'SKIPPED_USER_PREF',
            idempotencyKey: `pref-off:${triggerKey}:${r.userId}:${Date.now()}`,
            relatedEntityType: options.relatedEntity?.type ?? null,
            relatedEntityId: options.relatedEntity?.id ?? null,
          });
          skipped++;
        }

        // -------------------------------------------------------------------
        // Step 6b: IN_APP channel (independent of email outcome)
        // -------------------------------------------------------------------
        if (r.inAppEnabled) {
          const idemKeyApp =
            buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false) + ':inapp';
          try {
            await writeInAppNotification(db, {
              tenantId: options.tenantId,
              userId: r.userId,
              triggerKey,
              title: subjectFinal,
              message: stripHtml(html),
              relatedEntity: options.relatedEntity,
            });
            audits.push({
              tenantId: options.tenantId,
              triggerKey,
              recipientUserId: r.userId,
              channel: 'IN_APP',
              subject: subjectFinal,
              status: 'SENT',
              idempotencyKey: idemKeyApp,
              relatedEntityType: options.relatedEntity?.type ?? null,
              relatedEntityId: options.relatedEntity?.id ?? null,
            });
            sent++;
          } catch (inAppErr) {
            audits.push({
              tenantId: options.tenantId,
              triggerKey,
              recipientUserId: r.userId,
              channel: 'IN_APP',
              subject: subjectFinal,
              status: 'FAILED',
              idempotencyKey: idemKeyApp,
              errorMessage: (inAppErr as Error).message?.slice(0, 1000) ?? null,
              relatedEntityType: options.relatedEntity?.type ?? null,
              relatedEntityId: options.relatedEntity?.id ?? null,
            });
            failed++;
          }
        } else {
          // In-app channel disabled by user preference
          audits.push({
            tenantId: options.tenantId,
            triggerKey,
            recipientUserId: r.userId,
            channel: 'IN_APP',
            subject: subjectFinal,
            status: 'SKIPPED_USER_PREF',
            idempotencyKey: `pref-off-inapp:${triggerKey}:${r.userId}:${Date.now()}`,
            relatedEntityType: options.relatedEntity?.type ?? null,
            relatedEntityId: options.relatedEntity?.id ?? null,
          });
          skipped++;
        }
      } catch (perRecipientErr) {
        // Step 8: Catch-all per recipient — one failure never kills the loop
        console.error(
          '[notifications] recipient dispatch failed',
          r.userId,
          perRecipientErr,
        );
        failed++;
      }
    }
  } catch (outerErr) {
    // Outer catch — handles template fetch, recipient resolution, or render failures
    console.error('[notifications] dispatch failed before fan-out', outerErr);
    failed++;
  } finally {
    // Step 10: Persist all audit rows — always runs, even on outer error
    await writeAuditLog(db, audits);
  }

  return { sent, skipped, failed };
}
