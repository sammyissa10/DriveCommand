/**
 * Template rendering pipeline for the notification dispatcher.
 *
 * Flow: Tiptap blockJson -> raw HTML -> variable substitution -> DynamicTemplateEmail shell -> string
 *
 * Variable substitution happens AFTER Tiptap JSON->HTML conversion so that
 * {{var}} tokens in paragraph text are not altered by the HTML parser.
 */

import { generateHTML } from '@tiptap/html/server';
import StarterKit from '@tiptap/starter-kit';
import { render } from '@react-email/render';
import React from 'react';
import DynamicTemplateEmail from '@/emails/dynamic-template';

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

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
 * Full template render: Tiptap blockJson + payload variables -> final HTML string + subject.
 *
 * Steps:
 *   1. generateHTML(blockJson, [StarterKit]) — Tiptap JSON -> raw HTML
 *   2. substituteVariables(rawHtml, payload) — replace {{tokens}} in body
 *   3. substituteVariables(subject, payload) — replace {{tokens}} in subject
 *   4. render(<DynamicTemplateEmail bodyHtml={...} />) — wrap in React Email shell
 *
 * Returns { html, subjectFinal }.
 */
export async function renderTemplate(
  blockJson: unknown,
  payload: Record<string, string>,
  subject: string,
): Promise<{ html: string; subjectFinal: string }> {
  // Step 1: Tiptap JSON -> raw HTML
  // No try/catch here — if generateHTML throws, let it propagate.
  // The dispatcher's outer try/catch writes a FAILED audit row, and the
  // preview action surfaces the error to the iframe. Silently emitting
  // JSON-stringified blockJson is what caused quick-331.
  const rawHtml = generateHTML(blockJson as Parameters<typeof generateHTML>[0], [StarterKit]);

  // Step 2: Substitute variables in body HTML
  const bodyHtml = substituteVariables(rawHtml, payload);

  // Step 3: Substitute variables in subject
  const subjectFinal = substituteVariables(subject, payload);

  // Step 4: Wrap body HTML in React Email shell and render to string
  const html = await render(
    React.createElement(DynamicTemplateEmail, { bodyHtml }),
  );

  return { html, subjectFinal };
}
