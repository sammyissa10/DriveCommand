'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { LoadFinancials } from './LoadFinancials';
import { StopBuilder } from '@/components/carrier/stops/StopBuilder';
import type { StopBuilderStop } from '@/components/carrier/stops/StopBuilder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Client {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  contractNumber: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
}

export interface LoadData {
  id?: string;
  clientId?: string;
  contractId?: string;
  dispatchId?: string;
  loadType?: string;
  referenceNumber?: string;
  bolNumber?: string;
  proNumber?: string;
  poNumber?: string;
  commodityDescription?: string;
  commodityWeightLbs?: number | null;
  commodityPieces?: number | null;
  commodityPallets?: number | null;
  hazmat?: boolean;
  hazmatClass?: string;
  rateType?: string;
  rateAmount?: number | null;
  otherCharges?: number | null;
  brokerFlag?: boolean;
  carrierCost?: number | null;
  fuelSurchargeMethod?: string;
  fuelSurchargeRate?: number | null;
  specialInstructions?: string;
  notes?: string;
}

interface LoadFormProps {
  mode: 'create' | 'edit';
  initialData?: LoadData;
  clients: Client[];
  loadId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RATE_TYPE_LABELS: Record<string, string> = {
  per_mile: 'Rate per Mile ($)',
  flat: 'Flat Rate ($)',
  per_cwt: 'Rate per CWT ($)',
  per_pallet: 'Rate per Pallet ($)',
  per_stop: 'Rate per Delivery Stop ($)',
  hourly: 'Hourly Rate ($/hr)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadForm({ mode, initialData, clients, loadId }: LoadFormProps) {
  const router = useRouter();

  // Form state
  const [clientId, setClientId] = useState(initialData?.clientId ?? '');
  const [contractId, setContractId] = useState(initialData?.contractId ?? '');
  const [loadType, setLoadType] = useState(initialData?.loadType ?? 'ftl');
  const [commodityDescription, setCommodityDescription] = useState(
    initialData?.commodityDescription ?? ''
  );
  const [commodityWeightLbs, setCommodityWeightLbs] = useState<string>(
    initialData?.commodityWeightLbs != null ? String(initialData.commodityWeightLbs) : ''
  );
  const [commodityPieces, setCommodityPieces] = useState<string>(
    initialData?.commodityPieces != null ? String(initialData.commodityPieces) : ''
  );
  const [commodityPallets, setCommodityPallets] = useState<string>(
    initialData?.commodityPallets != null ? String(initialData.commodityPallets) : ''
  );
  const [rateType, setRateType] = useState(initialData?.rateType ?? 'flat');
  const [rateAmount, setRateAmount] = useState<string>(
    initialData?.rateAmount != null ? String(initialData.rateAmount) : ''
  );
  const [otherCharges, setOtherCharges] = useState<string>(
    initialData?.otherCharges != null ? String(initialData.otherCharges) : ''
  );
  const [brokerFlag, setBrokerFlag] = useState(initialData?.brokerFlag ?? false);
  const [carrierCost, setCarrierCost] = useState<string>(
    initialData?.carrierCost != null ? String(initialData.carrierCost) : ''
  );
  const [fuelSurchargeMethod, setFuelSurchargeMethod] = useState(
    initialData?.fuelSurchargeMethod ?? 'none'
  );
  const [fuelSurchargeRate, setFuelSurchargeRate] = useState<string>(
    initialData?.fuelSurchargeRate != null ? String(initialData.fuelSurchargeRate) : ''
  );
  const [specialInstructions, setSpecialInstructions] = useState(
    initialData?.specialInstructions ?? ''
  );
  const [bolNumber, setBolNumber] = useState(initialData?.bolNumber ?? '');
  const [proNumber, setProNumber] = useState(initialData?.proNumber ?? '');
  const [poNumber, setPoNumber] = useState(initialData?.poNumber ?? '');
  const [hazmat, setHazmat] = useState(initialData?.hazmat ?? false);

  // Contract auto-populate tracking
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractAutoFilled, setContractAutoFilled] = useState<Set<string>>(new Set());

  // Appointment fields (stop-level, not load-level — display only)
  // TODO: appointment fields are stop-level, not load-level — wire to stops when stop creation is integrated
  const [pickupApptStart, setPickupApptStart] = useState('');
  const [pickupApptEnd, setPickupApptEnd] = useState('');
  const [deliveryApptStart, setDeliveryApptStart] = useState('');
  const [deliveryApptEnd, setDeliveryApptEnd] = useState('');

  // Stops (for create mode without dispatch)
  const [stops, setStops] = useState<StopBuilderStop[]>([]);

  // Validation
  const [clientError, setClientError] = useState('');
  const [commodityError, setCommodityError] = useState('');

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch contracts when client changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!clientId) {
      setContracts([]);
      setContractId('');
      return;
    }
    async function fetchContracts() {
      try {
        const res = await fetch(`/api/v1/carrier/contracts?client_id=${clientId}&status=active`);
        if (!res.ok) return;
        const json = await res.json();
        const items = (json.data?.items ?? []) as Contract[];
        setContracts(items);
        // Reset contract if it doesn't belong to this client
        if (contractId && !items.find((c) => c.id === contractId)) {
          setContractId('');
          setContractAutoFilled(new Set());
        }
      } catch {
        setContracts([]);
      }
    }
    fetchContracts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ---------------------------------------------------------------------------
  // Auto-populate rate fields from selected contract
  // ---------------------------------------------------------------------------
  function handleContractChange(newContractId: string) {
    setContractId(newContractId);
    if (!newContractId) {
      setContractAutoFilled(new Set());
      return;
    }
    const contract = contracts.find((c) => c.id === newContractId);
    if (!contract) return;

    const autoFilled = new Set<string>();

    if (contract.rateType) {
      setRateType(contract.rateType);
      autoFilled.add('rateType');
    }
    if (contract.baseRate != null) {
      setRateAmount(String(contract.baseRate));
      autoFilled.add('rateAmount');
    }
    if (contract.fuelSurchargeMethod) {
      setFuelSurchargeMethod(contract.fuelSurchargeMethod);
      autoFilled.add('fuelSurchargeMethod');
    }
    if (contract.fuelSurchargeRate != null) {
      setFuelSurchargeRate(String(contract.fuelSurchargeRate));
      autoFilled.add('fuelSurchargeRate');
    }
    setContractAutoFilled(autoFilled);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let valid = true;

    if (!clientId) {
      setClientError('Client is required');
      valid = false;
    } else {
      setClientError('');
    }

    if (!commodityDescription.trim()) {
      setCommodityError('Commodity description is required');
      valid = false;
    } else {
      setCommodityError('');
    }

    if (!valid) return;

    setSubmitting(true);

    const payload = {
      clientId,
      contractId: contractId || undefined,
      loadType,
      commodityDescription: commodityDescription.trim() || undefined,
      commodityWeightLbs: commodityWeightLbs ? Number(commodityWeightLbs) : undefined,
      commodityPieces: commodityPieces ? parseInt(commodityPieces, 10) : undefined,
      commodityPallets: commodityPallets ? parseInt(commodityPallets, 10) : undefined,
      hazmat,
      bolNumber: bolNumber || undefined,
      proNumber: proNumber || undefined,
      poNumber: poNumber || undefined,
      rateType,
      rateAmount: rateAmount ? Number(rateAmount) : undefined,
      otherCharges: otherCharges ? Number(otherCharges) : undefined,
      brokerFlag,
      carrierCost: brokerFlag && carrierCost ? Number(carrierCost) : undefined,
      specialInstructions: specialInstructions || undefined,
      // TODO: persist stops on save — currently display-only
    };

    try {
      let res: Response;
      if (mode === 'create') {
        res = await fetch('/api/v1/carrier/loads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/v1/carrier/loads/${loadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to save load');
        return;
      }

      const json = await res.json();
      const savedId = json.data?.id ?? loadId;

      toast.success(mode === 'create' ? 'Load created' : 'Load saved');

      if (mode === 'create') {
        router.push(`/carrier/loads/${savedId}`);
      } else {
        router.push('/carrier/loads');
      }
    } catch {
      toast.error('Failed to save load');
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const labelClass = 'block text-sm font-medium text-foreground mb-1';
  const inputClass =
    'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  const selectClass =
    'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  const sectionClass = 'space-y-4 rounded-lg border bg-card p-4';
  const sectionTitleClass = 'text-sm font-semibold text-foreground mb-3';

  const fromContractLabel = (
    <span className="text-xs text-muted-foreground ml-2">from contract</span>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Section 1 — Client and Contract */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Client &amp; Contract</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Client <span className="text-red-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setClientError(''); }}
              className={selectClass}
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clientError && (
              <p className="mt-1 text-xs text-red-500">{clientError}</p>
            )}
          </div>

          {clientId && (
            <div>
              <label className={labelClass}>Contract</label>
              <select
                value={contractId}
                onChange={(e) => handleContractChange(e.target.value)}
                className={selectClass}
              >
                <option value="">No contract</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNumber ?? `Contract ${c.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              {contracts.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No active contracts for this client</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Section 2 — Freight Details */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Freight Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Load Type</label>
            <select
              value={loadType}
              onChange={(e) => setLoadType(e.target.value)}
              className={selectClass}
            >
              <option value="ftl">FTL</option>
              <option value="ltl">LTL</option>
              <option value="partial">Partial</option>
              <option value="drayage">Drayage</option>
              <option value="intermodal">Intermodal</option>
            </select>
          </div>

          <div className="sm:col-span-1">
            <label className={labelClass}>
              Commodity Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={commodityDescription}
              onChange={(e) => { setCommodityDescription(e.target.value); setCommodityError(''); }}
              placeholder="e.g. General freight, Palletized goods"
              className={inputClass}
            />
            {commodityError && (
              <p className="mt-1 text-xs text-red-500">{commodityError}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Weight (lbs)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={commodityWeightLbs}
              onChange={(e) => setCommodityWeightLbs(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Pieces</label>
            <input
              type="number"
              min="0"
              step="1"
              value={commodityPieces}
              onChange={(e) => setCommodityPieces(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Pallets</label>
            <input
              type="number"
              min="0"
              step="1"
              value={commodityPallets}
              onChange={(e) => setCommodityPallets(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          <div>
            <div className="flex items-center gap-3 mt-2">
              <Switch
                checked={hazmat}
                onCheckedChange={setHazmat}
                id="hazmat-toggle"
              />
              <label htmlFor="hazmat-toggle" className="text-sm font-medium cursor-pointer select-none">
                Hazmat
              </label>
            </div>
          </div>
        </div>

        {/* Reference numbers row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className={labelClass}>BOL Number</label>
            <input
              type="text"
              value={bolNumber}
              onChange={(e) => setBolNumber(e.target.value)}
              placeholder="BOL-XXXXX"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>PRO Number</label>
            <input
              type="text"
              value={proNumber}
              onChange={(e) => setProNumber(e.target.value)}
              placeholder="PRO-XXXXX"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>PO Number</label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="PO-XXXXX"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Section 3 — Rate + Financial Preview */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Rate</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Rate Type
              {contractAutoFilled.has('rateType') && fromContractLabel}
            </label>
            <select
              value={rateType}
              onChange={(e) => setRateType(e.target.value)}
              className={selectClass}
            >
              <option value="per_mile">Per Mile</option>
              <option value="flat">Flat Rate</option>
              <option value="per_cwt">Per CWT</option>
              <option value="per_pallet">Per Pallet</option>
              <option value="per_stop">Per Stop</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>
              {RATE_TYPE_LABELS[rateType] ?? 'Rate Amount ($)'}
              {contractAutoFilled.has('rateAmount') && fromContractLabel}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rateAmount}
              onChange={(e) => setRateAmount(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              FSC Method
              {contractAutoFilled.has('fuelSurchargeMethod') && fromContractLabel}
            </label>
            <select
              value={fuelSurchargeMethod}
              onChange={(e) => setFuelSurchargeMethod(e.target.value)}
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="percent_of_linehaul">% of Linehaul</option>
              <option value="per_mile">Per Mile</option>
            </select>
          </div>

          {fuelSurchargeMethod !== 'none' && (
            <div>
              <label className={labelClass}>
                FSC Rate
                {contractAutoFilled.has('fuelSurchargeRate') && fromContractLabel}
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={fuelSurchargeRate}
                onChange={(e) => setFuelSurchargeRate(e.target.value)}
                placeholder={fuelSurchargeMethod === 'percent_of_linehaul' ? '0.12 = 12%' : '0.00'}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Accessorial / Other Charges ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={otherCharges}
              onChange={(e) => setOtherCharges(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
        </div>

        {/* Live financial preview */}
        <div className="mt-4">
          <LoadFinancials
            rateType={rateType}
            rateAmount={rateAmount ? Number(rateAmount) : 0}
            weightLbs={commodityWeightLbs ? Number(commodityWeightLbs) : 0}
            pallets={commodityPallets ? Number(commodityPallets) : 0}
            otherCharges={otherCharges ? Number(otherCharges) : 0}
            fuelSurchargeMethod={fuelSurchargeMethod}
            fuelSurchargeRate={fuelSurchargeRate ? Number(fuelSurchargeRate) : 0}
            brokerFlag={brokerFlag}
            carrierCost={carrierCost ? Number(carrierCost) : 0}
          />
        </div>
      </div>

      {/* Section 4 — Appointments */}
      <div className={sectionClass}>
        {/* TODO: appointment fields are stop-level, not load-level — wire to stops when stop creation is integrated */}
        <h3 className={sectionTitleClass}>Appointments</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Note: These appointment fields are for reference only — they will be stored per stop when stop integration is complete.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Pickup Appt Start</label>
            <input
              type="datetime-local"
              value={pickupApptStart}
              onChange={(e) => setPickupApptStart(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Pickup Appt End</label>
            <input
              type="datetime-local"
              value={pickupApptEnd}
              onChange={(e) => setPickupApptEnd(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Delivery Appt Start</label>
            <input
              type="datetime-local"
              value={deliveryApptStart}
              onChange={(e) => setDeliveryApptStart(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Delivery Appt End</label>
            <input
              type="datetime-local"
              value={deliveryApptEnd}
              onChange={(e) => setDeliveryApptEnd(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Section 5 — Broker Toggle */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Broker Mode</h3>
        <div className="flex items-center gap-3">
          <Switch
            checked={brokerFlag}
            onCheckedChange={setBrokerFlag}
            id="broker-flag-toggle"
          />
          <label htmlFor="broker-flag-toggle" className="text-sm font-medium cursor-pointer select-none">
            This load is brokered (we are acting as broker, not carrier)
          </label>
        </div>
        {brokerFlag && (
          <div className="mt-4">
            <label className={labelClass}>Carrier Cost ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={carrierCost}
              onChange={(e) => setCarrierCost(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} max-w-xs`}
            />
          </div>
        )}
      </div>

      {/* Section 6 — Rate Confirmation */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Rate Confirmation</h3>
        <div>
          <label className={labelClass}>Upload Rate Confirmation PDF</label>
          {/* TODO: wire file upload to R2 presigned URL endpoint */}
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="flex w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
          />
          <p className="mt-1 text-xs text-muted-foreground">File upload will be wired to R2 storage in a future update.</p>
        </div>
      </div>

      {/* Section 7 — Driver Instructions */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Driver Instructions</h3>
        <div>
          <label className={labelClass}>Special Instructions</label>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={4}
            placeholder="Any special instructions for the driver…"
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

      {/* Section 8 — Stop Builder (create mode, no dispatchId only) */}
      {mode === 'create' && !initialData?.dispatchId && (
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>Stops</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Add pickup and delivery stops. Stop data is for planning purposes — stops will be linked to the load in a future update.
          </p>
          {/* TODO: persist stops on save — currently display-only */}
          <StopBuilder stops={stops} onChange={setStops} mode="load" />
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving…' : mode === 'create' ? 'Create Load' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
