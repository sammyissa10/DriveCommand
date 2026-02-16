import { z } from 'zod';

/**
 * Schema for creating a new tag.
 */
export const createTagSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50, 'Tag name must be 50 characters or less'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color (e.g., #3b82f6)'),
});

/**
 * Schema for assigning a tag to a truck or user.
 * Exactly one of truckId or userId must be provided.
 */
export const assignTagSchema = z
  .object({
    tagId: z.string().uuid('Tag ID must be a valid UUID'),
    truckId: z.string().uuid('Truck ID must be a valid UUID').optional(),
    userId: z.string().uuid('User ID must be a valid UUID').optional(),
  })
  .refine((data) => {
    // Ensure exactly one of truckId or userId is provided
    const hasTruckId = !!data.truckId;
    const hasUserId = !!data.userId;
    return (hasTruckId && !hasUserId) || (!hasTruckId && hasUserId);
  }, {
    message: 'Must provide exactly one of truckId or userId',
  });

/**
 * Preset color palette for tags.
 * Common Tailwind CSS colors for consistent UI.
 */
export const PRESET_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // green-500
  '#ef4444', // red-500
  '#f59e0b', // yellow-500
  '#8b5cf6', // purple-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
];
