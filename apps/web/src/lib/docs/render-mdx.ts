import 'server-only';

import { compileMDX } from 'next-mdx-remote/rsc';
import matter from 'gray-matter';
import { readFile } from 'fs/promises';
import path from 'path';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkGfm from 'remark-gfm';

import {
  clientFrontmatterSchema,
  sysadminFrontmatterSchema,
  type ClientFrontmatter,
  type SysadminFrontmatter,
} from './frontmatter-schema';
import { clientComponents, sysadminComponents } from '@/components/docs/mdx-components';
import { getFeatureBySlug } from './get-features';

// docs-content is at monorepo root, not inside apps/web
const DOCS_ROOT = path.resolve(process.cwd(), '..', '..', 'docs-content');

interface RenderResult<T> {
  frontmatter: T;
  content: React.ReactElement;
  feature: Awaited<ReturnType<typeof getFeatureBySlug>>;
}

/**
 * Render client-facing Help Center documentation
 * @param slug - Document slug (filename without .mdx extension)
 * @returns Parsed frontmatter, rendered MDX content, and feature registry entry
 * @throws Error if file not found, frontmatter invalid, or feature not in registry
 */
export async function renderClientDoc(
  slug: string
): Promise<RenderResult<ClientFrontmatter>> {
  const filePath = path.join(DOCS_ROOT, 'client', `${slug}.mdx`);

  // Read file
  let source: string;
  try {
    source = await readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Doc file not found: ${filePath}`);
    }
    throw error;
  }

  // Parse frontmatter
  const { data, content } = matter(source);

  // Validate frontmatter
  const validationResult = clientFrontmatterSchema.safeParse(data);
  if (!validationResult.success) {
    const errors = validationResult.error.issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid frontmatter in ${slug}: ${errors}`);
  }

  const frontmatter = validationResult.data;

  // Cross-check with feature registry
  const feature = await getFeatureBySlug(frontmatter.slug);
  if (!feature) {
    throw new Error(`Feature slug '${frontmatter.slug}' not found in registry`);
  }

  // Compile MDX
  const { content: mdxContent } = await compileMDX({
    source: content,
    components: clientComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: 'wrap' }],
        ],
      },
    },
  });

  return {
    frontmatter,
    content: mdxContent,
    feature,
  };
}

/**
 * Render sysadmin technical documentation
 * @param slug - Document slug (filename without .mdx extension)
 * @returns Parsed frontmatter, rendered MDX content, and feature registry entry
 * @throws Error if file not found, frontmatter invalid, or feature not in registry
 */
export async function renderSysadminDoc(
  slug: string
): Promise<RenderResult<SysadminFrontmatter>> {
  const filePath = path.join(DOCS_ROOT, 'sysadmin', `${slug}.mdx`);

  // Read file
  let source: string;
  try {
    source = await readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Doc file not found: ${filePath}`);
    }
    throw error;
  }

  // Parse frontmatter
  const { data, content } = matter(source);

  // Validate frontmatter
  const validationResult = sysadminFrontmatterSchema.safeParse(data);
  if (!validationResult.success) {
    const errors = validationResult.error.issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid frontmatter in ${slug}: ${errors}`);
  }

  const frontmatter = validationResult.data;

  // Cross-check with feature registry
  const feature = await getFeatureBySlug(frontmatter.slug);
  if (!feature) {
    throw new Error(`Feature slug '${frontmatter.slug}' not found in registry`);
  }

  // Compile MDX
  const { content: mdxContent } = await compileMDX({
    source: content,
    components: sysadminComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: 'wrap' }],
        ],
      },
    },
  });

  return {
    frontmatter,
    content: mdxContent,
    feature,
  };
}
