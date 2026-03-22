import { Clock } from 'lucide-react';

interface ComingSoonBannerProps {
  message?: string;
}

export function ComingSoonBanner({
  message = 'This feature is under active development. Live data will sync once ELD integrations are connected.',
}: ComingSoonBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
          Coming Soon
        </span>
        <p className="text-sm text-amber-700/90 dark:text-amber-400/80">{message}</p>
      </div>
    </div>
  );
}
