import type { LucideIcon } from 'lucide-react';

/**
 * Centered empty state: muted icon, one 15pt line, one 13pt secondary line
 * pointing at the add action. No illustrations.
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <Icon className="h-10 w-10 text-ds-txt3" strokeWidth={1.5} />
      <p className="mt-4 text-[15px] text-ds-txt">{title}</p>
      <p className="mt-1 text-[13px] text-ds-txt2">{message}</p>
    </div>
  );
}
