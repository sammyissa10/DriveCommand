'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { saveOperationsSettings, type OperationsSettings } from './actions';

interface Props {
  initial: OperationsSettings;
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
export function OperationsSettingsForm({ initial }: Props) {
  const [requireInspection, setRequireInspection] = useState(initial.requirePreTripInspection);
  const [blockOnFailure, setBlockOnFailure] = useState(initial.blockTripStartOnFailedInspection);
  const [isSaving, startSaving] = useTransition();

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
