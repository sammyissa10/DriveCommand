import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type StopState = 'completed' | 'current' | 'upcoming' | 'skipped';
type StopType = 'pickup' | 'delivery' | 'fuel' | 'weigh';

interface RouteStopProps {
  state: StopState;
  type: StopType;
  label?: string;
  isFirst?: boolean;
  isLast?: boolean;
}

const STATE_CONFIG: Record<
  StopState,
  { circle: string; dot: string; line: string; animate?: boolean }
> = {
  completed: {
    circle: 'bg-green-500',
    dot: '',
    line: 'bg-green-500',
  },
  current: {
    circle: 'bg-blue-500',
    dot: 'bg-blue-500',
    line: 'bg-gray-300',
    animate: true,
  },
  upcoming: {
    circle: 'border-2 border-gray-300 bg-white',
    dot: '',
    line: 'bg-gray-300',
  },
  skipped: {
    circle: 'bg-gray-400',
    dot: '',
    line: 'bg-gray-300',
  },
};

export function RouteStop({
  state,
  type,
  label,
  isFirst,
  isLast,
}: RouteStopProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="relative flex items-center">
      {/* Connecting line before (if not first) */}
      {!isFirst && (
        <div className={cn('absolute right-[50%] w-8 h-0.5 -translate-x-full', config.line)} />
      )}

      {/* Circle marker */}
      <div className="relative z-10 flex items-center justify-center">
        <div
          className={cn(
            'w-4 h-4 rounded-full flex items-center justify-center',
            config.circle
          )}
        >
          {state === 'completed' && (
            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          )}
          {state === 'current' && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>

        {/* Pulsing ring for current stop */}
        {state === 'current' && config.animate && (
          <div className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-75" />
        )}
      </div>

      {/* Connecting line after (if not last) */}
      {!isLast && (
        <div className={cn('absolute left-[50%] w-8 h-0.5 translate-x-full', config.line)} />
      )}

      {/* Optional label below */}
      {label && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      )}
    </div>
  );
}
