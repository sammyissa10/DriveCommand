import { features } from './feature-registry';
import type { Feature, Portal, Category, PlanTier } from './feature-registry-schema';

/**
 * Pure synchronous read helpers for feature registry
 * No React, no Next.js APIs — can be imported anywhere
 */

/**
 * Get all features
 */
export function getAllFeatures(): Feature[] {
  return features;
}

/**
 * Get feature by slug
 */
export function getFeatureBySlug(slug: string): Feature | undefined {
  return features.find((f) => f.slug === slug);
}

/**
 * Get features by portal
 */
export function getFeaturesByPortal(portal: Portal): Feature[] {
  return features.filter((f) => f.portal === portal || f.portal === 'shared');
}

/**
 * Get features by category
 */
export function getFeaturesByCategory(category: Category): Feature[] {
  return features.filter((f) => f.category === category);
}

/**
 * Get features by plan tier (inclusive — returns features at or below the tier)
 */
export function getFeaturesByPlan(plan: PlanTier): Feature[] {
  const tierOrder: PlanTier[] = ['free', 'starter', 'pro', 'business', 'enterprise'];
  const planIndex = tierOrder.indexOf(plan);

  return features.filter((f) => {
    const featureIndex = tierOrder.indexOf(f.planTier);
    return featureIndex <= planIndex;
  });
}

/**
 * Get related features for a given feature slug
 */
export function getRelatedFeatures(slug: string): Feature[] {
  const feature = getFeatureBySlug(slug);
  if (!feature) {
    return [];
  }

  return feature.relatedFeatureSlugs
    .map((relatedSlug) => getFeatureBySlug(relatedSlug))
    .filter((f): f is Feature => f !== undefined);
}
