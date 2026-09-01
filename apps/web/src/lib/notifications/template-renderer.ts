/**
 * Template rendering pipeline for the notification dispatcher.
 *
 * Flow: cached HTML string -> variable substitution -> DynamicTemplateEmail shell -> string
 *
 * Tiptap is NOT invoked on the server. The cached HTML is produced at template
 * save time in the browser (block-editor.tsx -> editor.getHTML()) and persisted
 * to NotificationTemplate.defaultHtmlCache / TenantNotificationSettings.customHtmlCache.
 *
 * This decouples the server render path from React Server Component bundling
 * concerns — the Next 16 RSC graph was promoting Tiptap extension symbols to
 * Client References because the client editor imports the same packages.
 * Quick-task-335 moved rendering off the server entirely.
 */

import { render } from '@react-email/render';
import React from 'react';
import DynamicTemplateEmail, { derivePreheader } from '@/emails/dynamic-template';
import type { StatusTone } from '@/emails/_system';
import { transformBodyHtml } from './body-html-transform';
import { logger } from '@/lib/logger';

/**
 * Pure variable substitution.
 *
 * Replaces every `{{varName}}` token in `text` with the corresponding value
 * from `payload`. Tokens with no matching key are replaced with empty string
 * and a console.warn is emitted.
 *
 * Never throws — always returns a string.
 */
export function substituteVariables(
  text: string,
  payload: Record<string, string>,
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name) => {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      return payload[name];
    }
    console.warn(`[notifications] missing variable: ${name}`);
    return '';
  });
}

/**
 * Full template render: cached HTML + payload variables -> final HTML string + subject.
 *
 * Steps:
 *   1. substituteVariables(cachedHtml, payload) — replace {{tokens}} in body HTML
 *   2. substituteVariables(subject, payload) — replace {{tokens}} in subject
 *   3. render(<DynamicTemplateEmail bodyHtml={...} />) — wrap in React Email shell
 *
 * Returns { html, subjectFinal }.
 */
export async function renderTemplate(
  cachedHtml: string,
  payload: Record<string, string>,
  subject: string,
  /**
   * Optional presentation options threaded straight through to the shell.
   *
   * Every field is optional and nothing here changes what is SENT — the
   * subject and the body HTML are computed exactly as before. This exists so a
   * caller that knows something the body does not (that a trip is unstarted,
   * where the recipient can change their preferences) can say so, rather than
   * the shell guessing.
   */
  options?: {
    /** Only used to label the transform log line. */
    triggerKey?: string;
    preheader?: string;
    statusBar?: { tone: StatusTone; label: string };
    accentColor?: string;
    preferencesUrl?: string;
  },
): Promise<{ html: string; subjectFinal: string }> {
  const substituted = substituteVariables(cachedHtml, payload);
  const subjectFinal = substituteVariables(subject, payload);

  // Post-processing runs AFTER substitution so the transforms see final text —
  // a greeting only looks like a greeting once {{driverName}} is a real name.
  const { html: bodyHtml, notes } = transformBodyHtml(substituted);
  if (notes.length > 0) {
    logger.debug('[notifications] body transforms applied', {
      triggerKey: options?.triggerKey,
      notes,
    });
  }
  const html = await render(
    React.createElement(DynamicTemplateEmail, {
      bodyHtml,
      // Derived from the PRE-transform HTML on purpose: the CTA upgrade appends
      // the destination URL as visible text, and that URL must never leak into
      // the inbox preview line.
      preheader: options?.preheader ?? derivePreheader(substituted),
      statusBar: options?.statusBar,
      accentColor: options?.accentColor,
      preferencesUrl: options?.preferencesUrl,
    }),
  );
  return { html, subjectFinal };
}
