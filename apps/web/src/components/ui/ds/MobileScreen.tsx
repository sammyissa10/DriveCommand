import { cn } from '@/lib/utils';

/**
 * Root of a mobile-web design-system screen: fixed dark `ds.bg` surface with the
 * 20px screen margin. Rendered only at mobile widths (the desktop UI keeps its
 * own layout). Source: .planning/mobile-design-system.md
 */
export function MobileScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-h-[100dvh] bg-ds-bg px-5 text-ds-txt', className)}>{children}</div>
  );
}
