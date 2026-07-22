'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Package, FileText, ScrollText } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  MonogramAvatar,
  StatusPill,
  ContactActionsRow,
  SegmentedControl,
  FieldGroup,
  SectionHeader,
  EmptyState,
  Skeleton,
  type StatusTone,
  type FieldDef,
} from '@/components/ui/ds';
import type { ContactInput } from '@/lib/carrier/client-contacts';
import {
  ContactsEditor,
  toContactRows,
  fromContactRows,
  type ContactRow,
} from '@/components/carrier/clients/ContactsEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientDetailData {
  id: string;
  name: string;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  taxId: string | null;
  status: string;
  primaryContact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  portalAccess: boolean;
  portalEmail: string | null;
  paymentTerms: number | null;
  creditLimit: string | null;
  notes: string | null;
  openLoadsCount: number;
  outstandingAR: string | null;
  contacts?: ContactInput[];
}

interface LoadRow {
  id: string;
  referenceNumber: string | null;
  status: string;
  totalRevenue: string | null;
  createdAt: string;
}
interface ContractRow {
  id: string;
  contractNumber: string;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
}
interface DocumentRow {
  id: string;
  documentType: string;
  documentTypeName: string | null;
  filename: string;
  uploadedAt: string;
  verified: boolean;
}

type Tab = 'details' | 'loads' | 'documents' | 'contracts';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function moneyFull(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function statusMeta(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case 'active':
      return { tone: 'success', label: 'Active' };
    case 'inactive':
      return { tone: 'neutral', label: 'Inactive' };
    case 'blocked':
      return { tone: 'danger', label: 'Blocked' };
    default:
      return { tone: 'neutral', label: status.charAt(0).toUpperCase() + status.slice(1) };
  }
}

function loadStatusTone(status: string): StatusTone {
  if (['delivered', 'invoiced', 'paid'].includes(status)) return 'success';
  if (['cancelled'].includes(status)) return 'danger';
  if (['in_transit', 'assigned', 'dispatched'].includes(status)) return 'accent';
  return 'neutral';
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Small child-tab row
// ---------------------------------------------------------------------------

function ChildRow({
  title,
  subline,
  right,
  onClick,
}: {
  title: string;
  subline?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-medium text-ds-txt">{title}</div>
        {subline ? <div className="mt-0.5 truncate text-[13px] text-ds-txt3">{subline}</div> : null}
      </div>
      {right ? <div className="shrink-0 self-start pt-0.5">{right}</div> : null}
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-[20px] bg-ds-card p-4 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition active:opacity-75`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
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
  { label: 'Loads', value: 'loads' },
  { label: 'Contracts', value: 'contracts' },
  { label: 'Docs', value: 'documents' },
];

export function ClientDetailMobile({
  client,
  initialEdit = false,
}: {
  client: ClientDetailData;
  initialEdit?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<ClientDetailData>(client);
  const [isEditing, setIsEditing] = useState(initialEdit);
  const [tab, setTab] = useState<Tab>('details');
  const [saving, setSaving] = useState(false);

  const makeForm = (d: ClientDetailData) => ({
    primaryContact: d.primaryContact ?? '',
    phone: d.phone ?? '',
    email: d.email ?? '',
    website: d.website ?? '',
    name: d.name ?? '',
    dbaName: d.dbaName ?? '',
    mcNumber: d.mcNumber ?? '',
    dotNumber: d.dotNumber ?? '',
    taxId: d.taxId ?? '',
    addressLine1: d.addressLine1 ?? '',
    addressLine2: d.addressLine2 ?? '',
    city: d.city ?? '',
    state: d.state ?? '',
    zip: d.zip ?? '',
    paymentTerms: d.paymentTerms != null ? String(d.paymentTerms) : '',
    creditLimit: d.creditLimit ?? '',
    portalAccess: d.portalAccess ? 'true' : 'false',
    portalEmail: d.portalEmail ?? '',
    notes: d.notes ?? '',
  });
  type Form = ReturnType<typeof makeForm>;
  const [form, setForm] = useState<Form>(() => makeForm(client));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [contactRows, setContactRows] = useState<ContactRow[]>(() => toContactRows(client.contacts));

  // Child records
  const [loads, setLoads] = useState<LoadRow[] | null>(null);
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);

  // Loads fetched on mount (powers the Recent Loads section + Loads tab).
  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/carrier/loads?client_id=${data.id}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => {
        if (alive) setLoads(j.data?.items ?? j.items ?? []);
      })
      .catch(() => alive && setLoads([]));
    return () => {
      alive = false;
    };
  }, [data.id]);

  useEffect(() => {
    if (tab !== 'contracts' || contracts !== null) return;
    fetch(`/api/v1/carrier/contracts?client_id=${data.id}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setContracts(j.data?.items ?? j.items ?? []))
      .catch(() => setContracts([]));
  }, [tab, contracts, data.id]);

  useEffect(() => {
    if (tab !== 'documents' || documents !== null) return;
    fetch(`/api/v1/carrier/clients/${data.id}/documents`)
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

  const status = statusMeta(data.status);

  // ---- field groups (one definition drives both view and edit) ----
  const contactFields: FieldDef[] = [
    { key: 'primaryContact', label: 'Primary contact', value: data.primaryContact, input: { value: form.primaryContact, onChange: (v) => setField('primaryContact', v), placeholder: 'Who you deal with' } },
    { key: 'phone', label: 'Phone', value: data.phone, input: { value: form.phone, onChange: (v) => setField('phone', v), type: 'tel', inputMode: 'tel' } },
    { key: 'email', label: 'Email', value: data.email, input: { value: form.email, onChange: (v) => setField('email', v), type: 'email', inputMode: 'email', autoCapitalize: 'none', error: errors.email } },
    { key: 'website', label: 'Website', value: data.website, input: { value: form.website, onChange: (v) => setField('website', v), type: 'url', inputMode: 'url', autoCapitalize: 'none' } },
  ];
  const companyFields: FieldDef[] = [
    { key: 'name', label: 'Legal name', value: data.name, input: { value: form.name, onChange: (v) => setField('name', v), error: errors.name } },
    { key: 'dbaName', label: 'DBA name', value: data.dbaName, input: { value: form.dbaName, onChange: (v) => setField('dbaName', v) } },
    { key: 'mcNumber', label: 'MC number', value: data.mcNumber, input: { value: form.mcNumber, onChange: (v) => setField('mcNumber', v), inputMode: 'numeric' } },
    { key: 'dotNumber', label: 'DOT number', value: data.dotNumber, input: { value: form.dotNumber, onChange: (v) => setField('dotNumber', v), inputMode: 'numeric' } },
    { key: 'taxId', label: 'Tax ID', value: data.taxId, input: { value: form.taxId, onChange: (v) => setField('taxId', v) } },
  ];
  const addressFields: FieldDef[] = [
    { key: 'addressLine1', label: 'Street', value: data.addressLine1, input: { value: form.addressLine1, onChange: (v) => setField('addressLine1', v) } },
    { key: 'addressLine2', label: 'Suite / Unit', value: data.addressLine2, input: { value: form.addressLine2, onChange: (v) => setField('addressLine2', v) } },
    { key: 'city', label: 'City', value: data.city, input: { value: form.city, onChange: (v) => setField('city', v) } },
    { key: 'state', label: 'State', value: data.state, input: { value: form.state, onChange: (v) => setField('state', v.toUpperCase().slice(0, 2)) } },
    { key: 'zip', label: 'ZIP', value: data.zip, input: { value: form.zip, onChange: (v) => setField('zip', v), inputMode: 'numeric' } },
  ];
  const billingFields: FieldDef[] = [
    { key: 'paymentTerms', label: 'Payment terms', value: data.paymentTerms != null ? `Net ${data.paymentTerms}` : null, input: { value: form.paymentTerms, onChange: (v) => setField('paymentTerms', v.replace(/[^\d]/g, '')), inputMode: 'numeric', placeholder: '30' } },
    { key: 'creditLimit', label: 'Credit limit', value: data.creditLimit ? moneyFull(Number(data.creditLimit)) : null, input: { value: form.creditLimit, onChange: (v) => setField('creditLimit', v.replace(/[^\d.]/g, '')), inputMode: 'decimal', placeholder: '0' } },
    { key: 'portalAccess', label: 'Portal access', value: data.portalAccess ? 'Enabled' : 'Disabled', input: { value: form.portalAccess, onChange: (v) => setField('portalAccess', v), options: [{ label: 'Disabled', value: 'false' }, { label: 'Enabled', value: 'true' }] } },
    { key: 'portalEmail', label: 'Portal email', value: data.portalEmail, input: { value: form.portalEmail, onChange: (v) => setField('portalEmail', v), type: 'email', inputMode: 'email', autoCapitalize: 'none', error: errors.portalEmail } },
  ];
  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', value: data.notes, input: { value: form.notes, onChange: (v) => setField('notes', v), multiline: true, placeholder: 'Anything worth remembering' } },
  ];

  // ---- actions ----
  function startEdit() {
    setForm(makeForm(data));
    setErrors({});
    setContactRows(toContactRows(data.contacts));
    setIsEditing(true);
  }

  function cancelEdit() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    setForm(makeForm(data));
    setErrors({});
    setContactRows(toContactRows(data.contacts));
    setIsEditing(false);
  }

  function validate(): Partial<Record<keyof Form, string>> {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.name.trim()) e.name = 'Legal name is required';
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (form.portalAccess === 'true') {
      if (!form.portalEmail.trim()) e.portalEmail = 'Portal email is required when portal access is on';
      else if (!EMAIL_RE.test(form.portalEmail.trim())) e.portalEmail = 'Enter a valid portal email';
    } else if (form.portalEmail.trim() && !EMAIL_RE.test(form.portalEmail.trim())) {
      e.portalEmail = 'Enter a valid portal email';
    }
    return e;
  }

  async function save() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      const firstKey = Object.keys(e)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSaving(true);
    try {
      const t = (s: string) => s.trim();
      const body: Record<string, unknown> = {
        name: t(form.name),
        primaryContact: t(form.primaryContact),
        dbaName: t(form.dbaName),
        mcNumber: t(form.mcNumber),
        dotNumber: t(form.dotNumber),
        taxId: t(form.taxId),
        phone: t(form.phone),
        addressLine1: t(form.addressLine1),
        addressLine2: t(form.addressLine2),
        city: t(form.city),
        state: t(form.state),
        zip: t(form.zip),
        portalAccess: form.portalAccess === 'true',
        paymentTerms: parseInt(form.paymentTerms || '0', 10) || 0,
        creditLimit: form.creditLimit ? form.creditLimit : null,
        notes: t(form.notes),
        contacts: fromContactRows(contactRows),
      };
      // Email-format fields: only send when non-empty (schema rejects '').
      if (t(form.email)) body.email = t(form.email);
      if (t(form.website)) body.website = t(form.website);
      if (t(form.portalEmail)) body.portalEmail = t(form.portalEmail);

      const res = await fetch(`/api/v1/carrier/clients/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { contacts?: ContactInput[] };
      };

      if (!res.ok) {
        setSaving(false);
        if (res.status === 409 || json.error === 'DUPLICATE_NAME') {
          setErrors((prev) => ({ ...prev, name: 'A client with this name already exists.' }));
          document.getElementById('field-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        toast.error('Couldn’t save changes. Please try again.');
        return;
      }

      // Update in place — no navigation, values visible immediately.
      const next: ClientDetailData = {
        ...data,
        name: t(form.name),
        primaryContact: t(form.primaryContact) || null,
        dbaName: t(form.dbaName) || null,
        mcNumber: t(form.mcNumber) || null,
        dotNumber: t(form.dotNumber) || null,
        taxId: t(form.taxId) || null,
        email: t(form.email) || null,
        phone: t(form.phone) || null,
        website: t(form.website) || null,
        addressLine1: t(form.addressLine1) || null,
        addressLine2: t(form.addressLine2) || null,
        city: t(form.city) || null,
        state: t(form.state) || null,
        zip: t(form.zip) || null,
        portalAccess: form.portalAccess === 'true',
        portalEmail: t(form.portalEmail) || null,
        paymentTerms: parseInt(form.paymentTerms || '0', 10) || 0,
        creditLimit: form.creditLimit || null,
        notes: t(form.notes) || null,
        contacts: json.data?.contacts ?? fromContactRows(contactRows),
      };
      setData(next);
      setContactRows(toContactRows(next.contacts));
      setIsEditing(false);
      setSaving(false);
      navigator.vibrate?.(10);
      router.refresh();
      toast.success('Client updated');
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

  const recentLoads = (loads ?? []).slice(0, 3);

  return (
    <MobileScreen className="pb-6 pt-2">
      <NavHeader
        title="Client"
        onBack={
          isEditing
            ? undefined
            : () => {
                // Return to wherever we came from (e.g. the Revenue report), not
                // always the Clients list; fall back to the list on a cold deep-link.
                if (typeof window !== 'undefined' && window.history.length > 1) router.back();
                else router.push('/carrier/clients');
              }
        }
        left={isEditing ? <NavTextButton label="Cancel" onClick={cancelEdit} /> : undefined}
        right={
          isEditing ? (
            <NavTextButton label={saving ? 'Saving…' : 'Save'} emphasized onClick={save} disabled={!dirty || saving} />
          ) : (
            <NavTextButton label="Edit" onClick={startEdit} />
          )
        }
      />

      {/* Identity */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <MonogramAvatar name={data.name} size={72} />
        <h1 className="mt-3 text-center text-[22px] font-bold text-ds-txt">{data.name}</h1>
        <div className="mt-2">
          <StatusPill label={status.label} tone={status.tone} />
        </div>
      </div>

      {/* Contact actions (view only) */}
      {!isEditing ? (
        <div className="pb-2">
          {/* alwaysShow: a client has a named primary contact, so Call/Message/Mail
              are part of the identity here — a channel not on file shows muted as a
              prompt to add it, rather than the row collapsing to a lone button. */}
          <ContactActionsRow phone={data.phone} email={data.email} alwaysShow />
        </div>
      ) : null}

      {/* Tabs */}
      <div className="py-3">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {/* Tab content */}
      {tab === 'details' ? (
        <div className="space-y-6">
          <div>
            <SectionHeader title="Contact" />
            <FieldGroup fields={contactFields} isEditing={isEditing} />
          </div>
          <div>
            <SectionHeader title="Contacts" />
            {isEditing ? (
              <div className="rounded-[20px] bg-ds-card p-4">
                <ContactsEditor rows={contactRows} onChange={setContactRows} />
              </div>
            ) : data.contacts && data.contacts.length > 0 ? (
              <div className="space-y-3">
                {data.contacts.map((c, i) => (
                  <div key={c.id ?? i} className="rounded-[20px] bg-ds-card p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-medium text-ds-txt">{c.name}</span>
                      {c.isMain ? <StatusPill label="Main" tone="accent" /> : null}
                    </div>
                    {c.role ? <div className="mt-0.5 text-[13px] text-ds-txt3">{c.role}</div> : null}
                    <div className="mt-1 text-[13px] text-ds-txt3">
                      {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] bg-ds-card p-4 text-[15px] text-ds-txt3">
                No contacts added yet.
              </div>
            )}
          </div>
          <div>
            <SectionHeader title="Company" />
            <FieldGroup fields={companyFields} isEditing={isEditing} />
          </div>
          <div>
            <SectionHeader title="Address" />
            <FieldGroup fields={addressFields} isEditing={isEditing} />
          </div>
          <div>
            <SectionHeader title="Billing" />
            <FieldGroup fields={billingFields} isEditing={isEditing} />
          </div>
          <div>
            <SectionHeader title="Notes" />
            <FieldGroup fields={notesFields} isEditing={isEditing} />
          </div>

          {!isEditing && recentLoads.length > 0 ? (
            <div>
              <SectionHeader title="Recent loads" action={{ label: 'See all', onClick: () => setTab('loads') }} />
              <div className="space-y-3">
                {recentLoads.map((l) => (
                  <ChildRow
                    key={l.id}
                    title={l.referenceNumber ?? 'Load'}
                    subline={`${fmtDate(l.createdAt)}${l.totalRevenue ? ` · ${moneyFull(Number(l.totalRevenue))}` : ''}`}
                    right={<StatusPill label={titleCase(l.status)} tone={loadStatusTone(l.status)} />}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'loads' ? (
        loads === null ? (
          <ChildListSkeleton />
        ) : loads.length === 0 ? (
          <EmptyState icon={Package} title="No loads yet" message="Loads for this client will appear here." />
        ) : (
          <div className="space-y-3">
            {loads.map((l) => (
              <ChildRow
                key={l.id}
                title={l.referenceNumber ?? 'Load'}
                subline={`${fmtDate(l.createdAt)}${l.totalRevenue ? ` · ${moneyFull(Number(l.totalRevenue))}` : ''}`}
                right={<StatusPill label={titleCase(l.status)} tone={loadStatusTone(l.status)} />}
              />
            ))}
          </div>
        )
      ) : null}

      {tab === 'documents' ? (
        documents === null ? (
          <ChildListSkeleton />
        ) : documents.length === 0 ? (
          <EmptyState icon={FileText} title="No documents" message="Uploaded documents will appear here." />
        ) : (
          <div className="space-y-3">
            {documents.map((d) => (
              <ChildRow
                key={d.id}
                title={d.documentTypeName ?? d.filename}
                subline={`${fmtDate(d.uploadedAt)}${d.verified ? ' · Verified' : ''}`}
                onClick={() => openDocument(d.id)}
              />
            ))}
          </div>
        )
      ) : null}

      {tab === 'contracts' ? (
        contracts === null ? (
          <ChildListSkeleton />
        ) : contracts.length === 0 ? (
          <EmptyState icon={ScrollText} title="No contracts" message="Contracts for this client will appear here." />
        ) : (
          <div className="space-y-3">
            {contracts.map((c) => (
              <ChildRow
                key={c.id}
                title={c.contractNumber}
                subline={c.effectiveDate ? `Effective ${fmtDate(c.effectiveDate)}` : undefined}
                right={<StatusPill label={titleCase(c.status)} tone={c.status === 'active' ? 'success' : 'neutral'} />}
              />
            ))}
          </div>
        )
      ) : null}
    </MobileScreen>
  );
}
