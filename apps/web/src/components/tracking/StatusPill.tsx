import { cn } from '@/lib/utils';

type StatusType = 'on-time' | 'delayed' | 'early' | 'at-risk' | 'no-route';

interface StatusPillProps {
  status: StatusType;
  className?: string;
}

const STATUS_CONFIG: Record<
  StatusType,
  { bg: string; label: string }
> = {
  'on-time': { bg: 'bg-green-500', label: 'On Time' },
  'delayed': { bg: 'bg-red-500', label: 'Delayed' },
  'early': { bg: 'bg-blue-500', label: 'Early' },
  'at-risk': { bg: 'bg-amber-500', label: 'At Risk' },
  'no-route': { bg: 'bg-gray-400', label: 'No Route' },
};

export function StatusPill({ status, className }: StatusPillProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white',
        config.bg,
        className
      )}
    >
      {config.label}
    </span>
  );
}
