import { useState, useEffect } from 'react';
import type { ChecklistStatusData } from '@/components/carrier/dashboard/dashboard.types';

/**
 * Hook for fetching checklist status data for dashboard triage widget.
 *
 * TODO: Connect to real API endpoint when checklist backend is implemented.
 * The endpoint should aggregate:
 * - Overdue: Checklist instances past their due date
 * - Due Today: Checklist instances due today (pre-trips, post-trips, inspections)
 * - Expiring Soon: Compliance documents expiring in the next 14 days
 *   (driver licenses, medical cards, insurance policies)
 *
 * Expected endpoint: GET /api/v1/carrier/dashboard/checklist-status
 */
export function useChecklistStatus(): {
  data: ChecklistStatusData;
  loading: boolean;
  error: Error | null;
} {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // TODO: Replace stub data with actual API call when backend is ready
  // Example implementation:
  //
  // useEffect(() => {
  //   fetch('/api/v1/carrier/dashboard/checklist-status')
  //     .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch')))
  //     .then((json) => setData(json))
  //     .catch((err) => setError(err))
  //     .finally(() => setLoading(false));
  // }, []);

  useEffect(() => {
    // Simulate brief loading state for UI consistency
    const timer = setTimeout(() => {
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // Stub data — all zeros until real backend is wired
  const data: ChecklistStatusData = {
    overdueCount: 0,
    overdueContext: 'All clear',
    dueTodayCount: 0,
    dueTodayContext: 'Pre-trips, post-trips, and inspections',
    expiringCount: 0,
    expiringContext: 'Licenses, medical cards, insurance',
  };

  return { data, loading, error };
}
