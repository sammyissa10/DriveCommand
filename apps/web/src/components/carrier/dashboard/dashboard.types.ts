/**
 * Checklist Status Widget Types
 *
 * These types define the data shape for the dashboard's checklist triage widget.
 * The widget provides a quick operational overview of compliance status.
 */

export interface ChecklistStatusData {
  /** Count of overdue checklists/tasks */
  overdueCount: number;
  /** Human-readable context, e.g., "3 pre-trips not completed" or "All clear" */
  overdueContext: string;

  /** Count of items due today */
  dueTodayCount: number;
  /** Human-readable context, e.g., "Pre-trips, post-trips, and inspections" */
  dueTodayContext: string;

  /** Count of compliance items expiring in next 14 days */
  expiringCount: number;
  /** Human-readable context, e.g., "Licenses, medical cards, insurance" */
  expiringContext: string;
}

export interface ChecklistStatusCardProps {
  /** Card title displayed at top (uppercase) */
  title: string;
  /** Large count number displayed prominently */
  count: number;
  /** Descriptive subtitle below the count */
  subtitle: string;
  /** Visual status affects count number color: overdue (red), dueToday (amber), expiring (neutral) */
  status: 'overdue' | 'dueToday' | 'expiring';
  /** Navigation URL when card is clicked */
  href: string;
  /** Optional Lucide icon component displayed top-right */
  icon?: React.ComponentType<{ className?: string }>;
}
