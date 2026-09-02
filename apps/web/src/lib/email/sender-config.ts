/**
 * Sender identity for outbound email.
 *
 * ===========================================================================
 * WHY THIS EXISTS
 * ===========================================================================
 * `NotificationEmailConfig` (fromName / fromEmail / replyTo) has had a SysAdmin
 * editing screen since it shipped and **no reader anywhere on the send path** —
 * editing it changed nothing a recipient ever saw. That was finding 7 of
 * docs/diagnostics/email-rendering-inventory.md. This is the reader.
 *
 * ===========================================================================
 * NAME AND ADDRESS ARE COMPOSED HERE, NEVER TRUSTED PRE-COMPOSED
 * ===========================================================================
 * The old code was a single baked constant:
 *
 *     FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DriveCommand <team@…>'
 *
 * so a deployment that set `RESEND_FROM_EMAIL` to a bare address silently lost
 * the display name, and nothing could tell that had happened. Here the name and
 * the address are separate values and `from` is assembled from them.
 *
 * `RESEND_FROM_EMAIL` is still PARSED rather than assumed bare, because the
 * value currently deployed is the pre-composed `DriveCommand <team@…>` form.
 * Treating that as an address would emit `Name <DriveCommand <team@…>>` and
 * every send would be rejected. Backwards compatibility here is not politeness,
 * it is the difference between working and not.
 *
 * ===========================================================================
 * NEVER THROWS
 * ===========================================================================
 * A database hiccup must not stop notifications going out. Every failure path
 * falls back to env. The 60-second cache also means a fan-out to 200 recipients
 * performs one config read, not 200.
 */

import { prisma } from '@/lib/db/prisma';
import { logger, serializeError } from '@/lib/logger';

export type SenderConfig = {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  /** RFC 5322 `Name <addr>`, composed from the two fields above. */
  from: string;
  /** Where the values came from — used by tests and worth logging. */
  source: 'database' | 'env';
};

/** Last-resort values. Only reached when neither the DB nor env supplies one. */
const FALLBACK_FROM_NAME = 'DriveCommand';
// Must be on a Resend-VERIFIED domain. drivecommand.app is verified;
// drivecommand.io is not (its DNS sits on an inaccessible Vercel account), so
// sending as @drivecommand.io is rejected with a 550. Replies still reach the
// real inbox through replyTo.
const FALLBACK_FROM_EMAIL = 'team@drivecommand.app';
const FALLBACK_REPLY_TO = 'team@drivecommand.io';

const CACHE_TTL_MS = 60_000;

let cached: { value: SenderConfig; expiresAt: number } | null = null;

/**
 * Characters that force a quoted display name under RFC 5322 §3.2.3.
 * A name like `Acme, Inc.` is not merely ugly unquoted — the comma splits the
 * header into two addresses.
 */
const SPECIALS = /[()<>[\]:;@\\,."]/;

/** `Name <addr>`, quoting and escaping the display name only when required. */
export function formatAddress(name: string, email: string): string {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  if (!trimmedName) return trimmedEmail;

  if (SPECIALS.test(trimmedName)) {
    const escaped = trimmedName.replace(/([\\"])/g, '\\$1');
    return `"${escaped}" <${trimmedEmail}>`;
  }

  return `${trimmedName} <${trimmedEmail}>`;
}

/**
 * Accepts either a bare address or a pre-composed `Name <addr>` and returns the
 * parts. See the header for why the composed form has to be tolerated.
 */
export function parseAddress(raw: string | undefined): { name?: string; email?: string } {
  if (!raw) return {};
  const value = raw.trim();
  if (!value) return {};

  const composed = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (composed) {
    const name = composed[1].replace(/^"(.*)"$/, '$1').replace(/\\(["\\])/g, '$1').trim();
    return { name: name || undefined, email: composed[2].trim() };
  }

  return { email: value };
}

/** Env-only resolution. Also the fallback when the DB read fails. */
function resolveFromEnv(): SenderConfig {
  const parsed = parseAddress(process.env.RESEND_FROM_EMAIL);

  // An explicit RESEND_FROM_NAME wins over a name embedded in RESEND_FROM_EMAIL.
  const fromName = process.env.RESEND_FROM_NAME?.trim() || parsed.name || FALLBACK_FROM_NAME;
  const fromEmail = parsed.email || FALLBACK_FROM_EMAIL;
  const replyTo = process.env.RESEND_REPLY_TO?.trim() || FALLBACK_REPLY_TO;

  return {
    fromName,
    fromEmail,
    replyTo,
    from: formatAddress(fromName, fromEmail),
    source: 'env',
  };
}

/**
 * Resolve the sender identity: database row first, env for anything it does not
 * supply. Cached for 60 seconds. Never throws.
 */
export async function resolveSenderConfig(): Promise<SenderConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const envConfig = resolveFromEnv();

  try {
    const row = await prisma.$transaction(async (tx) => {
      // @bypass_rls reason: NotificationEmailConfig is a global singleton with
      // no tenant column; the send path runs outside any tenant context.
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.notificationEmailConfig.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { fromName: true, fromEmail: true, replyTo: true },
      });
    });

    // Field-by-field fallback, not row-or-nothing: a row with a blank replyTo
    // should still contribute its fromName.
    const fromName = row?.fromName?.trim() || envConfig.fromName;
    const fromEmail = row?.fromEmail?.trim() || envConfig.fromEmail;
    const replyTo = row?.replyTo?.trim() || envConfig.replyTo;

    const value: SenderConfig = {
      fromName,
      fromEmail,
      replyTo,
      from: formatAddress(fromName, fromEmail),
      source: row ? 'database' : 'env',
    };

    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (err) {
    // `logger.error(message, error, context)` — the error goes SECOND (DEC-11 §3).
    logger.error('[email] sender config read failed; falling back to env', err, {
      error: serializeError(err),
    });
    // Cache the fallback too, so a persistent DB problem does not produce one
    // failed query per email sent.
    cached = { value: envConfig, expiresAt: now + CACHE_TTL_MS };
    return envConfig;
  }
}

/** Test seam. Not called by application code. */
export function __clearSenderConfigCache(): void {
  cached = null;
}
