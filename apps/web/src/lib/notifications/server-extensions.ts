/**
 * Server-only Tiptap extensions for the notification template renderer.
 *
 * Why this file exists (quick-task-333):
 * Importing `@tiptap/starter-kit` directly into the server-side renderer caused
 * a 500 with "Cannot access level on the server. You cannot dot into a temporary
 * client reference from a server component" — ProseMirror was reading the
 * Heading extension's `level` attr off a React Client Reference instead of the
 * real extension object. The StarterKit barrel export interacts badly with the
 * RSC bundler graph because the same barrel is used by the client editor
 * (`components/notifications/block-editor.tsx` — `'use client'`).
 *
 * Fix: import individual Tiptap extension packages here, never the barrel.
 * This file MUST stay free of 'use client', React component imports, and any
 * transitive client references.
 *
 * Variable placeholders `{{varName}}` are preserved as literal text — the
 * `mention` node is NOT registered here because the editor normalises mentions
 * back to plain `{{name}}` text via `mentionsToPlainText` before saving JSON.
 */

import type { Extensions } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import HardBreak from '@tiptap/extension-hard-break';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';

/**
 * Minimal server-safe Tiptap extensions array.
 * Matches the subset of StarterKit that buildDefaultTemplate emits (heading,
 * paragraph, text, link marks) plus common safe extensions (bold/italic/lists/
 * hardBreak) that admins might add via the client editor.
 */
export const serverExtensions: Extensions = [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [1, 2, 3] }),
  Bold,
  Italic,
  Link.configure({ openOnClick: false, autolink: false }),
  HardBreak,
  BulletList,
  OrderedList,
  ListItem,
];
