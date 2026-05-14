'use client';

import { useOptimistic, useTransition } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { updateMyPreference } from '@/app/(owner)/actions/my-notifications';
import type { MyPreferenceRow } from '@/app/(owner)/actions/my-notifications';

// ---------------------------------------------------------------------------
// Category ordering
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  'USER',
  'LOAD',
  'DRIVER',
  'TRUCK',
  'MESSAGE',
  'FINANCE',
  'ROUTE',
  'CUSTOMER',
  'DIGEST',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  USER: 'Account',
  LOAD: 'Loads',
  DRIVER: 'Drivers',
  TRUCK: 'Trucks',
  MESSAGE: 'Messages',
  FINANCE: 'Finance',
  ROUTE: 'Routes',
  CUSTOMER: 'Customers',
  DIGEST: 'Digests',
};

// ---------------------------------------------------------------------------
// Optimistic reducer type
// ---------------------------------------------------------------------------

type OptimisticAction = {
  triggerKey: string;
  field: 'emailEnabled' | 'inAppEnabled';
  value: boolean;
};

function applyOptimisticUpdate(
  state: MyPreferenceRow[],
  action: OptimisticAction,
): MyPreferenceRow[] {
  return state.map((row) =>
    row.template.triggerKey === action.triggerKey
      ? { ...row, [action.field]: action.value }
      : row,
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PreferencesFormProps {
  initialPreferences: MyPreferenceRow[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreferencesForm({ initialPreferences }: PreferencesFormProps) {
  const [optimisticPrefs, setOptimisticPrefs] = useOptimistic(
    initialPreferences,
    applyOptimisticUpdate,
  );
  const [isPending, startTransition] = useTransition();

  // Group by category
  const grouped: Record<string, MyPreferenceRow[]> = {};
  for (const row of optimisticPrefs) {
    const cat = row.template.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(row);
  }

  const orderedCategories = CATEGORY_ORDER.filter((cat) => grouped[cat]?.length);

  const handleToggle = (
    triggerKey: string,
    field: 'emailEnabled' | 'inAppEnabled',
    value: boolean,
  ) => {
    startTransition(async () => {
      setOptimisticPrefs({ triggerKey, field, value });
      updateMyPreference(triggerKey, field, value).catch(() =>
        toast.error('Failed to update — refresh'),
      );
    });
  };

  if (optimisticPrefs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No notifications are currently active for your team. Ask your manager to enable
        notifications under Settings &rarr; Notifications.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {isPending && (
        <p className="text-xs text-gray-400 text-right animate-pulse">Saving...</p>
      )}

      <Accordion type="multiple" defaultValue={orderedCategories} className="space-y-2">
        {orderedCategories.map((category) => (
          <AccordionItem
            key={category}
            value={category}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-900">
                {CATEGORY_LABELS[category] ?? category}
              </span>
            </AccordionTrigger>
            <AccordionContent className="p-0">
              <div className="divide-y divide-gray-100">
                {grouped[category].map((row) => (
                  <div
                    key={row.template.triggerKey}
                    className="flex items-center justify-between px-4 py-3 bg-white"
                  >
                    {/* Left: name + description */}
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-sm font-medium text-gray-900">
                        {row.template.displayName}
                      </p>
                      {row.template.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{row.template.description}</p>
                      )}
                    </div>

                    {/* Right: Email + In-App checkboxes */}
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`email-${row.template.triggerKey}`}
                          checked={row.emailEnabled}
                          onCheckedChange={(checked) =>
                            handleToggle(
                              row.template.triggerKey,
                              'emailEnabled',
                              checked === true,
                            )
                          }
                        />
                        <Label
                          htmlFor={`email-${row.template.triggerKey}`}
                          className="text-xs text-gray-600 cursor-pointer"
                        >
                          Email me
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`inapp-${row.template.triggerKey}`}
                          checked={row.inAppEnabled}
                          onCheckedChange={(checked) =>
                            handleToggle(
                              row.template.triggerKey,
                              'inAppEnabled',
                              checked === true,
                            )
                          }
                        />
                        <Label
                          htmlFor={`inapp-${row.template.triggerKey}`}
                          className="text-xs text-gray-600 cursor-pointer"
                        >
                          In-app
                        </Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
