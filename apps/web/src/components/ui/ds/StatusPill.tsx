import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'accent' | 'warning' | 'danger' | 'neutral' | 'vip';

/** Literal class fragments per tone so Tailwind's JIT sees every class. */
const TONE: Record<StatusTone, { fill: string; dot: string; text: string }> = {
  success: { fill: 'bg-ds-success/[0.14]', dot: 'bg-ds-success', text: 'text-ds-success' },
  accent: { fill: 'bg-ds-accent/[0.14]', dot: 'bg-ds-accent', text: 'text-ds-accent' },
  warning: { fill: 'bg-ds-warning/[0.14]', dot: 'bg-ds-warning', text: 'text-ds-warning' },
  danger: { fill: 'bg-ds-danger/[0.14]', dot: 'bg-ds-danger', text: 'text-ds-danger' },
  neutral: { fill: 'bg-ds-txt2/[0.14]', dot: 'bg-ds-txt2', text: 'text-ds-txt2' },
  vip: { fill: 'bg-ds-vip/[0.15]', dot: 'bg-ds-vip', text: 'text-ds-vip' },
};

/** Translucent status pill: 14% tint, colored dot + label. Height 22, radius 8. */
export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold',
        t.fill,
        t.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />
      {label}
    </span>
  );
}
