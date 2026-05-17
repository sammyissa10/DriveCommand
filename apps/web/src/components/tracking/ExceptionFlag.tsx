import { AlertTriangle, Construction, Clock, Wrench, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ExceptionType = 'weather' | 'traffic' | 'detention' | 'mechanical' | 'other';

interface ExceptionFlagProps {
  type: ExceptionType;
  className?: string;
}

const EXCEPTION_CONFIG: Record<
  ExceptionType,
  { icon: typeof AlertTriangle; label: string }
> = {
  weather: { icon: AlertTriangle, label: 'Weather' },
  traffic: { icon: Construction, label: 'Traffic' },
  detention: { icon: Clock, label: 'Detention' },
  mechanical: { icon: Wrench, label: 'Mechanical' },
  other: { icon: AlertCircle, label: 'Exception' },
};

export function ExceptionFlag({ type, className }: ExceptionFlagProps) {
  const config = EXCEPTION_CONFIG[type];
  const Icon = config.icon;

  return (
    <span
      role="status"
      aria-label={`Exception: ${config.label}`}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        'bg-status-danger-bg text-status-danger',
        className
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      <span>{config.label}</span>
    </span>
  );
}
