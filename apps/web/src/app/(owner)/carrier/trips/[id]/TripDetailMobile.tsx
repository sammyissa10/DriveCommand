'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MapPin, RefreshCw } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  StatusPill,
  SegmentedControl,
  SectionHeader,
  FieldGroup,
  EmptyState,
  PrimaryButton,
  SheetContainer,
  ParentStrip,
  type StatusTone,
  type FieldDef,
  type ParentChip,
} from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Types — mirror the server page's serialized trip
// ---------------------------------------------------------------------------

export interface TripDetailData {
  id: string;
  status: string;
  notes: string | null;
  primaryDriverId: string;
  coDriverId: string | null;
  truckId: string;
  plannedMiles: number | null;
  actualMiles: number | null;
  scheduledDeparture: string;
  routeTemplateId: string | null;
  routeTemplateName: string | null;
  routeTemplateRecurrenceRule: string | null;
  routeTemplateRecurrenceTimezone: string | null;
  routeTemplateScheduledDepartureTime: string | null;
}

export interface TripStopItem {
  id: string;
  sequenceOrder: number;
  stopType: string;
  facilityId: string;
  appointmentStart: string | null;
  appointmentEnd: string | null;
  status: string;
}

interface Template {
  id: string;
  templateName: string;
  client: { name: string } | null;
}

// ---------------------------------------------------------------------------
// Vocabulary / formatting (ported from DispatchHeader + StopTimelineCard)
// ---------------------------------------------------------------------------

const STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  planned: { tone: 'neutral', label: 'Planned' },
  in_progress: { tone: 'accent', label: 'In progress' },
  completed: { tone: 'success', label: 'Completed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  tonu: { tone: 'warning', label: 'TONU' },
};
const STOP_STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'neutral', label: 'Pending' },
  arrived: { tone: 'accent', label: 'Arrived' },
  completed: { tone: 'success', label: 'Completed' },
  skipped: { tone: 'warning', label: 'Skipped' },
};
const STOP_TYPE_LABEL: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel: 'Fuel',
  rest: 'Rest',
  customs: 'Customs',
  waypoint: 'Waypoint',
  other: 'Other',
};
const DOT_BG: Record<StatusTone, string> = {
  success: 'bg-ds-success',
  accent: 'bg-ds-accent',
  warning: 'bg-ds-warning',
  danger: 'bg-ds-danger',
  neutral: 'bg-ds-txt3',
  vip: 'bg-ds-vip',
};

function extractDispatchNumber(notes: string | null): string {
  if (!notes) return '—';
  const m = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return m ? m[1] : '—';
}

/** iCal RRULE → human summary. Ported verbatim from DispatchHeader. */
function formatRecurrenceRule(rule: string | null, tz: string | null, departureTime: string | null): string {
  if (!rule) return '';
  try {
    const parts: Record<string, string> = {};
    for (const seg of rule.split(';')) {
      const eq = seg.indexOf('=');
      if (eq === -1) continue;
      parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
    }
    const freq = parts['FREQ'];
    const byDay = parts['BYDAY'];
    const interval = parseInt(parts['INTERVAL'] ?? '1', 10);
    const DAY_LABELS: Record<string, string> = {
      MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
    };
    let schedule = '';
    if (freq === 'DAILY') {
      schedule = interval === 1 ? 'Daily' : `Every ${interval} days`;
    } else if (freq === 'WEEKLY') {
      if (byDay) {
        const days = byDay.split(',').map((d) => DAY_LABELS[d] ?? d).join(', ');
        schedule = interval === 1 ? days : `Every ${interval} weeks: ${days}`;
      } else {
        schedule = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
      }
    } else if (freq === 'MONTHLY') {
      schedule = interval === 1 ? 'Monthly' : `Every ${interval} months`;
    } else {
      schedule = rule;
    }
    if (departureTime) {
      const [h, m] = departureTime.split(':').map(Number);
      const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM';
      const hour12 = ((h ?? 0) % 12) || 12;
      const min = String(m ?? 0).padStart(2, '0');
      const tzAbbr = tz ? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz : '';
      schedule += ` at ${hour12}:${min} ${ampm}${tzAbbr ? ` ${tzAbbr}` : ''}`;
    }
    return schedule;
  } catch {
    return rule;
  }
}

function fmtDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtWindow(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start);
  if (isNaN(s.getTime())) return null;
  const sStr = s.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!end) return sStr;
  const e = new Date(end);
  if (isNaN(e.getTime())) return sStr;
  return `${sStr} – ${e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
/** ISO → datetime-local value. */
function toLocalInput(iso: string): string {
  return iso ? iso.slice(0, 16) : '';
}
function cleanNotes(notes: string | null): string {
  return (
    notes
      ?.replace(/^\[DISPATCH_NUMBER=[^\]]*\]\s*/, '')
      .replace(/\s*\[AUTO-GENERATED\]\s*$/, '')
      .replace(/\s*\[Template:[^\]]*\]\s*/g, '')
      .trim() ?? ''
  );
}

type Tab = 'details' | 'stops';
const TABS: { label: string; value: Tab }[] = [
  { label: 'Details', value: 'details' },
  { label: 'Stops', value: 'stops' },
];

// ---------------------------------------------------------------------------
// Trip Detail — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function TripDetailMobile({
  trip,
  driverName,
  coDriverName,
  truckUnit,
  allStopsDone,
  allDrivers,
  allTrucks,
  stops,
  facilityMap,
  canManage,
}: {
  trip: TripDetailData;
  driverName: string;
  coDriverName: string;
  truckUnit: string;
  allStopsDone: boolean;
  allDrivers: { id: string; name: string }[];
  allTrucks: { id: string; unitNumber: string }[];
  stops: TripStopItem[];
  facilityMap: Record<string, { name: string; addressLine1: string | null; city: string | null; state: string | null }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<Tab>('details');
  const [isEditing, setIsEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Odometer stays inline-editable: Edit is locked once a trip is in progress,
  // which is exactly when the end reading gets recorded.
  const [plannedMilesInput, setPlannedMilesInput] = useState(trip.plannedMiles != null ? String(trip.plannedMiles) : '');
  const [actualMilesInput, setActualMilesInput] = useState(trip.actualMiles != null ? String(trip.actualMiles) : '');

  const makeEditForm = () => ({
    scheduledDeparture: toLocalInput(trip.scheduledDeparture),
    plannedMiles: String(trip.plannedMiles ?? ''),
    actualMiles: String(trip.actualMiles ?? ''),
    notes: cleanNotes(trip.notes),
    primaryDriverId: trip.primaryDriverId,
    coDriverId: trip.coDriverId ?? '',
    truckId: trip.truckId,
    routeTemplateId: trip.routeTemplateId ?? '',
  });
  type EditForm = ReturnType<typeof makeEditForm>;
  const [editForm, setEditForm] = useState<EditForm>(makeEditForm);

  const isLocked = trip.status === 'completed' || trip.status === 'cancelled' || trip.status === 'tonu';
  const isInProgress = trip.status === 'in_progress';
  const isPlanned = trip.status === 'planned';
  const canEdit = canManage && !isInProgress && !isLocked;

  const dispatchNumber = extractDispatchNumber(trip.notes);
  const s = STATUS_META[trip.status] ?? { tone: 'neutral' as StatusTone, label: trip.status.replace(/_/g, ' ') };
  const recurrenceSummary = trip.routeTemplateId
    ? formatRecurrenceRule(trip.routeTemplateRecurrenceRule, trip.routeTemplateRecurrenceTimezone, trip.routeTemplateScheduledDepartureTime)
    : '';

  function setField<K extends keyof EditForm>(key: K, value: string) {
    setEditForm((p) => ({ ...p, [key]: value }));
  }
  const dirty = useMemo(() => {
    const base = makeEditForm();
    return (Object.keys(base) as (keyof EditForm)[]).some((k) => editForm[k] !== base[k]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm, trip]);

  // ---- server calls (same endpoints the desktop header uses) ----
  async function patchTrip(data: Record<string, unknown>) {
    const res = await fetch(`/api/v1/carrier/dispatches/${trip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Failed to update trip');
    }
  }
  async function patchStatus(status: string) {
    const res = await fetch(`/api/v1/carrier/dispatches/${trip.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Failed to update status');
    }
  }

  function runStatus(status: string, okMsg: string, failMsg: string) {
    startTransition(async () => {
      try {
        await patchStatus(status);
        navigator.vibrate?.(10);
        toast.success(okMsg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : failMsg);
      }
    });
  }

  function startEdit() {
    setEditForm(makeEditForm());
    setTab('details');
    setIsEditing(true);
    if (!templatesLoaded && isPlanned) {
      fetch('/api/v1/carrier/route-templates/active')
        .then((r) => r.json())
        .then((body) => {
          if (body.data) setTemplates(body.data as Template[]);
          setTemplatesLoaded(true);
        })
        .catch(() => setTemplatesLoaded(true));
    }
  }
  function cancelEdit() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    setEditForm(makeEditForm());
    setIsEditing(false);
  }

  function saveEdit() {
    startTransition(async () => {
      try {
        if (isPlanned && editForm.coDriverId && editForm.coDriverId === editForm.primaryDriverId) {
          toast.error('Co-driver cannot be the same as primary driver');
          return;
        }
        // Preserve the tags the notes field carries.
        const dnTag = trip.notes?.match(/^\[DISPATCH_NUMBER=[^\]]*\]/)?.[0] ?? null;
        const hadAutoGenerated = trip.notes?.includes('[AUTO-GENERATED]') ?? false;
        let savedNotes = editForm.notes.trim();
        if (dnTag) savedNotes = savedNotes ? `${dnTag} ${savedNotes}` : dnTag;
        if (hadAutoGenerated) savedNotes = `${savedNotes} [AUTO-GENERATED]`;

        const payload: Record<string, unknown> = {
          scheduledDeparture: editForm.scheduledDeparture ? new Date(editForm.scheduledDeparture).toISOString() : undefined,
          notes: savedNotes || undefined,
        };
        if (editForm.plannedMiles !== '') {
          const v = parseFloat(editForm.plannedMiles);
          if (!isNaN(v)) payload.plannedMiles = v;
        }
        if (editForm.actualMiles !== '') {
          const v = parseFloat(editForm.actualMiles);
          if (!isNaN(v)) payload.actualMiles = v;
        }
        if (isPlanned) {
          payload.primaryDriverId = editForm.primaryDriverId;
          payload.truckId = editForm.truckId;
          payload.coDriverId = editForm.coDriverId || null;
          if (editForm.routeTemplateId !== (trip.routeTemplateId ?? '')) {
            payload.routeTemplateId = editForm.routeTemplateId || undefined;
          }
        }

        await patchTrip(payload);
        if (payload.plannedMiles !== undefined) setPlannedMilesInput(String(payload.plannedMiles));
        if (payload.actualMiles !== undefined) setActualMilesInput(String(payload.actualMiles));
        navigator.vibrate?.(10);
        toast.success('Trip updated');
        setIsEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update trip');
      }
    });
  }

  function saveOdometer(which: 'plannedMiles' | 'actualMiles', raw: string) {
    const val = parseFloat(raw);
    const current = which === 'plannedMiles' ? trip.plannedMiles : trip.actualMiles;
    if (isNaN(val) || val === current) return;
    patchTrip({ [which]: val })
      .then(() => router.refresh())
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to save odometer'));
  }

  // ---- field groups ----
  const assignmentView: FieldDef[] = [
    { key: 'driver', label: 'Driver', value: driverName },
    ...(trip.coDriverId && coDriverName ? [{ key: 'coDriver', label: 'Co-driver', value: coDriverName } as FieldDef] : []),
    { key: 'truck', label: 'Truck', value: truckUnit },
  ];
  // Short labels keep the value column wide enough that dates don't clip.
  // Recurrence is deliberately absent — it already reads in full under the title.
  const scheduleView: FieldDef[] = [
    { key: 'departure', label: 'Departs', value: fmtDateTime(trip.scheduledDeparture) },
  ];
  const odometerFields: FieldDef[] = [
    {
      key: 'plannedMiles',
      label: 'Odometer start (mi)',
      value: trip.plannedMiles != null ? String(trip.plannedMiles) : null,
      input: {
        value: plannedMilesInput,
        onChange: (v) => setPlannedMilesInput(v.replace(/[^\d.]/g, '')),
        onBlur: () => saveOdometer('plannedMiles', plannedMilesInput),
        inputMode: 'decimal',
        placeholder: '—',
      },
    },
    {
      key: 'actualMiles',
      label: 'Odometer end (mi)',
      value: trip.actualMiles != null ? String(trip.actualMiles) : null,
      input: {
        value: actualMilesInput,
        onChange: (v) => setActualMilesInput(v.replace(/[^\d.]/g, '')),
        onBlur: () => saveOdometer('actualMiles', actualMilesInput),
        inputMode: 'decimal',
        placeholder: '—',
      },
    },
  ];
  const notesView: FieldDef[] = [{ key: 'notes', label: 'Notes', value: cleanNotes(trip.notes) || null }];

  // ---- edit-mode fields ----
  const editAssignment: FieldDef[] = [
    {
      key: 'routeTemplateId',
      label: 'Route template',
      input: {
        value: editForm.routeTemplateId,
        onChange: (v) => setField('routeTemplateId', v),
        options: [
          { label: 'No template', value: '' },
          ...templates.map((t) => ({ label: `${t.templateName}${t.client ? ` — ${t.client.name}` : ''}`, value: t.id })),
        ],
      },
    },
    {
      key: 'primaryDriverId',
      label: 'Primary driver',
      input: {
        value: editForm.primaryDriverId,
        onChange: (v) => setField('primaryDriverId', v),
        options: allDrivers.map((d) => ({ label: d.name, value: d.id })),
      },
    },
    {
      key: 'truckId',
      label: 'Truck',
      input: {
        value: editForm.truckId,
        onChange: (v) => setField('truckId', v),
        options: allTrucks.map((t) => ({ label: `Unit ${t.unitNumber}`, value: t.id })),
      },
    },
    {
      key: 'coDriverId',
      label: 'Co-driver',
      input: {
        value: editForm.coDriverId,
        onChange: (v) => setField('coDriverId', v),
        options: [{ label: 'None', value: '' }, ...allDrivers.map((d) => ({ label: d.name, value: d.id }))],
      },
    },
  ];
  const editSchedule: FieldDef[] = [
    { key: 'scheduledDeparture', label: 'Scheduled departure', input: { value: editForm.scheduledDeparture, onChange: (v) => setField('scheduledDeparture', v), type: 'datetime-local' } },
    { key: 'plannedMilesEdit', label: 'Odometer start (mi)', input: { value: editForm.plannedMiles, onChange: (v) => setField('plannedMiles', v.replace(/[^\d.]/g, '')), inputMode: 'decimal', placeholder: '—' } },
    { key: 'actualMilesEdit', label: 'Odometer end (mi)', input: { value: editForm.actualMiles, onChange: (v) => setField('actualMiles', v.replace(/[^\d.]/g, '')), inputMode: 'decimal', placeholder: '—' } },
  ];
  const editNotes: FieldDef[] = [
    { key: 'notesEdit', label: 'Notes', input: { value: editForm.notes, onChange: (v) => setField('notes', v), multiline: true, placeholder: 'Anything worth remembering' } },
  ];

  const parentChips: ParentChip[] = trip.routeTemplateId && trip.routeTemplateName
    ? [{ key: 'template', icon: RefreshCw, label: trip.routeTemplateName, onClick: () => router.push(`/carrier/templates/${trip.routeTemplateId}`) }]
    : [];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title={isEditing ? 'Edit Trip' : 'Trip'}
        onBack={isEditing ? undefined : () => router.push('/carrier/trips')}
        left={isEditing ? <NavTextButton label="Cancel" onClick={cancelEdit} /> : undefined}
        right={
          isEditing ? (
            <NavTextButton label={isPending ? 'Saving…' : 'Save'} emphasized onClick={saveEdit} disabled={!dirty || isPending} />
          ) : canEdit ? (
            <NavTextButton label="Edit" onClick={startEdit} />
          ) : undefined
        }
      />

      {isEditing ? (
        <div className="space-y-6 pt-2">
          <div className="flex flex-col items-center pb-2">
            <h1 className="text-[22px] font-bold text-ds-txt">{dispatchNumber}</h1>
            <p className="mt-1 text-[13px] text-ds-txt3">Editing trip</p>
          </div>
          {isPlanned ? (
            <div>
              <SectionHeader title="Assignment" />
              <FieldGroup fields={editAssignment} isEditing />
            </div>
          ) : null}
          <div>
            <SectionHeader title="Schedule" />
            <FieldGroup fields={editSchedule} isEditing />
          </div>
          <div>
            <SectionHeader title="Notes" />
            <FieldGroup fields={editNotes} isEditing />
          </div>
        </div>
      ) : (
        <>
          {/* Identity */}
          <div className="flex flex-col items-center pb-4 pt-2">
            <h1 className="text-center text-[22px] font-bold text-ds-txt">{dispatchNumber}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <StatusPill label={s.label} tone={s.tone} />
              {trip.routeTemplateId ? <StatusPill label="Recurring" tone="vip" /> : null}
            </div>
            {recurrenceSummary ? (
              <p className="mt-2 text-center text-[13px] text-ds-txt3">{recurrenceSummary}</p>
            ) : null}
          </div>

          {/* Parent — the route template this trip came from */}
          {parentChips.length > 0 ? (
            <div className="pb-3">
              <ParentStrip items={parentChips} />
            </div>
          ) : null}

          {/* Primary action */}
          {canManage && isPlanned ? (
            <div className="space-y-2 pb-3">
              <PrimaryButton
                label={isPending ? 'Starting…' : 'Start Trip'}
                onClick={() => runStatus('in_progress', 'Trip started', 'Failed to start trip')}
                disabled={isPending}
              />
              <button
                type="button"
                onClick={() => setActionsOpen(true)}
                disabled={isPending}
                className="h-[50px] w-full rounded-[15px] bg-ds-card text-[17px] font-semibold text-ds-txt transition active:opacity-75 disabled:opacity-35"
              >
                More actions
              </button>
            </div>
          ) : null}

          {canManage && isInProgress ? (
            <div className="space-y-2 pb-3">
              <PrimaryButton
                label={isPending ? 'Completing…' : 'Complete Trip'}
                onClick={() => runStatus('completed', 'Trip completed', 'Failed to complete trip')}
                disabled={isPending || !allStopsDone}
              />
              {!allStopsDone ? (
                <p className="px-1 text-center text-[13px] text-ds-txt3">
                  All stops must be completed or skipped first.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Tabs */}
          <div className="py-3">
            <SegmentedControl options={TABS} value={tab} onChange={setTab} />
          </div>

          {tab === 'details' ? (
            <div className="space-y-6">
              <div>
                <SectionHeader title="Assignment" />
                <FieldGroup fields={assignmentView} isEditing={false} />
              </div>
              <div>
                <SectionHeader title="Schedule" />
                <FieldGroup fields={scheduleView} isEditing={false} />
              </div>
              <div>
                <SectionHeader title="Odometer" />
                {/* Editable in place — Edit is locked once the trip is running. */}
                <FieldGroup fields={odometerFields} isEditing={canManage && !isLocked} />
              </div>
              <div>
                <SectionHeader title="Notes" />
                <FieldGroup fields={notesView} isEditing={false} />
              </div>
            </div>
          ) : null}

          {tab === 'stops' ? (
            <div>
              <SectionHeader
                title={`${stops.length} stop${stops.length === 1 ? '' : 's'}`}
                action={{ label: 'Manage', onClick: () => router.push(`/carrier/trips/${trip.id}/stops`) }}
              />
              {stops.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title="No stops yet"
                  message={
                    canManage
                      ? 'Tap Manage to add the first stop to this trip.'
                      : 'Stops added to this trip will appear here.'
                  }
                />
              ) : (
                <div className="space-y-3">
                  {stops.map((stop) => {
                    const meta = STOP_STATUS_META[stop.status] ?? { tone: 'neutral' as StatusTone, label: stop.status };
                    const f = facilityMap[stop.facilityId] ?? null;
                    const place = f ? [f.city, f.state].filter(Boolean).join(', ') : '';
                    const when = fmtWindow(stop.appointmentStart, stop.appointmentEnd);
                    return (
                      <div key={stop.id} className="flex gap-3 rounded-[20px] bg-ds-card p-4">
                        <div className="flex flex-col items-center pt-0.5">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_BG[meta.tone]}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[15px] font-semibold text-ds-txt">
                              {stop.sequenceOrder}. {STOP_TYPE_LABEL[stop.stopType] ?? stop.stopType}
                            </span>
                            <StatusPill label={meta.label} tone={meta.tone} />
                          </div>
                          {f ? (
                            <div className="mt-0.5 truncate text-[15px] text-ds-txt2">
                              {f.name}
                              {place ? <span className="text-ds-txt3"> · {place}</span> : null}
                            </div>
                          ) : null}
                          {when ? <div className="mt-0.5 text-[13px] text-ds-txt3">{when}</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Status actions — Cancel / TONU */}
      <SheetContainer open={actionsOpen} onCancel={() => setActionsOpen(false)} title="Trip actions">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              if (window.confirm('Cancel this trip?')) runStatus('cancelled', 'Trip cancelled', 'Failed to cancel trip');
            }}
            className="h-[50px] w-full rounded-[15px] bg-ds-danger/[0.14] text-[17px] font-semibold text-ds-danger transition active:opacity-75"
          >
            Cancel trip
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              if (window.confirm('Mark this trip as TONU?')) runStatus('tonu', 'Trip marked as TONU', 'Failed to mark TONU');
            }}
            className="h-[50px] w-full rounded-[15px] bg-ds-warning/[0.14] text-[17px] font-semibold text-ds-warning transition active:opacity-75"
          >
            Mark TONU
          </button>
        </div>
      </SheetContainer>
    </MobileScreen>
  );
}
