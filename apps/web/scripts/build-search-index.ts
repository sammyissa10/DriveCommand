/**
 * Build-time script to generate search index from feature registry.
 * Indexes only: slug, name, shortDescription, category — NOT full MDX content.
 * Run via: npm run build:search-index
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

// Import features directly (raw array, no Zod overhead at build time)
import { features } from '../src/lib/docs/feature-registry';

interface SearchEntry {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  portal: string;
  planTier: string;
  route: string;
}

const searchIndex: SearchEntry[] = features
  .filter((f) => f.requiresClientDoc && f.portal !== 'admin')
  .map((f) => ({
    slug: f.slug,
    name: f.name,
    shortDescription: f.shortDescription,
    category: f.category,
    portal: f.portal,
    planTier: f.planTier,
    route: f.route,
  }));

const outputPath = join(__dirname, '../src/lib/docs/search-index.json');
writeFileSync(outputPath, JSON.stringify(searchIndex, null, 2));

console.log(`Search index built: ${searchIndex.length} entries -> ${outputPath}`);
