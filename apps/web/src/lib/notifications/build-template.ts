/**
 * Builds a valid Tiptap document JSON for default notification templates.
 *
 * Tiptap doc shape: { type: "doc", content: [<block>...] }
 * Supported blocks here: heading (h2), paragraph with optional inline {{vars}},
 * a CTA paragraph rendered as a link, and a small footer paragraph.
 *
 * Inline `{{varName}}` strings stay as literal text — the dispatcher substitutes
 * them at send time AFTER Tiptap JSON is converted to HTML. This means a single
 * paragraph can contain multiple variables without special mention nodes.
 */
export type BuildDefaultTemplateInput = {
  headerText: string;
  paragraphTextWithVars: string;   // may contain {{varName}} segments
  ctaLabel?: string;
  ctaUrl?: string;                 // may contain {{varName}}
  footerNote?: string;
};

export function buildDefaultTemplate(input: BuildDefaultTemplateInput) {
  const content: unknown[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: input.headerText }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: input.paragraphTextWithVars }],
    },
  ];

  if (input.ctaLabel && input.ctaUrl) {
    content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: input.ctaLabel,
          marks: [{ type: 'link', attrs: { href: input.ctaUrl, target: '_blank' } }],
        },
      ],
    });
  }

  if (input.footerNote) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: input.footerNote }],
    });
  }

  return { type: 'doc', content };
}
