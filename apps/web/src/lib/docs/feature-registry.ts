import { z } from 'zod';
import { FeatureSchema, type Feature } from './feature-registry-schema';

/**
 * Feature Registry — Single source of truth for user-facing features
 *
 * HOW TO ADD A NEW FEATURE:
 * 1. Append entry to `rawFeatures` array below with all required fields
 * 2. Create docs-content/client/{slug}.mdx (unless requiresClientDoc: false)
 * 3. Create docs-content/sysadmin/{slug}.mdx (unless requiresSysadminDoc: false)
 * 4. Open PR — CI will block if required docs are missing
 */

const rawFeatures = [
  {
    slug: 'load-management',
    name: 'Load Management',
    shortDescription:
      'Create, assign, and track loads with pickup/delivery stops, status workflow, and route assignment.',
    portal: 'owner',
    category: 'dispatch',
    planTier: 'pro',
    status: 'stable',
    route: '/owner/loads',
    addedInVersion: '1.0.0',
    lastDocReviewedAt: '2026-04-01T00:00:00Z',
    relatedFeatureSlugs: ['route-planning', 'driver-my-route'],
    requiresClientDoc: true,
    requiresSysadminDoc: true,
    serverActionPaths: ['src/actions/loads.ts'],
    prismaModels: ['Load', 'RouteStop'],
  },
  {
    slug: 'route-planning',
    name: 'Route Planning',
    shortDescription:
      'Multi-stop route creation with leg sequencing, continuity warnings, and driver assignment.',
    portal: 'owner',
    category: 'dispatch',
    planTier: 'pro',
    status: 'stable',
    route: '/owner/routes',
    addedInVersion: '1.0.0',
    lastDocReviewedAt: '2026-04-01T00:00:00Z',
    relatedFeatureSlugs: ['load-management'],
    requiresClientDoc: true,
    requiresSysadminDoc: true,
    serverActionPaths: ['src/actions/routes.ts'],
    prismaModels: ['Route', 'RouteStop'],
  },
  {
    slug: 'driver-my-route',
    name: 'Driver My Route',
    shortDescription:
      'Driver view of assigned route with loads timeline, truck info, and route-scoped messages.',
    portal: 'driver',
    category: 'dispatch',
    planTier: 'pro',
    status: 'stable',
    route: '/driver/my-route',
    addedInVersion: '2.0.0',
    lastDocReviewedAt: '2026-04-01T00:00:00Z',
    relatedFeatureSlugs: ['load-management'],
    requiresClientDoc: true,
    requiresSysadminDoc: true,
    serverActionPaths: ['src/app/api/mobile/driver/routes/route.ts'],
    prismaModels: ['Route', 'Load'],
  },
  {
    slug: 'ai-document-reader',
    name: 'AI Document Reader',
    shortDescription:
      'Anthropic Claude-powered extraction of structured data from rate confirmations and BOLs.',
    portal: 'owner',
    category: 'ai',
    planTier: 'business',
    status: 'stable',
    route: '/owner/ai-documents',
    addedInVersion: '3.0.0',
    lastDocReviewedAt: '2026-04-01T00:00:00Z',
    relatedFeatureSlugs: ['load-management'],
    requiresClientDoc: true,
    requiresSysadminDoc: true,
    serverActionPaths: ['src/actions/documents/ai-reader.ts'],
    prismaModels: ['Document'],
  },
  {
    slug: 'tenant-management',
    name: 'Tenant Management',
    shortDescription:
      'SysAdmin view of all tenant accounts with creation, editing, and status controls.',
    portal: 'admin',
    category: 'admin',
    planTier: 'enterprise',
    status: 'stable',
    route: '/sysadmin/tenants',
    addedInVersion: '1.0.0',
    lastDocReviewedAt: '2026-04-01T00:00:00Z',
    relatedFeatureSlugs: [],
    requiresClientDoc: false,
    requiresSysadminDoc: true,
    serverActionPaths: ['src/actions/admin/tenants.ts'],
    prismaModels: ['Tenant', 'User'],
  },
  {
    slug: 'support-tickets',
    name: 'Support Tickets',
    shortDescription:
      'In-app support ticket system with screenshot capture and file attachments.',
    portal: 'shared',
    category: 'support',
    planTier: 'free',
    status: 'stable',
    route: '/support',
    addedInVersion: '2.0.0',
    lastDocReviewedAt: '2026-04-01T00:00:00Z',
    relatedFeatureSlugs: [],
    requiresClientDoc: true,
    requiresSysadminDoc: true,
    serverActionPaths: ['src/actions/support.ts'],
    prismaModels: ['SupportTicket'],
  },
] as const;

// First-pass validation: Zod schema for all fields
const parsedFeatures = z.array(FeatureSchema).parse(rawFeatures);

// Second-pass validation: Check relatedFeatureSlugs references
const validSlugs = new Set(parsedFeatures.map((f) => f.slug));
const brokenReferences: Array<{ feature: string; invalidSlug: string }> = [];

for (const feature of parsedFeatures) {
  for (const relatedSlug of feature.relatedFeatureSlugs) {
    if (!validSlugs.has(relatedSlug)) {
      brokenReferences.push({
        feature: feature.slug,
        invalidSlug: relatedSlug,
      });
    }
  }
}

if (brokenReferences.length > 0) {
  const errorMessage = [
    'Invalid relatedFeatureSlugs references found:',
    ...brokenReferences.map(
      (ref) => `  - Feature "${ref.feature}" references non-existent slug "${ref.invalidSlug}"`
    ),
  ].join('\n');
  throw new Error(errorMessage);
}

export const features: Feature[] = parsedFeatures;
