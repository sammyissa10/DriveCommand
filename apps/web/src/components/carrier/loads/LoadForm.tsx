'use client';

import { useState, useEffect, useRef } from 'react';
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
  contractName: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
}

interface ExistingDocument {
  id: string;
  fileName: string;
  fileUrl?: string;
  documentType: string;
}

export interface LoadData {
  id?: string;
  clientId?: string;
  contractId?: string;
  dispatchId?: string;
  loadType?: string;
  referenceNumber?: string;
  bolNumber?: string;
  poNumber?: string;
  commodityDescription?: string;
  commodityWeightLbs?: number | null;
  commodityPieces?: number | null;
  hazmat?: boolean;
  hazmatClass?: string;
  rateType?: string;
  rateAmount?: number | null;
  otherCharges?: number | null;
  brokerFlag?: boolean;
  carrierCost?: number | null;
  plannedMiles?: number | null;
  specialInstructions?: string;
  notes?: string;
  stops?: StopBuilderStop[];
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
  per_load: 'Rate per Load ($)',
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
  const [plannedMiles, setPlannedMiles] = useState<string>(
    initialData?.plannedMiles != null ? String(initialData.plannedMiles) : ''
  );
  const [specialInstructions, setSpecialInstructions] = useState(
    initialData?.specialInstructions ?? ''
  );
  const [bolNumber, setBolNumber] = useState(initialData?.bolNumber ?? '');
  const [poNumber, setPoNumber] = useState(initialData?.poNumber ?? '');
  const [hazmat, setHazmat] = useState(initialData?.hazmat ?? false);

  // Contract auto-populate tracking
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractAutoFilled, setContractAutoFilled] = useState<Set<string>>(new Set());

  // Stops state — initialized from initialData for edit mode
  const [stops, setStops] = useState<StopBuilderStop[]>(initialData?.stops ?? []);
  const [stopErrors, setStopErrors] = useState<Record<string, string>>({});

  // Validation
  const [clientError, setClientError] = useState('');
  const [commodityError, setCommodityError] = useState('');

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // Rate confirmation upload state
  const [rateConfFile, setRateConfFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [existingDocs, setExistingDocs] = useState<ExistingDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Fetch existing rate confirmation docs (edit mode)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode !== 'edit' || !loadId) return;
    async function fetchDocs() {
      try {
        const res = await fetch(`/api/v1/carrier/documents?parent_type=load&parent_id=${loadId}`);
        if (!res.ok) return;
        const json = await res.json();
        const items = (json.data ?? []) as ExistingDocument[];
        const rateDocs = items.filter((d) => d.documentType === 'rate_confirmation');
        setExistingDocs(rateDocs);
      } catch {
        // non-critical — silently ignore
      }
    }
    fetchDocs();
  }, [mode, loadId]);

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
    setContractAutoFilled(autoFilled);
  }

  // ---------------------------------------------------------------------------
  // Upload rate confirmation file
  // ---------------------------------------------------------------------------
  async function uploadRateConfirmation(currentLoadId: string, file: File): Promise<boolean> {
    setUploadStatus('uploading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('parent_type', 'load');
      fd.append('parent_id', currentLoadId);
      fd.append('document_type', 'rate_confirmation');

      const res = await fetch('/api/v1/carrier/documents', { method: 'POST', body: fd });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to upload rate confirmation');
        setUploadStatus('error');
        return false;
      }
      setUploadStatus('done');
      setUploadedFileName(file.name);
      return true;
    } catch {
      toast.error('Failed to upload rate confirmation');
      setUploadStatus('error');
      return false;
    }
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

    // Validate stops: every stop must have a facility selected
    const newStopErrors: Record<string, string> = {};
    for (const stop of stops) {
      if (!stop.facility_id) {
        newStopErrors[stop.id] = 'Please select a facility for this stop';
        valid = false;
      }
    }
    setStopErrors(newStopErrors);

    if (!valid) return;

    setSubmitting(true);

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

      // Upload rate confirmation if a file was selected
      if (rateConfFile && savedId) {
        await uploadRateConfirmation(savedId, rateConfFile);
      }

      toast.success(mode === 'create' ? 'Load created' : 'Load saved');

      if (mode === 'create') {
        router.push('/carrier/loads');
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

  const hasDispatch = !!(initialData?.dispatchId);

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
                    {c.contractName || c.contractNumber || `Contract ${c.id.slice(0, 8)}`}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
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

      {/* Section 3 — Stops */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Stops</h3>
        {!hasDispatch && (
          <div className="rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 px-4 py-3 mb-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Stops added here will be saved when this load is assigned to a dispatch.
            </p>
          </div>
        )}
        <StopBuilder stops={stops} onChange={setStops} mode="load" stopErrors={stopErrors} />
      </div>

      {/* Section 4 — Rate and Financials */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>Rate &amp; Financials</h3>
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
              <option value="per_load">Per Load</option>
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

          {rateType === 'per_mile' && (
            <div>
              <label className={labelClass}>Planned Miles</label>
              <input
                type="number"
                min="0"
                step="1"
                value={plannedMiles}
                onChange={(e) => setPlannedMiles(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used for revenue calculation: rate x miles
              </p>
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

        {/* Broker Mode */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Switch
              checked={brokerFlag}
              onCheckedChange={setBrokerFlag}
              id="broker-flag-toggle"
            />
            <label htmlFor="broker-flag-toggle" className="text-sm font-medium cursor-pointer select-none">
              Brokered load (we are acting as broker, not carrier)
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

        {/* Live financial preview */}
        <div className="mt-4">
          {(() => {
            const deliveryStopCount = stops.filter((s) => s.stop_type === 'delivery').length;
            return (
              <LoadFinancials
                rateType={rateType}
                rateAmount={rateAmount ? Number(rateAmount) : 0}
                weightLbs={commodityWeightLbs ? Number(commodityWeightLbs) : 0}
                otherCharges={otherCharges ? Number(otherCharges) : 0}
                brokerFlag={brokerFlag}
                carrierCost={carrierCost ? Number(carrierCost) : 0}
                plannedMiles={plannedMiles ? Number(plannedMiles) : 0}
                deliveryStopCount={deliveryStopCount}
              />
            );
          })()}
        </div>
      </div>

      {/* Section 5 — References */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>References</h3>

        {/* Rate Confirmation Upload */}
        <div>
          <label className={labelClass}>Rate Confirmation</label>

          {/* Show existing rate confirmation docs in edit mode */}
          {existingDocs.length > 0 && (
            <div className="mb-3 space-y-1">
              {existingDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Current:</span>
                  {doc.fileUrl ? (
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium truncate max-w-xs"
                    >
                      {doc.fileName}
                    </a>
                  ) : (
                    <span className="font-medium truncate max-w-xs">{doc.fileName}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={(e) => setRateConfFile(e.target.files?.[0] ?? null)}
            className="flex w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
          />

          {uploadStatus === 'uploading' && (
            <p className="mt-1 text-xs text-muted-foreground">Uploading…</p>
          )}
          {uploadStatus === 'done' && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400">
              Uploaded: {uploadedFileName}
            </p>
          )}
          {uploadStatus === 'error' && (
            <p className="mt-1 text-xs text-red-500">Upload failed — please try again.</p>
          )}
          {uploadStatus === 'idle' && rateConfFile && (
            <p className="mt-1 text-xs text-muted-foreground">
              Ready to upload: {rateConfFile.name}
            </p>
          )}
        </div>

        {/* Special Instructions */}
        <div className="mt-4">
          <label className={labelClass}>Special / Driver Instructions</label>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={4}
            placeholder="Any special instructions for the driver…"
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

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
