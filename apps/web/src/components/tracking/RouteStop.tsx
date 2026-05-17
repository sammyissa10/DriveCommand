import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type StopState = 'completed' | 'current' | 'upcoming' | 'skipped';
type StopType = 'pickup' | 'delivery' | 'fuel' | 'weigh';

interface RouteStopProps {
  state: StopState;
  type: StopType;
  label?: { city: string; time: string };
  isException?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

const STATE_CONFIG: Record<
  StopState,
  { circle: string; dot: string; line: string; animate?: boolean }
> = {
  completed: {
    circle: 'bg-status-success',
    dot: '',
    line: 'bg-status-success',
  },
  current: {
    circle: 'bg-status-info',
    dot: 'bg-status-info',
    line: 'bg-n-300',
    animate: true,
  },
  upcoming: {
    circle: 'border-2 border-n-300 bg-background',
    dot: '',
    line: 'bg-n-300',
  },
  skipped: {
    circle: 'bg-n-400',
    dot: '',
    line: 'bg-n-300',
  },
};

export function RouteStop({
  state,
  type,
  label,
  isException = false,
  isFirst,
  isLast,
}: RouteStopProps) {
  const config = STATE_CONFIG[state];

  // Exception overrides state colors
  const markerColor = isException ? 'bg-status-danger' : config.circle;
  const isDiamond = isException;

  // Build ARIA label
  const ariaLabel = `${state} ${type} stop${isException ? ' with exception' : ''}`;

  return (
    <div className="relative flex items-center">
      {/* Connecting line before (if not first) */}
      {!isFirst && (
        <div className={cn('absolute right-[50%] w-8 h-0.5 -translate-x-full', config.line)} />
      )}

      {/* Marker (circle or diamond) */}
      <div className="relative z-10 flex items-center justify-center">
        {isDiamond ? (
          // Diamond shape for exceptions
          <div
            className={cn(
              'w-4 h-4 rotate-45 flex items-center justify-center',
              markerColor
            )}
            aria-label={ariaLabel}
          >
            <div className="-rotate-45">
              {state === 'completed' && (
                <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
              )}
              {state === 'current' && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
          </div>
        ) : (
          // Circle shape for normal stops
          <div
            className={cn(
              'w-4 h-4 rounded-full flex items-center justify-center',
              markerColor
            )}
            aria-label={ariaLabel}
          >
            {state === 'completed' && (
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            )}
            {state === 'current' && (
              <div className="w-2 h-2 rounded-full bg-white" />
            )}
          </div>
        )}

        {/* Pulsing ring for current stop */}
        {state === 'current' && config.animate && (
          <div className={cn(
            'absolute inset-0 animate-ping opacity-75',
            isDiamond ? 'rotate-45 bg-status-danger' : 'rounded-full bg-status-info'
          )} />
        )}
      </div>

      {/* Connecting line after (if not last) */}
      {!isLast && (
        <div className={cn('absolute left-[50%] w-8 h-0.5 translate-x-full', config.line)} />
      )}

      {/* Optional label below (2-line: city on top, time below) */}
      {label && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
          <div className="text-[10px] font-medium text-foreground">{label.city}</div>
          <div className="text-[9px] text-muted-foreground">{label.time}</div>
        </div>
      )}
    </div>
  );
}
