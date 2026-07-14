'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, FileText, Package, Route, Truck } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  MonogramAvatar,
  StatusPill,
  ContactActionsRow,
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
import type { HOSDutyStatusLike } from '@/lib/hos/compute-hos-clocks';
import { DriverHoursTab, type HOSEntryDTO } from './DriverHoursTab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriverDetailData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  cdlNumberLast4: string | null;
  cdlClass: string | null;
  cdlState: string | null;
  cdlExpiry: string | null; // ISO
  homeTerminalId: string | null;
  homeTerminalName: string | null;
  payModel: string;
  payRate: number | null;
  payPeriod: string;
  status: string;
  notes: string | null;
  dutyStatus: HOSDutyStatusLike;
  invited: boolean;
}

export interface DriverTripRow {
  id: string;
  status: string;
  scheduledDeparture: string | null;
  miles: number | null;
  role: 'Primary' | 'Co-Driver';
  netPay: number | null;
}

export interface DriverParent {
  trip: { id: string; label: string } | null;
  truck: { id: string; label: string } | null;
}

interface CarrierDocRow {
  id: string;
  filename?: string;
  fileName?: string;
  documentType?: string;
  documentTypeName?: string | null;
  verified?: boolean;
  createdAt?: string;
}

type Tab = 'profile' | 'hours' | 'loads' | 'documents';

// ---------------------------------------------------------------------------
// Constants / formatting
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Drivers get more notice than trucks: license expiry warns at 90 days (past = danger).
const EXPIRY_THRESHOLD_DAYS = 90;

const PAY_MODEL_OPTIONS = [
  { label: 'Per mile', value: 'per_mile' },
  { label: 'Percentage', value: 'percentage' },
  { label: 'Flat rate', value: 'flat_rate' },
  { label: 'Per stop', value: 'per_stop' },
];
const PAY_MODEL_LABEL = Object.fromEntries(PAY_MODEL_OPTIONS.map((o) => [o.value, o.label]));
const PAY_PERIOD_OPTIONS = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Bi-weekly', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
];
const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Suspended', value: 'suspended' },
];

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
function expiryTone(iso: string | null): StatusTone | undefined {
  if (!iso) return undefined;
  const d = daysUntil(iso);
  if (d < 0) return 'danger';
  if (d <= EXPIRY_THRESHOLD_DAYS) return 'warning';
  return undefined;
}
function num(n: number | null | undefined) {
  return n != null ? n.toLocaleString('en-US') : null;
}

function dutyPillMeta(s: HOSDutyStatusLike, invited: boolean): { tone: StatusTone; label: string } {
  if (invited) return { tone: 'neutral', label: 'Invited' };
  switch (s) {
    case 'DRIVING':
      return { tone: 'accent', label: 'Driving' };
    case 'ON_DUTY':
      return { tone: 'success', label: 'On Duty' };
    case 'SLEEPER_BERTH':
      return { tone: 'neutral', label: 'Sleeper' };
    default:
      return { tone: 'neutral', label: 'Off Duty' };
  }
}
function tripStatusMeta(s: string): { tone: StatusTone; label: string } {
  switch (s) {
    case 'planned':
      return { tone: 'neutral', label: 'Planned' };
    case 'in_progress':
      return { tone: 'accent', label: 'In progress' };
    case 'completed':
      return { tone: 'success', label: 'Completed' };
    case 'cancelled':
      return { tone: 'danger', label: 'Cancelled' };
    default:
      return { tone: 'neutral', label: s.replace(/_/g, ' ') };
  }
}

/** CDL expiry banner text/tone when due or overdue. */
function cdlBanner(iso: string | null): { tone: 'danger' | 'warning'; title: string } | null {
  if (!iso) return null;
  const d = daysUntil(iso);
  if (d > EXPIRY_THRESHOLD_DAYS) return null;
  if (d < 0) return { tone: 'danger', title: `CDL expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago` };
  if (d === 0) return { tone: 'warning', title: 'CDL expires today' };
  return { tone: 'warning', title: `CDL expires in ${d} day${d === 1 ? '' : 's'}` };
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
  { label: 'Profile', value: 'profile' },
  { label: 'Hours', value: 'hours' },
  { label: 'Loads', value: 'loads' },
  { label: 'Docs', value: 'documents' },
];

export function DriverDetailMobile({
  driver,
  trips,
  parent,
  facilities,
  hosEntries,
  timezone,
  nowMs,
  canEdit,
  initialEdit = false,
}: {
  driver: DriverDetailData;
  trips: DriverTripRow[];
  parent: DriverParent | null;
  facilities: { id: string; name: string }[];
  hosEntries: HOSEntryDTO[];
  timezone: string;
  nowMs: number;
  canEdit: boolean;
  initialEdit?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<DriverDetailData>(driver);
  const [isEditing, setIsEditing] = useState(initialEdit && canEdit);
  const [tab, setTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);

  const makeForm = (d: DriverDetailData) => ({
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    cdlClass: d.cdlClass ?? '',
    cdlState: d.cdlState ?? '',
    cdlExpiry: toDateInput(d.cdlExpiry),
    homeTerminalId: d.homeTerminalId ?? '',
    payModel: d.payModel ?? 'per_mile',
    payRate: d.payRate != null ? String(d.payRate) : '',
    payPeriod: d.payPeriod ?? 'weekly',
    status: d.status ?? 'active',
    notes: d.notes ?? '',
  });
  type Form = ReturnType<typeof makeForm>;
  const [form, setForm] = useState<Form>(() => makeForm(driver));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const [documents, setDocuments] = useState<CarrierDocRow[] | null>(null);

  useEffect(() => {
    if (tab !== 'documents' || documents !== null) return;
    fetch(`/api/v1/carrier/documents?parent_type=driver&parent_id=${data.id}`)
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

  const duty = dutyPillMeta(data.dutyStatus, data.invited);
  const name = `${data.firstName} ${data.lastName}`.trim();

  // ---- field groups (one definition drives both view and edit) ----
  const identityFields: FieldDef[] = [
    { key: 'firstName', label: 'First name', value: data.firstName, input: { value: form.firstName, onChange: (v) => setField('firstName', v), error: errors.firstName } },
    { key: 'lastName', label: 'Last name', value: data.lastName, input: { value: form.lastName, onChange: (v) => setField('lastName', v), error: errors.lastName } },
  ];
  const contactFields: FieldDef[] = [
    { key: 'phone', label: 'Phone', value: data.phone, input: { value: form.phone, onChange: (v) => setField('phone', v), type: 'tel', inputMode: 'tel' } },
    { key: 'email', label: 'Email', value: data.email, input: { value: form.email, onChange: (v) => setField('email', v), type: 'email', inputMode: 'email', autoCapitalize: 'none', error: errors.email } },
  ];
  // License number is security-redacted to last-4 (full value is RBAC-gated + audited
  // behind a separate decrypt endpoint), shown state-prefixed like the mockup.
  const licenseValue = data.cdlNumberLast4
    ? `${data.cdlState ? data.cdlState + ' · ' : ''}•••• ${data.cdlNumberLast4}`
    : null;
  const licenseFields: FieldDef[] = [
    {
      key: 'cdlNumber',
      label: 'License',
      value: licenseValue,
      editable: false,
      lockReason: 'Full number is managed in the driver’s profile.',
    },
    { key: 'cdlClass', label: 'Class', value: data.cdlClass ? `Class ${data.cdlClass}` : null, input: { value: form.cdlClass, onChange: (v) => setField('cdlClass', v.toUpperCase().slice(0, 1)), autoCapitalize: 'characters', maxLength: 1, placeholder: 'A' } },
    { key: 'cdlState', label: 'State', value: data.cdlState, input: { value: form.cdlState, onChange: (v) => setField('cdlState', v.toUpperCase().slice(0, 2)), autoCapitalize: 'characters', maxLength: 2, placeholder: 'TX' } },
    { key: 'cdlExpiry', label: 'License expires', value: data.cdlExpiry ? fmtDate(data.cdlExpiry) : null, tone: expiryTone(data.cdlExpiry), input: { value: form.cdlExpiry, onChange: (v) => setField('cdlExpiry', v), type: 'date' } },
  ];
  const payFields: FieldDef[] = [
    { key: 'payModel', label: 'Pay model', value: PAY_MODEL_LABEL[data.payModel] ?? data.payModel, input: { value: form.payModel, onChange: (v) => setField('payModel', v), options: PAY_MODEL_OPTIONS } },
    { key: 'payRate', label: 'Pay rate', value: data.payRate != null ? String(data.payRate) : null, input: { value: form.payRate, onChange: (v) => setField('payRate', v.replace(/[^\d.]/g, '')), inputMode: 'decimal', placeholder: '0.00' } },
    { key: 'payPeriod', label: 'Pay period', value: PAY_PERIOD_OPTIONS.find((o) => o.value === data.payPeriod)?.label ?? data.payPeriod, input: { value: form.payPeriod, onChange: (v) => setField('payPeriod', v), options: PAY_PERIOD_OPTIONS } },
    { key: 'homeTerminalId', label: 'Home terminal', value: data.homeTerminalName, input: { value: form.homeTerminalId, onChange: (v) => setField('homeTerminalId', v), options: [{ label: '—', value: '' }, ...facilities.map((f) => ({ label: f.name, value: f.id }))] } },
    ...(isEditing
      ? [{ key: 'status', label: 'Status', value: data.status, input: { value: form.status, onChange: (v: string) => setField('status', v), options: STATUS_OPTIONS } } as FieldDef]
      : []),
  ];
  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', value: data.notes, input: { value: form.notes, onChange: (v) => setField('notes', v), multiline: true, placeholder: 'Anything worth remembering' } },
  ];

  const banner = cdlBanner(data.cdlExpiry);

  // ---- parent chips (active trip + its truck) ----
  const parentChips: ParentChip[] = [];
  if (parent?.trip) {
    parentChips.push({ key: 'trip', icon: Package, label: parent.trip.label, onClick: () => router.push(`/carrier/dispatches/${parent.trip!.id}`) });
  }
  if (parent?.truck) {
    parentChips.push({ key: 'truck', icon: Truck, label: parent.truck.label, onClick: () => router.push(`/carrier/fleet/trucks/${parent.truck!.id}`) });
  }

  // ---- actions ----
  function startEdit() {
    setForm(makeForm(data));
    setErrors({});
    setTab('profile');
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
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address';
    return e;
  }

  async function save() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      const firstKey = Object.keys(e)[0];
      requestAnimationFrame(() =>
        document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }

    setSaving(true);
    try {
      const t = (s: string) => s.trim();
      const body: Record<string, unknown> = {
        firstName: t(form.firstName),
        lastName: t(form.lastName),
        phone: t(form.phone),
        cdlClass: t(form.cdlClass) || undefined,
        cdlState: t(form.cdlState) || undefined,
        cdlExpiry: form.cdlExpiry || undefined,
        payModel: form.payModel,
        payPeriod: form.payPeriod,
        homeTerminalId: form.homeTerminalId || undefined,
        status: form.status,
        notes: t(form.notes),
      };
      if (t(form.email)) body.email = t(form.email);
      if (t(form.payRate)) body.payRate = parseFloat(form.payRate);

      const res = await fetch(`/api/v1/carrier/fleet/drivers/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaving(false);
        toast.error(json.error || 'Couldn’t save changes. Please try again.');
        return;
      }

      const next: DriverDetailData = {
        ...data,
        firstName: t(form.firstName),
        lastName: t(form.lastName),
        phone: t(form.phone) || null,
        email: t(form.email) || null,
        cdlClass: t(form.cdlClass) || null,
        cdlState: t(form.cdlState) || null,
        cdlExpiry: form.cdlExpiry || null,
        payModel: form.payModel,
        payRate: form.payRate ? parseFloat(form.payRate) : null,
        payPeriod: form.payPeriod,
        homeTerminalId: form.homeTerminalId || null,
        homeTerminalName: facilities.find((f) => f.id === form.homeTerminalId)?.name ?? null,
        status: form.status,
        notes: t(form.notes) || null,
      };
      setData(next);
      setIsEditing(false);
      setSaving(false);
      navigator.vibrate?.(10);
      router.refresh();
      toast.success('Driver updated');
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

  const tabsBar = <SegmentedControl options={TABS} value={tab} onChange={setTab} />;

  return (
    <MobileScreen className="pb-6 pt-2">
      <NavHeader
        title={isEditing ? 'Edit Driver' : 'Driver'}
        onBack={isEditing ? undefined : () => router.push('/carrier/fleet/drivers')}
        left={isEditing ? <NavTextButton label="Cancel" onClick={cancelEdit} /> : undefined}
        right={
          isEditing ? (
            <NavTextButton label={saving ? 'Saving…' : 'Save'} emphasized onClick={save} disabled={!dirty || saving} />
          ) : canEdit ? (
            <NavTextButton label="Edit" onClick={startEdit} />
          ) : undefined
        }
      />

      {isEditing ? (
        /* ---- Edit: profile only, stacked-label field groups ---- */
        <>
          <div className="flex flex-col items-center pb-4 pt-2">
            <MonogramAvatar name={name} size={72} />
            <h1 className="mt-3 text-center text-[22px] font-bold text-ds-txt">{name || 'Driver'}</h1>
            <p className="mt-1 text-[13px] text-ds-txt3">Editing profile</p>
          </div>
          <div className="space-y-6">
            <div><SectionHeader title="Identity" /><FieldGroup fields={identityFields} isEditing /></div>
            <div><SectionHeader title="Contact" /><FieldGroup fields={contactFields} isEditing /></div>
            <div><SectionHeader title="License" /><FieldGroup fields={licenseFields} isEditing /></div>
            <div><SectionHeader title="Pay" /><FieldGroup fields={payFields} isEditing /></div>
            <div><SectionHeader title="Notes" /><FieldGroup fields={notesFields} isEditing /></div>
          </div>
        </>
      ) : tab === 'hours' ? (
        /* ---- Hours: condensed sticky header with tabs pinned ---- */
        <>
          <div className="sticky top-0 z-20 -mx-5 bg-ds-bg px-5 pb-2 pt-1">
            <div className="flex items-center gap-3 pb-2">
              <MonogramAvatar name={name} size={40} />
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-ds-txt">{name}</span>
              <StatusPill label={duty.label} tone={duty.tone} />
            </div>
            {tabsBar}
          </div>
          <div className="pt-3">
            <DriverHoursTab entries={hosEntries} timezone={timezone} nowMs={nowMs} />
          </div>
        </>
      ) : (
        /* ---- View: full identity + parents + banner + tabs ---- */
        <>
          <div className="flex flex-col items-center pb-4 pt-2">
            <MonogramAvatar name={name} size={72} warning={banner?.tone === 'danger'} />
            <h1 className="mt-3 text-center text-[22px] font-bold text-ds-txt">{name}</h1>
            <div className="mt-2">
              <StatusPill label={duty.label} tone={duty.tone} />
            </div>
          </div>

          <div className="pb-2">
            <ContactActionsRow phone={data.phone} email={data.email} alwaysShow />
          </div>

          {parentChips.length > 0 ? (
            <div className="pb-3">
              <ParentStrip items={parentChips} />
            </div>
          ) : null}

          {banner ? (
            <button
              type="button"
              onClick={() => setTab('documents')}
              className={
                'mb-3 flex w-full items-center gap-3 rounded-[20px] p-4 text-left transition active:opacity-75 ' +
                (banner.tone === 'danger' ? 'bg-ds-danger/[0.14]' : 'bg-ds-warning/[0.14]')
              }
            >
              <AlertTriangle className={'h-5 w-5 shrink-0 ' + (banner.tone === 'danger' ? 'text-ds-danger' : 'text-ds-warning')} />
              <div className="min-w-0 flex-1">
                <div className={'text-[15px] font-semibold ' + (banner.tone === 'danger' ? 'text-ds-danger' : 'text-ds-warning')}>
                  {banner.title}
                </div>
                <div className="text-[13px] text-ds-txt2">Review it on the Docs tab</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ds-txt3" />
            </button>
          ) : null}

          <div className="py-3">{tabsBar}</div>

          {tab === 'profile' ? (
            <div className="space-y-6">
              <div><SectionHeader title="Contact" /><FieldGroup fields={contactFields} isEditing={false} /></div>
              <div><SectionHeader title="License" /><FieldGroup fields={licenseFields} isEditing={false} /></div>
              <div><SectionHeader title="Pay" /><FieldGroup fields={payFields} isEditing={false} /></div>
              <div><SectionHeader title="Notes" /><FieldGroup fields={notesFields} isEditing={false} /></div>
            </div>
          ) : null}

          {tab === 'loads' ? (
            trips.length === 0 ? (
              <EmptyState icon={Route} title="No trips yet" message="Dispatches assigned to this driver will appear here." />
            ) : (
              <div className="space-y-3">
                {trips.map((t) => {
                  const s = tripStatusMeta(t.status);
                  const meta = [
                    t.scheduledDeparture ? fmtDate(t.scheduledDeparture) : null,
                    t.miles != null ? `${num(t.miles)} mi` : null,
                    t.role === 'Co-Driver' ? 'Co-driver' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <DocumentRow
                      key={`${t.id}-${t.role}`}
                      icon={Route}
                      title={`Trip ${t.id.slice(0, 8).toUpperCase()}`}
                      meta={meta || undefined}
                      pill={{ label: s.label, tone: s.tone }}
                      onOpen={() => router.push(`/carrier/dispatches/${t.id}`)}
                    />
                  );
                })}
              </div>
            )
          ) : null}

          {tab === 'documents' ? (
            <div className="space-y-3">
              {banner ? (
                <div
                  className={
                    'flex items-center gap-3 rounded-[20px] p-4 ' +
                    (banner.tone === 'danger' ? 'bg-ds-danger/[0.14]' : 'bg-ds-warning/[0.14]')
                  }
                >
                  <AlertTriangle className={'h-5 w-5 shrink-0 ' + (banner.tone === 'danger' ? 'text-ds-danger' : 'text-ds-warning')} />
                  <span className={'text-[15px] font-semibold ' + (banner.tone === 'danger' ? 'text-ds-danger' : 'text-ds-warning')}>
                    {banner.title}
                  </span>
                </div>
              ) : null}
              {documents === null ? (
                <ChildListSkeleton />
              ) : documents.length === 0 ? (
                <EmptyState icon={FileText} title="No documents" message="CDL, medical card, and other files will appear here." />
              ) : (
                documents.map((d) => (
                  <DocumentRow
                    key={d.id}
                    title={d.documentTypeName ?? d.fileName ?? d.filename ?? 'Document'}
                    meta={[d.createdAt ? fmtDate(d.createdAt) : null, d.verified ? 'Verified' : null].filter(Boolean).join(' · ') || undefined}
                    pill={d.verified ? { label: 'Verified', tone: 'success' } : undefined}
                    onOpen={() => openDocument(d.id)}
                  />
                ))
              )}
            </div>
          ) : null}
        </>
      )}
    </MobileScreen>
  );
}
