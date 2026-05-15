'use client';

/*
 * FALLBACK: Using plain Tiptap (@tiptap/react + @tiptap/extension-mention) as the block editor.
 * The official React Email Editor (React Email team / email-builder) is not yet publicly released
 * as a standalone package. When it ships, the Mention extension can be replaced with its
 * built-in variable chip support. The storage format ({{name}} text nodes in Tiptap JSON)
 * is intentionally compatible with both approaches.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { VariablePicker } from './variable-picker';
import { SandboxedPreview } from './sandboxed-preview';
import type { VariableDef } from '@/lib/notifications/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlockEditorProps {
  template: {
    id: string;
    displayName: string;
    defaultSubject: string;
    defaultBlockJson: unknown;
    availableVariables: unknown; // cast to VariableDef[]
  };
  readOnly?: boolean;
  /**
   * Called when the user saves the template.
   * cachedHtml is produced by editor.getHTML() with mention spans post-processed
   * back to {{varName}} tokens — ready for the dispatcher's substituteVariables call.
   */
  onSave: (blockJson: unknown, subject: string, cachedHtml: string) => Promise<void> | void;
  onCancel: () => void;
  onRestoreDefault?: () => void;
}

// ---------------------------------------------------------------------------
// JSON walker helpers
// ---------------------------------------------------------------------------

type TiptapNode = {
  type: string;
  text?: string;
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

/**
 * Recursively walk Tiptap doc JSON and convert:
 *   { type: 'mention', attrs: { id: 'varName' } }  →  { type: 'text', text: '{{varName}}' }
 *
 * This normalises the editor JSON back to the plain-text {{token}} format
 * used by the dispatcher.
 */
function mentionsToPlainText(node: TiptapNode): TiptapNode {
  if (node.type === 'mention') {
    const id = node.attrs?.id as string | undefined;
    return { type: 'text', text: `{{${id ?? ''}}}` };
  }

  if (node.content && node.content.length > 0) {
    return {
      ...node,
      content: node.content.map(mentionsToPlainText),
    };
  }

  return node;
}

/**
 * Recursively walk Tiptap doc JSON and convert:
 *   { type: 'text', text: '...{{varName}}...' }  →  [text, mention, text, ...]
 *
 * Text nodes containing `{{varName}}` patterns are split into an array of
 * text and mention nodes so the editor renders them as styled chips.
 */
function plainTextToMentions(
  node: TiptapNode,
  vars: VariableDef[],
): TiptapNode | TiptapNode[] {
  if (node.type === 'text' && node.text) {
    const varNames = new Set(vars.map((v) => v.name));
    const pattern = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const parts: TiptapNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(node.text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', text: node.text.slice(lastIndex, match.index) });
      }
      const varName = match[1];
      if (varNames.has(varName)) {
        parts.push({
          type: 'mention',
          attrs: { id: varName, label: varName },
        });
      } else {
        // Unknown variable — keep as plain text
        parts.push({ type: 'text', text: match[0] });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < node.text.length) {
      parts.push({ type: 'text', text: node.text.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [node];
  }

  if (node.content && node.content.length > 0) {
    const newContent: TiptapNode[] = [];
    for (const child of node.content) {
      const result = plainTextToMentions(child, vars);
      if (Array.isArray(result)) {
        newContent.push(...result);
      } else {
        newContent.push(result);
      }
    }
    return { ...node, content: newContent };
  }

  return node;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BlockEditor({
  template,
  readOnly = false,
  onSave,
  onCancel,
  onRestoreDefault,
}: BlockEditorProps) {
  const vars = useMemo(
    () => (template.availableVariables as VariableDef[]) ?? [],
    [template.availableVariables],
  );

  const [subject, setSubject] = useState(template.defaultSubject);
  const [isSaving, setIsSaving] = useState(false);

  // Transform the stored plain-text JSON into mention nodes for the editor
  const initialContent = useMemo(() => {
    try {
      const transformed = plainTextToMentions(
        template.defaultBlockJson as TiptapNode,
        vars,
      );
      return Array.isArray(transformed) ? { type: 'doc', content: transformed } : transformed;
    } catch {
      return template.defaultBlockJson;
    }
  }, [template.defaultBlockJson, vars]);

  const editor = useEditor({
    editable: !readOnly,
    content: initialContent as object,
    extensions: [
      StarterKit,
      Mention.configure({
        // Disable the suggestion popup — we use the VariablePicker sidebar for insertion
        suggestion: {
          char: '',
          items: () => [],
          // Minimal render to avoid popup
          render: () => ({
            onStart: () => {},
            onUpdate: () => {},
            onKeyDown: () => false,
            onExit: () => {},
          }),
        },
        renderHTML({ node }) {
          return [
            'span',
            {
              class:
                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-blue-100 text-blue-700 mx-0.5',
              'data-mention': node.attrs.id,
            },
            `{{${node.attrs.id}}}`,
          ];
        },
      }),
    ],
  });

  // Sync readOnly prop changes to the editor — needed when parent switches
  // between readonly/editing modes without unmounting BlockEditor.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  const handleInsertVariable = useCallback(
    (name: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent({ type: 'mention', attrs: { id: name, label: name } })
        .run();
    },
    [editor],
  );

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setIsSaving(true);
    try {
      const rawJson = editor.getJSON();
      const cleanJson = mentionsToPlainText(rawJson as TiptapNode);

      // Get the browser-rendered HTML from the editor. The Mention extension's
      // renderHTML config produces <span data-mention="varName">{{varName}}</span>.
      // Post-process these spans back to bare {{varName}} tokens so the dispatcher's
      // substituteVariables can replace them during actual email sends.
      const rawHtml = editor.getHTML();
      const cachedHtml = rawHtml.replace(
        /<span[^>]+data-mention="([^"]+)"[^>]*>\{\{[^}]+\}\}<\/span>/g,
        '{{$1}}',
      );

      await onSave(cleanJson, subject, cachedHtml);
    } finally {
      setIsSaving(false);
    }
    onCancel();
  }, [editor, subject, onSave, onCancel]);

  // Live preview: get current editor HTML with mention spans post-processed to {{varName}}
  // so SandboxedPreview can substitute sample values client-side.
  const previewHtml = useMemo(() => {
    if (!editor) return '';
    try {
      const rawHtml = editor.getHTML();
      return rawHtml.replace(
        /<span[^>]+data-mention="([^"]+)"[^>]*>\{\{[^}]+\}\}<\/span>/g,
        '{{$1}}',
      );
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state]);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header: template name + subject input */}
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-gray-900">{template.displayName}</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Subject:</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={readOnly}
            placeholder="Email subject line"
            className="flex-1"
          />
        </div>
      </div>

      {/* Three-panel body */}
      <div className="flex flex-1 gap-3 min-h-0 overflow-hidden">
        {/* Left: Variable picker (hidden when readOnly) */}
        {!readOnly && (
          <div className="w-48 shrink-0 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
            <VariablePicker variables={vars} onInsert={handleInsertVariable} />
          </div>
        )}

        {/* Center: Tiptap editor */}
        <div className="flex-1 min-w-0 border border-gray-200 rounded-md overflow-y-auto">
          <EditorContent
            editor={editor}
            className={[
              'prose prose-sm max-w-none p-3 min-h-full',
              'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500',
              readOnly ? 'bg-gray-50 cursor-default' : 'bg-white',
            ].join(' ')}
          />
        </div>

        {/* Right: Sandboxed preview */}
        <div className="w-64 shrink-0 flex flex-col border border-gray-200 rounded-md p-2 bg-gray-50">
          <SandboxedPreview
            html={previewHtml}
            subject={subject}
            availableVariables={vars}
          />
        </div>
      </div>

      {/* Footer: action buttons */}
      {!readOnly && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
          <div>
            {onRestoreDefault && (
              <Button variant="ghost" size="sm" onClick={onRestoreDefault} type="button">
                Restore Default
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} type="button">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} type="button">
              {isSaving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
