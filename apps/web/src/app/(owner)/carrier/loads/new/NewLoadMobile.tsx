'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  PrimaryButton,
  type FieldDef,
} from '@/components/ui/ds';
import type { StopBuilderStop } from '@/components/carrier/stops/StopCard';
import { MobileStopsEditor, type FacilityOption } from '@/components/carrier/stops/MobileStopsEditor';
import { calculateRevenuePreview } from '@/lib/carrier/revenue-preview';

// ---------------------------------------------------------------------------
// Vocabulary — mirrors the desktop LoadForm
// ---------------------------------------------------------------------------

const LOAD_TYPES = [
  { label: 'FTL', value: 'ftl' },
  { label: 'LTL', value: 'ltl' },
  { label: 'Partial', value: 'partial' },
  { label: 'Expedited', value: 'expedited' },
  { label: 'Intermodal', value: 'intermodal' },
];

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

interface ClientOption { id: string; name: string }
interface Contract {
  id: string;
  contractNumber: string | null;
  contractName: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
}

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ---------------------------------------------------------------------------
// New Load — mobile-web design system create page (carrier)
// ---------------------------------------------------------------------------

export function NewLoadMobile({
  clients,
  facilities,
}: {
  clients: ClientOption[];
  facilities: FacilityOption[];
}) {
  const router = useRouter();

  const [clientId, setClientId] = useState('');
  const [contractId, setContractId] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadType, setLoadType] = useState('ftl');
  const [bolNumber, setBolNumber] = useState('');
  const [poNumber, setPoNumber] = useState('');

  const [commodityDescription, setCommodityDescription] = useState('');
  const [commodityWeightLbs, setCommodityWeightLbs] = useState('');
  const [commodityPieces, setCommodityPieces] = useState('');
  const [hazmat, setHazmat] = useState(false);

  const [rateType, setRateType] = useState('flat');
  const [rateAmount, setRateAmount] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [brokerFlag, setBrokerFlag] = useState(false);
  const [carrierCost, setCarrierCost] = useState('');
  const [plannedMiles, setPlannedMiles] = useState('');

  const [specialInstructions, setSpecialInstructions] = useState('');
  const [stops, setStops] = useState<StopBuilderStop[]>([]);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Contracts follow the client, exactly as on desktop.
  useEffect(() => {
    if (!clientId) {
      setContracts([]);
      setContractId('');
      return;
    }
    let cancelled = false;
    fetch(`/api/v1/carrier/contracts?client_id=${clientId}&status=active`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const items = (json?.data?.items ?? []) as Contract[];
        setContracts(items);
        setContractId((cur) => (cur && !items.find((c) => c.id === cur) ? '' : cur));
      })
      .catch(() => {
        if (!cancelled) setContracts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  /** Picking a contract auto-fills its rate — same fields the desktop fills. */
  function handleContractChange(next: string) {
    setContractId(next);
    if (!next) return;
    const contract = contracts.find((c) => c.id === next);
    if (!contract) return;
    if (contract.rateType) setRateType(contract.rateType);
    if (contract.baseRate != null) setRateAmount(String(contract.baseRate));
    toast.message('Rate filled from contract', { description: 'Change it if this load is different.' });
  }

  const deliveryStopCount = useMemo(() => stops.filter((s) => s.stop_type === 'delivery').length, [stops]);

  // Shared with the desktop LoadFinancials — one calculator, not a third copy.
  const preview = useMemo(
    () =>
      calculateRevenuePreview({
        rateType,
        rateAmount: rateAmount ? Number(rateAmount) : 0,
        weightLbs: commodityWeightLbs ? Number(commodityWeightLbs) : 0,
        otherCharges: otherCharges ? Number(otherCharges) : 0,
        brokerFlag,
        carrierCost: carrierCost ? Number(carrierCost) : 0,
        plannedMiles: plannedMiles ? Number(plannedMiles) : 0,
        deliveryStopCount,
      }),
    [rateType, rateAmount, commodityWeightLbs, otherCharges, brokerFlag, carrierCost, plannedMiles, deliveryStopCount],
  );

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!clientId) e.clientId = 'Client is required';
    if (!commodityDescription.trim()) e.commodityDescription = 'Commodity description is required';
    if (stops.some((s) => !s.facility_id)) e.stops = 'Every stop needs a facility';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) {
      toast.error('Check the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        clientId,
        contractId: contractId || undefined,
        loadType,
        commodityDescription: commodityDescription.trim() || undefined,
        commodityWeightLbs: commodityWeightLbs ? Number(commodityWeightLbs) : undefined,
        commodityPieces: commodityPieces ? parseInt(commodityPieces, 10) : undefined,
        hazmat,
        bolNumber: bolNumber || undefined,
        poNumber: poNumber || undefined,
        rateType,
        rateAmount: rateAmount ? Number(rateAmount) : undefined,
        plannedMiles: plannedMiles ? parseInt(plannedMiles, 10) : undefined,
        otherCharges: otherCharges ? Number(otherCharges) : undefined,
        brokerFlag,
        carrierCost: brokerFlag && carrierCost ? Number(carrierCost) : undefined,
        specialInstructions: specialInstructions || undefined,
        stops: stops.map((s) => ({
          id: s.id,
          facility_id: s.facility_id,
          stop_type: s.stop_type,
          sequence_order: s.sequence_order,
          contact_name: s.contact_name,
          contact_phone: s.contact_phone,
          commodity_description: s.commodity_description,
          bol_required: s.bol_required,
          pod_required: s.pod_required,
          special_instructions: s.special_instructions,
          appointment_start: s.appointment_start,
          appointment_end: s.appointment_end,
        })),
      };

      const res = await fetch('/api/v1/carrier/loads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? 'Failed to create load');
        setSaving(false);
        return;
      }
      const json = await res.json();
      const savedId = json.data?.id;
      navigator.vibrate?.(10);
      toast.success('Load created');
      router.push(savedId ? `/carrier/loads/${savedId}` : '/carrier/loads');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  // ---- field groups ----
  const clientFields: FieldDef[] = [
    {
      key: 'clientId',
      label: 'Client *',
      input: {
        value: clientId,
        onChange: (v) => {
          setClientId(v);
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
              onChange: handleContractChange,
              options: [
                { label: 'None', value: '' },
                ...contracts.map((c) => ({ label: c.contractName ?? c.contractNumber ?? 'Contract', value: c.id })),
              ],
            },
          } as FieldDef,
        ]
      : []),
    { key: 'loadType', label: 'Load type', input: { value: loadType, onChange: setLoadType, options: LOAD_TYPES } },
    { key: 'bolNumber', label: 'BOL #', input: { value: bolNumber, onChange: setBolNumber, placeholder: '—' } },
    { key: 'poNumber', label: 'PO #', input: { value: poNumber, onChange: setPoNumber, placeholder: '—' } },
  ];

  const commodityFields: FieldDef[] = [
    {
      key: 'commodityDescription',
      label: 'Commodity *',
      input: {
        value: commodityDescription,
        onChange: (v) => {
          setCommodityDescription(v);
          if (errors.commodityDescription) setErrors((e) => ({ ...e, commodityDescription: '' }));
        },
        placeholder: 'e.g. Dry goods',
        error: errors.commodityDescription || undefined,
      },
    },
    {
      key: 'commodityWeightLbs',
      label: 'Weight (lbs)',
      input: {
        value: commodityWeightLbs,
        onChange: (v) => setCommodityWeightLbs(v.replace(/[^\d]/g, '')),
        inputMode: 'numeric',
        placeholder: '—',
      },
    },
    {
      key: 'commodityPieces',
      label: 'Pieces',
      input: {
        value: commodityPieces,
        onChange: (v) => setCommodityPieces(v.replace(/[^\d]/g, '')),
        inputMode: 'numeric',
        placeholder: '—',
      },
    },
  ];

  const rateFields: FieldDef[] = [
    { key: 'rateType', label: 'Rate type', input: { value: rateType, onChange: setRateType, options: RATE_TYPES } },
    {
      key: 'rateAmount',
      label: 'Rate ($)',
      input: { value: rateAmount, onChange: (v) => setRateAmount(v.replace(/[^\d.]/g, '')), inputMode: 'decimal', placeholder: '0.00' },
    },
    {
      key: 'otherCharges',
      label: 'Other charges ($)',
      input: { value: otherCharges, onChange: (v) => setOtherCharges(v.replace(/[^\d.]/g, '')), inputMode: 'decimal', placeholder: '0.00' },
    },
    {
      key: 'plannedMiles',
      label: 'Planned miles',
      input: { value: plannedMiles, onChange: (v) => setPlannedMiles(v.replace(/[^\d]/g, '')), inputMode: 'numeric', placeholder: '—' },
    },
    ...(brokerFlag
      ? [
          {
            key: 'carrierCost',
            label: 'Carrier cost ($)',
            input: { value: carrierCost, onChange: (v: string) => setCarrierCost(v.replace(/[^\d.]/g, '')), inputMode: 'decimal' as const, placeholder: '0.00' },
          } as FieldDef,
        ]
      : []),
  ];

  const notesFields: FieldDef[] = [
    {
      key: 'specialInstructions',
      label: 'Special instructions',
      input: { value: specialInstructions, onChange: setSpecialInstructions, multiline: true, placeholder: 'Anything the driver should know' },
    },
  ];

  const canSave = clientId.length > 0 && commodityDescription.trim().length > 0 && !saving;

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Load"
        left={<NavTextButton label="Cancel" onClick={() => router.push('/carrier/loads')} />}
        right={<NavTextButton label={saving ? 'Creating…' : 'Create'} emphasized onClick={save} disabled={!canSave} />}
      />

      {clients.length === 0 ? (
        <div className="mt-2 space-y-3">
          <div className="rounded-[20px] bg-ds-warning/[0.14] p-4">
            <p className="text-[15px] font-semibold text-ds-warning">No clients yet</p>
            <p className="mt-0.5 text-[13px] text-ds-txt2">A load is booked for a client. Add one first, then come back.</p>
          </div>
          <PrimaryButton label="Add a client" onClick={() => router.push('/carrier/clients')} />
        </div>
      ) : (
        <div className="space-y-6 pt-1">
          <div>
            <SectionHeader title="Client & load" />
            <FieldGroup fields={clientFields} isEditing />
          </div>

          <div>
            <SectionHeader title="Commodity" />
            <FieldGroup fields={commodityFields} isEditing />
            {/* Hazmat is a hazard, not a primary action — warning, not accent. */}
            <button
              type="button"
              aria-pressed={hazmat}
              onClick={() => setHazmat((v) => !v)}
              className={`mt-2 h-11 w-full rounded-[12px] text-[15px] font-semibold transition active:opacity-75 ${
                hazmat ? 'bg-ds-warning text-white' : 'bg-ds-input text-ds-txt2'
              }`}
            >
              Hazmat
            </button>
          </div>

          {/*
            Stops sit above Rate on purpose: they're operational (§7 orders
            Identity → Operational → Financial), and the rate depends on them —
            a per_stop base counts delivery stops, per_mile needs the miles. Asking
            for the rate first showed "(add delivery stops)" before offering stops.
          */}
          <MobileStopsEditor stops={stops} onChange={setStops} facilities={facilities} error={errors.stops} mode="load" />

          <div>
            <SectionHeader title="Rate" />
            {/* Brokered lives here, not with Commodity: it's what drives carrier
                cost and gross margin, nothing to do with the freight itself. */}
            <button
              type="button"
              aria-pressed={brokerFlag}
              onClick={() => setBrokerFlag((v) => !v)}
              className={`mb-2 h-11 w-full rounded-[12px] text-[15px] font-semibold transition active:opacity-75 ${
                brokerFlag ? 'bg-ds-accent text-white' : 'bg-ds-input text-ds-txt2'
              }`}
            >
              Brokered to another carrier
            </button>
            <FieldGroup fields={rateFields} isEditing />

            {/* Live preview — same calculator the desktop uses */}
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
            <FieldGroup fields={notesFields} isEditing />
          </div>

          <PrimaryButton label={saving ? 'Creating…' : 'Create Load'} onClick={save} disabled={!canSave} loading={saving} />
        </div>
      )}
    </MobileScreen>
  );
}
