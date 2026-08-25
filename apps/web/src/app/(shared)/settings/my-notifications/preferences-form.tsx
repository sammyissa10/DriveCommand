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
import { updateMyPreference, updateMySubscription } from '@/app/(owner)/actions/my-notifications';
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
  // Document Import Phase 10 — DEC-16 change 3. A category missing from this
  // array renders no section at all, so every trigger in it becomes invisible
  // here — which on THIS screen also means unsubscribable-from.
  'TRIP',
  'IMPORT',
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
  TRIP: 'Trips',
  IMPORT: 'Document imports',
};

// ---------------------------------------------------------------------------
// Optimistic reducer type
// ---------------------------------------------------------------------------

/**
 * Phase 10 widened this from the two channel flags to four fields.
 *
 * `subscribed` sits in the same optimistic reducer as the channels but is NOT a
 * channel: it decides whether the user is in the audience at all, while the
 * others decide how a notification reaches them once they are. Same reducer,
 * different question — see `updateMySubscription`.
 */
type OptimisticAction = {
  triggerKey: string;
  field: 'emailEnabled' | 'inAppEnabled' | 'pushEnabled' | 'subscribed';
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
    field: 'emailEnabled' | 'inAppEnabled' | 'pushEnabled',
    value: boolean,
  ) => {
    startTransition(async () => {
      setOptimisticPrefs({ triggerKey, field, value });
      updateMyPreference(triggerKey, field, value).catch(() =>
        toast.error('Failed to update — refresh'),
      );
    });
  };

  /**
   * Phase 10 — subscribe / unsubscribe. A DIFFERENT server action from
   * `handleToggle`, deliberately: it writes `NotificationSubscription`, not
   * `UserNotificationPreference`, and unsubscribing DELETES the row because
   * presence in that table is the subscription. Routing both through one action
   * would collapse two questions into one flag.
   */
  const handleSubscribe = (triggerKey: string, value: boolean) => {
    startTransition(async () => {
      setOptimisticPrefs({ triggerKey, field: 'subscribed', value });
      updateMySubscription(triggerKey, value).catch(() =>
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
                      {/* Phase 10 — say plainly when the channel boxes cannot
                          do anything because the user is not in the audience.
                          Without this the three ticked channels on an
                          unsubscribed subscriber-only trigger read as "you will
                          be told three ways", which is the opposite of true. */}
                      {row.subscriptionOnly && !row.subscribed && (
                        <p className="text-xs text-amber-600 mt-1">
                          You are not subscribed, so you will not receive this.
                        </p>
                      )}
                    </div>

                    {/* Right: subscription + channel checkboxes */}
                    <div className="flex items-center gap-6 shrink-0">
                      {/* Phase 10 — subscription. Rendered ONLY for triggers
                          where it is the whole audience; on a trigger with a
                          role or related rule, an unticked box would falsely
                          suggest opting out, when the rule addresses the user
                          regardless. Two situations, so one control is not
                          enough — the same reasoning as filter-vs-mask in
                          Phase 7. */}
                      {row.subscriptionOnly && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`sub-${row.template.triggerKey}`}
                            checked={row.subscribed}
                            onCheckedChange={(checked) =>
                              handleSubscribe(row.template.triggerKey, checked === true)
                            }
                          />
                          <Label
                            htmlFor={`sub-${row.template.triggerKey}`}
                            className="text-xs font-medium text-gray-700 cursor-pointer"
                          >
                            Subscribe
                          </Label>
                        </div>
                      )}
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
                      {/* Phase 10 — push, shown only where the template
                          actually pushes (`NotificationTemplate.pushEnabled`).
                          A toggle on the other 44 triggers would be a control
                          that changes nothing, which teaches people their
                          settings do not work. */}
                      {row.pushOffered && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`push-${row.template.triggerKey}`}
                            checked={row.pushEnabled}
                            onCheckedChange={(checked) =>
                              handleToggle(
                                row.template.triggerKey,
                                'pushEnabled',
                                checked === true,
                              )
                            }
                          />
                          <Label
                            htmlFor={`push-${row.template.triggerKey}`}
                            className="text-xs text-gray-600 cursor-pointer"
                          >
                            Push
                          </Label>
                        </div>
                      )}
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
