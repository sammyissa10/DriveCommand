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
 *  7b. Per-recipient PUSH  : sendPushToUser() — Phase 10, gated on
 *      template.pushEnabled (DB default FALSE, so no pre-Phase-10 trigger
 *      gains a channel) AND the user's own pushEnabled preference
 *   8. (Implicit) Per-recipient error isolation — one failure never aborts others
 *   9. (Implicit) Preference gating — emailEnabled / inAppEnabled / pushEnabled per user
 *  10. Persist all audit rows in one bypass_rls transaction (always, even on outer error)
 *
 * @returns { sent, skipped, failed } counts across all channels and recipients
 * @never throws — always returns, even on catastrophic failure
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { resend, FROM_EMAIL, REPLY_TO_EMAIL } from '@/lib/email/resend-client';
import type { TriggerKey, NotificationPayload, DefaultRecipientRule } from './types';
import { resolveRecipients } from './recipient-resolver';
import { renderTemplate } from './template-renderer';
import { buildIdempotencyKey, checkIdempotency, wasSentWithinWindow } from './idempotency';
import { writeAuditLog, type AuditLogEntry } from './audit-log';
import { writeInAppNotification } from './in-app-writer';
import { sendPushToUser } from './send-push';
import { logger, serializeError } from '@/lib/logger';

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
    /**
     * Phase 10 — suppress a repeat of this (trigger, entity, recipient, channel)
     * sent within the last N milliseconds.
     *
     * OPT-IN, and it must stay opt-in. Every pre-Phase-10 call site omits it and
     * keeps the exact same-ISO-second `buildIdempotencyKey` behaviour it has
     * always had, which is what "do not change the behaviour of any existing
     * trigger" requires. The ten Section 13 emits pass
     * `NOTIFICATION_DEDUP_WINDOW_MS`.
     *
     * Applied IN ADDITION to the existing key check, not instead of it — the two
     * answer different questions and the key check is what a replayed request
     * with an identical timestamp still needs.
     */
    dedupWindowMs?: number;
  },
): Promise<{ sent: number; skipped: number; failed: number }> {
  const db = options.prismaClient ?? defaultPrisma;
  const audits: AuditLogEntry[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  console.log(`[notif-trace] dispatchNotification:start trigger=${triggerKey} tenant=${options.tenantId} hasPayload=${options.payload != null} hasRelatedEntity=${options.relatedEntity != null}`);

  try {
    // -----------------------------------------------------------------------
    // Step 1: Fetch global NotificationTemplate
    // -----------------------------------------------------------------------
    const template = await db.notificationTemplate.findUnique({
      where: { triggerKey },
    });
    console.log(`[notif-trace] template:fetched found=${template != null} isActive=${template?.isActive ?? 'n/a'}`);

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
      console.log(`[notif-trace] dispatchNotification:exit reason=${!template ? 'skip:template_missing' : 'skip:template_inactive'} trigger=${triggerKey}`);
      return { sent, skipped, failed };
    }

    // -----------------------------------------------------------------------
    // Step 2: Fetch TenantNotificationSettings
    // -----------------------------------------------------------------------
    const tenantSettings = await db.tenantNotificationSettings.findUnique({
      where: { tenantId_triggerKey: { tenantId: options.tenantId, triggerKey } },
    });
    console.log(`[notif-trace] settings:fetched found=${tenantSettings != null} isActive=${tenantSettings?.isActive ?? 'n/a'}`);

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
      console.log(`[notif-trace] dispatchNotification:exit reason=skip:settings_inactive trigger=${triggerKey}`);
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
    console.log(`[notif-trace] recipients:resolved count=${recipients.length}`);
    if (recipients.length === 0) {
      console.log(`[notif-trace] recipients:none trigger=${triggerKey} reason=skip:no_recipients`);
    }

    // -----------------------------------------------------------------------
    // Steps 4-5: Pick content + render once (shared by all recipients)
    // -----------------------------------------------------------------------
    const cachedHtml = tenantSettings?.customHtmlCache ?? template.defaultHtmlCache;
    const subjectTemplate = (tenantSettings?.customSubject ?? template.defaultSubject) as string;
    console.log(`[notif-trace] content:picked source=${tenantSettings?.customHtmlCache != null ? 'custom' : 'default'}`);

    if (!cachedHtml) {
      audits.push({
        tenantId: options.tenantId,
        triggerKey,
        channel: 'EMAIL',
        status: 'FAILED',
        idempotencyKey: `no-cached-html:${triggerKey}:${Date.now()}`,
        relatedEntityType: options.relatedEntity?.type ?? null,
        relatedEntityId: options.relatedEntity?.id ?? null,
        errorMessage: 'No cached HTML available for trigger — seed migration missing or save flow not run',
      });
      failed++;
      return { sent, skipped, failed };
    }

    console.log(`[notif-trace] render:start`);
    const { html, subjectFinal } = await renderTemplate(
      cachedHtml,
      options.payload as Record<string, string>,
      subjectTemplate,
    );
    console.log(`[notif-trace] render:done html_length=${html.length}`);

    // -----------------------------------------------------------------------
    // Step 6c (Phase 10): PUSH channel.
    //
    // DEC-2 put `PUSH` in `NotificationChannel` and forbade anything sending on
    // it until this phase, whose instruction was to reuse the existing
    // `sendPushToUser` mechanism "rather than growing a second delivery path".
    // So this is a third branch beside EMAIL and IN_APP, not a new dispatcher.
    //
    // THREE gates, and all three must pass:
    //   1. `template.pushEnabled` — default FALSE in the DB, so all 37
    //      pre-Phase-10 templates take it and NO existing trigger gains a
    //      channel from this branch existing. That is the whole reason the
    //      column exists rather than a hard-coded key list.
    //   2. `r.pushEnabled`      — the user's own preference, default true.
    //   3. `r.userId !== null`  — `PushToken.userId` is a non-null FK; an
    //      external-email recipient has no device to push to.
    //
    // `sendPushToUser` never throws (it swallows and logs internally), but it is
    // wrapped anyway: a push failure must not cost the recipient their in-app
    // row, and this whole function is documented as never throwing.
    const dispatchPush = async (r: (typeof recipients)[number]): Promise<void> => {
      if (!template.pushEnabled || r.userId === null || !r.pushEnabled) return;

      const idemKeyPush =
        buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false) + ':push';

      if (
        options.dedupWindowMs !== undefined &&
        (await wasSentWithinWindow(db, {
          triggerKey,
          relatedEntity: options.relatedEntity,
          recipientUserId: r.userId,
          recipientEmail: null,
          channel: 'PUSH',
          windowMs: options.dedupWindowMs,
        }))
      ) {
        audits.push({
          tenantId: options.tenantId,
          triggerKey,
          recipientUserId: r.userId,
          channel: 'PUSH',
          subject: subjectFinal,
          status: 'SKIPPED_IDEMPOTENT',
          idempotencyKey: idemKeyPush,
          relatedEntityType: options.relatedEntity?.type ?? null,
          relatedEntityId: options.relatedEntity?.id ?? null,
        });
        skipped++;
        return;
      }

      try {
        await sendPushToUser(r.userId, {
          // The subject is already rendered and is the one line a driver reads
          // on a lock screen. The body is the stripped HTML, same source the
          // in-app message uses, capped hard — Expo truncates anyway and a
          // multi-kilobyte body is a wasted request.
          title: subjectFinal,
          body: stripHtml(html).slice(0, 240),
          data: {
            triggerKey,
            ...(options.relatedEntity
              ? { entityType: options.relatedEntity.type, entityId: options.relatedEntity.id }
              : {}),
          },
        });
        audits.push({
          tenantId: options.tenantId,
          triggerKey,
          recipientUserId: r.userId,
          channel: 'PUSH',
          subject: subjectFinal,
          status: 'SENT',
          idempotencyKey: idemKeyPush,
          relatedEntityType: options.relatedEntity?.type ?? null,
          relatedEntityId: options.relatedEntity?.id ?? null,
        });
        sent++;
      } catch (pushErr) {
        // `logger.error(message, error, context)` — the error goes SECOND.
        // Passing the context object there collapses it to
        // `Error: [object Object]` and tells Sentry nothing (DEC-11 §3).
        logger.error('[notifications] push dispatch failed', pushErr, {
          triggerKey,
          recipientUserId: r.userId,
          error: serializeError(pushErr),
        });
        audits.push({
          tenantId: options.tenantId,
          triggerKey,
          recipientUserId: r.userId,
          channel: 'PUSH',
          subject: subjectFinal,
          status: 'FAILED',
          idempotencyKey: idemKeyPush,
          errorMessage: (pushErr instanceof Error ? pushErr.message : String(pushErr)).slice(0, 1000),
          relatedEntityType: options.relatedEntity?.type ?? null,
          relatedEntityId: options.relatedEntity?.id ?? null,
        });
        failed++;
      }
    };

    // -----------------------------------------------------------------------
    // Steps 6-9: Per-recipient fan-out (isolated error boundary per recipient)
    // -----------------------------------------------------------------------
    for (const r of recipients) {
      const _preSent = sent, _preSkipped = skipped, _preFailed = failed;
      try {
        console.log(`[notif-trace] recipient:start userId=${r.userId ?? 'null'} hasEmail=${r.emailEnabled} hasInApp=${r.userId !== null && r.inAppEnabled}`);
        // -------------------------------------------------------------------
        // Step 6a: EMAIL channel
        // -------------------------------------------------------------------
        if (r.emailEnabled) {
          const idemKey = buildIdempotencyKey(
            triggerKey,
            options.relatedEntity,
            r.userId,
            false,
            r.email,
          );
          const alreadySent =
            (await checkIdempotency(db, idemKey)) ||
            (options.dedupWindowMs !== undefined &&
              (await wasSentWithinWindow(db, {
                triggerKey,
                relatedEntity: options.relatedEntity,
                recipientUserId: r.userId,
                recipientEmail: r.email,
                channel: 'EMAIL',
                windowMs: options.dedupWindowMs,
              })));

          if (alreadySent) {
            audits.push({
              tenantId: options.tenantId,
              triggerKey,
              recipientUserId: r.userId ?? null,
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
              const { error: sendError } = await resend.emails.send({
                from: FROM_EMAIL,
                to: r.email,
                subject: subjectFinal,
                html: html,
                replyTo: REPLY_TO_EMAIL,
              });

              if (sendError) {
                // API-level failure (e.g. unverified domain, bad from-address, 4xx/5xx).
                // Resend does NOT throw in this case — it returns { error }.
                const failMessage = `${sendError.name}: ${sendError.message}`;
                audits.push({
                  tenantId: options.tenantId,
                  triggerKey,
                  recipientUserId: r.userId ?? null,
                  recipientEmail: r.email,
                  channel: 'EMAIL',
                  subject: subjectFinal,
                  status: 'FAILED',
                  idempotencyKey: idemKey,
                  errorMessage: failMessage.slice(0, 1000),
                  relatedEntityType: options.relatedEntity?.type ?? null,
                  relatedEntityId: options.relatedEntity?.id ?? null,
                });
                failed++;
              } else {
                audits.push({
                  tenantId: options.tenantId,
                  triggerKey,
                  recipientUserId: r.userId ?? null,
                  recipientEmail: r.email,
                  channel: 'EMAIL',
                  subject: subjectFinal,
                  status: 'SENT',
                  idempotencyKey: idemKey,
                  relatedEntityType: options.relatedEntity?.type ?? null,
                  relatedEntityId: options.relatedEntity?.id ?? null,
                });
                sent++;
              }
            } catch (emailErr) {
              // Network-level throw (Resend only throws here, not on API errors).
              audits.push({
                tenantId: options.tenantId,
                triggerKey,
                recipientUserId: r.userId ?? null,
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
            recipientUserId: r.userId ?? null,
            recipientEmail: r.email,
            channel: 'EMAIL',
            subject: subjectFinal,
            status: 'SKIPPED_USER_PREF',
            idempotencyKey: `pref-off:${triggerKey}:${r.userId ?? `email:${r.email}`}:${Date.now()}`,
            relatedEntityType: options.relatedEntity?.type ?? null,
            relatedEntityId: options.relatedEntity?.id ?? null,
          });
          skipped++;
        }

        // -------------------------------------------------------------------
        // Step 6b: IN_APP channel (independent of email outcome)
        // -------------------------------------------------------------------
        if (r.userId !== null && r.inAppEnabled) {
          // User-backed recipient with in-app enabled
          const idemKeyApp =
            buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false) + ':inapp';

          const inAppDuplicate =
            options.dedupWindowMs !== undefined &&
            (await wasSentWithinWindow(db, {
              triggerKey,
              relatedEntity: options.relatedEntity,
              recipientUserId: r.userId,
              recipientEmail: null,
              channel: 'IN_APP',
              windowMs: options.dedupWindowMs,
            }));

          if (inAppDuplicate) {
            audits.push({
              tenantId: options.tenantId,
              triggerKey,
              recipientUserId: r.userId,
              channel: 'IN_APP',
              subject: subjectFinal,
              status: 'SKIPPED_IDEMPOTENT',
              idempotencyKey: idemKeyApp,
              relatedEntityType: options.relatedEntity?.type ?? null,
              relatedEntityId: options.relatedEntity?.id ?? null,
            });
            skipped++;
            // The PUSH branch below still runs. A suppressed in-app row must not
            // suppress the push that accompanies it — they are separate channels
            // with separate windows, which is exactly why `wasSentWithinWindow`
            // matches on channel.
            await dispatchPush(r);
            continue;
          }
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
        } else if (r.userId === null) {
          // External email recipient: no User row, no InAppNotification possible.
          // Record a SKIPPED_DISABLED audit row so the log is complete.
          audits.push({
            tenantId: options.tenantId,
            triggerKey,
            recipientUserId: null,
            recipientEmail: r.email,
            channel: 'IN_APP',
            subject: subjectFinal,
            status: 'SKIPPED_DISABLED',
            idempotencyKey: `no-userid-inapp:${triggerKey}:${r.email}:${Date.now()}`,
            relatedEntityType: options.relatedEntity?.type ?? null,
            relatedEntityId: options.relatedEntity?.id ?? null,
            errorMessage: 'Recipient has no User row; in-app channel not applicable',
          });
          skipped++;
        } else {
          // userId present but inAppEnabled false — user-pref-off
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

        // Step 6c: PUSH — independent of both outcomes above.
        await dispatchPush(r);

        console.log(`[notif-trace] recipient:done userId=${r.userId ?? 'null'} sent=${sent - _preSent} skipped=${skipped - _preSkipped} failed=${failed - _preFailed}`);
      } catch (perRecipientErr) {
        // Step 8: Catch-all per recipient — one failure never kills the loop
        console.error(
          '[notifications] recipient dispatch failed',
          r.userId ?? r.email,
          perRecipientErr,
        );
        // TODO(quick-321): consider pushing an audit row here for per-recipient catch failures
        failed++;
      }
    }
  } catch (outerErr) {
    // Outer catch — handles template fetch, recipient resolution, or render failures
    console.error('[notifications] dispatch failed before fan-out', outerErr);
    console.error(`[notif-trace] dispatchNotification:catastrophic message=${(outerErr as Error)?.message ?? 'unknown'} stack=${((outerErr as Error)?.stack ?? '').slice(0, 500)}`);
    failed++;
  } finally {
    // Step 10: Persist all audit rows — always runs, even on outer error
    console.log(`[notif-trace] audit:writing entries=${audits.length}`);
    await writeAuditLog(db, audits);
    console.log(`[notif-trace] audit:done`);
  }

  console.log(`[notif-trace] dispatchNotification:done trigger=${triggerKey} sent=${sent} skipped=${skipped} failed=${failed}`);
  return { sent, skipped, failed };
}
