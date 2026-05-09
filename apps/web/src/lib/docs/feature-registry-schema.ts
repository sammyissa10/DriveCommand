import { z } from 'zod';

/**
 * Portal types — where the feature is accessible
 */
export const portalSchema = z.enum(['owner', 'driver', 'admin', 'shared']);
export type Portal = z.infer<typeof portalSchema>;

/**
 * Feature categories — logical grouping for navigation and filtering
 */
export const categorySchema = z.enum([
  'fleet',
  'dispatch',
  'finance',
  'crm',
  'compliance',
  'ai',
  'reporting',
  'integrations',
  'admin',
  'support',
  'settings',
  'workflows',
]);
export type Category = z.infer<typeof categorySchema>;

/**
 * Plan tiers — feature availability by subscription level
 */
export const planTierSchema = z.enum([
  'free',
  'starter',
  'pro',
  'business',
  'enterprise',
]);
export type PlanTier = z.infer<typeof planTierSchema>;

/**
 * Feature status — lifecycle stage
 */
export const statusSchema = z.enum(['stable', 'beta', 'deprecated', 'planned']);
export type Status = z.infer<typeof statusSchema>;

/**
 * Slug validation — lowercase kebab-case only
 */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "Slug must be lowercase kebab-case (e.g., 'load-management')",
  });

/**
 * Feature schema — validated at module load time
 */
export const FeatureSchema = z.object({
  slug: slugSchema,
  name: z.string(),
  shortDescription: z.string().max(160),
  portal: portalSchema,
  category: categorySchema,
  planTier: planTierSchema,
  status: statusSchema,
  route: z.string().startsWith('/'),
  addedInVersion: z.string().regex(/^\d+\.\d+\.\d+$/, {
    message: 'Must be semantic version (e.g., "1.0.0")',
  }),
  lastDocReviewedAt: z.string().datetime(),
  relatedFeatureSlugs: z.array(z.string()),
  requiresClientDoc: z.boolean().default(true),
  requiresSysadminDoc: z.boolean().default(true),
  serverActionPaths: z.array(z.string()).optional(),
  prismaModels: z.array(z.string()).optional(),
});

export type Feature = z.infer<typeof FeatureSchema>;
