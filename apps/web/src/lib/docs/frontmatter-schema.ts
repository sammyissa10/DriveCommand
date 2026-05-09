import { z } from 'zod';

/**
 * Frontmatter schema for client-facing Help Center documentation
 */
export const clientFrontmatterSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case (lowercase letters, numbers, hyphens only)'),
  title: z.string().min(1),
  summary: z.string().max(300),
  lastReviewed: z.string().datetime(),
  estimatedReadMinutes: z.number().int().min(1).max(60),
  videoUrl: z.string().url().optional(),
});

/**
 * Frontmatter schema for sysadmin technical documentation
 * Extends client schema with engineering-specific fields
 */
export const sysadminFrontmatterSchema = clientFrontmatterSchema.extend({
  engineeringOwner: z.string(),
  runbookUrl: z.string().url().optional(),
  securityNotes: z.array(z.string()).optional(),
});

export type ClientFrontmatter = z.infer<typeof clientFrontmatterSchema>;
export type SysadminFrontmatter = z.infer<typeof sysadminFrontmatterSchema>;
