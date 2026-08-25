'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { saveOperationsSettings, type OperationsSettings } from './actions';

interface Props {
  initial: OperationsSettings;
  /**
   * quick-545 — the tenant's inspection checklists exist and carry inspection
   * items, but not one of those items is marked as stopping the trip.
   *
   * Resolved server-side by `tenantInspectionsBlockNothing`; the two tenant
   * settings are NOT folded into it, deliberately, so this component can test
   * them against live toggle state (below).
   */
  inspectionsBlockNothing: boolean;
}

/**
 * The two Phase 9 tenant settings.
 *
 * Design rules, Section 15: no borders doing the work — elevation is the card
 * surface; one accent colour on one primary action (Save); spacing on the 8/12/
 * 16/20/24 scale. **Red appears nowhere on this page.** A safety setting being
 * off is a choice a carrier is entitled to make, not an error state, and Section
 * 15 reserves red for errors and destructive actions.
 */
export function OperationsSettingsForm({ initial, inspectionsBlockNothing }: Props) {
  const [requireInspection, setRequireInspection] = useState(initial.requirePreTripInspection);
  const [blockOnFailure, setBlockOnFailure] = useState(initial.blockTripStartOnFailedInspection);
  const [isSaving, startSaving] = useTransition();

  /**
   * quick-545 — the setting reads as protection and protects nothing.
   *
   * Both toggles are read from LIVE state, not `initial`: an owner who switches
   * inspections on should learn straight away that no item can stop a trip,
   * rather than saving first and finding out never. The two clauses are also
   * what keeps this honest — with inspections off, the existing line below owns
   * the case; with blocking off, the owner has deliberately chosen not to block
   * and there is no false promise to correct.
   *
   * Mutually exclusive with that existing line by construction: this one
   * requires `requireInspection`, that one requires `!requireInspection`.
   */
  const showsProtectionThatIsNotThere =
    requireInspection && blockOnFailure && inspectionsBlockNothing;

  const dirty =
    requireInspection !== initial.requirePreTripInspection ||
    blockOnFailure !== initial.blockTripStartOnFailedInspection;

  function handleSave() {
    startSaving(async () => {
      const result = await saveOperationsSettings({
        requirePreTripInspection: requireInspection,
        blockTripStartOnFailedInspection: blockOnFailure,
      });
      if (result.ok) {
        toast.success('Settings saved');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Pre-trip inspection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Require a pre-trip inspection
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Drivers complete a full-screen walkaround before a trip can start. An
                inspection stays valid for 24 hours on the same truck, so a second trip the
                same day does not ask again.
              </p>
            </div>
            <Switch
              checked={requireInspection}
              onCheckedChange={setRequireInspection}
              aria-label="Require a pre-trip inspection"
              className="mt-1 shrink-0"
            />
          </div>

          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Block the trip when a critical item fails
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                A failed critical item stops the trip and notifies dispatch. An owner or
                manager can still override it from the trip, with a written reason that
                stays on the record. Turn this off and a critical failure is logged against
                the truck but does not stop the driver.
              </p>
            </div>
            <Switch
              checked={blockOnFailure}
              onCheckedChange={setBlockOnFailure}
              disabled={!requireInspection}
              aria-label="Block the trip when a critical item fails"
              className="mt-1 shrink-0"
            />
          </div>

          {!requireInspection && (
            <p className="text-sm text-muted-foreground">
              Inspections are off, so nothing can block a trip start. Turn inspections on to
              use this setting.
            </p>
          )}

          {showsProtectionThatIsNotThere && (
            <p className="text-sm text-muted-foreground">
              No inspection item is set to stop the trip, so nothing can block a trip
              start. In{' '}
              <Link
                href="/checklists"
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
              >
                Checklists &amp; Workflows
              </Link>
              , open your vehicle inspection checklist, select an item, and turn on
              &ldquo;Failing this stops the trip&rdquo;.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || isSaving}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
        {dirty && !isSaving && (
          <span className="text-sm text-muted-foreground">You have unsaved changes.</span>
        )}
      </div>
    </div>
  );
}
