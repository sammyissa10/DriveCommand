'use client';

import type { VariableDef } from '@/lib/notifications/types';

interface SandboxedPreviewProps {
  /** Pre-rendered cached HTML from editor.getHTML() with {{var}} tokens intact. */
  html: string;
  subject: string;
  availableVariables: VariableDef[];
}

/**
 * Inline substituteVariables — mirrors the server-side version in template-renderer.ts.
 * DO NOT import the server renderer module here; this is a 'use client' component.
 */
function substituteVariables(text: string, payload: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name) =>
    Object.prototype.hasOwnProperty.call(payload, name) ? payload[name] : '',
  );
}

/**
 * Live sandboxed preview of a notification template.
 *
 * Renders synchronously by substituting sample variable values into the cached
 * HTML and writing the result to an iframe srcDoc.
 *
 * No Server Action call — that was the root cause of the production 500
 * (quick-task-335): the old renderNotificationTemplatePreview action invoked
 * Tiptap generateHTML on the server, where the RSC bundler had promoted Tiptap
 * extension symbols to Client References.
 */
export function SandboxedPreview({ html, availableVariables }: SandboxedPreviewProps) {
  // Build a sample payload from sampleValue of each variable definition
  const samplePayload: Record<string, string> = {};
  for (const v of availableVariables) {
    samplePayload[v.name] = v.sampleValue;
  }

  // Client-side variable substitution — dispatcher.substituteVariables runs the
  // identical regex server-side when sending real emails
  const substituted = substituteVariables(html, samplePayload);

  return (
    <div className="flex flex-col h-full">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Preview
      </p>
      <iframe
        sandbox="allow-same-origin"
        srcDoc={substituted || '<p style="padding:1rem;color:#999;">Preview will appear here</p>'}
        style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
        title="Template preview"
      />
    </div>
  );
}
