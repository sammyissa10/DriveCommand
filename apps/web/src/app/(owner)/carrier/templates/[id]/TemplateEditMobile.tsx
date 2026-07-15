'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  StatusPill,
  Toggle,
  type FieldDef,
} from '@/components/ui/ds';
import { saveRouteTemplate } from '@/actions/carrier/save-route-template';
import type { RouteTemplateFormData } from '@/components/carrier/templates/RouteTemplateForm';
import type { StopBuilderStop } from '@/components/carrier/stops/StopCard';
import { formatRecurrence } from '../TemplatesMobile';
import { MobileStopsEditor, type FacilityOption } from '@/components/carrier/stops/MobileStopsEditor';

// ---------------------------------------------------------------------------
// Vocabulary (mirrors RouteTemplateForm)
// ---------------------------------------------------------------------------

const EQUIPMENT_TYPES = [
  { value: 'dry_van', label: 'Dry Van' },
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'reefer', label: 'Reefer' },
  { value: 'tanker', label: 'Tanker' },
  { value: 'step_deck', label: 'Step Deck' },
  { value: 'other', label: 'Other' },
];
const SCHEDULE_TYPES = [
  { value: 'fixed_days', label: 'Fixed days' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'on_call', label: 'On call' },
];
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (AZ)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'UTC', label: 'UTC' },
];
const FREQ_OPTIONS = [
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Daily', value: 'DAILY' },
  { label: 'Monthly', value: 'MONTHLY' },
];
const WEEK_DAYS: { key: string; label: string }[] = [
  { key: 'MO', label: 'Mon' },
  { key: 'TU', label: 'Tue' },
  { key: 'WE', label: 'Wed' },
  { key: 'TH', label: 'Thu' },
  { key: 'FR', label: 'Fri' },
  { key: 'SA', label: 'Sat' },
  { key: 'SU', label: 'Sun' },
];

interface ClientItem { id: string; name: string }
interface ContractItem { id: string; contractNumber: string; contractName: string | null }
interface DriverItem { id: string; firstName: string; lastName: string }
interface TruckItem { id: string; unitNumber: string }

// ---------------------------------------------------------------------------
// Route Template edit — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function TemplateEditMobile({
  initialData,
  templateId,
  initialActive,
  clients,
  drivers,
  trucks,
  facilities,
  initialContracts,
}: {
  initialData: RouteTemplateFormData;
  templateId: string;
  initialActive: boolean;
  /** Server-provided so every select has its option on the first paint. */
  clients: ClientItem[];
  drivers: DriverItem[];
  trucks: TruckItem[];
  facilities: FacilityOption[];
  initialContracts: ContractItem[];
}) {
  const router = useRouter();

  const [templateName, setTemplateName] = useState(initialData.templateName ?? '');
  const [clientId, setClientId] = useState(initialData.clientId ?? '');
  const [contractId, setContractId] = useState(initialData.contractId ?? '');
  const [scheduleType, setScheduleType] = useState(initialData.scheduleType ?? 'fixed_days');
  const [rruleFrequency, setRruleFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>(() => {
    const rule = initialData.recurrenceRule ?? '';
    if (rule.includes('FREQ=MONTHLY')) return 'MONTHLY';
    if (rule.includes('FREQ=DAILY')) return 'DAILY';
    return 'WEEKLY';
  });
  const [rruleSelectedDays, setRruleSelectedDays] = useState<string[]>(() => {
    const m = (initialData.recurrenceRule ?? '').match(/BYDAY=([^;]+)/);
    return m ? m[1].split(',').map((d) => d.trim().toUpperCase()) : [];
  });
  const [rruleMonthlyDays, setRruleMonthlyDays] = useState(() => {
    const m = (initialData.recurrenceRule ?? '').match(/BYMONTHDAY=([^;]+)/);
    return m ? m[1] : '';
  });
  const [recurrenceTimezone, setRecurrenceTimezone] = useState(initialData.recurrenceTimezone ?? 'America/Chicago');
  const [scheduledDepartureTime, setScheduledDepartureTime] = useState(initialData.scheduledDepartureTime ?? '');
  const [equipmentType, setEquipmentType] = useState(initialData.equipmentType ?? 'dry_van');
  const [tempMinF, setTempMinF] = useState(initialData.tempMinF != null ? String(initialData.tempMinF) : '');
  const [tempMaxF, setTempMaxF] = useState(initialData.tempMaxF != null ? String(initialData.tempMaxF) : '');
  const [maxWeightLbs, setMaxWeightLbs] = useState(initialData.maxWeightLbs != null ? String(initialData.maxWeightLbs) : '');
  const [commodityDescription, setCommodityDescription] = useState(initialData.commodityDescription ?? '');
  const [defaultDriverId, setDefaultDriverId] = useState(initialData.defaultDriverId ?? '');
  const [defaultTruckId, setDefaultTruckId] = useState(initialData.defaultTruckId ?? '');
  const [autoGenerateDaysAhead, setAutoGenerateDaysAhead] = useState(String(initialData.autoGenerateDaysAhead ?? 7));
  const [notes, setNotes] = useState(initialData.notes ?? '');
  const [stops, setStops] = useState<StopBuilderStop[]>(initialData.stops ?? []);

  const [active, setActive] = useState(initialActive);
  const [togglingActive, setTogglingActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Contracts depend on the selected client, so they refetch — but seed from the
  // server so the current contract shows immediately.
  const [contracts, setContracts] = useState<ContractItem[]>(initialContracts);

  // The RRULE is derived from the builder state, exactly as on desktop.
  const recurrenceRule = useMemo(() => {
    if (scheduleType !== 'fixed_days' && scheduleType !== 'frequency') return '';
    if (rruleFrequency === 'DAILY') return 'FREQ=DAILY';
    if (rruleFrequency === 'WEEKLY') {
      return rruleSelectedDays.length === 0 ? 'FREQ=WEEKLY' : `FREQ=WEEKLY;BYDAY=${rruleSelectedDays.join(',')}`;
    }
    return rruleMonthlyDays.trim() ? `FREQ=MONTHLY;BYMONTHDAY=${rruleMonthlyDays.trim()}` : 'FREQ=MONTHLY';
  }, [scheduleType, rruleFrequency, rruleSelectedDays, rruleMonthlyDays]);

  const showRecurrence = scheduleType === 'fixed_days' || scheduleType === 'frequency';

  // Only refetch when the client is actually switched — the initial client's
  // contracts already came from the server.
  useEffect(() => {
    if (clientId === initialData.clientId) return;
    if (!clientId) {
      setContracts([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/v1/carrier/contracts?client_id=${clientId}&pageSize=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setContracts((d?.data?.items ?? []) as ContractItem[]);
      })
      .catch(() => {
        if (!cancelled) setContracts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, initialData.clientId]);

  async function toggleActive() {
    const next = !active;
    setTogglingActive(true);
    setActive(next); // optimistic
    try {
      const res = await fetch(`/api/v1/carrier/route-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? 'Template activated' : 'Template deactivated');
      router.refresh();
    } catch {
      setActive(!next); // roll back
      toast.error('Failed to update template status');
    } finally {
      setTogglingActive(false);
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!templateName.trim()) e.templateName = 'Template name is required';
    if (!clientId) e.clientId = 'Client is required';
    if (!equipmentType) e.equipmentType = 'Equipment type is required';
    if (!scheduleType) e.scheduleType = 'Schedule type is required';
    // Mirror the server rule so it surfaces here rather than as a failed save.
    if (stops.length === 0) e.stops = 'A route template needs at least one stop';
    if (stops.some((s) => !s.facility_id)) e.stops = 'Every stop needs a facility';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) {
      const first = Object.keys(errors)[0];
      if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
      const result = await saveRouteTemplate({
        templateId,
        templateName: templateName.trim(),
        clientId,
        contractId: contractId || undefined,
        scheduleType,
        recurrenceRule: recurrenceRule || undefined,
        recurrenceTimezone,
        scheduledDepartureTime: scheduledDepartureTime || undefined,
        equipmentType,
        tempMinF: tempMinF ? Number(tempMinF) : undefined,
        tempMaxF: tempMaxF ? Number(tempMaxF) : undefined,
        maxWeightLbs: maxWeightLbs ? Number(maxWeightLbs) : undefined,
        commodityDescription: commodityDescription || undefined,
        defaultDriverId: defaultDriverId || undefined,
        defaultTruckId: defaultTruckId || undefined,
        autoGenerateDaysAhead: autoGenerateDaysAhead ? Number(autoGenerateDaysAhead) : undefined,
        notes: notes || undefined,
        stops,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save template');
        setSaving(false);
        return;
      }
      navigator.vibrate?.(10);
      toast.success('Template updated');
      router.push('/carrier/templates');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  // ---- field groups ----
  const detailFields: FieldDef[] = [
    {
      key: 'templateName',
      label: 'Name *',
      input: {
        value: templateName,
        onChange: (v) => {
          setTemplateName(v);
          if (errors.templateName) setErrors((e) => ({ ...e, templateName: '' }));
        },
        placeholder: 'e.g. Chi to Dal',
        error: errors.templateName || undefined,
      },
    },
    {
      key: 'clientId',
      label: 'Client *',
      input: {
        value: clientId,
        onChange: (v) => {
          setClientId(v);
          setContractId('');
          if (errors.clientId) setErrors((e) => ({ ...e, clientId: '' }));
        },
        options: [{ label: 'Select client…', value: '' }, ...clients.map((c) => ({ label: c.name, value: c.id }))],
        error: errors.clientId || undefined,
      },
    },
    ...(contracts.length > 0
      ? [
          {
            key: 'contractId',
            label: 'Contract',
            input: {
              value: contractId,
              onChange: setContractId,
              options: [
                { label: 'None', value: '' },
                ...contracts.map((c) => ({ label: c.contractName ?? c.contractNumber, value: c.id })),
              ],
            },
          } as FieldDef,
        ]
      : []),
  ];

  const scheduleFields: FieldDef[] = [
    {
      key: 'scheduleType',
      label: 'Schedule',
      input: { value: scheduleType, onChange: setScheduleType, options: SCHEDULE_TYPES.map((s) => ({ label: s.label, value: s.value })) },
    },
    ...(showRecurrence
      ? ([
          { key: 'frequency', label: 'Repeats', input: { value: rruleFrequency, onChange: (v) => setRruleFrequency(v as 'DAILY' | 'WEEKLY' | 'MONTHLY'), options: FREQ_OPTIONS } },
          ...(rruleFrequency === 'MONTHLY'
            ? [{ key: 'monthlyDays', label: 'Days of month', input: { value: rruleMonthlyDays, onChange: (v: string) => setRruleMonthlyDays(v.replace(/[^\d,]/g, '')), inputMode: 'numeric' as const, placeholder: 'e.g. 1,15' } }]
            : []),
          { key: 'departureTime', label: 'Departs at', input: { value: scheduledDepartureTime, onChange: setScheduledDepartureTime, type: 'time' } },
          { key: 'timezone', label: 'Timezone', input: { value: recurrenceTimezone, onChange: setRecurrenceTimezone, options: TIMEZONES } },
          { key: 'autoGen', label: 'Generate days ahead', input: { value: autoGenerateDaysAhead, onChange: (v: string) => setAutoGenerateDaysAhead(v.replace(/[^\d]/g, '')), inputMode: 'numeric' as const, placeholder: '7' } },
        ] as FieldDef[])
      : []),
  ];

  const equipmentFields: FieldDef[] = [
    { key: 'equipmentType', label: 'Equipment *', input: { value: equipmentType, onChange: setEquipmentType, options: EQUIPMENT_TYPES.map((e) => ({ label: e.label, value: e.value })), error: errors.equipmentType || undefined } },
    ...(equipmentType === 'reefer'
      ? ([
          { key: 'tempMinF', label: 'Temp min (°F)', input: { value: tempMinF, onChange: (v: string) => setTempMinF(v.replace(/[^\d-]/g, '')), inputMode: 'numeric' as const, placeholder: '—' } },
          { key: 'tempMaxF', label: 'Temp max (°F)', input: { value: tempMaxF, onChange: (v: string) => setTempMaxF(v.replace(/[^\d-]/g, '')), inputMode: 'numeric' as const, placeholder: '—' } },
        ] as FieldDef[])
      : []),
    { key: 'maxWeightLbs', label: 'Max weight (lbs)', input: { value: maxWeightLbs, onChange: (v) => setMaxWeightLbs(v.replace(/[^\d]/g, '')), inputMode: 'numeric', placeholder: '—' } },
    { key: 'commodityDescription', label: 'Commodity', input: { value: commodityDescription, onChange: setCommodityDescription, placeholder: 'e.g. Dry goods' } },
  ];

  const defaultsFields: FieldDef[] = [
    { key: 'defaultDriverId', label: 'Default driver', input: { value: defaultDriverId, onChange: setDefaultDriverId, options: [{ label: 'None', value: '' }, ...drivers.map((d) => ({ label: `${d.firstName} ${d.lastName}`, value: d.id }))] } },
    { key: 'defaultTruckId', label: 'Default truck', input: { value: defaultTruckId, onChange: setDefaultTruckId, options: [{ label: 'None', value: '' }, ...trucks.map((t) => ({ label: `Unit ${t.unitNumber}`, value: t.id }))] } },
  ];

  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', input: { value: notes, onChange: setNotes, multiline: true, placeholder: 'Anything worth remembering' } },
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="Route Template"
        onBack={() => router.push('/carrier/templates')}
        right={<NavTextButton label={saving ? 'Saving…' : 'Save'} emphasized onClick={save} disabled={saving} />}
      />

      {/* Identity */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <h1 className="text-center text-[22px] font-bold text-ds-txt">{templateName || 'Route template'}</h1>
        <p className="mt-1 text-center text-[13px] text-ds-txt3">
          {formatRecurrence(recurrenceRule || null, recurrenceTimezone, scheduledDepartureTime || null)}
        </p>
        <button
          type="button"
          onClick={toggleActive}
          disabled={togglingActive}
          className="mt-3 transition active:opacity-75 disabled:opacity-50"
          aria-label={active ? 'Deactivate template' : 'Activate template'}
        >
          <StatusPill label={active ? 'Active' : 'Inactive'} tone={active ? 'success' : 'neutral'} />
        </button>
        <p className="mt-1 text-[12px] text-ds-txt3">Tap to {active ? 'deactivate' : 'activate'}</p>
      </div>

      {/* Changes only affect future auto-generated trips */}
      <div className="mb-3 flex items-start gap-2 rounded-[20px] bg-ds-warning/[0.14] p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ds-warning" />
        <p className="text-[13px] text-ds-txt2">
          Changes apply to future auto-generated trips only. Trips already created are not affected.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <SectionHeader title="Details" />
          <FieldGroup fields={detailFields} isEditing />
        </div>
        <div>
          <SectionHeader title="Schedule" />
          <FieldGroup fields={scheduleFields} isEditing />
          {showRecurrence && rruleFrequency === 'WEEKLY' ? (
            <div className="mt-2 rounded-[20px] bg-ds-card p-4">
              <p className="mb-2 text-[13px] text-ds-txt2">Repeat on</p>
              <div className="flex gap-2">
                {WEEK_DAYS.map((d) => (
                  <Toggle
                    key={d.key}
                    label={d.label.slice(0, 1)}
                    ariaLabel={d.label}
                    on={rruleSelectedDays.includes(d.key)}
                    onChange={(next) =>
                      setRruleSelectedDays((prev) => (next ? [...prev, d.key] : prev.filter((x) => x !== d.key)))
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <SectionHeader title="Equipment" />
          <FieldGroup fields={equipmentFields} isEditing />
        </div>
        <div>
          <SectionHeader title="Defaults" />
          <FieldGroup fields={defaultsFields} isEditing />
        </div>

        {/* Stops — editable in place; the server requires at least one */}
        <MobileStopsEditor stops={stops} onChange={setStops} facilities={facilities} error={errors.stops} mode="template" />

        <div>
          <SectionHeader title="Notes" />
          <FieldGroup fields={notesFields} isEditing />
        </div>
      </div>
    </MobileScreen>
  );
}
