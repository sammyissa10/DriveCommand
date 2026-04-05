'use client';

// TODO: The following fields from the original spec do NOT exist on the CarrierContract schema
// and are not included in this form. They require a schema migration to add:
//   - detention_free_minutes, detention_rate_per_hour
//   - tonu_rate, layover_rate_per_day
//   - auto_renew
//   - contract_name
//   - payment_terms_override

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export interface ContractData {
  id: string;
  clientId: string;
  contractType: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  status: string;
  notes: string | null;
}

interface ContractFormProps {
  initialData?: ContractData;
  defaultClientId?: string;
}

interface ClientOption {
  id: string;
  name: string;
}

interface FormErrors {
  clientId?: string;
  baseRate?: string;
}

const CONTRACT_TYPES = [
  { value: 'spot', label: 'Spot' },
  { value: 'dedicated', label: 'Dedicated' },
  { value: 'volume', label: 'Volume' },
  { value: 'brokerage', label: 'Brokerage' },
];

const RATE_TYPES = [
  { value: 'per_mile', label: 'Per Mile' },
  { value: 'flat', label: 'Flat Rate' },
  { value: 'per_hour', label: 'Per Hour' },
  { value: 'per_load', label: 'Per Load' },
  { value: 'percentage', label: 'Percentage' },
];

const FUEL_SURCHARGE_METHODS = [
  { value: 'none', label: 'None' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'flat_rate', label: 'Flat Rate' },
  { value: 'doe_index', label: 'DOE Index' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'terminated', label: 'Terminated' },
];

function validate(values: { clientId: string; baseRate: string }): FormErrors {
  const errors: FormErrors = {};
  if (!values.clientId) {
    errors.clientId = 'Client is required';
  }
  if (values.baseRate && (isNaN(Number(values.baseRate)) || Number(values.baseRate) < 0)) {
    errors.baseRate = 'Base rate must be a positive number';
  }
  return errors;
}

export function ContractForm({ initialData, defaultClientId }: ContractFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);

  const [values, setValues] = useState({
    clientId: initialData?.clientId ?? defaultClientId ?? '',
    contractType: initialData?.contractType ?? '',
    rateType: initialData?.rateType ?? '',
    baseRate: initialData?.baseRate ?? '',
    fuelSurchargeMethod: initialData?.fuelSurchargeMethod ?? 'none',
    fuelSurchargeRate: initialData?.fuelSurchargeRate ?? '',
    effectiveDate: initialData?.effectiveDate
      ? initialData.effectiveDate.slice(0, 10)
      : '',
    expirationDate: initialData?.expirationDate
      ? initialData.expirationDate.slice(0, 10)
      : '',
    status: initialData?.status ?? 'active',
    notes: initialData?.notes ?? '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/clients')
      .then((r) => r.json())
      .then((json) => {
        const items = json.data?.items ?? json.items ?? [];
        setClients(items.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function handleSelectChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate({ clientId: values.clientId, baseRate: values.baseRate });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        clientId: values.clientId,
        ...(values.contractType ? { contractType: values.contractType } : {}),
        ...(values.rateType ? { rateType: values.rateType } : {}),
        ...(values.baseRate ? { baseRate: values.baseRate } : {}),
        fuelSurchargeMethod: values.fuelSurchargeMethod,
        ...(values.fuelSurchargeMethod !== 'none' && values.fuelSurchargeRate
          ? { fuelSurchargeRate: values.fuelSurchargeRate }
          : {}),
        ...(values.effectiveDate ? { effectiveDate: values.effectiveDate } : {}),
        ...(values.expirationDate ? { expirationDate: values.expirationDate } : {}),
        status: values.status,
        ...(values.notes ? { notes: values.notes } : {}),
      };

      const url = isEdit
        ? `/api/v1/carrier/contracts/${initialData!.id}`
        : '/api/v1/carrier/contracts';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save contract');
      }

      toast.success(isEdit ? 'Contract updated' : 'Contract created');
      router.push('/carrier/contracts');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Client selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="clientId">
          Client <span className="text-destructive">*</span>
        </label>
        {clientsLoading ? (
          <div className="h-9 rounded-md bg-muted/40 animate-pulse" />
        ) : (
          <Select
            value={values.clientId || undefined}
            onValueChange={(val) => handleSelectChange('clientId', val)}
          >
            <SelectTrigger id="clientId">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.clientId && <p className="text-xs text-destructive">{errors.clientId}</p>}
      </div>

      {/* Type + Status */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="contractType">
            Contract Type
          </label>
          <Select
            value={values.contractType || undefined}
            onValueChange={(val) => handleSelectChange('contractType', val)}
          >
            <SelectTrigger id="contractType">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="status">
            Status
          </label>
          <Select
            value={values.status}
            onValueChange={(val) => handleSelectChange('status', val)}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Rate section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Rate &amp; Accessorials
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="rateType">
              Rate Type
            </label>
            <Select
              value={values.rateType || undefined}
              onValueChange={(val) => handleSelectChange('rateType', val)}
            >
              <SelectTrigger id="rateType">
                <SelectValue placeholder="Select rate type" />
              </SelectTrigger>
              <SelectContent>
                {RATE_TYPES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="baseRate">
              Base Rate
            </label>
            <Input
              id="baseRate"
              name="baseRate"
              type="number"
              step="0.01"
              min="0"
              value={values.baseRate}
              onChange={handleChange}
              placeholder="2.50"
            />
            {errors.baseRate && <p className="text-xs text-destructive">{errors.baseRate}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="fuelSurchargeMethod">
              Fuel Surcharge Method
            </label>
            <Select
              value={values.fuelSurchargeMethod}
              onValueChange={(val) => handleSelectChange('fuelSurchargeMethod', val)}
            >
              <SelectTrigger id="fuelSurchargeMethod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUEL_SURCHARGE_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {values.fuelSurchargeMethod !== 'none' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="fuelSurchargeRate">
                Fuel Surcharge Rate
              </label>
              <Input
                id="fuelSurchargeRate"
                name="fuelSurchargeRate"
                type="number"
                step="0.01"
                min="0"
                value={values.fuelSurchargeRate}
                onChange={handleChange}
                placeholder="0.50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="effectiveDate">
            Effective Date
          </label>
          <Input
            id="effectiveDate"
            name="effectiveDate"
            type="date"
            value={values.effectiveDate}
            onChange={handleChange}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="expirationDate">
            Expiration Date
          </label>
          <Input
            id="expirationDate"
            name="expirationDate"
            type="date"
            value={values.expirationDate}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="notes">
          Notes
        </label>
        <Textarea
          id="notes"
          name="notes"
          value={values.notes}
          onChange={handleChange}
          placeholder="Additional notes about this contract..."
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/carrier/contracts')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Contract'}
        </Button>
      </div>
    </form>
  );
}
