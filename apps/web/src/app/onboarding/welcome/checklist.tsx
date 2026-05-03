'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ChecklistProps {
  completionPct: number;
  firstRealTruckAt: Date | null;
  firstRealDriverAt: Date | null;
  firstRealClientAt: Date | null;
  firstLoadInTransitAt: Date | null;
}

interface ChecklistItem {
  label: string;
  complete: boolean;
  href?: string;
}

export function ActivationChecklist({
  completionPct,
  firstRealTruckAt,
  firstRealDriverAt,
  firstRealClientAt,
  firstLoadInTransitAt,
}: ChecklistProps) {
  if (completionPct === 100) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-6 animate-in fade-in duration-500">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h2 className="text-xl font-semibold text-foreground">You&apos;re all set!</h2>
        <p className="text-sm text-muted-foreground">Your fleet is ready to roll.</p>
        <Button asChild className="mt-4 w-full">
          <Link href="/carrier/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const items: ChecklistItem[] = [
    { label: 'Account created', complete: true },
    { label: 'Add your first truck', complete: firstRealTruckAt !== null, href: '/carrier/fleet/trucks/new' },
    { label: 'Add your first driver', complete: firstRealDriverAt !== null, href: '/carrier/fleet/drivers/new' },
    { label: 'Add your first customer', complete: firstRealClientAt !== null, href: '/carrier/clients/new' },
    { label: 'Dispatch your first load', complete: firstLoadInTransitAt !== null, href: '/carrier/dispatches' },
  ];

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-4">
        <span className="text-sm font-medium text-foreground">{completionPct}% complete</span>
        <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const rowContent = (
            <>
              {item.complete ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              )}
              <span
                className={
                  item.complete
                    ? 'text-sm line-through text-muted-foreground'
                    : 'text-sm text-foreground'
                }
              >
                {item.label}
              </span>
            </>
          );

          if (!item.complete && item.href) {
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 py-2 rounded-md px-1 -mx-1 cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors"
                >
                  {rowContent}
                </Link>
              </li>
            );
          }

          return (
            <li key={item.label} className="flex items-center gap-3 py-2">
              {rowContent}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
