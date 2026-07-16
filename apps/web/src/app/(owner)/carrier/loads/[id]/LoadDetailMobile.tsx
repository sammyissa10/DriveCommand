'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MapPin, Truck, Users } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  StatusPill,
  SegmentedControl,
  SectionHeader,
  FieldGroup,
  Toggle,
  ParentStrip,
  SheetContainer,
  PrimaryButton,
  EmptyState,
  MonogramAvatar,
  type StatusTone,
  type FieldDef,
  type ParentChip,
} from '@/components/ui/ds';
import type { StopBuilderStop } from '@/components/carrier/stops/StopCard';
import { MobileStopsEditor, type FacilityOption } from '@/components/carrier/stops/MobileStopsEditor';
import { calculateRevenuePreview } from '@/lib/carrier/revenue-preview';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';

// ---------------------------------------------------------------------------
// Types — mirror the server page's serialized load
// ---------------------------------------------------------------------------

export interface LoadDetailData {
  id: string;
  referenceNumber: string;
  status: string;
  clientId: string;
  contractId: string | null;
  dispatchId: string | null;
  loadType: string;
  bolNumber: string | null;
  poNumber: string | null;
  commodityDescription: string | null;
  commodityWeightLbs: number | null;
  commodityPieces: number | null;
  hazmat: boolean;
  rateType: string;
  rateAmount: number | null;
  otherCharges: number | null;
  brokerFlag: boolean;
  carrierCost: number | null;
  specialInstructions: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  contractNumber: string | null;
  contractName: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
}

interface DriverOption {
  id: string;
  name: string;
  status: string;
}

interface TruckOption {
  id: string;
  unitNumber: string;
  make: string | null;
  model: string | null;
}

export interface LoadAuditData {
  createdAt: string;
  createdByName: string | null;
  createdByEmail: string | null;
  updatedAt: string;
  updatedByName: string | null;
  updatedByEmail: string | null;
}

// ---------------------------------------------------------------------------
// Vocabulary — mirrors the desktop LoadForm + LoadsMobile
// ---------------------------------------------------------------------------

// Matches the CarrierLoad.loadType enum (LoadCreateSchema in loads/route.ts) — the
// desktop select is the source of truth, not NewLoadMobile's drifted list.
const LOAD_TYPES = [
  { label: 'FTL', value: 'ftl' },
  { label: 'LTL', value: 'ltl' },
  { label: 'Partial', value: 'partial' },
  { label: 'Drayage', value: 'drayage' },
  { label: 'Intermodal', value: 'intermodal' },
];
const LOAD_TYPE_LABEL: Record<string, string> = {
  ftl: 'FTL',
  ltl: 'LTL',
  partial: 'Partial',
  drayage: 'Drayage',
  intermodal: 'Intermodal',
};

const RATE_TYPES = [
  { label: 'Flat rate', value: 'flat' },
  { label: 'Per mile', value: 'per_mile' },
  { label: 'Per load', value: 'per_load' },
  { label: 'Per hour', value: 'per_hour' },
  { label: 'Per delivery stop', value: 'per_stop' },
  { label: 'Per CWT', value: 'per_cwt' },
  { label: 'Per pallet', value: 'per_pallet' },
  { label: 'Hourly', value: 'hourly' },
];
const RATE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  RATE_TYPES.map((r) => [r.value, r.label]),
);

/** Reuse LoadsMobile's STATUS_META tones exactly — locked decision (see mobile-design-system.md §12). */
const STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'neutral', label: 'Pending' },
  in_transit: { tone: 'accent', label: 'In transit' },
  delivered: { tone: 'success', label: 'Delivered' },
  invoiced: { tone: 'success', label: 'Invoiced' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
};

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
/** Strip display formatting back to something Number() can read. */
const raw = (s: string) => s.replace(/[^\d.]/g, '');
const num = (s: string) => Number(raw(s)) || 0;
/** 2400 -> "2,400.00" on blur; §7 wants money to format live. */
function fmtMoneyInput(s: string): string {
  const v = raw(s);
  if (!v) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** 125000 -> "125,000" on blur. */
function fmtIntInput(s: string): string {
  const v = s.replace(/[^\d]/g, '');
  if (!v) return '';
  return Number(v).toLocaleString('en-US');
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtWindow(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const st = new Date(start);
  if (isNaN(st.getTime())) return null;
  const sStr = st.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!end) return sStr;
  const e = new Date(end);
  if (isNaN(e.getTime())) return sStr;
  return `${sStr} – ${e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
/** Tomorrow at 08:00 local — same default the desktop DispatchLoadModal uses. */
function getDefaultDeparture(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** From 30 days ago to 90 days out — covers most planned trips. */
function getWideDateRange() {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const to = new Date();
  to.setDate(to.getDate() + 90);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

const STOP_TYPE_LABEL: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel_stop: 'Fuel stop',
  layover: 'Layover',
};
const STOP_STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'neutral', label: 'Pending' },
  arrived: { tone: 'accent', label: 'Arrived' },
  completed: { tone: 'success', label: 'Completed' },
  skipped: { tone: 'warning', label: 'Skipped' },
};
const DOT_BG: Record<StatusTone, string> = {
  success: 'bg-ds-success',
  accent: 'bg-ds-accent',
  warning: 'bg-ds-warning',
  danger: 'bg-ds-danger',
  neutral: 'bg-ds-txt3',
  vip: 'bg-ds-vip',
};

const PAY_STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'neutral', label: 'Draft' },
  PENDING_REVIEW: { tone: 'warning', label: 'Pending review' },
  APPROVED: { tone: 'accent', label: 'Approved' },
  PAID: { tone: 'success', label: 'Paid' },
  DISPUTED: { tone: 'danger', label: 'Disputed' },
  CORRECTED: { tone: 'neutral', label: 'Corrected' },
};
/** Ported from assignment-card.tsx's formatRate — same rate vocabulary. */
function formatAssignmentRate(a: SerializedAssignment): string {
  const rate = Number(a.baseRate);
  switch (a.payType) {
    case 'CPM':
      return `$${rate.toFixed(4)}/mile`;
    case 'HOURLY':
      return `$${rate.toFixed(2)}/hr`;
    case 'FLAT_PER_LOAD':
      return `$${rate.toFixed(2)} flat`;
    case 'PERCENTAGE':
      return `${(rate * 100).toFixed(1)}% of load gross`;
    case 'DAILY':
      return `$${rate.toFixed(2)}/day`;
    case 'SALARY':
      return `$${rate.toFixed(2)}/yr`;
    default:
      return `$${rate.toFixed(4)}`;
  }
}

type Tab = 'details' | 'stops' | 'assignments';
const TABS: { label: string; value: Tab }[] = [
  { label: 'Details', value: 'details' },
  { label: 'Stops', value: 'stops' },
  { label: 'Assignments', value: 'assignments' },
];

// ---------------------------------------------------------------------------
// Load Detail — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function LoadDetailMobile({
  load,
  clients,
  contracts,
  facilities,
  driverOptions,
  truckOptions,
  stops: initialStops,
  stopStatusMap,
  dispatchNumber,
  pendingStopCount,
  loadAudit,
  initialAssignments,
}: {
  load: LoadDetailData;
  clients: ClientOption[];
  contracts: Contract[];
  facilities: FacilityOption[];
  driverOptions: DriverOption[];
  truckOptions: TruckOption[];
  stops: StopBuilderStop[];
  stopStatusMap: Record<string, string>;
  dispatchNumber: string | null;
  pendingStopCount: number;
  loadAudit: LoadAuditData | null;
  initialAssignments: SerializedAssignment[];
}) {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('details');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stops, setStops] = useState<StopBuilderStop[]>(initialStops);

  // ---- Add to Trip sheet ----
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [existingTrips, setExistingTrips] = useState<{ id: string; label: string }[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [selectedExistingTripId, setSelectedExistingTripId] = useState('');
  const [tripPrimaryDriverId, setTripPrimaryDriverId] = useState('');
  const [tripTruckId, setTripTruckId] = useState('');
  const [tripScheduledDeparture, setTripScheduledDeparture] = useState(getDefaultDeparture());
  const [tripPlannedMiles, setTripPlannedMiles] = useState('');
  const [addingToTrip, setAddingToTrip] = useState(false);
  const [addTripError, setAddTripError] = useState<string | null>(null);

  // ---- Cancel Load sheet ----
  const [cancelOpen, setCancelOpen] = useState(false);
  const [removeStops, setRemoveStops] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const makeEditForm = () => ({
    clientId: load.clientId,
    contractId: load.contractId ?? '',
    loadType: load.loadType,
    bolNumber: load.bolNumber ?? '',
    poNumber: load.poNumber ?? '',
    commodityDescription: load.commodityDescription ?? '',
    commodityWeightLbs: load.commodityWeightLbs != null ? String(load.commodityWeightLbs) : '',
    commodityPieces: load.commodityPieces != null ? String(load.commodityPieces) : '',
    hazmat: load.hazmat,
    rateType: load.rateType,
    rateAmount: load.rateAmount != null ? String(load.rateAmount) : '',
    otherCharges: load.otherCharges != null ? String(load.otherCharges) : '',
    brokerFlag: load.brokerFlag,
    carrierCost: load.carrierCost != null ? String(load.carrierCost) : '',
    // CarrierLoad has no planned_miles column (calc-only override) — desktop's
    // initialData never sets it either, so edit always starts blank.
    plannedMiles: '',
    specialInstructions: load.specialInstructions ?? '',
  });
  type EditForm = ReturnType<typeof makeEditForm>;
  const [editForm, setEditForm] = useState<EditForm>(makeEditForm);

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((p) => ({ ...p, [key]: value }));
  }

  const dirty = useMemo(() => {
    const base = makeEditForm();
    return (
      editForm.clientId !== base.clientId ||
      editForm.contractId !== base.contractId ||
      editForm.loadType !== base.loadType ||
      editForm.bolNumber !== base.bolNumber ||
      editForm.poNumber !== base.poNumber ||
      editForm.commodityDescription !== base.commodityDescription ||
      num(editForm.commodityWeightLbs) !== num(base.commodityWeightLbs) ||
      num(editForm.commodityPieces) !== num(base.commodityPieces) ||
      editForm.hazmat !== base.hazmat ||
      editForm.rateType !== base.rateType ||
      num(editForm.rateAmount) !== num(base.rateAmount) ||
      num(editForm.otherCharges) !== num(base.otherCharges) ||
      editForm.brokerFlag !== base.brokerFlag ||
      num(editForm.carrierCost) !== num(base.carrierCost) ||
      num(editForm.plannedMiles) !== num(base.plannedMiles) ||
      editForm.specialInstructions !== base.specialInstructions ||
      JSON.stringify(stops) !== JSON.stringify(initialStops)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm, stops, load]);

  const s = STATUS_META[load.status] ?? { tone: 'neutral' as StatusTone, label: load.status.replace(/_/g, ' ') };

  const clientName = clients.find((c) => c.id === load.clientId)?.name ?? null;
  const contractName = (id: string) => {
    const c = contracts.find((x) => x.id === id);
    return c ? c.contractName ?? c.contractNumber ?? 'Contract' : null;
  };

  const deliveryStopCount = useMemo(() => stops.filter((st) => st.stop_type === 'delivery').length, [stops]);
  const preview = useMemo(
    () =>
      calculateRevenuePreview({
        rateType: editForm.rateType,
        rateAmount: num(editForm.rateAmount),
        weightLbs: num(editForm.commodityWeightLbs),
        otherCharges: num(editForm.otherCharges),
        brokerFlag: editForm.brokerFlag,
        carrierCost: num(editForm.carrierCost),
        plannedMiles: num(editForm.plannedMiles),
        deliveryStopCount,
      }),
    [editForm, deliveryStopCount],
  );

  function startEdit() {
    setEditForm(makeEditForm());
    setStops(initialStops);
    setErrors({});
    setIsEditing(true);
  }
  function cancelEdit() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    setEditForm(makeEditForm());
    setStops(initialStops);
    setErrors({});
    setIsEditing(false);
  }

  /** Picking a contract auto-fills its rate — same fields the desktop fills. */
  function handleContractChange(next: string) {
    setField('contractId', next);
    if (!next) return;
    const contract = contracts.find((c) => c.id === next);
    if (!contract) return;
    if (contract.rateType) setField('rateType', contract.rateType);
    if (contract.baseRate != null) setField('rateAmount', String(contract.baseRate));
    toast.message('Rate filled from contract', { description: 'Change it if this load is different.' });
  }

  // Fetch existing planned trips when the Existing-trip mode is chosen — same
  // wide date range + endpoint the desktop DispatchLoadModal uses.
  useEffect(() => {
    if (!(addToTripOpen && addMode === 'existing')) return;
    setLoadingTrips(true);
    const { dateFrom, dateTo } = getWideDateRange();
    const params = new URLSearchParams({ status: 'planned', pageSize: '100', date_from: dateFrom, date_to: dateTo });
    fetch(`/api/v1/carrier/dispatches?${params.toString()}`)
      .then((r) => r.json())
      .then((body) => {
        interface TripItem {
          id: string;
          notes: string | null;
          scheduledDeparture: string;
          primaryDriver?: { firstName: string; lastName: string };
        }
        const items = (body.data?.items ?? []) as TripItem[];
        setExistingTrips(
          items.map((t) => {
            const match = t.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
            const tripNumber = match ? match[1] : t.id.slice(0, 8);
            const driverName = t.primaryDriver ? `${t.primaryDriver.firstName} ${t.primaryDriver.lastName}` : 'No driver';
            const date = new Date(t.scheduledDeparture).toLocaleDateString();
            return { id: t.id, label: `${tripNumber} - ${driverName} - ${date}` };
          }),
        );
      })
      .catch(() => toast.error('Failed to load trips'))
      .finally(() => setLoadingTrips(false));
  }, [addToTripOpen, addMode]);

  function openAddToTrip() {
    setAddMode('new');
    setSelectedExistingTripId('');
    setTripPrimaryDriverId('');
    setTripTruckId('');
    setTripScheduledDeparture(getDefaultDeparture());
    setTripPlannedMiles('');
    setAddTripError(null);
    setAddToTripOpen(true);
  }

  async function submitAddToTrip() {
    if (addMode === 'existing') {
      if (!selectedExistingTripId) {
        setAddTripError('Please select a trip.');
        return;
      }
    } else {
      if (!tripPrimaryDriverId) {
        setAddTripError('Primary driver is required.');
        return;
      }
      if (!tripTruckId) {
        setAddTripError('Truck is required.');
        return;
      }
      if (!tripScheduledDeparture) {
        setAddTripError('Scheduled departure is required.');
        return;
      }
    }

    setAddingToTrip(true);
    setAddTripError(null);
    try {
      let dispatchId: string;
      if (addMode === 'existing') {
        dispatchId = selectedExistingTripId;
      } else {
        // Route-template prefill and co-driver are desktop-only conveniences here —
        // deliberately out of scope for putting a load on a trip from mobile. The
        // desktop Add to Trip modal stays available at lg+ for that.
        const dispatchBody: Record<string, unknown> = {
          primaryDriverId: tripPrimaryDriverId,
          truckId: tripTruckId,
          scheduledDeparture: new Date(tripScheduledDeparture).toISOString(),
        };
        if (tripPlannedMiles) dispatchBody.plannedMiles = num(tripPlannedMiles);

        const dispatchRes = await fetch('/api/v1/carrier/dispatches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dispatchBody),
        });
        if (!dispatchRes.ok) {
          const data = await dispatchRes.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to create trip');
        }
        const dispatchData = await dispatchRes.json();
        const newDispatchId: string | undefined = dispatchData.data?.id;
        if (!newDispatchId) throw new Error('No trip ID returned from server');
        dispatchId = newDispatchId;
      }

      const loadRes = await fetch(`/api/v1/carrier/loads/${load.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatchId }),
      });
      if (!loadRes.ok) {
        const data = await loadRes.json().catch(() => ({}));
        // In 'new' mode the trip may already exist at this point — surface the
        // real error rather than a silent success, same two-step handling the
        // desktop DispatchLoadModal uses.
        throw new Error(data.error ?? 'Trip created but could not be attached to this load');
      }

      navigator.vibrate?.(10);
      toast.success('Load added to trip');
      setAddToTripOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add load to trip';
      setAddTripError(msg);
      toast.error(msg);
    } finally {
      setAddingToTrip(false);
    }
  }

  function submitCancel() {
    setCancelling(true);
    fetch(`/api/v1/carrier/loads/${load.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeStops, reason: cancelReason }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to cancel load');
        }
        toast.success(`Load ${load.referenceNumber} cancelled`);
        setCancelOpen(false);
        router.push('/carrier/loads');
        router.refresh();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to cancel'))
      .finally(() => setCancelling(false));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!editForm.clientId) e.clientId = 'Client is required';
    if (!editForm.commodityDescription.trim()) e.commodityDescription = 'Commodity description is required';
    if (stops.some((st) => !st.facility_id)) e.stops = 'Every stop needs a facility';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function saveEdit() {
    if (!validate()) {
      toast.error('Check the highlighted fields');
      return;
    }
    setSaving(true);
    // Ported verbatim from LoadForm.handleSubmit (lines 408-439), minus the
    // create-only dispatch-immediately branch — that only exists at creation.
    const payload = {
      clientId: editForm.clientId,
      contractId: editForm.contractId || undefined,
      loadType: editForm.loadType,
      commodityDescription: editForm.commodityDescription.trim() || undefined,
      commodityWeightLbs: editForm.commodityWeightLbs ? num(editForm.commodityWeightLbs) : undefined,
      commodityPieces: editForm.commodityPieces ? parseInt(raw(editForm.commodityPieces), 10) : undefined,
      hazmat: editForm.hazmat,
      bolNumber: editForm.bolNumber || undefined,
      poNumber: editForm.poNumber || undefined,
      rateType: editForm.rateType,
      rateAmount: editForm.rateAmount ? num(editForm.rateAmount) : undefined,
      plannedMiles: editForm.plannedMiles ? parseInt(raw(editForm.plannedMiles), 10) : undefined,
      otherCharges: editForm.otherCharges ? num(editForm.otherCharges) : undefined,
      brokerFlag: editForm.brokerFlag,
      carrierCost: editForm.brokerFlag && editForm.carrierCost ? num(editForm.carrierCost) : undefined,
      specialInstructions: editForm.specialInstructions || undefined,
      // Always send the real stops array — omitting it (or sending []) on a load
      // that already has stops causes updateLoad to delete the pending ones.
      stops: stops.map((st) => ({
        id: st.id,
        facility_id: st.facility_id,
        stop_type: st.stop_type,
        sequence_order: st.sequence_order,
        contact_name: st.contact_name,
        contact_phone: st.contact_phone,
        commodity_description: st.commodity_description,
        bol_required: st.bol_required,
        pod_required: st.pod_required,
        special_instructions: st.special_instructions,
        appointment_start: st.appointment_start,
        appointment_end: st.appointment_end,
      })),
    };

    fetch(`/api/v1/carrier/loads/${load.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? 'Failed to save load');
        }
        navigator.vibrate?.(10);
        toast.success('Load updated');
        setIsEditing(false);
        router.refresh();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to save load'))
      .finally(() => setSaving(false));
  }

  // ---- field groups (view) ----
  const clientFieldsView: FieldDef[] = [
    { key: 'clientId', label: 'Client', value: clientName },
    ...(load.contractId ? [{ key: 'contractId', label: 'Contract', value: contractName(load.contractId) } as FieldDef] : []),
    { key: 'loadType', label: 'Load type', value: LOAD_TYPE_LABEL[load.loadType] ?? load.loadType },
    { key: 'bolNumber', label: 'BOL #', value: load.bolNumber },
    { key: 'poNumber', label: 'PO #', value: load.poNumber },
  ];
  const commodityFieldsView: FieldDef[] = [
    { key: 'commodityDescription', label: 'Commodity', value: load.commodityDescription },
    { key: 'commodityWeightLbs', label: 'Weight (lbs)', value: load.commodityWeightLbs != null ? String(load.commodityWeightLbs) : null },
    { key: 'commodityPieces', label: 'Pieces', value: load.commodityPieces != null ? String(load.commodityPieces) : null },
    { key: 'hazmat', label: 'Hazmat', value: load.hazmat ? 'Yes' : 'No', tone: load.hazmat ? 'warning' : undefined },
  ];
  const rateFieldsView: FieldDef[] = [
    { key: 'brokerFlag', label: 'Brokered to another carrier', value: load.brokerFlag ? 'Yes' : 'No' },
    { key: 'rateType', label: 'Rate type', value: RATE_TYPE_LABEL[load.rateType] ?? load.rateType },
    { key: 'rateAmount', label: 'Rate', value: load.rateAmount != null ? money(load.rateAmount) : null },
    { key: 'otherCharges', label: 'Other charges', value: load.otherCharges != null ? money(load.otherCharges) : null },
    ...(load.brokerFlag
      ? [{ key: 'carrierCost', label: 'Carrier cost', value: load.carrierCost != null ? money(load.carrierCost) : null } as FieldDef]
      : []),
  ];
  const notesFieldsView: FieldDef[] = [
    { key: 'specialInstructions', label: 'Special instructions', value: load.specialInstructions },
  ];

  // ---- field groups (edit) ----
  const moneyInput = (key: 'rateAmount' | 'otherCharges' | 'carrierCost') => ({
    value: editForm[key],
    onChange: (v: string) => setField(key, raw(v)),
    onFocus: () => setField(key, raw(editForm[key])),
    onBlur: () => setField(key, fmtMoneyInput(editForm[key])),
    inputMode: 'decimal' as const,
    placeholder: '0.00',
  });
  const intInput = (key: 'commodityWeightLbs' | 'commodityPieces' | 'plannedMiles') => ({
    value: editForm[key],
    onChange: (v: string) => setField(key, v.replace(/[^\d]/g, '')),
    onFocus: () => setField(key, editForm[key].replace(/[^\d]/g, '')),
    onBlur: () => setField(key, fmtIntInput(editForm[key])),
    inputMode: 'numeric' as const,
    placeholder: '—',
  });

  const clientFieldsEdit: FieldDef[] = [
    {
      key: 'clientId',
      label: 'Client *',
      input: {
        value: editForm.clientId,
        onChange: (v) => {
          setField('clientId', v);
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
              value: editForm.contractId,
              onChange: handleContractChange,
              options: [
                { label: 'None', value: '' },
                ...contracts.map((c) => ({ label: c.contractName ?? c.contractNumber ?? 'Contract', value: c.id })),
              ],
            },
          } as FieldDef,
        ]
      : []),
    { key: 'loadType', label: 'Load type', input: { value: editForm.loadType, onChange: (v) => setField('loadType', v), options: LOAD_TYPES } },
    { key: 'bolNumber', label: 'BOL #', input: { value: editForm.bolNumber, onChange: (v) => setField('bolNumber', v), placeholder: '—' } },
    { key: 'poNumber', label: 'PO #', input: { value: editForm.poNumber, onChange: (v) => setField('poNumber', v), placeholder: '—' } },
  ];
  const commodityFieldsEdit: FieldDef[] = [
    {
      key: 'commodityDescription',
      label: 'Commodity *',
      input: {
        value: editForm.commodityDescription,
        onChange: (v) => {
          setField('commodityDescription', v);
          if (errors.commodityDescription) setErrors((e) => ({ ...e, commodityDescription: '' }));
        },
        placeholder: 'e.g. Dry goods',
        error: errors.commodityDescription || undefined,
      },
    },
    { key: 'commodityWeightLbs', label: 'Weight (lbs)', input: intInput('commodityWeightLbs') },
    { key: 'commodityPieces', label: 'Pieces', input: intInput('commodityPieces') },
  ];
  const rateFieldsEdit: FieldDef[] = [
    { key: 'rateType', label: 'Rate type', input: { value: editForm.rateType, onChange: (v) => setField('rateType', v), options: RATE_TYPES } },
    { key: 'rateAmount', label: 'Rate ($)', input: moneyInput('rateAmount') },
    { key: 'otherCharges', label: 'Other charges ($)', input: moneyInput('otherCharges') },
    { key: 'plannedMiles', label: 'Planned miles', input: intInput('plannedMiles') },
    ...(editForm.brokerFlag
      ? [{ key: 'carrierCost', label: 'Carrier cost ($)', input: moneyInput('carrierCost') } as FieldDef]
      : []),
  ];
  const notesFieldsEdit: FieldDef[] = [
    {
      key: 'specialInstructions',
      label: 'Special instructions',
      input: { value: editForm.specialInstructions, onChange: (v) => setField('specialInstructions', v), multiline: true, placeholder: 'Anything the driver should know' },
    },
  ];

  // Gating ported verbatim from LoadDetailActions.tsx:
  // cancelled -> no actions at all; dispatched -> the trip lives in the
  // ParentStrip, Cancel Load only when pending; no dispatch -> Add to Trip +
  // Cancel Load only when pending, otherwise nothing.
  const showCancel = load.status !== 'cancelled' && load.status === 'pending';
  const showAddToTrip = load.status !== 'cancelled' && !load.dispatchId && load.status === 'pending';

  const parentChips: ParentChip[] =
    load.dispatchId != null
      ? [
          {
            key: 'trip',
            icon: Truck,
            // Commit 4986a301 removed the /carrier/dispatches 308 redirect — link straight to /trips.
            label: dispatchNumber ?? 'View Trip',
            onClick: () => router.push(`/carrier/trips/${load.dispatchId}`),
          },
        ]
      : [];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title={isEditing ? 'Edit Load' : 'Load'}
        onBack={isEditing ? undefined : () => router.push('/carrier/loads')}
        left={isEditing ? <NavTextButton label="Cancel" onClick={cancelEdit} /> : undefined}
        right={
          isEditing ? (
            <NavTextButton label={saving ? 'Saving…' : 'Save'} emphasized onClick={saveEdit} disabled={!dirty || saving} />
          ) : (
            <NavTextButton label="Edit" onClick={startEdit} />
          )
        }
      />

      {/* Identity — stays put across view/edit, matching the four-page pattern */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <h1 className="text-center text-[22px] font-bold text-ds-txt">{load.referenceNumber}</h1>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <StatusPill label={s.label} tone={s.tone} />
        </div>
      </div>

      {/* Parent — the trip this load is on */}
      {parentChips.length > 0 ? (
        <div className="pb-3">
          <ParentStrip items={parentChips} />
        </div>
      ) : null}

      {/* Add to Trip / Cancel Load — hidden while editing, same as the header
          swapping to Cancel/Save.

          Cancel Load is the trigger for the reason sheet below, so it carries
          the neutral card fill, not a danger tint: the page body must never
          lead with a destructive action — TripDetailMobile's "More actions"
          button does the same. The danger colour lives on the confirm inside
          the sheet, at the point of no return. (No intermediate "Load actions"
          sheet: the trip has one to hold Cancel + TONU together, but a load has
          only this one action, so a middle layer would add a tap and hold a
          single row.) */}
      {!isEditing && (showAddToTrip || showCancel) ? (
        <div className="space-y-2 pb-3">
          {showAddToTrip ? <PrimaryButton label="Add to Trip" onClick={openAddToTrip} /> : null}
          {showCancel ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="h-[50px] w-full rounded-[15px] bg-ds-card text-[17px] font-semibold text-ds-txt transition active:opacity-75"
            >
              Cancel Load
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Tabs — stay visible in edit mode; each tab swaps its own content */}
      <div className="py-3">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'details' ? (
        isEditing ? (
          <div className="space-y-6">
            <div>
              <SectionHeader title="Client & load" />
              <FieldGroup fields={clientFieldsEdit} isEditing />
            </div>

            <div>
              <SectionHeader title="Commodity" />
              <FieldGroup fields={commodityFieldsEdit} isEditing />
              <div className="mt-2 flex">
                <Toggle label="Hazmat" on={editForm.hazmat} onChange={(v) => setField('hazmat', v)} tone="warning" />
              </div>
            </div>

            <div>
              <SectionHeader title="Rate" />
              <div className="mb-2 flex">
                <Toggle label="Brokered to another carrier" on={editForm.brokerFlag} onChange={(v) => setField('brokerFlag', v)} />
              </div>
              <FieldGroup fields={rateFieldsEdit} isEditing />

              <div className="mt-2 space-y-2 rounded-[20px] bg-ds-card p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-ds-txt2">
                    Base{preview.baseNote ? <span className="text-ds-txt3"> {preview.baseNote}</span> : null}
                  </span>
                  <span className="text-[15px] tabular-nums text-ds-txt">{money(preview.baseRevenue)}</span>
                </div>
                {preview.other > 0 ? (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-ds-txt2">Other charges</span>
                    <span className="text-[15px] tabular-nums text-ds-txt">{money(preview.other)}</span>
                  </div>
                ) : null}
                <div className="h-px bg-ds-hairline" />
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-semibold text-ds-txt">Total revenue</span>
                  <span className="text-[17px] font-bold tabular-nums text-ds-success">{money(preview.totalRevenue)}</span>
                </div>
                {preview.grossMargin !== null ? (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-ds-txt2">Gross margin</span>
                    <span
                      className={`text-[15px] font-semibold tabular-nums ${
                        preview.grossMargin < 0 ? 'text-ds-danger' : 'text-ds-txt'
                      }`}
                    >
                      {money(preview.grossMargin)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <SectionHeader title="Instructions" />
              <FieldGroup fields={notesFieldsEdit} isEditing />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <SectionHeader title="Client & load" />
              <FieldGroup fields={clientFieldsView} isEditing={false} />
            </div>
            <div>
              <SectionHeader title="Commodity" />
              <FieldGroup fields={commodityFieldsView} isEditing={false} />
            </div>
            <div>
              <SectionHeader title="Rate" />
              <FieldGroup fields={rateFieldsView} isEditing={false} />
            </div>
            <div>
              <SectionHeader title="Instructions" />
              <FieldGroup fields={notesFieldsView} isEditing={false} />
            </div>

            {loadAudit ? (
              <div className="rounded-[20px] bg-ds-card p-4">
                <p className="text-[13px] text-ds-txt3">
                  Created {fmtDateTime(loadAudit.createdAt)}
                  {loadAudit.createdByName ? ` by ${loadAudit.createdByName}` : ''}
                </p>
                <p className="mt-1 text-[13px] text-ds-txt3">
                  Updated {fmtDateTime(loadAudit.updatedAt)}
                  {loadAudit.updatedByName ? ` by ${loadAudit.updatedByName}` : ''}
                </p>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {tab === 'stops' ? (
        isEditing ? (
          <MobileStopsEditor stops={stops} onChange={setStops} facilities={facilities} error={errors.stops} mode="load" />
        ) : (
          <div>
            <SectionHeader title={`${stops.length} stop${stops.length === 1 ? '' : 's'}`} />
            {stops.length === 0 ? (
              <EmptyState icon={MapPin} title="No stops yet" message="Stops added to this load will appear here." />
            ) : (
              <div className="space-y-3">
                {stops.map((st, i) => {
                  const status = stopStatusMap[st.id];
                  const meta = status ? (STOP_STATUS_META[status] ?? { tone: 'neutral' as StatusTone, label: status }) : null;
                  const place = [st.facility_city, st.facility_state].filter(Boolean).join(', ');
                  const when = fmtWindow(st.appointment_start, st.appointment_end);
                  return (
                    <div key={st.id} className="rounded-[20px] bg-ds-card p-4">
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center pt-1.5">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta ? DOT_BG[meta.tone] : 'bg-ds-txt3'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[15px] font-semibold text-ds-txt">
                              {i + 1}. {STOP_TYPE_LABEL[st.stop_type] ?? st.stop_type}
                            </span>
                            {meta ? <StatusPill label={meta.label} tone={meta.tone} /> : null}
                          </div>
                          {st.facility_name ? (
                            <div className="mt-0.5 truncate text-[15px] text-ds-txt2">
                              {st.facility_name}
                              {place ? <span className="text-ds-txt3"> · {place}</span> : null}
                            </div>
                          ) : null}
                          {when ? <div className="mt-0.5 text-[13px] text-ds-txt3">{when}</div> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      ) : null}

      {tab === 'assignments' ? (
        <div>
          <SectionHeader title={`${initialAssignments.length} assignment${initialAssignments.length === 1 ? '' : 's'}`} />
          {initialAssignments.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No driver assigned yet"
              message="Assign a driver from the desktop to set pay terms for this load."
            />
          ) : (
            <div className="space-y-3">
              {initialAssignments.map((a) => {
                const pay = PAY_STATUS_META[a.payStatus] ?? { tone: 'neutral' as StatusTone, label: a.payStatus };
                return (
                  <div key={a.id} className="rounded-[20px] bg-ds-card p-4">
                    <div className="flex items-center gap-3">
                      <MonogramAvatar name={`${a.driver.firstName} ${a.driver.lastName}`} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[15px] font-semibold text-ds-txt">
                            {a.driver.firstName} {a.driver.lastName}
                          </span>
                          <StatusPill label={pay.label} tone={pay.tone} />
                        </div>
                        <div className="mt-0.5 text-[13px] text-ds-txt2">
                          {a.driverRole === 'MAIN_DRIVER' ? 'Main driver' : 'Co-driver'} · {formatAssignmentRate(a)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Add to Trip */}
      <SheetContainer
        open={addToTripOpen}
        onCancel={() => setAddToTripOpen(false)}
        title="Add to Trip"
        subtitle="Create a new trip or add to an existing planned trip."
      >
        <div className="space-y-4">
          <SegmentedControl
            options={[
              { label: 'New trip', value: 'new' as const },
              { label: 'Existing trip', value: 'existing' as const },
            ]}
            value={addMode}
            onChange={setAddMode}
          />

          {addMode === 'existing' ? (
            loadingTrips ? (
              <p className="text-[13px] text-ds-txt2">Loading trips…</p>
            ) : existingTrips.length === 0 ? (
              <p className="text-[13px] text-ds-txt2">No planned trips available. Create a new trip instead.</p>
            ) : (
              <FieldGroup
                isEditing
                fields={[
                  {
                    key: 'existingTrip',
                    label: 'Trip *',
                    input: {
                      value: selectedExistingTripId,
                      onChange: setSelectedExistingTripId,
                      options: [{ label: 'Select trip…', value: '' }, ...existingTrips.map((t) => ({ label: t.label, value: t.id }))],
                    },
                  },
                ]}
              />
            )
          ) : (
            <FieldGroup
              isEditing
              fields={[
                {
                  key: 'primaryDriverId',
                  label: 'Primary driver *',
                  input: {
                    value: tripPrimaryDriverId,
                    onChange: setTripPrimaryDriverId,
                    options: [{ label: 'Select driver…', value: '' }, ...driverOptions.map((d) => ({ label: d.name, value: d.id }))],
                  },
                },
                {
                  key: 'truckId',
                  label: 'Truck *',
                  input: {
                    value: tripTruckId,
                    onChange: setTripTruckId,
                    options: [{ label: 'Select truck…', value: '' }, ...truckOptions.map((t) => ({ label: `Unit ${t.unitNumber}`, value: t.id }))],
                  },
                },
                {
                  key: 'scheduledDeparture',
                  label: 'Scheduled departure *',
                  input: { value: tripScheduledDeparture, onChange: setTripScheduledDeparture, type: 'datetime-local' },
                },
                {
                  key: 'plannedMiles',
                  label: 'Planned miles',
                  input: { value: tripPlannedMiles, onChange: (v) => setTripPlannedMiles(v.replace(/[^\d]/g, '')), inputMode: 'numeric', placeholder: '—' },
                },
              ]}
            />
          )}

          {addTripError ? <p className="text-[13px] text-ds-danger">{addTripError}</p> : null}

          <PrimaryButton
            label={addingToTrip ? (addMode === 'existing' ? 'Adding…' : 'Creating…') : addMode === 'existing' ? 'Add to Trip' : 'Create Trip & Attach Load'}
            onClick={submitAddToTrip}
            disabled={addingToTrip}
            loading={addingToTrip}
          />
        </div>
      </SheetContainer>

      {/* Cancel Load — destructive, reason + optional stop removal */}
      <SheetContainer
        open={cancelOpen}
        onCancel={() => setCancelOpen(false)}
        title="Cancel Load"
        subtitle="This action cannot be undone."
      >
        <div className="space-y-4">
          {load.dispatchId && pendingStopCount > 0 ? (
            <div className="flex">
              <Toggle
                label={`Remove ${pendingStopCount} pending stop${pendingStopCount > 1 ? 's' : ''} from trip`}
                on={removeStops}
                onChange={setRemoveStops}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="cancel-reason" className="block text-[13px] text-ds-txt2">
              Reason (optional)
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Customer cancelled, load rebooked with another carrier…"
              className="w-full resize-none rounded-[10px] bg-ds-input px-3 py-2.5 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3"
            />
          </div>
          <button
            type="button"
            onClick={submitCancel}
            disabled={cancelling}
            className="h-[50px] w-full rounded-[15px] bg-ds-danger text-[17px] font-semibold text-white transition active:opacity-75 disabled:opacity-35"
          >
            {cancelling ? 'Cancelling…' : 'Cancel Load'}
          </button>
        </div>
      </SheetContainer>
    </MobileScreen>
  );
}
