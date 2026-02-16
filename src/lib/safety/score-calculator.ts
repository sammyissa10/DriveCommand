/**
 * Safety Score Calculator
 *
 * Converts safety event counts by severity into a 0-100 safety score.
 * Lower score = more safety events. Score of 100 = no safety events.
 */

import { SafetyEventSeverity } from '@/generated/prisma';

/**
 * Severity weights: penalty points per event
 * - LOW: 1 point
 * - MEDIUM: 2 points
 * - HIGH: 4 points
 * - CRITICAL: 8 points
 */
export const SEVERITY_WEIGHTS: Record<SafetyEventSeverity, number> = {
  [SafetyEventSeverity.LOW]: 1,
  [SafetyEventSeverity.MEDIUM]: 2,
  [SafetyEventSeverity.HIGH]: 4,
  [SafetyEventSeverity.CRITICAL]: 8,
};

/**
 * Calculate safety score from event counts by severity
 *
 * @param eventCounts - Count of events for each severity level
 * @returns Safety score from 0-100 (100 = best, 0 = worst)
 *
 * @example
 * calculateSafetyScore({ LOW: 5, MEDIUM: 2, HIGH: 1, CRITICAL: 0 })
 * // Returns 87 (100 - (5*1 + 2*2 + 1*4 + 0*8) = 100 - 13 = 87)
 */
export function calculateSafetyScore(
  eventCounts: Record<SafetyEventSeverity, number>
): number {
  let totalPenalty = 0;

  for (const severity of Object.values(SafetyEventSeverity)) {
    const count = eventCounts[severity] || 0;
    const weight = SEVERITY_WEIGHTS[severity];
    totalPenalty += count * weight;
  }

  // Score = 100 - total penalty, clamped to 0-100
  return Math.max(0, Math.round(100 - totalPenalty));
}

/**
 * Get Tailwind text color class for safety score
 *
 * @param score - Safety score from 0-100
 * @returns Tailwind text color class
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Get human-readable label for safety score
 *
 * @param score - Safety score from 0-100
 * @returns Label string (Excellent, Good, Needs Improvement, Poor)
 */
export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor';
}
