'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Building2, ChevronRight, FileText, Package, Route } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  UnitChip,
  StatusPill,
  ParentStrip,
  DocumentRow,
  SegmentedControl,
  FieldGroup,
  SectionHeader,
  EmptyState,
  Skeleton,
  type StatusTone,
  type FieldDef,
  type ParentChip,
} from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TruckDetailData {
  id: string;
  vehicleId: string | null;
  unitNumber: string;
  displayName: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  truckType: string;
  grossWeightLbs: number | null;
  payloadCapacityLbs: number | null;
  currentOdometerMiles: number | null;
  licensePlate: string | null;
  licenseState: string | null;
  registrationExpiry: string | null; // ISO
  licenseExpiry: string | null;
  insuranceExpiry: string | null;
  status: string; // stored: active | inactive | maintenance | out_of_service
  displayStatus: string; // computed: ready | on_load | in_shop | out_of_service | inactive
  notes: string | null;
}

export interface TruckTripRow {
  id: string;
  status: string;
  scheduledDeparture: string | null;
  miles: number | null;
  driver: string | null;
}

export interface TruckParent {
  load: { id: string; label: string } | null;
  client: { id: string; name: string } | null;
}

interface CarrierDocRow {
  id: string;
  filename: string;
  documentType?: string;
  verified?: boolean;
  createdAt?: string;
}

type Tab = 'details' | 'trips' | 'documents';

// ---------------------------------------------------------------------------
// Constants / formatting
// ---------------------------------------------------------------------------

const TRUCK_TYPE_OPTIONS = [
  { label: 'Cargo Van', value: 'cargo_van' },
  { label: 'Sprinter Van', value: 'sprinter_van' },
  { label: 'Pickup Truck', value: 'pickup' },
  { label: 'Car', value: 'car' },
  { label: 'Semi', value: 'semi' },
  { label: 'Box Truck', value: 'box_truck' },
  { label: 'Flatbed', value: 'flatbed' },
  { label: 'Reefer', value: 'reefer' },
  { label: 'Tanker', value: 'tanker' },
  { label: 'Day Cab', value: 'day_cab' },
  { label: 'Straight Truck', value: 'straight_truck' },
];
const TRUCK_TYPE_LABEL = Object.fromEntries(TRUCK_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const EXPIRY_THRESHOLD_DAYS = 30;

const num = (n: number | null | undefined) => (n != null ? n.toLocaleString('en-US') : null);
const digits = (s: string) => s.replace(/[^\d]/g, '');
const commafy = (s: string) => {
  const d = digits(s);
  return d ? Number(d).toLocaleString('en-US') : '';
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
/** Expiry tint: expired = danger, within threshold = warning, else untinted. */
function expiryTone(iso: string | null): StatusTone | undefined {
  if (!iso) return undefined;
  const d = daysUntil(iso);
  if (d < 0) return 'danger';
  if (d <= EXPIRY_THRESHOLD_DAYS) return 'warning';
  return undefined;
}

function displayStatusMeta(s: string): { tone: StatusTone; label: string } {
  switch (s) {
    case 'ready':
      return { tone: 'success', label: 'Ready' };
    case 'on_load':
      return { tone: 'accent', label: 'On Load' };
    case 'in_shop':
      return { tone: 'warning', label: 'In Shop' };
    case 'out_of_service':
      return { tone: 'danger', label: 'Out of service' };
    case 'inactive':
      return { tone: 'neutral', label: 'Inactive' };
    default:
      return { tone: 'neutral', label: s.replace(/_/g, ' ') };
  }
}
function tripStatusMeta(s: string): { tone: StatusTone; label: string } {
  switch (s) {
    case 'planned':
      return { tone: 'neutral', label: 'Planned' };
    case 'in_transit':
      return { tone: 'accent', label: 'In transit' };
    case 'completed':
      return { tone: 'success', label: 'Completed' };
    case 'cancelled':
      return { tone: 'danger', label: 'Cancelled' };
    default:
      return { tone: 'neutral', label: s.replace(/_/g, ' ') };
  }
}

function ChildListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-[20px] bg-ds-card p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail — one component, isEditing flag
// ---------------------------------------------------------------------------

const TABS: { label: string; value: Tab }[] = [
  { label: 'Details', value: 'details' },
  { label: 'Trips', value: 'trips' },
  { label: 'Docs', value: 'documents' },
];

export function TruckDetailMobile({
  truck,
  dispatches,
  parent,
  hasChildren,
  canEdit,
  initialEdit = false,
}: {
  truck: TruckDetailData;
  dispatches: TruckTripRow[];
  parent: TruckParent | null;
  /** Truck has trip history → immutable identifiers (unit #, VIN) are locked. */
  hasChildren: boolean;
  canEdit: boolean;
  initialEdit?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<TruckDetailData>(truck);
  const [isEditing, setIsEditing] = useState(initialEdit && canEdit);
  const [tab, setTab] = useState<Tab>('details');
  const [saving, setSaving] = useState(false);

  const makeForm = (d: TruckDetailData) => ({
    unitNumber: d.unitNumber ?? '',
    displayName: d.displayName ?? '',
    vin: d.vin ?? '',
    year: d.year != null ? String(d.year) : '',
    make: d.make ?? '',
    model: d.model ?? '',
    truckType: d.truckType ?? 'semi',
    grossWeightLbs: d.grossWeightLbs != null ? d.grossWeightLbs.toLocaleString('en-US') : '',
    payloadCapacityLbs: d.payloadCapacityLbs != null ? d.payloadCapacityLbs.toLocaleString('en-US') : '',
    currentOdometerMiles: d.currentOdometerMiles != null ? d.currentOdometerMiles.toLocaleString('en-US') : '',
    licensePlate: d.licensePlate ?? '',
    licenseState: d.licenseState ?? '',
    registrationExpiry: toDateInput(d.registrationExpiry),
    licenseExpiry: toDateInput(d.licenseExpiry),
    insuranceExpiry: toDateInput(d.insuranceExpiry),
    status: d.status ?? 'active',
    notes: d.notes ?? '',
  });
  type Form = ReturnType<typeof makeForm>;
  const [form, setForm] = useState<Form>(() => makeForm(truck));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const [documents, setDocuments] = useState<CarrierDocRow[] | null>(null);

  useEffect(() => {
    if (tab !== 'documents' || documents !== null) return;
    fetch(`/api/v1/carrier/documents?parent_type=truck&parent_id=${data.id}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setDocuments(j.data ?? []))
      .catch(() => setDocuments([]));
  }, [tab, documents, data.id]);

  function setField<K extends keyof Form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  const dirty = useMemo(() => {
    const base = makeForm(data);
    return (Object.keys(base) as (keyof Form)[]).some((k) => form[k].trim() !== base[k].trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, data]);

  // A numeric field: strip commas on focus, reformat on blur, keep digits on input.
  const numInput = (key: keyof Form) => ({
    value: form[key],
    onChange: (v: string) => setField(key, digits(v)),
    onFocus: () => setForm((p) => ({ ...p, [key]: digits(p[key]) })),
    onBlur: () => setForm((p) => ({ ...p, [key]: commafy(p[key]) })),
    inputMode: 'numeric' as const,
  });

  const dstatus = displayStatusMeta(data.displayStatus);
  const lockedIdReason = hasChildren ? 'Locked — this truck has trip history.' : undefined;

  // ---- field groups (one definition drives both view and edit) ----
  const identityFields: FieldDef[] = [
    {
      key: 'unitNumber',
      label: 'Unit number',
      value: data.unitNumber,
      editable: !hasChildren,
      lockReason: lockedIdReason,
      input: { value: form.unitNumber, onChange: (v) => setField('unitNumber', v), error: errors.unitNumber },
    },
    {
      key: 'displayName',
      label: 'Display name',
      value: data.displayName,
      input: { value: form.displayName, onChange: (v) => setField('displayName', v), placeholder: 'e.g. Big Red' },
    },
    {
      key: 'vehicleId',
      label: 'Vehicle ID',
      value: data.vehicleId,
      copyValue: data.vehicleId ?? undefined,
      editable: false,
      lockReason: 'System-generated ID.',
    },
    {
      key: 'vin',
      label: 'VIN',
      value: data.vin,
      copyValue: data.vin ?? undefined,
      editable: !hasChildren,
      lockReason: lockedIdReason,
      input: {
        value: form.vin,
        onChange: (v) => setField('vin', v.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17)),
        autoCapitalize: 'characters',
        maxLength: 17,
        error: errors.vin,
      },
    },
  ];

  const vehicleFields: FieldDef[] = [
    {
      key: 'year',
      label: 'Year',
      value: data.year != null ? String(data.year) : null,
      input: { value: form.year, onChange: (v) => setField('year', v.replace(/[^\d]/g, '').slice(0, 4)), inputMode: 'numeric', maxLength: 4, error: errors.year },
    },
    { key: 'make', label: 'Make', value: data.make, input: { value: form.make, onChange: (v) => setField('make', v), placeholder: 'e.g. Kenworth' } },
    { key: 'model', label: 'Model', value: data.model, input: { value: form.model, onChange: (v) => setField('model', v), placeholder: 'e.g. T680' } },
    { key: 'truckType', label: 'Type', value: TRUCK_TYPE_LABEL[data.truckType] ?? data.truckType, input: { value: form.truckType, onChange: (v) => setField('truckType', v), options: TRUCK_TYPE_OPTIONS } },
  ];

  const specsFields: FieldDef[] = [
    { key: 'grossWeightLbs', label: 'GVWR', value: data.grossWeightLbs != null ? `${num(data.grossWeightLbs)} lbs` : null, input: { ...numInput('grossWeightLbs'), placeholder: '80,000' } },
    { key: 'payloadCapacityLbs', label: 'Payload', value: data.payloadCapacityLbs != null ? `${num(data.payloadCapacityLbs)} lbs` : null, input: { ...numInput('payloadCapacityLbs'), placeholder: '44,000' } },
    { key: 'currentOdometerMiles', label: 'Odometer', value: data.currentOdometerMiles != null ? `${num(data.currentOdometerMiles)} mi` : null, input: { ...numInput('currentOdometerMiles'), placeholder: '125,000' } },
    // Status is the computed display status: a read-only row in view mode, and
    // omitted in edit (the identity header states it's computed).
    ...(isEditing
      ? []
      : [{ key: 'status', label: 'Status', value: dstatus.label, tone: dstatus.tone, editable: false } as FieldDef]),
  ];

  const complianceFields: FieldDef[] = [
    { key: 'licensePlate', label: 'License plate', value: data.licensePlate, input: { value: form.licensePlate, onChange: (v) => setField('licensePlate', v.toUpperCase()), autoCapitalize: 'characters' } },
    { key: 'licenseState', label: 'License state', value: data.licenseState, input: { value: form.licenseState, onChange: (v) => setField('licenseState', v.toUpperCase().slice(0, 2)), autoCapitalize: 'characters', maxLength: 2 } },
    { key: 'registrationExpiry', label: 'Registration expiry', value: data.registrationExpiry ? fmtDate(data.registrationExpiry) : null, tone: expiryTone(data.registrationExpiry), input: { value: form.registrationExpiry, onChange: (v) => setField('registrationExpiry', v), type: 'date' } },
    { key: 'licenseExpiry', label: 'Plate expiry', value: data.licenseExpiry ? fmtDate(data.licenseExpiry) : null, tone: expiryTone(data.licenseExpiry), input: { value: form.licenseExpiry, onChange: (v) => setField('licenseExpiry', v), type: 'date' } },
    { key: 'insuranceExpiry', label: 'Insurance expiry', value: data.insuranceExpiry ? fmtDate(data.insuranceExpiry) : null, tone: expiryTone(data.insuranceExpiry), input: { value: form.insuranceExpiry, onChange: (v) => setField('insuranceExpiry', v), type: 'date' } },
  ];

  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', value: data.notes, input: { value: form.notes, onChange: (v) => setField('notes', v), multiline: true, placeholder: 'Anything worth remembering' } },
  ];

  // ---- "costs me money soon" card: nearest expiry that is due/overdue ----
  const costCard = useMemo(() => {
    const items = [
      { label: 'Insurance', iso: data.insuranceExpiry },
      { label: 'Registration', iso: data.registrationExpiry },
      { label: 'Plate', iso: data.licenseExpiry },
    ].filter((x) => x.iso) as { label: string; iso: string }[];
    if (items.length === 0) return null;
    const soonest = items.reduce((a, b) => (daysUntil(a.iso) <= daysUntil(b.iso) ? a : b));
    const d = daysUntil(soonest.iso);
    if (d > EXPIRY_THRESHOLD_DAYS) return null; // nothing costs money soon
    const danger = d < 0;
    return {
      tone: (danger ? 'danger' : 'warning') as StatusTone,
      title: danger
        ? `${soonest.label} expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`
        : d === 0
          ? `${soonest.label} expires today`
          : `${soonest.label} expires in ${d} day${d === 1 ? '' : 's'}`,
    };
  }, [data.insuranceExpiry, data.registrationExpiry, data.licenseExpiry]);

  // ---- parent chips (active load + its client) ----
  const parentChips: ParentChip[] = [];
  if (parent?.load) {
    parentChips.push({ key: 'load', icon: Package, label: parent.load.label, onClick: () => router.push(`/carrier/loads/${parent.load!.id}`) });
  }
  if (parent?.client) {
    parentChips.push({ key: 'client', icon: Building2, label: parent.client.name, onClick: () => router.push(`/carrier/clients/${parent.client!.id}`) });
  }

  // ---- actions ----
  function startEdit() {
    setForm(makeForm(data));
    setErrors({});
    setTab('details');
    setIsEditing(true);
  }
  function cancelEdit() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    setForm(makeForm(data));
    setErrors({});
    setIsEditing(false);
  }

  function validate(): Partial<Record<keyof Form, string>> {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!hasChildren && !form.unitNumber.trim()) e.unitNumber = 'Unit number is required';
    if (!hasChildren && form.vin.trim() && !VIN_RE.test(form.vin.trim().toUpperCase())) {
      e.vin = 'VIN must be 17 characters (no I, O, Q)';
    }
    if (form.year.trim()) {
      const y = parseInt(form.year, 10);
      if (isNaN(y) || y < 1900 || y > new Date().getFullYear() + 1) e.year = 'Enter a valid year';
    }
    return e;
  }

  async function save() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      setTab('details');
      const firstKey = Object.keys(e)[0];
      requestAnimationFrame(() =>
        document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }

    // Guard an odometer that goes backwards behind an explicit confirm.
    const newOdo = form.currentOdometerMiles ? parseInt(digits(form.currentOdometerMiles), 10) : null;
    if (newOdo != null && data.currentOdometerMiles != null && newOdo < data.currentOdometerMiles) {
      if (!window.confirm(`New odometer (${num(newOdo)} mi) is lower than the current ${num(data.currentOdometerMiles)} mi. Save anyway?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const t = (s: string) => s.trim();
      const body: Record<string, unknown> = {
        displayName: t(form.displayName) || null,
        make: t(form.make),
        model: t(form.model),
        truckType: form.truckType,
        licensePlate: t(form.licensePlate),
        licenseState: t(form.licenseState) || undefined,
        registrationExpiry: form.registrationExpiry || null,
        licenseExpiry: form.licenseExpiry || null,
        insuranceExpiry: form.insuranceExpiry || null,
        notes: t(form.notes),
      };
      if (form.year.trim()) body.year = parseInt(form.year, 10);
      if (form.grossWeightLbs.trim()) body.grossWeightLbs = parseInt(digits(form.grossWeightLbs), 10);
      if (form.payloadCapacityLbs.trim()) body.payloadCapacityLbs = parseInt(digits(form.payloadCapacityLbs), 10);
      if (newOdo != null) body.currentOdometerMiles = newOdo;
      // Immutable identifiers only travel when still editable (no trip history).
      if (!hasChildren) {
        body.unitNumber = t(form.unitNumber);
        if (t(form.vin)) body.vin = t(form.vin).toUpperCase();
      }

      const res = await fetch(`/api/v1/carrier/fleet/trucks/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; field?: string };

      if (!res.ok) {
        setSaving(false);
        if (res.status === 409 && json.field === 'vin') {
          setErrors((prev) => ({ ...prev, vin: json.error ?? 'This VIN already exists.' }));
          return;
        }
        if (res.status === 409 && json.field === 'unitNumber') {
          setErrors((prev) => ({ ...prev, unitNumber: json.error ?? 'This unit number already exists.' }));
          return;
        }
        toast.error('Couldn’t save changes. Please try again.');
        return;
      }

      // Update in place — no navigation, values visible immediately.
      const next: TruckDetailData = {
        ...data,
        displayName: t(form.displayName) || null,
        make: t(form.make) || null,
        model: t(form.model) || null,
        truckType: form.truckType,
        year: form.year.trim() ? parseInt(form.year, 10) : null,
        grossWeightLbs: form.grossWeightLbs.trim() ? parseInt(digits(form.grossWeightLbs), 10) : null,
        payloadCapacityLbs: form.payloadCapacityLbs.trim() ? parseInt(digits(form.payloadCapacityLbs), 10) : null,
        currentOdometerMiles: newOdo,
        licensePlate: t(form.licensePlate) || null,
        licenseState: t(form.licenseState) || null,
        registrationExpiry: form.registrationExpiry || null,
        licenseExpiry: form.licenseExpiry || null,
        insuranceExpiry: form.insuranceExpiry || null,
        notes: t(form.notes) || null,
        ...(hasChildren ? {} : { unitNumber: t(form.unitNumber), vin: t(form.vin).toUpperCase() || null }),
      };
      setData(next);
      setIsEditing(false);
      setSaving(false);
      navigator.vibrate?.(10);
      router.refresh();
      toast.success('Truck updated');
    } catch {
      setSaving(false);
      toast.error('Network error — your changes are safe. Try again.');
    }
  }

  async function openDocument(id: string) {
    try {
      const res = await fetch(`/api/v1/carrier/documents/${id}/signed-url`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      window.open(json.signedUrl, '_blank');
    } catch {
      toast.error('Couldn’t open document');
    }
  }

  const title =
    data.make && data.model
      ? `${data.make} ${data.model}`
      : data.displayName || `Unit ${data.unitNumber}`;
  const subtitle = [data.displayName && data.make ? null : `Unit ${data.unitNumber}`, data.year ? String(data.year) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <MobileScreen className="pb-6 pt-2">
      <NavHeader
        title={isEditing ? 'Edit Truck' : 'Truck'}
        onBack={isEditing ? undefined : () => router.push('/carrier/fleet/trucks')}
        left={isEditing ? <NavTextButton label="Cancel" onClick={cancelEdit} /> : undefined}
        right={
          isEditing ? (
            <NavTextButton label={saving ? 'Saving…' : 'Save'} emphasized onClick={save} disabled={!dirty || saving} />
          ) : canEdit ? (
            <NavTextButton label="Edit" onClick={startEdit} />
          ) : undefined
        }
      />

      {/* Identity — condenses in edit: pill hides, status stated as computed */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <UnitChip number={data.unitNumber} size={72} />
        <h1 className="mt-3 text-center text-[22px] font-bold text-ds-txt">{title}</h1>
        {isEditing ? (
          <p className="mt-1 text-[13px] text-ds-txt3">Status is computed — not editable</p>
        ) : (
          <>
            {subtitle ? <p className="mt-1 text-[13px] text-ds-txt3">{subtitle}</p> : null}
            <div className="mt-2">
              <StatusPill label={dstatus.label} tone={dstatus.tone} />
            </div>
          </>
        )}
      </div>

      {/* Parents (view only — navigates away) */}
      {!isEditing && parentChips.length > 0 ? (
        <div className="pb-3">
          <ParentStrip items={parentChips} />
        </div>
      ) : null}

      {/* Costs-me-money-soon card (view only) */}
      {!isEditing && costCard ? (
        <button
          type="button"
          onClick={() => {
            setTab('details');
            requestAnimationFrame(() =>
              document.getElementById('truck-compliance')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            );
          }}
          className={
            'mb-3 flex w-full items-center gap-3 rounded-[20px] p-4 text-left transition active:opacity-75 ' +
            (costCard.tone === 'danger' ? 'bg-ds-danger/[0.14]' : 'bg-ds-warning/[0.14]')
          }
        >
          <AlertTriangle className={'h-5 w-5 shrink-0 ' + (costCard.tone === 'danger' ? 'text-ds-danger' : 'text-ds-warning')} />
          <div className="min-w-0 flex-1">
            <div className={'text-[15px] font-semibold ' + (costCard.tone === 'danger' ? 'text-ds-danger' : 'text-ds-warning')}>
              {costCard.title}
            </div>
            <div className="text-[13px] text-ds-txt2">Update it in Registration &amp; compliance</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-ds-txt3" />
        </button>
      ) : null}

      {/* Tabs — hidden in edit; editing is Details-only (children aren't editable) */}
      {isEditing ? (
        <div className="pt-1" />
      ) : (
        <div className="py-3">
          <SegmentedControl options={TABS} value={tab} onChange={setTab} />
        </div>
      )}

      {tab === 'details' ? (
        <div className="space-y-6">
          <div>
            <SectionHeader title="Identity" />
            <FieldGroup fields={identityFields} isEditing={isEditing} />
          </div>
          <div>
            <SectionHeader title="Vehicle" />
            <FieldGroup fields={vehicleFields} isEditing={isEditing} />
          </div>
          <div>
            <SectionHeader title="Specs" />
            <FieldGroup fields={specsFields} isEditing={isEditing} />
          </div>
          <div id="truck-compliance">
            <SectionHeader title="Registration & compliance" />
            <FieldGroup fields={complianceFields} isEditing={isEditing} />
          </div>
          <div>
            <SectionHeader title="Notes" />
            <FieldGroup fields={notesFields} isEditing={isEditing} />
          </div>
        </div>
      ) : null}

      {tab === 'trips' ? (
        dispatches.length === 0 ? (
          <EmptyState icon={Route} title="No trips yet" message="Dispatches assigned to this truck will appear here." />
        ) : (
          <div className="space-y-3">
            {dispatches.map((d) => {
              const s = tripStatusMeta(d.status);
              const meta = [d.miles != null ? `${num(d.miles)} mi` : null, d.driver].filter(Boolean).join(' · ');
              return (
                <DocumentRow
                  key={d.id}
                  icon={Route}
                  title={d.scheduledDeparture ? `Trip · ${fmtDate(d.scheduledDeparture)}` : `Trip ${d.id.slice(0, 8).toUpperCase()}`}
                  meta={meta || undefined}
                  pill={{ label: s.label, tone: s.tone }}
                  onOpen={() => router.push(`/carrier/trips/${d.id}`)}
                />
              );
            })}
          </div>
        )
      ) : null}

      {tab === 'documents' ? (
        documents === null ? (
          <ChildListSkeleton />
        ) : documents.length === 0 ? (
          <EmptyState icon={FileText} title="No documents" message="Registration, insurance, and inspection files will appear here." />
        ) : (
          <div className="space-y-3">
            {documents.map((d) => (
              <DocumentRow
                key={d.id}
                title={d.filename}
                meta={[d.createdAt ? fmtDate(d.createdAt) : null, d.verified ? 'Verified' : null].filter(Boolean).join(' · ') || undefined}
                pill={d.verified ? { label: 'Verified', tone: 'success' } : undefined}
                onOpen={() => openDocument(d.id)}
              />
            ))}
          </div>
        )
      ) : null}
    </MobileScreen>
  );
}
