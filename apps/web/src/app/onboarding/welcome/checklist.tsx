'use client';

import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ChecklistProps {
  /** True once a real (non-sample) record of each type exists for the tenant. */
  hasClient: boolean;
  hasContract: boolean;
  hasLoad: boolean;
  hasTrip: boolean;
}

interface ChecklistItem {
  label: string;
  description?: string;
  complete: boolean;
  href?: string;
}

export function ActivationChecklist({
  hasClient,
  hasContract,
  hasLoad,
  hasTrip,
}: ChecklistProps) {
  // Steps follow the data dependency chain: client → contract → load → trip.
  // A step is complete when the underlying record actually exists (not on click).
  const items: ChecklistItem[] = [
    { label: 'Account created', complete: true },
    {
      label: 'Add your first client',
      description: 'The company you haul for.',
      complete: hasClient,
      href: '/carrier/clients/new',
    },
    {
      label: 'Create a contract for that client',
      description: 'Sets the rates and terms for their loads.',
      complete: hasContract,
      href: '/carrier/contracts/new',
    },
    {
      label: 'Create your first load',
      description: 'The shipment to move, on that contract.',
      complete: hasLoad,
      href: '/carrier/loads/new',
    },
    {
      label: 'Assign the load to a trip and dispatch',
      description: 'Put the load on a truck and send it.',
      complete: hasTrip,
      href: '/carrier/trips/new',
    },
  ];

  const completeCount = items.filter((i) => i.complete).length;
  const completionPct = Math.round((completeCount / items.length) * 100);

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
              <span className="flex flex-col">
                <span
                  className={
                    item.complete
                      ? 'text-sm line-through text-muted-foreground'
                      : 'text-sm text-foreground'
                  }
                >
                  {item.label}
                </span>
                {item.description && !item.complete && (
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                )}
              </span>
            </>
          );

          if (!item.complete && item.href) {
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between py-2 rounded-md px-1 -mx-1 cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors"
                >
                  <span className="flex items-center gap-3">{rowContent}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
