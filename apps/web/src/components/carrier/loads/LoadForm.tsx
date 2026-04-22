'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
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

interface RouteTemplate {
  id: string;
  templateName: string;
  recurrenceRule: string | null;
  estimatedMiles: number | null;
  defaultDriverId: string | null;
  defaultTruckId: string | null;
  client: { name: string } | null;
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
  drivers?: DriverOption[];
  trucks?: TruckOption[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultDeparture(): string {
  const d = new Date();
  // Tomorrow at 08:00 local time
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const RATE_TYPE_LABELS: Record<string, string> = {
  per_mile: 'Rate per Mile ($)',
  per_load: 'Rate per Load ($)',
  per_hour: 'Rate per Hour ($/hr)',
  per_stop: 'Rate per Delivery Stop ($)',
  flat: 'Flat Rate ($)',
  per_cwt: 'Rate per CWT ($)',
  per_pallet: 'Rate per Pallet ($)',
  hourly: 'Hourly Rate ($/hr)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadForm({ mode, initialData, clients, loadId, drivers, trucks }: LoadFormProps) {
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

  // Dispatch immediately state (create mode only)
  const [dispatchImmediately, setDispatchImmediately] = useState(false);
  const [primaryDriverId, setPrimaryDriverId] = useState('');
  const [dispatchTruckId, setDispatchTruckId] = useState('');
  const [coDriverId, setCoDriverId] = useState('');
  const [scheduledDeparture, setScheduledDeparture] = useState(getDefaultDeparture());
  const [dispatchPlannedMiles, setDispatchPlannedMiles] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [templatesFetched, setTemplatesFetched] = useState(false);
  const [coDriverError, setCoDriverError] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

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
  // Fetch route templates when dispatch toggle is turned on
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!dispatchImmediately || templatesFetched) return;
    fetch('/api/v1/carrier/route-templates/active')
      .then((r) => r.json())
      .then((body) => {
        if (body.data) setTemplates(body.data as RouteTemplate[]);
        setTemplatesFetched(true);
      })
      .catch(() => {
        setTemplatesFetched(true); // non-critical — show empty dropdown
      });
  }, [dispatchImmediately, templatesFetched]);

  // ---------------------------------------------------------------------------
  // Dispatch field handlers
  // ---------------------------------------------------------------------------
  function handleTemplateChange(newTemplateId: string) {
    setSelectedTemplateId(newTemplateId);
    if (!newTemplateId) return;
    const template = templates.find((t) => t.id === newTemplateId);
    if (!template) return;
    if (dispatchPlannedMiles === '' && template.estimatedMiles != null) {
      setDispatchPlannedMiles(String(template.estimatedMiles));
    }
    if (!primaryDriverId && template.defaultDriverId) {
      const driverExists = (drivers ?? []).some((d) => d.id === template.defaultDriverId);
      if (driverExists) setPrimaryDriverId(template.defaultDriverId);
    }
    if (!dispatchTruckId && template.defaultTruckId) {
      const truckExists = (trucks ?? []).some((t) => t.id === template.defaultTruckId);
      if (truckExists) setDispatchTruckId(template.defaultTruckId);
    }
  }

  function handleCoDriverChange(value: string) {
    setCoDriverId(value);
    if (value && value === primaryDriverId) {
      setCoDriverError('Co-driver cannot be the same as the primary driver.');
    } else {
      setCoDriverError(null);
    }
  }

  function handlePrimaryDriverChange(value: string) {
    setPrimaryDriverId(value);
    if (coDriverId && value === coDriverId) {
      setCoDriverError('Co-driver cannot be the same as the primary driver.');
    } else {
      setCoDriverError(null);
    }
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

    // Validate dispatch fields when toggle is ON (create mode only)
    if (mode === 'create' && dispatchImmediately) {
      if (!primaryDriverId) {
        setDispatchError('Primary driver is required to dispatch.');
        valid = false;
      } else if (!dispatchTruckId) {
        setDispatchError('Truck is required to dispatch.');
        valid = false;
      } else if (!scheduledDeparture) {
        setDispatchError('Scheduled departure is required to dispatch.');
        valid = false;
      } else if (coDriverId && coDriverId === primaryDriverId) {
        setCoDriverError('Co-driver cannot be the same as the primary driver.');
        valid = false;
      } else {
        setDispatchError(null);
      }
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

      // Dispatch immediately path (create mode only)
      if (mode === 'create' && dispatchImmediately && savedId) {
        const dispatchBody: Record<string, unknown> = {
          primaryDriverId,
          truckId: dispatchTruckId,
          scheduledDeparture: new Date(scheduledDeparture).toISOString(),
        };
        if (coDriverId) dispatchBody.coDriverId = coDriverId;
        if (dispatchPlannedMiles) dispatchBody.plannedMiles = parseFloat(dispatchPlannedMiles);
        if (selectedTemplateId) dispatchBody.routeTemplateId = selectedTemplateId;

        const dispatchRes = await fetch('/api/v1/carrier/dispatches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dispatchBody),
        });

        if (!dispatchRes.ok) {
          const dispatchJson = await dispatchRes.json().catch(() => ({}));
          toast.error(dispatchJson.error ?? 'Load created but dispatch failed');
          router.push('/carrier/loads');
          return;
        }

        const dispatchData = await dispatchRes.json();
        const newDispatchId: string = dispatchData.data?.id;
        if (!newDispatchId) {
          toast.error('Load created but could not get dispatch ID');
          router.push('/carrier/loads');
          return;
        }

        // Extract dispatch number from notes tag
        const dispatchNotes: string = dispatchData.data?.notes ?? '';
        const match = dispatchNotes.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
        const dispatchNumber = match ? match[1] : `DC-${newDispatchId.slice(0, 8)}`;

        // Attach load to dispatch
        const attachRes = await fetch(`/api/v1/carrier/loads/${savedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dispatchId: newDispatchId }),
        });

        if (!attachRes.ok) {
          const attachJson = await attachRes.json().catch(() => ({}));
          toast.error(attachJson.error ?? 'Load and dispatch created but could not link them');
          router.push(`/carrier/dispatches/${newDispatchId}`);
          return;
        }

        toast.success(`Load created and dispatched as ${dispatchNumber}`);
        router.push(`/carrier/dispatches/${newDispatchId}`);
        return;
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

      {/* Section 3b — Dispatch (create mode only) */}
      {mode === 'create' && drivers && (
        <div className={sectionClass}>
          <div className="flex items-center justify-between">
            <h3 className={`${sectionTitleClass} mb-0`}>Dispatch</h3>
            <div className="flex items-center gap-2">
              <Switch
                checked={dispatchImmediately}
                onCheckedChange={setDispatchImmediately}
                id="dispatch-toggle"
              />
              <label htmlFor="dispatch-toggle" className="text-sm font-medium cursor-pointer select-none">
                Dispatch immediately
              </label>
            </div>
          </div>

          {dispatchImmediately && (
            <div className="mt-4 space-y-4">
              {/* Route Template */}
              <div>
                <label className={labelClass}>Route Template (optional)</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className={selectClass}
                  disabled={submitting}
                >
                  <option value="">No template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.templateName}{t.client ? ` — ${t.client.name}` : ''}
                    </option>
                  ))}
                </select>
                {selectedTemplateId && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs text-blue-700 dark:text-blue-300">
                      Template stops will be added to the dispatch.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Driver */}
                <div>
                  <label className={labelClass}>
                    Primary Driver <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={primaryDriverId}
                    onChange={(e) => handlePrimaryDriverChange(e.target.value)}
                    className={selectClass}
                    disabled={submitting}
                  >
                    <option value="">Select driver…</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Truck */}
                <div>
                  <label className={labelClass}>
                    Truck <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={dispatchTruckId}
                    onChange={(e) => setDispatchTruckId(e.target.value)}
                    className={selectClass}
                    disabled={submitting}
                  >
                    <option value="">Select truck…</option>
                    {(trucks ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.unitNumber}
                        {(t.make || t.model) && ` — ${[t.make, t.model].filter(Boolean).join(' ')}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Scheduled Departure */}
                <div>
                  <label className={labelClass}>
                    Scheduled Departure <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledDeparture}
                    onChange={(e) => setScheduledDeparture(e.target.value)}
                    className={inputClass}
                    disabled={submitting}
                  />
                </div>

                {/* Co-Driver */}
                <div>
                  <label className={labelClass}>Co-Driver (optional)</label>
                  <select
                    value={coDriverId}
                    onChange={(e) => handleCoDriverChange(e.target.value)}
                    className={selectClass}
                    disabled={submitting}
                  >
                    <option value="">None</option>
                    {drivers
                      .filter((d) => d.id !== primaryDriverId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                  </select>
                  {coDriverError && (
                    <p className="mt-1 text-xs text-destructive">{coDriverError}</p>
                  )}
                </div>
              </div>

              {/* Planned Miles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Planned Miles (optional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dispatchPlannedMiles}
                    onChange={(e) => setDispatchPlannedMiles(e.target.value)}
                    placeholder="e.g. 350"
                    className={inputClass}
                    disabled={submitting}
                  />
                </div>
              </div>

              {dispatchError && (
                <p className="text-sm text-destructive">{dispatchError}</p>
              )}
            </div>
          )}
        </div>
      )}

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
              <option value="per_load">Per Load</option>
              <option value="per_hour">Per Hour</option>
              <option value="per_stop">Per Stop</option>
              <option value="flat">Flat Rate</option>
              <option value="per_cwt">Per CWT</option>
              <option value="per_pallet">Per Pallet</option>
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
          {submitting
            ? 'Saving…'
            : mode === 'create' && dispatchImmediately
              ? 'Create & Dispatch'
              : mode === 'create'
                ? 'Create Load'
                : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
