import 'server-only';

import { compileMDX } from 'next-mdx-remote/rsc';
import matter from 'gray-matter';
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { sysadminComponents } from '@/components/docs/mdx-components';

const DOCS_ROOT = path.join(process.cwd(), 'docs');

interface OperationalDoc {
  slug: string;
  title: string;
  summary: string;
  content: React.ReactElement;
}

/**
 * Render operational markdown documentation
 * @param slug - Document slug (filename without .md extension)
 * @returns Parsed title, summary, and rendered MDX content
 * @throws Error if file not found
 */
export async function renderOperationalMd(slug: string): Promise<OperationalDoc> {
  const filePath = path.join(DOCS_ROOT, `${slug}.md`);

  // Read file
  let source: string;
  try {
    source = await readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Operational doc not found: ${filePath}`);
    }
    throw error;
  }

  // Parse frontmatter (if any)
  const { data, content } = matter(source);

  // Extract title and summary from content if not in frontmatter
  let title = data.title || '';
  let summary = data.summary || '';

  if (!title || !summary) {
    // Extract first H1 for title
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match && !title) {
      title = h1Match[1];
    }

    // Extract first paragraph for summary
    const paragraphMatch = content.match(/\n\n([A-Z][^.\n]+[.!?])/);
    if (paragraphMatch && !summary) {
      summary = paragraphMatch[1];
    }
  }

  // Compile MDX (markdown is a valid MDX subset)
  const { content: mdxContent } = await compileMDX({
    source: content,
    components: sysadminComponents,
    options: {
      mdxOptions: {
        rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]],
      },
    },
  });

  return {
    slug,
    title: title || slug,
    summary: summary || 'No summary available',
    content: mdxContent,
  };
}

/**
 * Get list of all operational docs
 * @returns Array of doc metadata (slug, title, summary)
 */
export async function getOperationalDocs(): Promise<
  Array<{ slug: string; title: string; summary: string }>
> {
  const files = await readdir(DOCS_ROOT);

  const docs = await Promise.all(
    files
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map(async (filename) => {
        const slug = filename.replace('.md', '');
        try {
          const doc = await renderOperationalMd(slug);
          return { slug, title: doc.title, summary: doc.summary };
        } catch (error) {
          console.error(`Error reading ${filename}:`, error);
          return {
            slug,
            title: slug,
            summary: 'Error loading summary',
          };
        }
      })
  );

  return docs;
}
