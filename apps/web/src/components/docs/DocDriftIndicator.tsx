import { features } from '@/lib/docs/feature-registry';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import fs from 'node:fs';
import path from 'node:path';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const DOCS_ROOT = path.join(process.cwd(), '../../docs-content');

export async function DocDriftIndicator() {
  const missingDocs: string[] = [];
  const staleDocs: string[] = [];

  // Check each stable/beta feature for required docs
  for (const feature of features) {
    if (feature.status !== 'stable' && feature.status !== 'beta') {
      continue;
    }

    // Check client doc
    if (feature.requiresClientDoc) {
      const clientPath = path.join(DOCS_ROOT, 'client', `${feature.slug}.mdx`);
      if (!fs.existsSync(clientPath)) {
        missingDocs.push(`${feature.slug} (client)`);
      }
    }

    // Check sysadmin doc
    if (feature.requiresSysadminDoc) {
      const sysadminPath = path.join(DOCS_ROOT, 'sysadmin', `${feature.slug}.mdx`);
      if (!fs.existsSync(sysadminPath)) {
        missingDocs.push(`${feature.slug} (sysadmin)`);
      }
    }

    // Check staleness
    const lastReviewed = new Date(feature.lastDocReviewedAt);
    const now = new Date();
    const ageMs = now.getTime() - lastReviewed.getTime();

    if (ageMs > NINETY_DAYS_MS) {
      staleDocs.push(feature.slug);
    }
  }

  // Determine status
  if (missingDocs.length > 0) {
    return (
      <Badge variant="destructive" className="flex items-center gap-2">
        <XCircle className="h-4 w-4" />
        {missingDocs.length} missing doc{missingDocs.length !== 1 ? 's' : ''}
      </Badge>
    );
  }

  if (staleDocs.length > 0) {
    return (
      <Badge variant="secondary" className="flex items-center gap-2 bg-yellow-500/10 text-yellow-700 dark:text-yellow-500">
        <AlertCircle className="h-4 w-4" />
        {staleDocs.length} stale doc{staleDocs.length !== 1 ? 's' : ''}
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="flex items-center gap-2 bg-green-500/10 text-green-700 dark:text-green-500">
      <CheckCircle className="h-4 w-4" />
      All docs in sync
    </Badge>
  );
}
