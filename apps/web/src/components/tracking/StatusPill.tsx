import { cn } from '@/lib/utils';

export type StatusType = 'on-time' | 'delayed' | 'early' | 'at-risk' | 'no-route';

interface StatusPillProps {
  status: StatusType;
  className?: string;
}

const STATUS_CONFIG: Record<
  StatusType,
  { bg: string; text: string; label: string }
> = {
  'on-time': {
    bg: 'bg-status-success',
    text: 'text-status-success-foreground',
    label: 'On Time',
  },
  'delayed': {
    bg: 'bg-status-danger',
    text: 'text-status-danger-foreground',
    label: 'Delayed',
  },
  'early': {
    bg: 'bg-status-info',
    text: 'text-status-info-foreground',
    label: 'Early',
  },
  'at-risk': {
    bg: 'bg-status-warning',
    text: 'text-status-warning-foreground',
    label: 'At Risk',
  },
  'no-route': {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    label: 'No Route',
  },
};

export function StatusPill({ status, className }: StatusPillProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      role="status"
      aria-label={`Status: ${config.label}`}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
        className
      )}
    >
      {config.label}
    </span>
  );
}
