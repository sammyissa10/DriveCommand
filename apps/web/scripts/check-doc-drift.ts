#!/usr/bin/env tsx
/**
 * Doc-Drift CI Check
 *
 * Ensures all stable/beta features have required MDX documentation.
 * Exits 1 if docs are missing, exits 0 if only warnings or all good.
 *
 * Usage: npx tsx scripts/check-doc-drift.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { features } from '../src/lib/docs/feature-registry';

const DOCS_ROOT = path.resolve(process.cwd(), '../../docs-content');
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface MissingDoc {
  featureSlug: string;
  docType: 'client' | 'sysadmin';
  expectedPath: string;
}

interface StaleDoc {
  featureSlug: string;
  lastReviewed: string;
  daysAgo: number;
}

const missingDocs: MissingDoc[] = [];
const staleDocs: StaleDoc[] = [];

// Check each feature for required docs
for (const feature of features) {
  // Only check stable/beta features
  if (feature.status !== 'stable' && feature.status !== 'beta') {
    continue;
  }

  // Check client doc
  if (feature.requiresClientDoc) {
    const clientPath = path.join(DOCS_ROOT, 'client', `${feature.slug}.mdx`);
    if (!fs.existsSync(clientPath)) {
      missingDocs.push({
        featureSlug: feature.slug,
        docType: 'client',
        expectedPath: `docs-content/client/${feature.slug}.mdx`,
      });
    }
  }

  // Check sysadmin doc
  if (feature.requiresSysadminDoc) {
    const sysadminPath = path.join(DOCS_ROOT, 'sysadmin', `${feature.slug}.mdx`);
    if (!fs.existsSync(sysadminPath)) {
      missingDocs.push({
        featureSlug: feature.slug,
        docType: 'sysadmin',
        expectedPath: `docs-content/sysadmin/${feature.slug}.mdx`,
      });
    }
  }

  // Check staleness
  const lastReviewed = new Date(feature.lastDocReviewedAt);
  const now = new Date();
  const ageMs = now.getTime() - lastReviewed.getTime();
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  if (ageMs > NINETY_DAYS_MS) {
    staleDocs.push({
      featureSlug: feature.slug,
      lastReviewed: feature.lastDocReviewedAt,
      daysAgo: ageDays,
    });
  }
}

// Output results
console.log('Doc-Drift Check');
console.log('===============\n');

let hasErrors = false;

if (missingDocs.length > 0) {
  hasErrors = true;
  console.log(`ERRORS (${missingDocs.length} missing docs):`);
  for (const doc of missingDocs) {
    console.log(`- ${doc.expectedPath} (feature: ${doc.featureSlug})`);
  }
  console.log('');
}

if (staleDocs.length > 0) {
  console.log(`WARNINGS (${staleDocs.length} stale docs):`);
  for (const doc of staleDocs) {
    console.log(`- ${doc.featureSlug}: last reviewed ${doc.daysAgo} days ago`);
  }
  console.log('');
}

if (!hasErrors && staleDocs.length === 0) {
  const totalFeatures = features.filter(
    (f) => f.status === 'stable' || f.status === 'beta'
  ).length;
  console.log(`All ${totalFeatures} features have required documentation.`);
}

process.exit(hasErrors ? 1 : 0);
