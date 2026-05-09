import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { features } from './feature-registry';

const DOCS_ROOT = path.resolve(process.cwd(), '../../docs-content');
const OPERATIONAL_DOCS_ROOT = path.resolve(process.cwd(), 'docs');
const OUTPUT_PATH = path.resolve(process.cwd(), '.docs-data/admin-docs-search-index.json');

interface SearchIndexEntry {
  slug: string;
  name?: string;
  title?: string;
  shortDescription?: string;
  summary?: string;
  category?: string;
  portal?: string;
  planTier?: string;
  route?: string;
  type: 'feature' | 'sysadmin-doc' | 'operations-doc';
}

/**
 * Build search index for admin documentation
 * Includes: features from registry, sysadmin MDX files, operational markdown docs
 */
export function buildAdminSearchIndex(): SearchIndexEntry[] {
  const index: SearchIndexEntry[] = [];

  // 1. Add all features from registry
  for (const feature of features) {
    index.push({
      slug: feature.slug,
      name: feature.name,
      shortDescription: feature.shortDescription,
      category: feature.category,
      portal: feature.portal,
      planTier: feature.planTier,
      route: feature.route,
      type: 'feature',
    });
  }

  // 2. Add sysadmin MDX docs
  const sysadminDocsPath = path.join(DOCS_ROOT, 'sysadmin');
  if (fs.existsSync(sysadminDocsPath)) {
    const sysadminFiles = fs.readdirSync(sysadminDocsPath).filter((f) => f.endsWith('.mdx'));

    for (const filename of sysadminFiles) {
      const slug = filename.replace('.mdx', '');
      if (slug.startsWith('_')) continue; // Skip templates

      const filePath = path.join(sysadminDocsPath, filename);
      const source = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(source);

      index.push({
        slug,
        title: data.title || slug,
        summary: data.summary || '',
        type: 'sysadmin-doc',
      });
    }
  }

  // 3. Add operational docs (apps/web/docs/*.md)
  if (fs.existsSync(OPERATIONAL_DOCS_ROOT)) {
    const operationalFiles = fs
      .readdirSync(OPERATIONAL_DOCS_ROOT)
      .filter((f) => f.endsWith('.md') && f !== 'README.md');

    for (const filename of operationalFiles) {
      const slug = filename.replace('.md', '');
      const filePath = path.join(OPERATIONAL_DOCS_ROOT, filename);
      const source = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(source);

      // Extract title and summary
      let title = data.title || '';
      let summary = data.summary || '';

      if (!title) {
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match) title = h1Match[1];
      }

      if (!summary) {
        const paragraphMatch = content.match(/\n\n([A-Z][^.\n]+[.!?])/);
        if (paragraphMatch) summary = paragraphMatch[1];
      }

      index.push({
        slug,
        title: title || slug,
        summary: summary || '',
        type: 'operations-doc',
      });
    }
  }

  return index;
}

/**
 * Build and write search index to disk
 * Used during build time or on-demand
 */
export function writeAdminSearchIndex(): void {
  const index = buildAdminSearchIndex();

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write index
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`Admin search index written to ${OUTPUT_PATH} (${index.length} entries)`);
}

// If run directly, build and write index
if (require.main === module) {
  writeAdminSearchIndex();
}
