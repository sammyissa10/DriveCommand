'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  PrimaryButton,
  SheetContainer,
  type FieldDef,
} from '@/components/ui/ds';
import { driverReadinessLabel, canDispatchClientSide } from '@/lib/dispatch/driver-readiness-label';

// ---------------------------------------------------------------------------
// Types — same route-template shape the desktop NewDispatchForm uses
// ---------------------------------------------------------------------------

interface Template {
  id: string;
  templateName: string;
  estimatedMiles: number | null;
  defaultDriverId: string | null;
  defaultTruckId: string | null;
  client: { name: string } | null;
  stops: Array<{
    sequenceOrder: number;
    stopType: string;
    facility: { name: string; city: string | null; state: string | null };
  }>;
}

const STOP_TYPE_LABEL: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel: 'Fuel',
  rest: 'Rest',
  customs: 'Customs',
  other: 'Other',
};

const ADMIN_ROLES = ['OWNER', 'MANAGER'];

/** Next top of the hour, formatted for a datetime-local input. */
function getDefaultDeparture(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// New Trip — mobile-web design system create page (carrier)
// ---------------------------------------------------------------------------

export function NewTripMobile({
  driverMap,
  truckMap,
  userRole,
}: {
  driverMap: Record<string, string>;
  truckMap: Record<string, string>;
  userRole?: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();

  const [primaryDriverId, setPrimaryDriverId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [coDriverId, setCoDriverId] = useState('');
  const [scheduledDeparture, setScheduledDeparture] = useState(getDefaultDeparture());
  const [plannedMiles, setPlannedMiles] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [showOverrideReason, setShowOverrideReason] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const isAdmin = userRole ? ADMIN_ROLES.includes(userRole) : false;

  useEffect(() => {
    fetch('/api/v1/carrier/route-templates/active')
      .then((r) => r.json())
      .then((body) => {
        if (body.data) setTemplates(body.data as Template[]);
      })
      .catch(() => {
        /* non-critical — empty dropdown */
      });
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  const { data: driverReadiness } = useQuery({
    ...trpc.workflows.instance.getDriverReadiness.queryOptions({ carrierDriverId: primaryDriverId }),
    enabled: Boolean(primaryDriverId),
  });
  const label = driverReadiness ? driverReadinessLabel(driverReadiness) : null;

  function handleTemplateChange(id: string) {
    setSelectedTemplateId(id);
    if (!id) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (plannedMiles === '' && t.estimatedMiles != null) setPlannedMiles(String(t.estimatedMiles));
    if (!primaryDriverId && t.defaultDriverId && t.defaultDriverId in driverMap) setPrimaryDriverId(t.defaultDriverId);
    if (!truckId && t.defaultTruckId && t.defaultTruckId in truckMap) setTruckId(t.defaultTruckId);
  }

  const driverEntries = useMemo(() => Object.entries(driverMap), [driverMap]);
  const truckEntries = useMemo(() => Object.entries(truckMap), [truckMap]);

  // ---- field groups (create form driven by state) ----
  const routeFields: FieldDef[] = [
    {
      key: 'template',
      label: 'Route template',
      input: {
        value: selectedTemplateId,
        onChange: handleTemplateChange,
        options: [
          { label: 'No template', value: '' },
          ...templates.map((t) => ({ label: `${t.templateName}${t.client ? ` — ${t.client.name}` : ''}`, value: t.id })),
        ],
      },
    },
  ];
  const assignmentFields: FieldDef[] = [
    {
      key: 'driver',
      label: 'Primary driver *',
      input: {
        value: primaryDriverId,
        onChange: setPrimaryDriverId,
        options: [{ label: 'Select driver…', value: '' }, ...driverEntries.map(([id, name]) => ({ label: name, value: id }))],
      },
    },
    {
      key: 'truck',
      label: 'Truck *',
      input: {
        value: truckId,
        onChange: setTruckId,
        options: [{ label: 'Select truck…', value: '' }, ...truckEntries.map(([id, unit]) => ({ label: `Unit ${unit}`, value: id }))],
      },
    },
    {
      key: 'coDriver',
      label: 'Co-driver',
      input: {
        value: coDriverId,
        onChange: setCoDriverId,
        options: [{ label: 'None', value: '' }, ...driverEntries.map(([id, name]) => ({ label: name, value: id }))],
      },
    },
  ];
  const scheduleFields: FieldDef[] = [
    {
      key: 'departure',
      label: 'Scheduled departure *',
      input: { value: scheduledDeparture, onChange: setScheduledDeparture, type: 'datetime-local' },
    },
    {
      key: 'miles',
      label: 'Planned miles',
      input: {
        value: plannedMiles,
        onChange: (v) => setPlannedMiles(v.replace(/[^\d.]/g, '')),
        inputMode: 'decimal',
        placeholder: 'e.g. 350',
      },
    },
  ];
  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', input: { value: notes, onChange: setNotes, multiline: true, placeholder: 'Any additional notes…' } },
  ];

  async function submitDispatch(opts?: { overrideReason: string; overrideForEntityId: string }) {
    if (!primaryDriverId) return setError('Primary driver is required.');
    if (!truckId) return setError('Truck is required.');
    if (!scheduledDeparture) return setError('Scheduled departure is required.');

    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        primaryDriverId,
        truckId,
        scheduledDeparture: new Date(scheduledDeparture).toISOString(),
      };
      if (coDriverId) body.coDriverId = coDriverId;
      if (plannedMiles.trim() !== '') body.plannedMiles = parseFloat(plannedMiles);
      if (notes.trim()) body.notes = notes.trim();
      if (selectedTemplateId) body.routeTemplateId = selectedTemplateId;
      if (opts?.overrideReason) {
        body.overrideReason = opts.overrideReason;
        body.overrideForEntityType = 'DRIVER';
        body.overrideForEntityId = opts.overrideForEntityId;
      }

      const res = await fetch('/api/v1/carrier/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409 && data.error === 'DRIVER_NOT_DISPATCH_READY') {
          setBlockModalOpen(true);
          return;
        }
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { data?: { id: string } };
      const newId = data.data?.id ?? '';
      if (!newId) throw new Error('No ID returned from server');
      toast.success('Trip created');
      router.push(`/carrier/trips/${newId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create trip';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  function handleSubmit() {
    // Agrees with the server gate — also catches NO_ONBOARDING_INSTANCE,
    // which the server treats as not ready.
    if (primaryDriverId && !canDispatchClientSide(driverReadiness)) {
      setBlockModalOpen(true);
      return;
    }
    void submitDispatch();
  }

  async function handleOverrideSubmit() {
    if (!overrideReason.trim()) return;
    const entityId = driverReadiness?.userId ?? '';
    setBlockModalOpen(false);
    setShowOverrideReason(false);
    await submitDispatch({ overrideReason: overrideReason.trim(), overrideForEntityId: entityId });
    setOverrideReason('');
  }

  function closeBlock() {
    setBlockModalOpen(false);
    setShowOverrideReason(false);
    setOverrideReason('');
  }

  // A trip can't exist without an active driver + truck. On a fresh workspace both
  // dropdowns are empty, so say why rather than leaving a dead Create button.
  const noDrivers = driverEntries.length === 0;
  const noTrucks = truckEntries.length === 0;
  const missingFleet = noDrivers || noTrucks;
  const missingFleetTitle = noDrivers && noTrucks
    ? 'Add a driver and a truck first'
    : noDrivers
      ? 'Add a driver first'
      : 'Add a truck first';

  const canSubmit = Boolean(primaryDriverId && truckId && scheduledDeparture) && !submitting;

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Trip"
        onBack={undefined}
        left={<NavTextButton label="Cancel" onClick={() => router.push('/carrier/trips')} />}
        right={<NavTextButton label={submitting ? 'Creating…' : 'Create'} emphasized onClick={handleSubmit} disabled={!canSubmit} />}
      />

      <div className="space-y-6 pt-2">
        {/* Blocked: no active driver and/or truck to assign */}
        {missingFleet ? (
          <div className="rounded-[20px] bg-ds-warning/[0.14] p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-ds-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ds-warning">{missingFleetTitle}</p>
                <p className="mt-0.5 text-[13px] text-ds-txt2">
                  A trip needs an active driver and truck assigned before it can be created.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {noDrivers ? (
                <button
                  type="button"
                  onClick={() => router.push('/carrier/fleet/drivers')}
                  className="h-11 flex-1 rounded-[12px] bg-ds-card text-[15px] font-semibold text-ds-accent transition active:opacity-75"
                >
                  Add driver
                </button>
              ) : null}
              {noTrucks ? (
                <button
                  type="button"
                  onClick={() => router.push('/carrier/fleet/trucks')}
                  className="h-11 flex-1 rounded-[12px] bg-ds-card text-[15px] font-semibold text-ds-accent transition active:opacity-75"
                >
                  Add truck
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Route template */}
        <div>
          <SectionHeader title="Route" />
          <FieldGroup fields={routeFields} isEditing />
          {selectedTemplate && selectedTemplate.stops.length > 0 ? (
            <div className="mt-2 rounded-[20px] bg-ds-accent/[0.08] p-4">
              <div className="mb-2 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 shrink-0 text-ds-accent" />
                <span className="text-[13px] font-semibold text-ds-accent">
                  {selectedTemplate.stops.length} stop{selectedTemplate.stops.length === 1 ? '' : 's'} will be created
                </span>
              </div>
              <div className="space-y-1.5">
                {selectedTemplate.stops.map((s) => (
                  <div key={s.sequenceOrder} className="flex items-center gap-2 text-[13px]">
                    <span className="w-12 shrink-0 text-ds-txt3">Stop {s.sequenceOrder}</span>
                    <span className="shrink-0 text-ds-txt2">{STOP_TYPE_LABEL[s.stopType] ?? s.stopType}</span>
                    <span className="min-w-0 flex-1 truncate text-ds-txt">
                      {s.facility.name}
                      {(s.facility.city || s.facility.state) ? (
                        <span className="text-ds-txt3"> ({[s.facility.city, s.facility.state].filter(Boolean).join(', ')})</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Assignment + readiness */}
        <div>
          <SectionHeader title="Assignment" />
          <FieldGroup fields={assignmentFields} isEditing />
          {primaryDriverId && driverReadiness && label ? (
            <>
              {label.tone === 'ready' && (
                <div className="mt-2 flex items-center gap-1.5 px-1 text-[13px] text-ds-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Dispatch ready</span>
                </div>
              )}

              {label.tone === 'not_started' && (
                <div className="mt-2 px-1">
                  <div className="flex items-center gap-1.5 text-[13px] text-ds-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{label.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/checklists'; }}
                    className="mt-0.5 text-[13px] font-medium text-ds-warning underline"
                  >
                    Start onboarding
                  </button>
                </div>
              )}

              {label.tone === 'incomplete' && (
                <div className="mt-2 px-1">
                  <div className="flex items-center gap-1.5 text-[13px] text-ds-danger">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>{label.title}</span>
                  </div>
                  {label.detail ? (
                    <p className="mt-0.5 text-[13px] text-ds-txt2">{label.detail}</p>
                  ) : null}
                  {driverReadiness.openInstanceId ? (
                    <button
                      type="button"
                      onClick={() => { window.location.href = `/checklists/instances/${driverReadiness.openInstanceId}`; }}
                      className="mt-0.5 text-[13px] font-medium text-ds-danger underline"
                    >
                      View checklist
                    </button>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Schedule */}
        <div>
          <SectionHeader title="Schedule" />
          <FieldGroup fields={scheduleFields} isEditing />
        </div>

        {/* Notes */}
        <div>
          <SectionHeader title="Notes" />
          <FieldGroup fields={notesFields} isEditing />
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 rounded-[20px] bg-ds-card p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ds-txt3" />
          <p className="text-[13px] text-ds-txt2">
            {selectedTemplateId
              ? 'Stops from the selected template will be added automatically.'
              : 'Add loads and stops to this trip from its detail page.'}
          </p>
        </div>

        {error ? <p className="px-1 text-[13px] text-ds-danger">{error}</p> : null}

        <PrimaryButton label={submitting ? 'Creating…' : 'Create Trip'} onClick={handleSubmit} disabled={!canSubmit} loading={submitting} />
      </div>

      {/* Readiness block sheet */}
      <SheetContainer
        open={blockModalOpen}
        onCancel={closeBlock}
        title={label?.tone === 'not_started' ? 'Driver has not started onboarding' : 'Driver not ready'}
        cancelLabel="Cancel"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${label?.tone === 'not_started' ? 'text-ds-warning' : 'text-ds-danger'}`} />
            <p className="text-[15px] text-ds-txt">
              {label?.tone === 'not_started'
                ? 'Onboarding must be completed - or overridden by an admin - before this driver can be dispatched.'
                : 'This driver has incomplete onboarding steps.'}
            </p>
          </div>

          {label?.tone !== 'not_started' && driverReadiness && driverReadiness.blockerStepNames.length > 0 ? (
            <div className="space-y-2 rounded-[20px] bg-ds-card p-4">
              {driverReadiness.blockerStepNames.map((name, i) => (
                <div key={i} className="flex items-center gap-2 text-[14px] text-ds-txt2">
                  <XCircle className="h-4 w-4 shrink-0 text-ds-danger" />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          ) : null}

          {showOverrideReason && isAdmin ? (
            <div className="space-y-1.5">
              <label htmlFor="override-reason" className="block text-[13px] text-ds-txt2">
                Reason <span className="text-ds-danger">*</span>
              </label>
              <textarea
                id="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why you are proceeding despite incomplete steps…"
                rows={3}
                autoFocus
                className="w-full resize-none rounded-[10px] bg-ds-input px-3 py-2.5 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            {isAdmin && showOverrideReason ? (
              <PrimaryButton
                label={submitting ? 'Creating…' : 'Create anyway'}
                onClick={() => void handleOverrideSubmit()}
                disabled={!overrideReason.trim() || submitting}
                loading={submitting}
              />
            ) : null}

            {label?.tone === 'not_started' ? (
              <button
                type="button"
                onClick={() => {
                  closeBlock();
                  window.location.href = '/checklists';
                }}
                className="h-[50px] w-full rounded-[15px] bg-ds-card text-[17px] font-semibold text-ds-txt transition active:opacity-75"
              >
                Start onboarding
              </button>
            ) : driverReadiness?.openInstanceId ? (
              <button
                type="button"
                onClick={() => {
                  closeBlock();
                  window.location.href = `/checklists/instances/${driverReadiness.openInstanceId}`;
                }}
                className="h-[50px] w-full rounded-[15px] bg-ds-card text-[17px] font-semibold text-ds-txt transition active:opacity-75"
              >
                View checklist
              </button>
            ) : null}

            {isAdmin && !showOverrideReason ? (
              <button
                type="button"
                onClick={() => setShowOverrideReason(true)}
                className="h-[50px] w-full rounded-[15px] bg-ds-danger/[0.14] text-[17px] font-semibold text-ds-danger transition active:opacity-75"
              >
                Override
              </button>
            ) : null}
          </div>
        </div>
      </SheetContainer>
    </MobileScreen>
  );
}
